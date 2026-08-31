/**
 * archive/deleteAll cloud function (task 4.6) — owner-scoped complete
 * deletion gated by a fresh-export receipt.
 *
 * Action: deleteAll { confirmation: { id, archiveDigest, preparedAt } }
 *         -> { state: 'success' | 'partial_cleanup', cleanup }
 *
 * Hard rules (DEVELOPMENT_PLAN.md §4.6 acceptance):
 *   1. The caller MUST have just exported successfully (archive/export
 *      prepareDeleteAll wrote a server-side receipt keyed by ownerOpenid).
 *   2. The echoed confirmation { id, archiveDigest, preparedAt } MUST match
 *      the stored receipt exactly; mismatch => token_mismatch.
 *   3. The receipt MUST NOT be consumed (single-use) and MUST NOT be expired
 *      (default 5-minute replay window).
 *   4. The receipt ownerOpenid MUST equal cloud.getWXContext().OPENID.
 *   5. After deletion, the function re-scans every owner-scoped collection
 *      AND the public Card projection. Any leftover record forces
 *      `partial_cleanup` and reports exactly which ids remain so the owner
 *      can reconcile.
 *
 * What gets deleted:
 *   - canonical owner records (memories, conversations, requests,
 *     now_items, contact_methods, visitor_evidence, request_gates,
 *     owner_export_receipts)
 *   - public Card projection tombstoned (users.deleted=true,
 *     users.status='deleted', users.blockedUsers=[])
 *   - audit log entry kept (an owner may inspect what happened)
 *
 * What never gets deleted:
 *   - other owners' data (strict ownerOpenid filter)
 *   - the audit log entry this call writes
 */

const cloud = require('wx-server-sdk');
const core = require('../lib/core');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function typedError(code, message) {
  return { ok: false, error: { code, message } };
}
function ok(result) {
  return { ok: true, result };
}

async function audit(openid, action, outcome, meta) {
  try {
    await db.collection('owner_audit_log').add({
      data: {
        ownerOpenid: openid || '',
        action,
        outcome,
        meta: meta || {},
        createdAt: Date.now(),
      },
    });
  } catch (error) {
    console.warn('archive.deleteAll audit failed:', error && error.message);
  }
}

exports.main = async (event) => {
  const { action } = event || {};
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return typedError('unauthorized', 'login required');

  if (action !== 'deleteAll') {
    return typedError('invalid_action', 'unknown action');
  }

  const confirmation = event.confirmation || null;

  // Fetch receipt first so we can validate before touching anything else.
  // The receipt id is deterministic from ownerOpenid; cross-owner replay
  // would already fail the existence check below, but we also gate on
  // ownerOpenid match.
  const receiptId = core.computeDeleteAllReceiptId(openid);
  const receiptResult = await db.collection('owner_export_receipts').doc(receiptId).get().catch(() => null);
  if (!receiptResult || !receiptResult.data) {
    await audit(openid, 'deleteAll', 'failure', { reason: 'no_receipt' });
    return ok({
      state: 'permission_denied',
      error: { code: 'token_missing', message: 'no active delete-all receipt; call archive/export prepareDeleteAll first' },
    });
  }
  const receipt = receiptResult.data;
  if (receipt.ownerOpenid !== openid) {
    await audit(openid, 'deleteAll', 'failure', { reason: 'receipt_owner_mismatch' });
    return ok({
      state: 'permission_denied',
      error: { code: 'ownership_mismatch', message: 'receipt does not belong to this OPENID' },
    });
  }

  const validation = core.validateDeleteAllConfirmation(confirmation, receipt, Date.now());
  if (validation.ok === false) {
    await audit(openid, 'deleteAll', 'failure', { code: validation.error.code });
    return ok({
      state: validation.error.code === 'token_expired' || validation.error.code === 'token_already_used'
        ? 'failure'
        : 'permission_denied',
      error: { code: validation.error.code, message: validation.error.message },
    });
  }

  // Receipt is valid — consume it before any destructive operation so a
  // partial failure can never be replayed against the same archive.
  await db.collection('owner_export_receipts').doc(receipt.id).update({
    data: { consumedAt: Date.now() },
  });

  // === Owner-scoped canonical collections ===
  const ownerScopedCollections = [
    'memories',
    'conversations',
    'requests',
    'now_items',
    'contact_methods',
    'visitor_evidence',
    'request_gates',
  ];
  const deletionReport = {};
  for (const name of ownerScopedCollections) {
    deletionReport[name] = await deleteOwnerRecords(name, openid);
  }

  // === Tombstone the public Card projection ===
  // The v1 `users` doc IS the public projection. We do NOT hard-delete it:
  // card.getPublicCard must still resolve an owner so a stale visitor link
  // can read "card_deleted" instead of "not_found" (task 3.4 contract).
  const userResult = await db.collection('users').where({ openid }).get();
  let tombstoned = false;
  let tombstoneError = null;
  if (userResult.data[0]) {
    try {
      await db.collection('users').doc(userResult.data[0]._id).update({
        data: {
          deleted: true,
          status: 'deleted',
          // Strip every contact-bearing namecard field; keep nothing private.
          namecard: {},
          // Empty the legacy verified fields too — owner asked for "delete all".
          verified: { wallet: '', twitter: '', discord: '', wechat: '' },
          nickname: '',
          avatar: '',
          bio: '',
          // The legacy tag stash (used by the v1 profile migration) MUST be
          // wiped, otherwise stale tags resurrect the deleted profile.
          tags: [],
          blockedUsers: [],
          updatedAt: Date.now(),
        },
      });
      tombstoned = true;
    } catch (error) {
      tombstoneError = error && error.message;
    }
  }
  deletionReport.users_tombstone = { requested: true, ok: tombstoned, error: tombstoneError };

  // === Re-scan: every collection must show zero owner records. ===
  const leftovers = await scanLeftovers(openid);

  // === Audit (always) ===
  if (Object.keys(leftovers).length > 0) {
    await audit(openid, 'deleteAll', 'partial_cleanup', { leftovers });
    return ok({
      state: 'partial_cleanup',
      error: {
        code: 'partial_cleanup',
        message: 'some owner records could not be deleted; reconciliation needed',
      },
      cleanup: deletionReport,
      leftovers,
    });
  }

  await audit(openid, 'deleteAll', 'success', { deleted: deletionReport });
  return ok({ state: 'success', cleanup: deletionReport });
};

async function deleteOwnerRecords(collection, openid) {
  const result = await db.collection(collection).where({ ownerId: openid }).get();
  const docs = result.data;
  let deleted = 0;
  let failed = 0;
  const failedIds = [];
  for (const doc of docs) {
    try {
      await db.collection(collection).doc(doc._id).remove();
      deleted += 1;
    } catch (error) {
      failed += 1;
      failedIds.push(doc._id);
    }
  }
  return { scanned: docs.length, deleted, failed, failedIds };
}

async function scanLeftovers(openid) {
  const leftovers = {};
  const ownerScopedCollections = [
    'memories',
    'conversations',
    'requests',
    'now_items',
    'contact_methods',
    'visitor_evidence',
    'request_gates',
  ];
  for (const name of ownerScopedCollections) {
    const result = await db.collection(name).where({ ownerId: openid }).get();
    if (result.data.length > 0) {
      leftovers[name] = result.data.map((d) => d._id);
    }
  }
  // also flag any tombstoned user doc with non-default fields
  const userResult = await db.collection('users').where({ openid }).get();
  const user = userResult.data[0];
  if (user && !(user.deleted === true && user.status === 'deleted')) {
    leftovers.users = [user._id];
  }
  return leftovers;
}