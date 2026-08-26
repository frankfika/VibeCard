/**
 * requests cloud function (task 2.3) — connection requests.
 *
 * Actions:
 *   createRequest  { ownerId, visitorSummary, reason, possibleSharedContext,
 *                    visitorWorkUrl?, conversationId? } -> pending request
 *   listInbox      () -> owner's incoming requests, newest first
 *   getRequest     { requestId } -> request (owner or that visitor only);
 *                    contact values attached only when ownerAction='connect'
 *   actOnRequest   { requestId, decision: connect|later|decline,
 *                    sharedContactMethodIds? } -> updated request (owner only)
 *                    (`action` is the router field, so the owner decision
 *                    travels as `decision`)
 *   blockVisitor   { requestId } -> { request } (owner only, task 3.2)
 *                    adds the visitor to users.blockedUsers (addToSet, same
 *                    array the legacy report function maintains) and declines
 *                    the request when it is still pending / later
 *
 * Every action returns { ok:true, result } or { ok:false, error:{code,message} }.
 * Contact details never appear before the owner connects, and only the
 * methods the owner explicitly selected are ever resolved.
 */

const cloud = require('wx-server-sdk');
const crypto = require('node:crypto');
const core = require('./lib/core');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function requestGateDocId(ownerId, visitorId) {
  return `pair_${crypto.createHash('sha256').update(`${ownerId}\0${visitorId}`).digest('hex')}`;
}

function newRequestDocId() {
  return `req_${crypto.randomBytes(16).toString('hex')}`;
}

function typedError(code, message) {
  return { ok: false, error: { code, message } };
}

function ok(result) {
  return { ok: true, result };
}

exports.main = async (event) => {
  const { action } = event || {};
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return typedError('unauthorized', 'login required');

  try {
    switch (action) {
      case 'createRequest':
        return ok(await createRequest(openid, event));
      case 'listInbox':
        return ok(await listInbox(openid));
      case 'getRequest':
        return ok(await getRequest(openid, event));
      case 'actOnRequest':
        return ok(await actOnRequest(openid, event));
      case 'blockVisitor':
        return ok(await blockVisitor(openid, event));
      default:
        return typedError('invalid_action', 'unknown action');
    }
  } catch (error) {
    if (error && error.code) return typedError(error.code, error.message);
    console.error('requests function error:', error && error.message);
    return typedError('internal_error', 'request failed');
  }
};

async function getUserByOpenid(openid) {
  const result = await db.collection('users').where({ openid }).get();
  return result.data[0] || null;
}

/**
 * Moderate stranger-generated text via content-check. Any failure of the
 * moderation path itself becomes `moderation_unavailable` — stranger content
 * never defaults to safe.
 */
async function moderateStrangerText(content) {
  try {
    const res = await cloud.callFunction({
      name: 'content-check',
      data: { action: 'gateText', content },
    });
    const gate = res && res.result && res.result.gate;
    if (gate) return gate;
    return { allowed: false, code: 'moderation_unavailable', message: '内容安全检查暂时不可用，请稍后重试，内容已保留' };
  } catch (error) {
    console.error('moderation call failed:', error && error.message);
    return { allowed: false, code: 'moderation_unavailable', message: '内容安全检查暂时不可用，请稍后重试，内容已保留' };
  }
}

async function getRequestDoc(requestId) {
  if (typeof requestId !== 'string' || !requestId.trim()) {
    throw core.codedError('invalid_request', 'requestId is required');
  }
  const result = await db.collection('requests').doc(requestId).get().catch(() => null);
  const request = result && result.data;
  if (!request) throw core.codedError('not_found', 'request not found');
  return { _id: requestId, ...request };
}

/** Contact values are attached only for connected requests. */
async function withSharedContacts(request) {
  if (request.ownerAction !== 'connect') return { request };
  const ownerUser = await getUserByOpenid(request.ownerId);
  return { request, sharedContacts: core.resolveSharedContacts(request, ownerUser) || [] };
}

async function createRequest(openid, event) {
  const invalid = core.validateRequestPayload(event);
  if (invalid) {
    throw core.codedError(
      invalid,
      invalid === 'weak_reason' ? '请写下一个具体的认识理由（至少 10 个字）' : `invalid payload: ${invalid}`,
    );
  }
  const { ownerId } = event;
  if (ownerId === openid) throw core.codedError('invalid_owner', '不能向自己发起连接请求');

  const ownerUser = await getUserByOpenid(ownerId);
  if (!ownerUser) throw core.codedError('not_found', 'owner not found');
  if (core.isBlocked(ownerUser, openid)) throw core.codedError('blocked', '对方暂时无法接收你的请求');

  // Stranger-generated content must pass moderation; a moderation failure
  // blocks submission (never defaults to safe) so the visitor can retry.
  let visitorWorkUrl = null;
  if (event.visitorWorkUrl) {
    try {
      const parsed = new URL(String(event.visitorWorkUrl));
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('unsafe URL');
      visitorWorkUrl = parsed.toString();
    } catch (error) {
      throw core.codedError('invalid_work_url', '作品链接必须是 HTTPS 地址');
    }
  }
  const moderation = await moderateStrangerText(`${event.visitorSummary || ''}\n${event.reason}\n${visitorWorkUrl || ''}`);
  if (!moderation.allowed) throw core.codedError(moderation.code, moderation.message);

  // Client-provided context/conversation ids are untrusted. A conversation
  // becomes request evidence only through a short-lived evidence token whose
  // owner, visitor and conversation all match a server-owned visitor record.
  let verifiedSharedContext = [];
  let verifiedConversationId = '';
  let evidenceIdToConsume = '';
  if (typeof event.evidenceId === 'string' && event.evidenceId.trim()) {
    const evidenceResult = await db.collection('visitor_evidence').doc(event.evidenceId.trim()).get().catch(() => null);
    const evidence = evidenceResult && evidenceResult.data;
    const candidateConversationId = typeof event.conversationId === 'string' ? event.conversationId.trim() : '';
    if (evidence && evidence.ownerId === ownerId && evidence.visitorId === openid
        && evidence.expiresAt > Date.now() && candidateConversationId
        && evidence.conversationId === candidateConversationId) {
      const conversationResult = await db.collection('conversations').doc(candidateConversationId).get().catch(() => null);
      const conversation = conversationResult && conversationResult.data;
      if (conversation && conversation.mode === 'visitor'
          && conversation.ownerId === ownerId && conversation.visitorId === openid) {
        verifiedSharedContext = (evidence.contexts || []).filter((value) => core.normalizeSafeDecisionTopic(value)).slice(0, 5);
        verifiedConversationId = candidateConversationId;
        evidenceIdToConsume = event.evidenceId.trim();
      }
    }
  }
  const now = Date.now();
  const request = core.buildRequest({
    ...event,
    possibleSharedContext: verifiedSharedContext,
    conversationId: verifiedConversationId,
    visitorWorkUrl,
    visitorId: openid,
  }, now);
  const gateId = requestGateDocId(ownerId, openid);
  const requestId = newRequestDocId();
  // Preserve cooldowns created before deterministic gate documents existed.
  // CloudBase query APIs are used only outside the transaction.
  const legacyResult = await db.collection('requests').where({ ownerId, visitorId: openid }).get();
  const legacyGate = core.checkCreateAllowed({ requests: legacyResult.data, ownerId, visitorId: openid, now });
  const result = await db.runTransaction(async transaction => {
    const requests = transaction.collection('requests');
    const gates = transaction.collection('request_gates');
    const gateResult = await gates.doc(gateId).get().catch(() => null);
    const gate = legacyGate || core.checkCreateGate(gateResult && gateResult.data, now);
    if (gate === 'declined_cooldown') throw core.codedError('declined_cooldown', '对方刚作出过决定，请 24 小时后再试');
    if (gate === 'rate_limited') throw core.codedError('rate_limited', '24 小时内只能向同一个人发送一条请求');
    await requests.doc(requestId).set({ data: request });
    await gates.doc(gateId).set({
      data: {
        ownerId, visitorId: openid, lastRequestId: requestId,
        lastCreatedAt: now, lastDeclinedAt: null, updatedAt: now,
      },
    });
    return { _id: requestId };
  });
  if (evidenceIdToConsume) {
    await db.collection('visitor_evidence').doc(evidenceIdToConsume).remove().catch(() => {});
  }
  return { request: { _id: result._id, ...request } };
}

async function listInbox(openid) {
  const result = await db.collection('requests')
    .where({ ownerId: openid })
    .orderBy('createdAt', 'desc')
    .get();
  return { requests: result.data.map(r => ({ _id: r._id, ...r })) };
}

async function getRequest(openid, event) {
  const request = await getRequestDoc(event.requestId);
  if (!core.canViewRequest(request, openid)) throw core.codedError('forbidden', '无权查看该请求');
  return await withSharedContacts(request);
}

async function actOnRequest(openid, event) {
  // `action` is consumed by the function router, so the owner decision
  // arrives as `decision` (one of connect / later / decline).
  // Exact repeats are idempotent so clients may retry after a lost response.
  // A retry also gives best-effort learning another chance, without creating
  // a second proposal (memory uses the stable idempotency key below).
  if (typeof event.requestId !== 'string' || !event.requestId.trim()) {
    throw core.codedError('invalid_request', 'requestId is required');
  }
  const updated = await db.runTransaction(async transaction => {
    const requests = transaction.collection('requests');
    const result = await requests.doc(event.requestId).get().catch(() => null);
    const current = result && result.data;
    if (!current) throw core.codedError('not_found', 'request not found');
    if (current.ownerId !== openid) throw core.codedError('forbidden', '只有主人可以处理该请求');
    const request = { _id: event.requestId, ...current };
    const repeated = core.sameDecision(request, event.decision, event.sharedContactMethodIds);
    const next = repeated
      ? request
      : core.applyOwnerAction(request, event.decision, event.sharedContactMethodIds, Date.now());
    if (!repeated) {
      await requests.doc(event.requestId).update({
        data: {
          ownerAction: next.ownerAction,
          sharedContactMethodIds: next.sharedContactMethodIds,
          updatedAt: next.updatedAt,
        },
      });
    }
    if (next.ownerAction === 'decline') {
      const gates = transaction.collection('request_gates');
      const gateId = requestGateDocId(next.ownerId, next.visitorId);
      const gateResult = await gates.doc(gateId).get().catch(() => null);
      const oldGate = (gateResult && gateResult.data) || {};
      await gates.doc(gateId).set({ data: {
        ownerId: next.ownerId,
        visitorId: next.visitorId,
        lastRequestId: oldGate.lastRequestId || event.requestId,
        lastCreatedAt: typeof oldGate.lastCreatedAt === 'number' ? oldGate.lastCreatedAt : next.createdAt,
        lastDeclinedAt: next.updatedAt,
        updatedAt: next.updatedAt,
      } });
    }
    return next;
  });

  // Decision persistence is complete before this best-effort path starts.
  // Provider, schema, or memory failures are contained and never change the
  // success of connect/later/decline.
  const learning = await proposeDecisionLearning(openid, { ...updated, _id: event.requestId }, event.learningPreference);
  return { ...(await withSharedContacts(updated)), ...learning };
}

async function proposeDecisionLearning(openid, request, rawExplicitPreference) {
  try {
    const allResult = await db.collection('requests').where({ ownerId: openid }).get();
    const all = allResult.data.map(item => ({ _id: item._id, ...item }));
    const explicitPreference = core.validateLearningPreference(rawExplicitPreference) === null
      ? rawExplicitPreference
      : undefined;
    const evidence = {
      current: core.decisionSignal(request),
      prior: all
        .filter(item => item._id !== request._id && item.ownerAction !== 'pending')
        .map(core.decisionSignal),
      explicitPreference,
      forbiddenFragments: all.flatMap(core.thirdPartyFragments),
    };
    const eligible = core.evaluateDecisionLearning(evidence);
    if (!eligible) return { learningStatus: 'not_suggested' };

    const extracted = await cloud.callFunction({
      name: 'agent',
      data: {
        action: 'extractDecisionLearning',
        kind: eligible.kind,
        suggestedContent: eligible.suggestedContent,
      },
    });
    const agentResult = extracted && extracted.result;
    if (!agentResult || !agentResult.ok || !agentResult.result || !agentResult.result.proposal) {
      return { learningStatus: 'unavailable' };
    }
    const proposal = core.finalizeLearningProposal(agentResult.result.proposal, evidence, openid);
    if (!proposal) return { learningStatus: 'not_suggested' };

    const saved = await cloud.callFunction({
      name: 'memory',
      data: {
        action: 'createMemoryProposal',
        kind: proposal.kind,
        content: proposal.content,
        visibility: proposal.visibility,
        sourceMessageIds: proposal.sourceRequestIds,
        idempotencyKey: proposal.idempotencyKey,
      },
    });
    const result = saved && saved.result;
    const memory = result && result.memory;
    if (!memory) return { learningStatus: 'unavailable' };
    return {
      learningStatus: result.deduplicated ? 'already_handled' : 'proposed',
      learningProposalId: memory._id || memory.id,
    };
  } catch (error) {
    console.warn('decision learning unavailable:', error && error.message);
    return { learningStatus: 'unavailable' };
  }
}

/**
 * Block the visitor behind a request (task 3.2). Owner-only. Writes the
 * visitor into the same `users.blockedUsers` array the legacy report
 * function maintains (addToSet, so repeat blocks are harmless), and declines
 * the request when it is still actionable.
 */
async function blockVisitor(openid, event) {
  const request = await getRequestDoc(event.requestId);
  if (request.ownerId !== openid) throw core.codedError('forbidden', '只有主人可以拉黑访客');

  await db.collection('users').where({ openid }).update({
    data: { blockedUsers: db.command.addToSet(request.visitorId) },
  });

  const blocked = core.applyBlock(request, Date.now());
  if (blocked.ownerAction !== request.ownerAction) {
    await db.collection('requests').doc(event.requestId).update({
      data: {
        ownerAction: blocked.ownerAction,
        sharedContactMethodIds: blocked.sharedContactMethodIds,
        updatedAt: blocked.updatedAt,
      },
    });
  }
  return { request: blocked };
}
