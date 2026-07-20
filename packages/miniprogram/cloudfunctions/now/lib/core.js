/**
 * Now domain core (task 4.5) — pure logic, no cloud dependencies.
 *
 * Mirrors the canonical contract in packages/shared/now.ts and the rules in
 * docs/engineering/AI_BEHAVIOR.md §13:
 * - a Now item is an owner-confirmed public projection, never an automatic
 *   copy of raw private conversation
 * - the Vibe/agent may create a draft proposal but must never publish
 * - active = status 'published' AND (expiresAt === null OR expiresAt > now)
 * - the public Card shows at most the 3 newest active items by publishedAt
 * - archived / hidden / deleted / expired items are never shown publicly nor
 *   used as visitor-chat grounding
 * - publishing never changes the source Memory's visibility (this layer never
 *   touches the memories collection at all)
 *
 * Kept separate from index.js so it can be unit-tested with plain node.
 */

const NOW_ITEM_STATUSES = ['draft', 'published', 'archived', 'hidden', 'deleted'];

const NOW_ITEM_TOPICS = [
  'current_work',
  'completed_work',
  'exploring',
  'looking_for',
  'offer_help',
];

/** Max items on the public Card projection (AI_BEHAVIOR §13). */
const PUBLIC_NOW_LIMIT = 3;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validate a draft/updated Now payload. Returns an error string or null. */
function validateNowPayload(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== 'object') return 'invalid_payload';
  if (!partial || payload.text !== undefined) {
    if (!isNonEmptyString(payload.text) || payload.text.length > 200) return 'invalid_text';
  }
  if (!partial || payload.topic !== undefined) {
    if (!NOW_ITEM_TOPICS.includes(payload.topic)) return 'invalid_topic';
  }
  if (payload.expiresAt !== undefined && payload.expiresAt !== null) {
    if (typeof payload.expiresAt !== 'number' || !Number.isFinite(payload.expiresAt)) {
      return 'invalid_expires_at';
    }
  }
  return null;
}

/** Only the owner may ever read or mutate a Now item. */
function isOwner(item, openid) {
  return !!item && item.ownerId === openid;
}

/** Active = published and not expired. Only active items are ever public. */
function isActiveNowItem(item, now) {
  return (
    !!item &&
    item.status === 'published' &&
    (item.expiresAt === null || item.expiresAt === undefined || item.expiresAt > now)
  );
}

/**
 * The public Card projection: at most `limit` newest active items by
 * publishedAt, reduced to known-safe public fields (never ownerId,
 * sourceMemoryId, or lifecycle timestamps).
 */
function activeNowItems(items, now, limit = PUBLIC_NOW_LIMIT) {
  return (items || [])
    .filter((item) => isActiveNowItem(item, now))
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .slice(0, limit)
    .map((item) => ({
      id: item._id || item.id,
      text: item.text,
      topic: item.topic,
      publishedAt: item.publishedAt,
    }));
}

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Build a new Now item in `draft` status. Both owner-written updates and
 * Vibe proposals enter as drafts — publishing is always a separate,
 * owner-only action.
 */
function buildNowItem({ ownerId, text, topic, sourceMemoryId = null, expiresAt = null }, now) {
  return {
    schemaVersion: 1,
    ownerId,
    text: text.trim(),
    topic,
    sourceMemoryId: sourceMemoryId || null,
    status: 'draft',
    publishedAt: null,
    expiresAt: expiresAt || null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * draft/archived/hidden -> published. Sets publishedAt only on first publish.
 * Never touches the source memory — visibility of memories is owned by the
 * memory function.
 */
function applyPublish(item, now) {
  if (item.status === 'deleted') {
    const err = new Error('deleted_item_cannot_be_published');
    err.code = 'invalid_transition';
    throw err;
  }
  return {
    ...item,
    status: 'published',
    publishedAt: item.publishedAt || now,
    updatedAt: now,
  };
}

/** Owner edit of text/topic/expiresAt; status and publishedAt untouched. */
function applyEdit(item, patch, now) {
  return {
    ...item,
    text: isNonEmptyString(patch.text) ? patch.text.trim() : item.text,
    topic: patch.topic || item.topic,
    expiresAt: patch.expiresAt !== undefined ? patch.expiresAt : item.expiresAt,
    updatedAt: now,
  };
}

/** published/draft/hidden -> archived: kept in history, never public. */
function applyArchive(item, now) {
  if (item.status === 'deleted') {
    const err = new Error('deleted_item_cannot_be_archived');
    err.code = 'invalid_transition';
    throw err;
  }
  return { ...item, status: 'archived', updatedAt: now };
}

/** -> hidden: kept but explicitly hidden by the owner, never public. */
function applyHide(item, now) {
  if (item.status === 'deleted') {
    const err = new Error('deleted_item_cannot_be_hidden');
    err.code = 'invalid_transition';
    throw err;
  }
  return { ...item, status: 'hidden', updatedAt: now };
}

/** Soft delete: tombstone, excluded from all retrieval. */
function applyDelete(item, now) {
  return { ...item, status: 'deleted', updatedAt: now };
}

module.exports = {
  NOW_ITEM_STATUSES,
  NOW_ITEM_TOPICS,
  PUBLIC_NOW_LIMIT,
  validateNowPayload,
  isOwner,
  isActiveNowItem,
  activeNowItems,
  buildNowItem,
  applyPublish,
  applyEdit,
  applyArchive,
  applyHide,
  applyDelete,
  nextId,
};
