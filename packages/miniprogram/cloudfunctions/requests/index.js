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
 *
 * Every action returns { ok:true, result } or { ok:false, error:{code,message} }.
 * Contact details never appear before the owner connects, and only the
 * methods the owner explicitly selected are ever resolved.
 */

const cloud = require('wx-server-sdk');
const core = require('./lib/core');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

  const existing = await db.collection('requests').where({ ownerId, visitorId: openid }).get();
  const gate = core.checkCreateAllowed({ requests: existing.data, ownerId, visitorId: openid, now: Date.now() });
  if (gate === 'declined_cooldown') throw core.codedError('declined_cooldown', '对方刚作出过决定，请 24 小时后再试');
  if (gate === 'rate_limited') throw core.codedError('rate_limited', '24 小时内只能向同一个人发送一条请求');

  const request = core.buildRequest({ ...event, visitorId: openid }, Date.now());
  const result = await db.collection('requests').add({ data: request });
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
  const request = await getRequestDoc(event.requestId);
  if (request.ownerId !== openid) throw core.codedError('forbidden', '只有主人可以处理该请求');

  // `action` is consumed by the function router, so the owner decision
  // arrives as `decision` (one of connect / later / decline).
  const updated = core.applyOwnerAction(request, event.decision, event.sharedContactMethodIds, Date.now());
  await db.collection('requests').doc(event.requestId).update({
    data: {
      ownerAction: updated.ownerAction,
      sharedContactMethodIds: updated.sharedContactMethodIds,
      updatedAt: updated.updatedAt,
    },
  });
  return await withSharedContacts(updated);
}
