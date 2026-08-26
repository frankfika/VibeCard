/**
 * Visitor abuse-control gates (task 3.2) — pure logic, no cloud dependencies.
 *
 * Two per-day budgets, tracked in the `visitor_activity` collection
 * (one doc per visitor / owner / day):
 * - VISITOR_MESSAGES_PER_DAY: messages one visitor may send to one owner
 * - VISITOR_NEW_CONVERSATIONS_PER_DAY: distinct owners one visitor may start
 *   conversations with
 *
 * The gates run before any model call; a gated visitor never reaches the
 * provider. Day boundaries use UTC+8 so "tomorrow" matches user expectation.
 */

const VISITOR_MESSAGES_PER_DAY = 60;
const VISITOR_NEW_CONVERSATIONS_PER_DAY = 10;

/** East-8 date string, e.g. '2026-07-19'. */
function todayStr(now) {
  return new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
}

/** Deterministic doc id for the (visitor, owner, day) activity counter. */
function activityDocId(visitorId, ownerId, dateStr) {
  return `${visitorId}:${ownerId}:${dateStr}`;
}

/** Deterministic aggregate doc id for one visitor's distinct-owner budget. */
function activityDailyDocId(visitorId, dateStr) {
  return `__daily__:${visitorId}:${dateStr}`;
}

/** The owner's users document carries a blockedUsers array of openids. */
function isBlocked(ownerUser, visitorId) {
  return Array.isArray(ownerUser && ownerUser.blockedUsers) && ownerUser.blockedUsers.includes(visitorId);
}

/**
 * Gate decision for one incoming visitor message.
 *
 * @param {object} input
 * @param {object|null} input.myDoc today's activity doc for this
 *   (visitor, owner) pair, or null when this would be a new conversation
 * @param {number} input.todayOwnerCount distinct owners this visitor has
 *   activity docs for today (only consulted when myDoc is null)
 * @returns {null|'rate_limited_messages'|'rate_limited_new'}
 */
function checkVisitorActivity({ myDoc, todayOwnerCount }) {
  const count = myDoc && typeof myDoc.count === 'number' ? myDoc.count : 0;
  if (count >= VISITOR_MESSAGES_PER_DAY) return 'rate_limited_messages';
  if (!myDoc && todayOwnerCount >= VISITOR_NEW_CONVERSATIONS_PER_DAY) return 'rate_limited_new';
  return null;
}

module.exports = {
  VISITOR_MESSAGES_PER_DAY,
  VISITOR_NEW_CONVERSATIONS_PER_DAY,
  todayStr,
  activityDocId,
  activityDailyDocId,
  isBlocked,
  checkVisitorActivity,
};
