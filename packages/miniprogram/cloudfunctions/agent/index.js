/**
 * agent cloud function — provider-independent AI boundary.
 *
 * Actions:
 *   ownerMessage           { messages: [{role, content}] } -> OwnerAgentResult
 *   extractMemoryProposal  { messages } -> { proposal | null }
 *   generateCardDraft      { currentCard? } -> { draft, keptFields }
 *   visitorMessage         { ownerId, message, conversationId? } -> VisitorAgentResult (task 2.2)
 *   summarizeConnection    { requestId } -> { summary } (task 2.4, owner-only)
 *
 * The provider secret lives only in cloud env vars; clients always receive
 * either a schema-validated result or a typed error, never raw model output.
 *
 * Visitor mode reads memories with visibility filters in the `where` clause:
 * public memories are quotable evidence, agent_only memories may only steer
 * the agent's judgment. connected / private memories are never read here.
 *
 * visitorMessage is gated before any model call (task 3.2): blocked owners
 * (`users.blockedUsers`) and per-day budgets (`visitor_activity` collection,
 * see lib/limits.js) reject with typed errors and never invoke the provider.
 */

const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { getProvider, isProviderError, safeErrorForLog } = require('./lib/providers');
const { runOwnerAgent, extractMemoryProposal, runCardDraft, runVisitorAgent, runConnectionSummary, runDecisionLearning } = require('./lib/agent');
const { typedError } = require('./lib/schema');
const limits = require('./lib/limits');
const { normalizeMemoryIds, filterPublicCardDraftMemories } = require('./lib/card-draft-scope');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { action } = event || {};
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return typedError('unauthorized', 'login required');

  const provider = getProvider();

  try {
    switch (action) {
      case 'ownerMessage': {
        const memories = await listConfirmedMemories(openid);
        return await runOwnerAgent({ provider, memories, messages: event.messages });
      }
      case 'extractMemoryProposal': {
        const memories = await listConfirmedMemories(openid);
        return await extractMemoryProposal({ provider, memories, messages: event.messages });
      }
      case 'generateCardDraft': {
        // 普通 1.4 owner 草稿仍可使用全部已确认记忆；首次 onboarding
        // 生成公开 Card 时必须在查询阶段只读取 public，并再套客户端本轮
        // 已确认 memoryIds allowlist。private / agent_only 内容不会进入模型。
        const memories = event.cardDraftScope === 'public_only'
          ? await listPublicCardDraftMemories(openid, event.memoryIds)
          : await listConfirmedMemories(openid);
        return await runCardDraft({ provider, memories, currentCard: event.currentCard });
      }
      case 'visitorMessage': {
        const { ownerId, message, conversationId } = event;
        if (typeof ownerId !== 'string' || !ownerId.trim()) {
          return typedError('invalid_request', 'ownerId is required');
        }
        if (Object.prototype.hasOwnProperty.call(event, 'messages') || Object.prototype.hasOwnProperty.call(event, 'roundCount')) {
          return typedError('invalid_request', 'visitor history and round count are server-managed');
        }
        if (typeof message !== 'string' || !message.trim() || message.trim().length > 1000) {
          return typedError('invalid_request', 'message must be 1-1000 characters');
        }
        const owner = await getUserByOpenid(ownerId);
        if (!owner) return typedError('not_found', 'owner not found');
        // Abuse gates run before any model call (task 3.2): a blocked or
        // rate-limited visitor never reaches the provider.
        if (limits.isBlocked(owner, openid)) {
          return typedError('blocked', '对方暂时无法接收消息');
        }
        // Stranger text is fail-closed before it can enter either the model
        // or the authoritative conversation record.
        const moderation = await moderateVisitorText(message.trim());
        if (!moderation.allowed) return typedError(moderation.code, moderation.message);
        const gate = await checkAndRecordVisitorActivity(openid, ownerId);
        if (gate === 'rate_limited_messages') {
          return typedError('rate_limited', '今天聊得够多了，明天再来吧');
        }
        if (gate === 'rate_limited_new') {
          return typedError('rate_limited', '今天认识的新朋友够多了，明天再来吧');
        }
        const reservation = await reserveVisitorConversation({
          visitorId: openid,
          ownerId,
          conversationId,
          message: message.trim(),
        });
        if (!reservation.ok) return typedError(reservation.code, reservation.message);
        // Permission filtering at query stage: only public + agent_only,
        // confirmed memories are ever read for a visitor conversation.
        // now_items: only status='published' is read; expired items are
        // dropped before grounding (task 4.5) and drafts/archived/hidden/
        // deleted items are never read at all.
        const [publicMemories, agentMemories, publishedNowItems] = await Promise.all([
          listMemoriesWithVisibility(ownerId, 'public'),
          listMemoriesWithVisibility(ownerId, 'agent_only'),
          listPublishedNowItems(ownerId),
        ]);
        const nowItems = filterActiveNowItems(publishedNowItems, Date.now());
        const card = buildVisitorCardContext(owner, publicMemories);
        const output = await runVisitorAgent({
          provider,
          card,
          publicMemories,
          agentMemories,
          nowItems,
          messages: reservation.messages,
          roundCount: reservation.roundCountBefore,
        });
        if (output && output.ok === true && output.result) {
          await appendVisitorAgentReply(reservation.conversationId, output.result.reply);
          output.result.conversationId = reservation.conversationId;
        }
        if (output && output.ok === true && output.result && Array.isArray(output.result.sharedContext)) {
          const contexts = verifiedDecisionTopics(output.result.sharedContext);
          if (contexts.length) {
            try {
              // Keep at most one short-lived token per visitor-owner pair;
              // production also configures a TTL index on expiresAt.
              await db.collection('visitor_evidence').where({ ownerId, visitorId: openid }).remove();
              const evidence = await db.collection('visitor_evidence').add({
                data: { ownerId, visitorId: openid, conversationId: reservation.conversationId, contexts, createdAt: Date.now(), expiresAt: Date.now() + 24 * 60 * 60 * 1000 },
              });
              output.result.evidenceId = evidence._id;
            } catch (error) {
              console.warn('visitor evidence persistence failed:', error && error.message);
            }
          }
        }
        return output;
      }
      case 'summarizeConnection': {
        const { requestId } = event;
        if (typeof requestId !== 'string' || !requestId.trim()) {
          return typedError('invalid_request', 'requestId is required');
        }
        const requestResult = await db.collection('requests').doc(requestId).get().catch(() => null);
        const request = requestResult && requestResult.data;
        if (!request || request.ownerId !== openid) return typedError('not_found', 'request not found');
        const conversationExcerpt = await loadConversationExcerpt(request);
        return await runConnectionSummary({ provider, request, conversationExcerpt });
      }
      case 'extractDecisionLearning': {
        // Owner-only and privacy-minimized: requests supplies only a server-
        // established kind/content candidate, never visitor identity/reason.
        return await runDecisionLearning({
          provider,
          kind: event.kind,
          suggestedContent: event.suggestedContent,
        });
      }
      default:
        return typedError('invalid_action', 'unknown action');
    }
  } catch (error) {
    // Provider/network failures surface as a stable typed error (§12). The
    // log line is redacted: no keys, no prompt text, no provider bodies.
    console.error('agent function error:', safeErrorForLog(error));
    if (isProviderError(error)) return typedError(error.code, error.message);
    return typedError('model_unavailable', 'the model is temporarily unavailable');
  }
};

async function listConfirmedMemories(openid) {
  const result = await db.collection('memories').where({ ownerId: openid, status: 'confirmed' }).get();
  return result.data;
}

async function listPublicCardDraftMemories(openid, rawMemoryIds) {
  const memoryIds = normalizeMemoryIds(rawMemoryIds);
  if (memoryIds.length === 0) return [];
  const result = await db.collection('memories')
    .where({ ownerId: openid, status: 'confirmed', visibility: 'public' })
    .get();
  return filterPublicCardDraftMemories(result.data, memoryIds);
}

async function listMemoriesWithVisibility(ownerId, visibility) {
  const result = await db.collection('memories')
    .where({ ownerId, status: 'confirmed', visibility })
    .get();
  return result.data;
}

/**
 * Read published Now items for visitor grounding (task 4.5). If the
 * collection does not exist yet (fresh environments), grounding simply has
 * no Now evidence — the agent falls back to public current-focus memory.
 */
async function listPublishedNowItems(ownerId) {
  try {
    const result = await db.collection('now_items')
      .where({ ownerId, status: 'published' })
      .get();
    return result.data;
  } catch (error) {
    console.warn('now_items read failed, grounding without now items:', error && error.message);
    return [];
  }
}

/** Active = published and not expired. Expired items are never grounding. */
function filterActiveNowItems(items, now) {
  return (items || []).filter(
    item => item && item.status === 'published'
      && (item.expiresAt === null || item.expiresAt === undefined || item.expiresAt > now),
  );
}

async function getUserByOpenid(openid) {
  const result = await db.collection('users').where({ openid }).get();
  return result.data[0] || null;
}

async function moderateVisitorText(content) {
  try {
    const res = await cloud.callFunction({
      name: 'content-check',
      data: { action: 'gateText', content },
    });
    const gate = res && res.result && res.result.gate;
    if (gate && gate.allowed === true) return gate;
    if (gate && typeof gate.code === 'string') return gate;
  } catch (error) {
    console.warn('visitor moderation unavailable:', error && error.message);
  }
  return { allowed: false, code: 'moderation_unavailable', message: '内容安全检查暂时不可用，请稍后重试' };
}

function visitorConversationId(visitorId, ownerId) {
  return 'visitor-' + crypto.createHash('sha256').update(`${visitorId}\u0000${ownerId}`).digest('hex').slice(0, 40);
}

/** Atomically reserve one of the six server-owned rounds using doc-only ops. */
async function reserveVisitorConversation({ visitorId, ownerId, conversationId, message }) {
  const authoritativeId = visitorConversationId(visitorId, ownerId);
  if (conversationId !== undefined && conversationId !== null
      && (typeof conversationId !== 'string' || conversationId !== authoritativeId)) {
    return { ok: false, code: 'invalid_request', message: 'conversationId does not belong to this visitor conversation' };
  }
  try {
    return await db.runTransaction(async transaction => {
      const ref = transaction.collection('conversations').doc(authoritativeId);
      const result = await ref.get().catch(() => null);
      const existing = result && result.data;
      if (existing && (existing.mode !== 'visitor' || existing.ownerId !== ownerId || existing.visitorId !== visitorId)) {
        return { ok: false, code: 'invalid_request', message: 'conversation ownership mismatch' };
      }
      const roundCount = existing && Number.isInteger(existing.roundCount) ? existing.roundCount : 0;
      if (roundCount >= 6) {
        return { ok: false, code: 'round_limit', message: '这次先聊到这里，你可以把具体理由告诉我' };
      }
      const now = Date.now();
      const userMessage = { role: 'user', content: message, createdAt: now };
      const messages = [...(existing && Array.isArray(existing.messages) ? existing.messages : []), userMessage].slice(-12);
      const data = {
        mode: 'visitor', ownerId, visitorId, roundCount: roundCount + 1,
        messages, createdAt: (existing && existing.createdAt) || now, updatedAt: now,
      };
      await ref.set({ data });
      return { ok: true, conversationId: authoritativeId, roundCountBefore: roundCount, messages };
    });
  } catch (error) {
    console.warn('visitor conversation reservation failed:', error && error.message);
    return { ok: false, code: 'model_unavailable', message: 'conversation is temporarily unavailable' };
  }
}

async function appendVisitorAgentReply(conversationId, reply) {
  if (typeof reply !== 'string' || !reply) return;
  try {
    await db.runTransaction(async transaction => {
      const ref = transaction.collection('conversations').doc(conversationId);
      const result = await ref.get();
      const existing = result && result.data;
      if (!existing || existing.mode !== 'visitor') throw new Error('visitor conversation missing');
      const messages = [...(Array.isArray(existing.messages) ? existing.messages : []), {
        role: 'assistant', content: reply.slice(0, 2000), createdAt: Date.now(),
      }].slice(-12);
      await ref.update({ data: { messages, updatedAt: Date.now() } });
    });
  } catch (error) {
    // The reply may still be returned, but evidence creation remains bound to
    // the authoritative conversation id and never trusts client history.
    console.warn('visitor reply persistence failed:', error && error.message);
  }
}

/**
 * Check the visitor's per-day budgets and record this message. Returns null
 * when the conversation may proceed, or a limits.js gate code.
 *
 * The check and increment are one transaction before the model call. An
 * unavailable limiter fails closed so concurrency or DB jitter cannot spend
 * unmetered provider capacity.
 */
async function checkAndRecordVisitorActivity(visitorId, ownerId) {
  const now = Date.now();
  const dateStr = limits.todayStr(now);
  const docId = limits.activityDocId(visitorId, ownerId, dateStr);
  const dailyDocId = limits.activityDailyDocId(visitorId, dateStr);
  // Backfill aid for deployments that already have the original per-pair
  // documents but no aggregate document. This query is deliberately outside
  // the transaction: CloudBase transactions only expose doc operations.
  let legacyOwnerCount = 0;
  try {
    const legacy = await db.collection('visitor_activity').where({ visitorId, date: dateStr }).get();
    legacyOwnerCount = new Set((legacy.data || [])
      .filter(item => item && typeof item.ownerId === 'string')
      .map(item => item.ownerId)).size;
  } catch (error) {
    // The transaction remains fail-closed if it needs this value and cannot
    // establish one; existing pair counters can still proceed without it.
    legacyOwnerCount = null;
  }
  try {
    return await db.runTransaction(async transaction => {
      const coll = transaction.collection('visitor_activity');
      const existing = await coll.doc(docId).get().catch(() => null);
      const myDoc = existing && existing.data;
      const dailyResult = await coll.doc(dailyDocId).get().catch(() => null);
      const dailyDoc = dailyResult && dailyResult.data;
      if (!myDoc && !dailyDoc && legacyOwnerCount === null) throw new Error('daily activity unavailable');
      const todayOwnerCount = dailyDoc && Number.isInteger(dailyDoc.ownerCount)
        ? dailyDoc.ownerCount
        : (legacyOwnerCount || 0);
      const gate = limits.checkVisitorActivity({ myDoc, todayOwnerCount });
      if (gate) return gate;
      if (myDoc) {
        await coll.doc(docId).update({ data: { count: (myDoc.count || 0) + 1, updatedAt: now } });
      } else {
        await coll.doc(docId).set({ data: { visitorId, ownerId, date: dateStr, count: 1, updatedAt: now } });
        await coll.doc(dailyDocId).set({
          data: {
            kind: 'visitor_daily', visitorId, date: dateStr,
            ownerCount: todayOwnerCount + 1, updatedAt: now,
          },
        });
      }
      return null;
    });
  } catch (error) {
    console.warn('visitor_activity transaction failed, blocking:', error && error.message);
    return 'rate_limited_messages';
  }
}

/**
 * Minimal public Card context for visitor grounding. Only known-safe fields
 * are read — contact-bearing namecard fields are never touched here.
 */
function buildVisitorCardContext(user, publicMemories) {
  const sorted = [...publicMemories].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const byKind = kind => sorted.filter(m => m.kind === kind).map(m => m.content);
  const interests = user.namecard && Array.isArray(user.namecard.interests) ? user.namecard.interests : [];
  const card = user.namecard || {};
  return {
    name: user.nickname || '',
    headline: (user.namecard && user.namecard.motto) || user.bio || '',
    currentFocus: typeof card.currentFocus === 'string' ? card.currentFocus : (byKind('current')[0] || ''),
    canHelpWith: Array.isArray(card.canHelpWith) ? card.canHelpWith.filter(s => typeof s === 'string').slice(0, 5) : byKind('fact').slice(0, 5),
    wantsToMeet: Array.isArray(card.wantsToMeet) ? card.wantsToMeet.filter(s => typeof s === 'string').slice(0, 5) : byKind('preference').slice(0, 5),
    topics: (Array.isArray(card.topics) ? card.topics : interests).filter(s => typeof s === 'string' && s.trim()).slice(0, 8),
  };
}

function verifiedDecisionTopics(values) {
  const rules = [
    ['个人 AI 分身', /个人\s*AI\s*分身/i], ['自托管 AI', /自托管\s*AI/i],
    ['AI 社交产品', /AI\s*社交产品/i], ['隐私边界', /隐私边界/],
    ['数据隐私', /数据隐私/], ['模型安全', /模型安全/], ['知识检索', /知识检索/],
    ['微信小程序', /微信小程序/], ['开源软件', /开源软件/], ['产品设计', /产品设计/],
    ['用户研究', /用户研究/], ['软件开发', /软件开发/],
  ];
  return [...new Set((values || []).flatMap(value => {
    if (typeof value !== 'string') return [];
    const found = rules.find(([, pattern]) => pattern.test(value));
    return found ? [found[0]] : [];
  }))].slice(0, 5);
}

/** Latest visitor-conversation excerpt as summary evidence, if linked. */
async function loadConversationExcerpt(request) {
  if (!request.conversationId) return '';
  const result = await db.collection('conversations').doc(request.conversationId).get().catch(() => null);
  const conversation = result && result.data;
  if (!conversation || !Array.isArray(conversation.messages)) return '';
  return conversation.messages
    .slice(-8)
    .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : ''}`)
    .join('\n');
}
