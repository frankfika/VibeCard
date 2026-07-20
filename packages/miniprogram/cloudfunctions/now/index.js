/**
 * now cloud function (task 4.5) — personal Now updates.
 *
 * Data layer for the `now_items` collection: owner-confirmed recent public
 * updates shown on the Card (at most 3 newest active items). Not a feed.
 *
 * Actions:
 *   listNowItems       owner-only; optional { status }
 *   createNowDraft     owner-only; creates status='draft' (owner-written or
 *                      Vibe-proposed — a draft is never public)
 *   publishNowItem     owner-only; -> status='published' (sets publishedAt)
 *   editNowItem        owner-only; edit text/topic/expiresAt
 *   archiveNowItem     owner-only; -> status='archived'
 *   hideNowItem        owner-only; -> status='hidden'
 *   deleteNowItem      owner-only; soft delete (status='deleted')
 *   getActiveNowItems  public read; { ownerId? } -> at most 3 newest active
 *                      items with public-safe fields only. Defaults to the
 *                      caller's own items when ownerId is omitted.
 *
 * Every write action is scoped to the caller's OPENID: a Now item can only be
 * created or mutated by its owner. The Vibe/agent creates drafts through
 * createNowDraft only — there is no agent path to publish.
 *
 * Required indexes (docs/engineering/ARCHITECTURE.md §4, see README.md):
 *   ownerId + status + publishedAt
 *   ownerId + expiresAt
 */

const cloud = require('wx-server-sdk');
const core = require('./lib/core');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { action } = event || {};
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) throw new Error('unauthorized');

  switch (action) {
    case 'listNowItems':
      return listNowItems(openid, event);
    case 'createNowDraft':
      return createNowDraft(openid, event);
    case 'publishNowItem':
      return publishNowItem(openid, event);
    case 'editNowItem':
      return editNowItem(openid, event);
    case 'archiveNowItem':
      return archiveNowItem(openid, event);
    case 'hideNowItem':
      return hideNowItem(openid, event);
    case 'deleteNowItem':
      return deleteNowItem(openid, event);
    case 'getActiveNowItems':
      return getActiveNowItems(openid, event);
    default:
      throw new Error('invalid_action');
  }
};

async function getOwnedNowItem(nowId, openid) {
  if (!nowId) throw new Error('now_id_required');
  const result = await db.collection('now_items').doc(nowId).get().catch(() => null);
  const item = result && result.data;
  if (!item || !core.isOwner(item, openid)) throw new Error('not_found');
  return { _id: nowId, ...item };
}

async function listNowItems(openid, event) {
  const { status } = event;
  if (status && !core.NOW_ITEM_STATUSES.includes(status)) throw new Error('invalid_status');

  const where = { ownerId: openid };
  if (status) where.status = status;

  const result = await db.collection('now_items').where(where).orderBy('updatedAt', 'desc').get();
  // Deleted tombstones never leave the store, even for the owner list.
  const nowItems = result.data
    .filter((item) => item.status !== 'deleted')
    .map((item) => ({ _id: item._id, ...item }));
  return { nowItems };
}

async function createNowDraft(openid, event) {
  const payload = {
    text: event.text,
    topic: event.topic,
    expiresAt: event.expiresAt !== undefined ? event.expiresAt : null,
  };
  const invalid = core.validateNowPayload(payload);
  if (invalid) throw new Error(invalid);

  const now = Date.now();
  const item = core.buildNowItem({
    ownerId: openid,
    text: payload.text,
    topic: payload.topic,
    sourceMemoryId: event.sourceMemoryId || null,
    expiresAt: payload.expiresAt,
  }, now);

  const result = await db.collection('now_items').add({ data: item });
  return { nowItem: { _id: result._id, ...item } };
}

async function publishNowItem(openid, event) {
  const item = await getOwnedNowItem(event.nowId, openid);
  const updated = core.applyPublish(item, Date.now());
  await db.collection('now_items').doc(event.nowId).update({
    data: { status: updated.status, publishedAt: updated.publishedAt, updatedAt: updated.updatedAt },
  });
  return { nowItem: updated };
}

async function editNowItem(openid, event) {
  const item = await getOwnedNowItem(event.nowId, openid);
  const patch = { text: event.text, topic: event.topic, expiresAt: event.expiresAt };
  const invalid = core.validateNowPayload(
    {
      text: patch.text ?? item.text,
      topic: patch.topic ?? item.topic,
      expiresAt: patch.expiresAt !== undefined ? patch.expiresAt : item.expiresAt,
    },
  );
  if (invalid) throw new Error(invalid);

  const updated = core.applyEdit(item, patch, Date.now());
  await db.collection('now_items').doc(event.nowId).update({
    data: { text: updated.text, topic: updated.topic, expiresAt: updated.expiresAt, updatedAt: updated.updatedAt },
  });
  return { nowItem: updated };
}

async function archiveNowItem(openid, event) {
  const item = await getOwnedNowItem(event.nowId, openid);
  const updated = core.applyArchive(item, Date.now());
  await db.collection('now_items').doc(event.nowId).update({
    data: { status: updated.status, updatedAt: updated.updatedAt },
  });
  return { nowItem: updated };
}

async function hideNowItem(openid, event) {
  const item = await getOwnedNowItem(event.nowId, openid);
  const updated = core.applyHide(item, Date.now());
  await db.collection('now_items').doc(event.nowId).update({
    data: { status: updated.status, updatedAt: updated.updatedAt },
  });
  return { nowItem: updated };
}

async function deleteNowItem(openid, event) {
  const item = await getOwnedNowItem(event.nowId, openid);
  const updated = core.applyDelete(item, Date.now());
  await db.collection('now_items').doc(event.nowId).update({
    data: { status: updated.status, updatedAt: updated.updatedAt },
  });
  return { nowItem: updated };
}

/**
 * Public read: the same published snapshot owner and visitor surfaces see.
 * Only active (published, non-expired) items are read from the database at
 * all — drafts, archived, hidden and deleted items never leave the store
 * through this action.
 */
async function getActiveNowItems(openid, event) {
  const ownerId = typeof event.ownerId === 'string' && event.ownerId.trim()
    ? event.ownerId.trim()
    : openid;
  const result = await db.collection('now_items')
    .where({ ownerId, status: 'published' })
    .orderBy('publishedAt', 'desc')
    .get();
  return { nowItems: core.activeNowItems(result.data, Date.now()) };
}
