/**
 * Connection request core (task 2.3) — pure logic, no cloud dependencies.
 *
 * Mirrors the ConnectionRequest contract in packages/shared/vibe.ts and
 * AI_BEHAVIOR.md §7:
 * - a request carries a specific reason; weak reasons are rejected
 * - one pending/new request per visitor-owner pair per 24h
 * - a declined visitor cools down for 24h; a blocked visitor cannot request
 * - contact values are attached only after the owner chooses `connect`
 *
 * Functions throw coded Errors (err.code) so index.js can map them onto
 * typed results; pure predicates return values instead.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_REASON_LENGTH = 10;
const OWNER_ACTIONS = ['connect', 'later', 'decline'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function codedError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/**
 * Validate a createRequest payload. Returns an error code or null.
 * A reason under MIN_REASON_LENGTH characters is a weak_reason — the client
 * uses that code to guide the visitor toward a specific reason.
 */
function validateRequestPayload({ ownerId, reason, visitorSummary, possibleSharedContext, visitorWorkUrl }) {
  if (!isNonEmptyString(ownerId)) return 'invalid_owner';
  if (!isNonEmptyString(reason)) return 'weak_reason';
  if (reason.trim().length < MIN_REASON_LENGTH) return 'weak_reason';
  if (visitorSummary !== undefined && visitorSummary !== null && typeof visitorSummary !== 'string') {
    return 'invalid_summary';
  }
  if (possibleSharedContext !== undefined && possibleSharedContext !== null && !Array.isArray(possibleSharedContext)) {
    return 'invalid_shared_context';
  }
  if (visitorWorkUrl !== undefined && visitorWorkUrl !== null && typeof visitorWorkUrl !== 'string') {
    return 'invalid_work_url';
  }
  return null;
}

/** Build a pending ConnectionRequest (schemaVersion 1). */
function buildRequest({ ownerId, visitorId, visitorSummary, reason, possibleSharedContext, visitorWorkUrl, conversationId }, now) {
  return {
    schemaVersion: 1,
    ownerId,
    visitorId,
    visitorSummary: typeof visitorSummary === 'string' ? visitorSummary.trim().slice(0, 500) : '',
    reason: reason.trim().slice(0, 500),
    possibleSharedContext: (Array.isArray(possibleSharedContext) ? possibleSharedContext : [])
      .filter(isNonEmptyString)
      .map(s => s.trim().slice(0, 100))
      .slice(0, 5),
    ...(isNonEmptyString(visitorWorkUrl) ? { visitorWorkUrl: visitorWorkUrl.trim().slice(0, 300) } : {}),
    ...(isNonEmptyString(conversationId) ? { conversationId: conversationId.trim() } : {}),
    ownerAction: 'pending',
    sharedContactMethodIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** The owner's users document carries a blockedUsers array of openids. */
function isBlocked(ownerUser, visitorId) {
  return Array.isArray(ownerUser && ownerUser.blockedUsers) && ownerUser.blockedUsers.includes(visitorId);
}

/**
 * Gate for createRequest. Returns 'declined_cooldown' | 'rate_limited' | null.
 *
 * - declined_cooldown: the owner declined this visitor within the window
 * - rate_limited: this visitor already sent a request to this owner within
 *   the window (at most one pending/new request per 24h)
 */
function checkCreateAllowed({ requests, ownerId, visitorId, now, windowMs = DAY_MS }) {
  const mine = (requests || []).filter(r => r && r.ownerId === ownerId && r.visitorId === visitorId);
  const declined = mine.some(r => r.ownerAction === 'decline' && now - (r.updatedAt || 0) < windowMs);
  if (declined) return 'declined_cooldown';
  const recent = mine.some(r => now - (r.createdAt || 0) < windowMs);
  if (recent) return 'rate_limited';
  return null;
}

/** Gate decision from the deterministic owner/visitor pair document. */
function checkCreateGate(gate, now, windowMs = DAY_MS) {
  if (!gate) return null;
  if (typeof gate.lastDeclinedAt === 'number' && now - gate.lastDeclinedAt < windowMs) {
    return 'declined_cooldown';
  }
  if (typeof gate.lastCreatedAt === 'number' && now - gate.lastCreatedAt < windowMs) {
    return 'rate_limited';
  }
  return null;
}

/** Owner and the requesting visitor may read a request; nobody else. */
function canViewRequest(request, openid) {
  return !!request && (request.ownerId === openid || request.visitorId === openid);
}

/**
 * Apply an owner decision. Allowed from pending or later; connect and
 * decline are terminal. `connect` requires at least one selected contact
 * method. Returns the updated request; throws coded errors otherwise.
 */
function applyOwnerAction(request, action, sharedContactMethodIds, now) {
  if (!OWNER_ACTIONS.includes(action)) throw codedError('invalid_action', 'action must be connect, later, or decline');
  if (request.ownerAction !== 'pending' && request.ownerAction !== 'later') {
    throw codedError('invalid_transition', `cannot act on a ${request.ownerAction} request`);
  }
  if (action === 'connect') {
    const ids = (Array.isArray(sharedContactMethodIds) ? sharedContactMethodIds : []).filter(isNonEmptyString);
    if (ids.length === 0) {
      throw codedError('invalid_contact_selection', 'connect requires at least one contact method');
    }
    return {
      ...request,
      ownerAction: 'connect',
      sharedContactMethodIds: [...new Set(ids)].slice(0, 10),
      updatedAt: now,
    };
  }
  return { ...request, ownerAction: action, sharedContactMethodIds: [], updatedAt: now };
}

/**
 * Resolve contact values for a connected request. Returns undefined for any
 * other state — pending / later / decline never carry contact data. Unknown
 * ids are dropped silently.
 */
function resolveSharedContacts(request, ownerUser) {
  if (!request || request.ownerAction !== 'connect') return undefined;
  const methods = Array.isArray(ownerUser && ownerUser.contactMethods) ? ownerUser.contactMethods : [];
  return request.sharedContactMethodIds
    .map(id => methods.find(m => m && m.id === id))
    .filter(Boolean)
    .map(m => ({ id: m.id, kind: m.kind, label: m.label || '', value: m.value }));
}

/**
 * Blocking a visitor (task 3.2) declines the request while it is still
 * actionable (pending / later). Terminal states (connect / decline) are
 * returned unchanged so blocking stays idempotent.
 */
function applyBlock(request, now) {
  if (!request) return request;
  if (request.ownerAction === 'pending' || request.ownerAction === 'later') {
    return applyOwnerAction(request, 'decline', undefined, now);
  }
  return request;
}

function clean(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalize(value) {
  return clean(value).toLocaleLowerCase('zh-CN');
}

// Visitor-controlled shared-context strings are not learning topics by
// default. Only this small product-level vocabulary may participate in a
// repeated-decision signal; everything else is discarded as ambiguous.
const SAFE_TOPIC_RULES = [
  { label: '个人 AI 分身', patterns: [/^(?:双方)?都?(?:在)?(?:做|开发|研究)?(?:个人)?ai分身$/i, /^(?:both)?personalaiagents?$/i] },
  { label: '自托管 AI', patterns: [/^(?:双方)?都?(?:在)?(?:做|研究)?自托管ai$/i, /^(?:both)?selfhostedai$/i] },
  { label: 'AI 社交产品', patterns: [/^(?:双方)?都?(?:在)?(?:做|开发|研究)?ai社交产品$/i, /^(?:both)?aisocialproducts?$/i] },
  { label: '隐私边界', patterns: [/^(?:双方)?都?(?:关注|研究)?隐私边界$/i, /^(?:both)?privacyboundar(?:y|ies)$/i] },
  { label: '数据隐私', patterns: [/^(?:双方)?都?(?:关注|研究)?数据隐私$/i, /^(?:both)?dataprivacy$/i] },
  { label: '模型安全', patterns: [/^(?:双方)?都?(?:关注|研究)?模型安全$/i, /^(?:both)?modelsafety$/i] },
  { label: '知识检索', patterns: [/^(?:双方)?都?(?:在)?(?:做|研究)?知识检索$/i, /^(?:both)?knowledgeretrieval$/i] },
  { label: '微信小程序', patterns: [/^(?:双方)?都?(?:在)?(?:做|开发)?微信小程序$/i, /^(?:both)?wechatminiprograms?$/i] },
  { label: '开源软件', patterns: [/^(?:双方)?都?(?:在)?(?:做|开发|贡献)?开源软件$/i, /^(?:both)?opensource(?:software)?$/i] },
  { label: '产品设计', patterns: [/^(?:双方)?都?(?:在)?(?:做|研究)?产品设计$/i, /^(?:both)?productdesign$/i] },
  { label: '用户研究', patterns: [/^(?:双方)?都?(?:在)?(?:做|研究)?用户研究$/i, /^(?:both)?userresearch$/i] },
  { label: '软件开发', patterns: [/^(?:双方)?都?(?:在)?(?:做|从事)?软件开发$/i, /^(?:both)?softwaredevelopment$/i] },
];

function normalizeSafeDecisionTopic(value) {
  const compact = clean(value, 100).toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]+/gu, '');
  if (!compact) return null;
  for (const rule of SAFE_TOPIC_RULES) {
    if (rule.patterns.some(pattern => pattern.test(compact))) return rule.label;
  }
  return null;
}

function identifiableFragments(value) {
  const raw = clean(value, 500);
  if (!raw) return [];
  const found = [raw];
  found.push(...raw.split(/[\s,，。；;、|/]+/).filter(part => part.length >= 3));
  found.push(...(raw.match(/https?:\/\/[^\s]+|www\.[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|@[A-Za-z0-9_.-]{2,}|\b\+?\d[\d\s().-]{6,}\d\b/gi) || []));
  found.push(...(raw.match(/\b[A-Z][a-z]{1,30}(?:\s+[A-Z][a-z]{1,30})+\b/g) || []));
  for (const match of raw.matchAll(/(?=([赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹][\u3400-\u9fff]{1,2}))/g)) {
    if (match[1]) found.push(match[1].slice(0, 2), match[1]);
  }
  found.push(...(raw.match(/(?:欧阳|司马|上官|诸葛|东方|皇甫|尉迟|公孙)[\u3400-\u9fff]{1,2}/g) || []));
  for (const match of raw.matchAll(/(?:我是|我叫|叫做|介绍|认识|联系|寻找)\s*([\u3400-\u9fff]{2,4})(?=给|来|和|，|。|、|,|\s|$)/g)) {
    if (match[1]) found.push(match[1]);
  }
  for (const match of raw.matchAll(/来自\s*([\u3400-\u9fff]{2,12})(?=，|。|、|,|\s|$)/g)) {
    if (match[1]) found.push(match[1]);
  }
  return [...new Set(found.map(value => clean(value)).filter(Boolean))].slice(0, 40);
}

/** Privacy-minimized: never carries visitor id, reason, summary, or URL. */
function decisionSignal(request) {
  return {
    requestId: request._id || request.id,
    decision: request.ownerAction,
    contexts: [...new Set((request.possibleSharedContext || [])
      .map(normalizeSafeDecisionTopic)
      .filter(Boolean))].slice(0, 5),
  };
}

function thirdPartyFragments(request) {
  const unsafeContexts = (request.possibleSharedContext || [])
    .filter(context => normalizeSafeDecisionTopic(context) === null);
  return [...new Set([
    request.visitorId,
    request.visitorSummary,
    request.visitorWorkUrl,
    request.reason,
    ...unsafeContexts,
  ].flatMap(identifiableFragments))].slice(0, 80);
}

function containsForbidden(content, fragments) {
  const target = normalize(content);
  return (fragments || []).some(fragment => {
    const needle = normalize(fragment);
    const isShortCjkIdentity = /^[\u3400-\u9fff]{2}$/.test(needle);
    return (needle.length >= 3 || isShortCjkIdentity) && target.includes(needle);
  });
}

function validateLearningPreference(value) {
  if (!value || typeof value !== 'object') return 'invalid_learning_preference';
  if (!['preference', 'boundary'].includes(value.kind)) return 'invalid_learning_kind';
  if (!isNonEmptyString(value.content) || value.content.length > 500) return 'invalid_learning_content';
  return null;
}

function evaluateDecisionLearning({ current, prior, explicitPreference, forbiddenFragments }) {
  if (explicitPreference) {
    if (validateLearningPreference(explicitPreference) || containsForbidden(explicitPreference.content, forbiddenFragments)) {
      return null;
    }
    return {
      kind: explicitPreference.kind,
      suggestedContent: clean(explicitPreference.content, 500),
      sourceRequestIds: [current.requestId],
    };
  }
  const contexts = new Map(current.contexts.map(context => [normalize(context), clean(context)]));
  for (const previous of prior || []) {
    if (previous.decision !== current.decision) continue;
    for (const context of previous.contexts || []) {
      const label = contexts.get(normalize(context));
      if (!label) continue;
      const positive = current.decision === 'connect';
      const suggestedContent = positive
        ? `我更愿意认识能围绕「${label}」进行具体交流的人。`
        : `对于围绕「${label}」的连接邀请，我希望先看到更明确、合适的交流理由。`;
      if (containsForbidden(suggestedContent, forbiddenFragments)) continue;
      return {
        kind: positive ? 'preference' : 'boundary',
        suggestedContent,
        sourceRequestIds: [previous.requestId, current.requestId].sort(),
      };
    }
  }
  return null;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function stableFingerprint(value) {
  return `${fnv1a(value)}${fnv1a([...value].reverse().join(''))}`;
}

function finalizeLearningProposal(value, evidence, ownerId) {
  const eligible = evaluateDecisionLearning(evidence);
  if (!eligible || !value || typeof value !== 'object') return null;
  if (!['preference', 'boundary'].includes(value.kind) || value.kind !== eligible.kind) return null;
  if (!isNonEmptyString(value.content) || value.content.length > 500) return null;
  if (!['private', 'agent_only'].includes(value.suggestedVisibility)) return null;
  if (containsForbidden(value.content, evidence.forbiddenFragments)) return null;
  const content = clean(value.content, 500);
  return {
    kind: value.kind,
    content,
    visibility: value.suggestedVisibility,
    sourceRequestIds: eligible.sourceRequestIds,
    idempotencyKey: `connection-decision:${stableFingerprint(`${ownerId}|${evidence.current.requestId}`)}`,
  };
}

function sameDecision(request, decision, sharedContactMethodIds) {
  if (request.ownerAction !== decision) return false;
  if (decision !== 'connect') return true;
  const a = [...new Set(request.sharedContactMethodIds || [])].sort();
  const b = [...new Set(sharedContactMethodIds || [])].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

module.exports = {
  DAY_MS,
  MIN_REASON_LENGTH,
  OWNER_ACTIONS,
  codedError,
  validateRequestPayload,
  buildRequest,
  isBlocked,
  checkCreateAllowed,
  checkCreateGate,
  canViewRequest,
  applyOwnerAction,
  applyBlock,
  resolveSharedContacts,
  decisionSignal,
  normalizeSafeDecisionTopic,
  thirdPartyFragments,
  validateLearningPreference,
  evaluateDecisionLearning,
  finalizeLearningProposal,
  sameDecision,
};
