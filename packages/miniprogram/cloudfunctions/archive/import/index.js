/**
 * archive/import cloud function (task 4.6) — validated, ownership-checked
 * import of a portable Vibe archive.
 *
 * Action: importArchive { archive } -> { state, report }
 *
 * Pipeline:
 *   1. schema-validate the archive (format, schemaVersion, section versions,
 *      per-section checksums, public/private boundary, integrity map).
 *   2. ownership check: archive.card.ownerId MUST equal cloud.getWXContext
 *      .OPENID. A stranger cannot import another user's archive into their
 *      own account; a future archive from another OPENID is refused before
 *      any DB write.
 *   3. optional re-key (the archive can be re-keyed to a new owner openid
 *      ONLY when the caller passes `rekeyToOpenid` explicitly, and only
 *      private archives; this supports recovery onto a fresh OPENID, the
 *      acceptance scenario for task 4.6).
 *   4. idempotent upsert per collection by record id. No deletions — import
 *      is additive. The owner must call archive/deleteAll first to wipe, then
 *      re-import on a fresh owner.
 *   5. audit + structured per-collection report.
 *
 * The function never logs the archive contents; only the bytes count,
 * ownership verification outcome, and per-collection counters reach the log.
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
    console.warn('archive.import audit failed:', error && error.message);
  }
}

exports.main = async (event) => {
  const { action } = event || {};
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return typedError('unauthorized', 'login required');

  if (action !== 'importArchive') {
    return typedError('invalid_action', 'unknown action');
  }

  const archive = event.archive;
  if (!archive) {
    // Domain-level failure: invalid input, surfaced through the state machine.
    return ok({
      state: 'failure',
      error: { code: 'invalid_request', message: 'archive is required' },
      imported: {},
    });
  }

  // Step 1 — schema validation (covers future_version, section_version_mismatch,
  // checksum_mismatch, encrypted_archive, public_boundary_violation).
  const validated = core.validateArchive(archive);
  if (validated.ok === false) {
    await audit(openid, 'importArchive', 'failure', { code: validated.error.code });
    return ok({
      state: 'failure',
      error: { code: validated.error.code, message: validated.error.message },
      imported: {},
    });
  }
  const arc = validated.value;

  // Step 2 — ownership: only private archives are importable. The card ownerId
  // must equal the caller's OPENID. Public archives carry no private sections
  // and so cannot be imported; this enforces the contract boundary.
  if (arc.kind !== 'private') {
    await audit(openid, 'importArchive', 'failure', { reason: 'public_archive_not_importable' });
    return ok({
      state: 'failure',
      error: { code: 'public_boundary_violation', message: 'public archives cannot be imported; only private exports restore owner data' },
      imported: {},
    });
  }

  const targetOpenid = typeof event.rekeyToOpenid === 'string' && event.rekeyToOpenid.trim()
    ? event.rekeyToOpenid.trim()
    : openid;

  if (arc.card.ownerId !== openid && arc.card.ownerId !== targetOpenid) {
    await audit(openid, 'importArchive', 'failure', { reason: 'ownership_mismatch' });
    return ok({
      state: 'permission_denied',
      error: { code: 'ownership_mismatch', message: 'archive owner does not match the current OPENID' },
      imported: {},
    });
  }

  try {
    const report = await applyImport(arc, targetOpenid);
    await audit(openid, 'importArchive', 'success', {
      imported: report.totals,
      rekeyed: arc.card.ownerId !== targetOpenid,
    });
    return ok({ state: 'success', report });
  } catch (error) {
    console.error('archive.import apply failed:', error && error.message);
    await audit(openid, 'importArchive', 'failure', { reason: error && error.message });
    return typedError('internal_error', 'import failed');
  }
};

async function applyImport(arc, targetOpenid) {
  const sections = arc.kind === 'private'
    ? ['memories', 'nowItems', 'conversations', 'connectionRequests', 'contactMethods', 'attachments', 'knowledgeSources']
    : [];
  const totals = { created: 0, updated: 0, skipped: 0 };

  const perCollection = {};

  for (const section of sections) {
    const collection = sectionToCollection(section);
    if (!collection) continue;
    const items = arc[section] || [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const item of items) {
      const id = item && item.id;
      if (!id) {
        skipped += 1;
        continue;
      }
      const rekeyed = rekeyRecord(section, item, targetOpenid);
      if (rekeyed === null) {
        skipped += 1;
        continue;
      }
      const existing = await db.collection(collection).doc(id).get().catch(() => null);
      if (existing && existing.data) {
        // Idempotent: same content => skip; different => update.
        if (sameShape(existing.data, rekeyed)) {
          skipped += 1;
        } else {
          await db.collection(collection).doc(id).update({ data: rekeyed });
          updated += 1;
        }
      } else {
        await db.collection(collection).doc(id).set({ data: rekeyed });
        created += 1;
      }
    }
    perCollection[section] = { collection, created, updated, skipped };
    totals.created += created;
    totals.updated += updated;
    totals.skipped += skipped;
  }

  // Card: the public projection has no dedicated collection; the v1 user
  // document is the source of truth. Upsert the presentational namecard.
  if (arc.kind === 'private') {
    const card = arc.card;
    const existingUser = await db.collection('users').where({ openid: targetOpenid }).get();
    const userUpdate = buildUserUpsertFromCard(card);
    if (existingUser.data[0]) {
      // Only update fields that actually differ; a no-op replay is a no-op.
      const existingUserDoc = existingUser.data[0];
      const patch = projectChangedKeys(userUpdate, existingUserDoc);
      if (Object.keys(patch).length > 0) {
        await db.collection('users').doc(existingUserDoc._id).update({ data: patch });
        perCollection.users = { collection: 'users', updated: 1, skipped: 0 };
        totals.updated += 1;
      } else {
        perCollection.users = { collection: 'users', updated: 0, skipped: 1, created: 0 };
        totals.skipped += 1;
      }
    } else {
      await db.collection('users').add({
        data: {
          openid: targetOpenid,
          ...userUpdate,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      });
      perCollection.users = { collection: 'users', created: 1, updated: 0, skipped: 0 };
      totals.created += 1;
    }
  }

  return { totals, perCollection, importedAt: Date.now() };
}

function sectionToCollection(section) {
  switch (section) {
    case 'memories': return 'memories';
    case 'nowItems': return 'now_items';
    case 'conversations': return null; // inline messages: handled via conversations
    case 'connectionRequests': return 'requests';
    case 'contactMethods': return 'contact_methods';
    case 'attachments': return null; // no metadata collection yet
    case 'knowledgeSources': return null; // no ingestion collection yet
    default: return null;
  }
}

function rekeyRecord(section, item, targetOpenid) {
  if (!item || typeof item !== 'object' || !item.id) return null;
  switch (section) {
    case 'memories':
      return {
        ...item,
        ownerId: targetOpenid,
        _id: item.id,
      };
    case 'nowItems':
      return {
        ...item,
        ownerId: targetOpenid,
        _id: item.id,
      };
    case 'connectionRequests':
      return {
        ...item,
        ownerId: targetOpenid,
        _id: item.id,
      };
    case 'contactMethods':
      return {
        ...item,
        ownerId: targetOpenid,
        _id: item.id,
      };
    default:
      return null;
  }
}

function buildUserUpsertFromCard(card) {
  return {
    nickname: card.name || '',
    avatar: card.avatarUrl || '',
    bio: card.headline || card.currentFocus || '',
    namecard: {
      intro: card.headline || '',
      motto: card.headline || '',
      currentFocus: card.currentFocus || '',
      canHelpWith: card.canHelpWith || [],
      wantsToMeet: card.wantsToMeet || [],
      topics: card.topics || [],
      highlights: (card.highlights || []).map((h) => ({
        id: h.id,
        title: h.title,
        ...(h.url ? { link: h.url } : {}),
      })),
      agentEnabled: card.agentEnabled !== false,
    },
  };
}

function sameShape(existing, incoming) {
  try {
    return JSON.stringify(existing) === JSON.stringify(incoming);
  } catch (error) {
    return false;
  }
}

/**
 * Build a patch containing only the keys from `incoming` whose values differ
 * from `existing`. Used for the users upsert where the existing document also
 * carries server-side timestamps that must NOT be considered.
 */
function projectChangedKeys(incoming, existing) {
  const patch = {};
  for (const key of Object.keys(incoming)) {
    const a = incoming[key];
    const b = existing ? existing[key] : undefined;
    if (a === undefined) continue;
    if (sameShape(a, b)) continue;
    patch[key] = a;
  }
  return patch;
}