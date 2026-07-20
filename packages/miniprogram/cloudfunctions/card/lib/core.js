/**
 * Public Card projection core (task 2.1) — pure logic, no cloud dependencies.
 *
 * Builds the VibeCard shape from packages/shared/vibe.ts out of:
 * - the owner's v1 `users` document (nickname / avatar / namecard / bio)
 * - the owner's public + confirmed memories (already filtered at query stage)
 *
 * Hard rules enforced here:
 * - contact-bearing namecard keys (wechat / socialLinks / contacts / ...) are
 *   never projected
 * - non-public memory content is defensively dropped even if it slips past
 *   the query filter — permission filtering belongs before retrieval, and
 *   this is the second net, not the first
 *
 * Kept separate from index.js so it can be unit-tested with plain node.
 */

/**
 * v1 namecard keys that may carry contact details. Anything not in the
 * projection allow-list below is dropped; these are called out explicitly
 * because they look presentational but are contact data.
 */
const CONTACT_KEYS = [
  'wechat',
  'phone',
  'mobile',
  'email',
  'telegram',
  'qq',
  'whatsapp',
  'socialLinks',
  'contacts',
  'contactMethods',
];

/** namecard keys that are safe to read for a public projection. */
const PRESENTATIONAL_NAMECARD_KEYS = ['intro', 'motto', 'theme', 'coverImage', 'interests'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Keep only known-presentational namecard fields. Contact keys are stripped
 * even if a v1 document carries them.
 */
function sanitizeNamecard(namecard) {
  if (!namecard || typeof namecard !== 'object') return {};
  const clean = {};
  for (const key of PRESENTATIONAL_NAMECARD_KEYS) {
    if (namecard[key] !== undefined) clean[key] = namecard[key];
  }
  return clean;
}

/** A Card is gone when the owner profile is flagged deleted. */
function isCardDeleted(user) {
  return !!user && (user.deleted === true || user.status === 'deleted');
}

/**
 * Second-net memory filter: only public + confirmed memories may ever feed
 * the projection. The db query already applies this filter; anything else
 * arriving here is a bug and gets dropped silently.
 */
function filterProjectableMemories(memories) {
  return (memories || []).filter(
    m => m && m.status === 'confirmed' && m.visibility === 'public' && isNonEmptyString(m.content),
  );
}

function latestContent(memories, kind) {
  const found = memories
    .filter(m => m.kind === kind)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  return found ? found.content : '';
}

function contentsOf(memories, kind) {
  return memories
    .filter(m => m.kind === kind)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(m => m.content)
    .slice(0, 5);
}

/** Max Now items on the public Card (AI_BEHAVIOR §13). */
const PUBLIC_NOW_LIMIT = 3;

/** Active = published and not expired. Only active items are ever public. */
function isActiveNowItem(item, now) {
  return (
    !!item &&
    item.status === 'published' &&
    (item.expiresAt === null || item.expiresAt === undefined || item.expiresAt > now)
  );
}

/**
 * Second-net Now filter + projection (task 4.5): the db query already reads
 * only status='published'; expiry is applied here and the projection keeps at
 * most 3 newest active items with public-safe fields only (no ownerId,
 * sourceMemoryId, or lifecycle internals). Empty input projects to [] — the
 * empty state invents nothing.
 */
function projectActiveNowItems(nowItems, now, limit = PUBLIC_NOW_LIMIT) {
  return (nowItems || [])
    .filter(item => isActiveNowItem(item, now) && isNonEmptyString(item.text))
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .slice(0, limit)
    .map(item => ({
      id: item._id || item.id,
      text: item.text,
      topic: item.topic,
      publishedAt: item.publishedAt || null,
    }));
}

/**
 * Build the public VibeCard projection.
 *
 * @param {object} input
 * @param {string} input.ownerId owner openid
 * @param {object} input.user v1 users document (may carry private fields —
 *   they are never read into the projection)
 * @param {Array} input.memories owner memories (defensively re-filtered)
 * @param {Array} [input.nowItems] owner now_items (defensively re-filtered
 *   to active-only and projected; task 4.5)
 * @param {number} now timestamp for updatedAt
 */
function buildPublicCard({ ownerId, user, memories, nowItems }, now) {
  const namecard = sanitizeNamecard(user && user.namecard);
  const projectable = filterProjectableMemories(memories);

  return {
    id: `card-${ownerId}`,
    schemaVersion: 1,
    ownerId,
    name: (user && user.nickname) || '',
    avatarUrl: (user && user.avatar) || '',
    headline: namecard.motto || (user && user.bio) || namecard.intro || '',
    currentFocus: latestContent(projectable, 'current'),
    canHelpWith: contentsOf(projectable, 'fact'),
    wantsToMeet: contentsOf(projectable, 'preference'),
    topics: Array.isArray(namecard.interests)
      ? namecard.interests.filter(isNonEmptyString).slice(0, 8)
      : [],
    highlights: [],
    now: projectActiveNowItems(nowItems, now),
    agentEnabled: true,
    updatedAt: now,
  };
}

module.exports = {
  CONTACT_KEYS,
  sanitizeNamecard,
  isCardDeleted,
  filterProjectableMemories,
  isActiveNowItem,
  projectActiveNowItems,
  buildPublicCard,
};
