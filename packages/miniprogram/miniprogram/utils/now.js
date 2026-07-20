/**
 * Now helpers for the Mini Program (task 4.5).
 *
 * Mirrors the canonical contract in packages/shared/now.ts and the pure logic
 * in cloudfunctions/now/lib/core.js, so the Card page, the Vibe page, and the
 * fixture demo all apply exactly the same rule:
 *
 *   active = status 'published' && (expiresAt === null || expiresAt > now)
 *
 * The public Card shows at most the 3 newest active items by publishedAt.
 * Archived / hidden / deleted / expired items are never shown publicly.
 * Pure module — no wx or cloud dependencies, unit-testable with plain node.
 */

const NOW_ITEM_STATUSES = ['draft', 'published', 'archived', 'hidden', 'deleted'];

const NOW_ITEM_TOPICS = ['current_work', 'completed_work', 'exploring', 'looking_for', 'offer_help'];

const NOW_TOPIC_LABELS = {
  current_work: '正在做',
  completed_work: '刚完成',
  exploring: '在关注',
  looking_for: '在寻找',
  offer_help: '能帮上忙',
};

const NOW_STATUS_LABELS = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
  hidden: '已隐藏',
  deleted: '已删除',
};

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
 * At most `limit` newest active items by publishedAt, reduced to public-safe
 * fields. Empty input returns [] — the empty state invents nothing.
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
      topicLabel: NOW_TOPIC_LABELS[item.topic] || '',
      publishedAt: item.publishedAt || null,
    }));
}

/** Owner-facing list rows: everything except deleted tombstones. */
function ownerNowList(items) {
  return (items || [])
    .filter((item) => item && item.status !== 'deleted')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((item) => ({
      id: item._id || item.id,
      text: item.text,
      topic: item.topic,
      topicLabel: NOW_TOPIC_LABELS[item.topic] || '',
      status: item.status,
      statusLabel: NOW_STATUS_LABELS[item.status] || item.status,
      publishedAt: item.publishedAt || null,
      expiresAt: item.expiresAt === undefined ? null : item.expiresAt,
    }));
}

module.exports = {
  NOW_ITEM_STATUSES,
  NOW_ITEM_TOPICS,
  NOW_TOPIC_LABELS,
  NOW_STATUS_LABELS,
  PUBLIC_NOW_LIMIT,
  isActiveNowItem,
  activeNowItems,
  ownerNowList,
};
