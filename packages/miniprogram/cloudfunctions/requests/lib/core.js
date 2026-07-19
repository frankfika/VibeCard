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

module.exports = {
  DAY_MS,
  MIN_REASON_LENGTH,
  OWNER_ACTIONS,
  codedError,
  validateRequestPayload,
  buildRequest,
  isBlocked,
  checkCreateAllowed,
  canViewRequest,
  applyOwnerAction,
  applyBlock,
  resolveSharedContacts,
};
