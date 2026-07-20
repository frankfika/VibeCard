/**
 * card cloud function (task 2.1) — public Card projection.
 *
 * Actions:
 *   getPublicCard  { ownerId } -> { card }   VibeCard-shaped, contact-free
 *
 * Privacy contract:
 * - memories are filtered at query stage (status=confirmed AND
 *   visibility=public); agent_only / connected / private content is never
 *   read from the database for this endpoint
 * - contact-bearing namecard fields are stripped in the projection
 * - missing owner -> not_found; deleted profile -> card_deleted
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

  if (action !== 'getPublicCard') return typedError('invalid_action', 'unknown action');

  const { ownerId } = event;
  if (typeof ownerId !== 'string' || !ownerId.trim()) {
    return typedError('invalid_request', 'ownerId is required');
  }

  try {
    const userResult = await db.collection('users').where({ openid: ownerId }).get();
    const user = userResult.data[0];
    if (!user) return typedError('not_found', 'owner not found');
    if (core.isCardDeleted(user)) return typedError('card_deleted', 'this card is no longer available');

    // Permission filtering happens here, before retrieval — not after generation.
    // now_items: only status='published' is ever read; expiry + the 3-item cap
    // are applied in the projection (task 4.5).
    const [memoryResult, nowResult] = await Promise.all([
      db.collection('memories')
        .where({ ownerId, status: 'confirmed', visibility: 'public' })
        .get(),
      db.collection('now_items')
        .where({ ownerId, status: 'published' })
        .orderBy('publishedAt', 'desc')
        .get()
        .catch(() => ({ data: [] })),
    ]);

    const card = core.buildPublicCard(
      { ownerId, user, memories: memoryResult.data, nowItems: nowResult.data },
      Date.now(),
    );
    return ok({ card });
  } catch (error) {
    console.error('card function error:', error && error.message);
    return typedError('internal_error', 'failed to load the card');
  }
};
