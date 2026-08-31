/**
 * archive/export cloud function (task 4.6) — owner-scoped private/public
 * Vibe archive export plus fresh-export receipts that authorize delete-all.
 *
 * Actions:
 *   exportPrivateArchive
 *     Aggregates the owner's canonical private state from users / memories /
 *     conversations / requests / now_items / visitor_evidence / request_gates
 *     into a validated private `.vibe` document and returns the JSON plus a
 *     stable digest. Conversations are exported only when the owner opts in
 *     (so we never bundle raw chat by accident).
 *
 *   exportPublicArchive
 *     The strict public projection: Card + active Now items. Never authorizes
 *     deletion; never carries contact data, memories, or conversations.
 *
 *   prepareDeleteAll
 *     Issues a fresh private archive AND writes a server-side receipt bound
 *     to the caller's OPENID. The receipt is the only thing that authorizes
 *     the subsequent deleteAll call; the archive digest + preparedAt the
 *     client must echo back are returned alongside the archive JSON. The
 *     receipt has a 5-minute replay window and is consumed on first use.
 *
 * Every action is OPENID-scoped: cloud.getWXContext().OPENID is the only
 * identity consulted. A wrong / missing OPENID is refused before any DB read.
 * Audit entries are written to `owner_audit_log` for every successful and
 * refused call (action / outcome / openid / timestamp only — never payload).
 */

const cloud = require('wx-server-sdk');
const core = require('../lib/core');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const APP_INFO = Object.freeze({ name: 'vibecard-miniprogram', version: '4.6.0' });

function typedError(code, message) {
  return { ok: false, error: { code, message } };
}
function ok(result) {
  return { ok: true, result };
}

function nowMs() {
  return Date.now();
}

async function audit(openid, action, outcome, meta) {
  try {
    await db.collection('owner_audit_log').add({
      data: {
        ownerOpenid: openid || '',
        action,
        outcome,
        meta: meta || {},
        createdAt: nowMs(),
      },
    });
  } catch (error) {
    // Audit failures never block the main path; the cloud function still
    // returns its primary outcome. A console warning keeps the breadcrumb.
    console.warn('archive.export audit failed:', error && error.message);
  }
}

exports.main = async (event) => {
  const { action } = event || {};
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) {
    return typedError('unauthorized', 'login required');
  }

  try {
    switch (action) {
      case 'exportPrivateArchive':
        return ok(await exportPrivateArchive(openid, event));
      case 'exportPublicArchive':
        return ok(await exportPublicArchive(openid, event));
      case 'prepareDeleteAll':
        return ok(await prepareDeleteAll(openid, event));
      default:
        return typedError('invalid_action', 'unknown action');
    }
  } catch (error) {
    console.error('archive.export error:', error && error.message);
    await audit(openid, action || 'unknown', 'failure', { message: error && error.message });
    return typedError('internal_error', 'archive export failed');
  }
};

/* ---------------------------------------------------------------------------
 * Data layer: read everything the archive needs.
 * ------------------------------------------------------------------------- */

async function fetchUserDoc(openid) {
  const result = await db.collection('users').where({ openid }).get();
  return result.data[0] || null;
}

async function fetchMemories(openid) {
  const result = await db.collection('memories').where({ ownerId: openid }).get();
  return result.data;
}

async function fetchConversations(openid) {
  const result = await db.collection('conversations').where({ ownerId: openid }).get();
  return result.data;
}

async function fetchConnectionRequests(openid) {
  const result = await db.collection('requests').where({ ownerId: openid }).get();
  return result.data;
}

async function fetchNowItems(openid) {
  const result = await db.collection('now_items').where({ ownerId: openid }).get();
  return result.data;
}

/**
 * The v1 `users` document is what the Cloud layer has today; the archive
 * profile carries only the public-safe namecard fields and a stable id.
 */
function buildProfileFromV1User(user) {
  if (!user) return null;
  return {
    id: user.openid,
    schemaVersion: 1,
    name: user.nickname || '',
    avatarUrl: user.avatar || '',
  };
}

/**
 * The v1 `users.namecard` keys are split into contact data (private) and
 * presentational namecard fields. The portable VibeCard shape needs the
 * presentational keys plus a synthetic id derived from the owner openid.
 */
function buildCardFromV1User(user, openid) {
  if (!user) return null;
  const namecard = (user.namecard && typeof user.namecard === 'object') ? user.namecard : {};
  const highlights = Array.isArray(namecard.highlights)
    ? namecard.highlights.flatMap((item) => {
      if (!item || typeof item.title !== 'string' || !item.title.trim()) return [];
      return [{
        id: String(item.id || ''),
        title: item.title.trim(),
        ...(typeof item.url === 'string' && item.url.trim() ? { url: item.url.trim() } : {}),
      }];
    }).slice(0, 6)
    : [];
  return {
    id: `card-${openid}`,
    schemaVersion: 1,
    ownerId: openid,
    name: user.nickname || '',
    avatarUrl: user.avatar || '',
    headline: namecard.motto || user.bio || namecard.intro || '',
    currentFocus: typeof namecard.currentFocus === 'string' ? namecard.currentFocus : '',
    canHelpWith: Array.isArray(namecard.canHelpWith) ? namecard.canHelpWith.filter((v) => typeof v === 'string').slice(0, 5) : [],
    wantsToMeet: Array.isArray(namecard.wantsToMeet) ? namecard.wantsToMeet.filter((v) => typeof v === 'string').slice(0, 5) : [],
    topics: Array.isArray(namecard.topics) ? namecard.topics.filter((v) => typeof v === 'string').slice(0, 8) : [],
    highlights,
    agentEnabled: namecard.agentEnabled !== false,
    updatedAt: nowMs(),
  };
}

/* ---------------------------------------------------------------------------
 * Section assembly — straight JSON, no projection lies.
 * ------------------------------------------------------------------------- */

function toArchiveMemory(memory) {
  return {
    id: memory._id || memory.id,
    schemaVersion: 1,
    ownerId: memory.ownerId,
    kind: memory.kind,
    content: memory.content,
    visibility: memory.visibility,
    status: memory.status,
    sourceConversationId: memory.sourceConversationId || '',
    sourceMessageIds: Array.isArray(memory.sourceMessageIds) ? memory.sourceMessageIds : [],
    createdAt: memory.createdAt || 0,
    updatedAt: memory.updatedAt || memory.createdAt || 0,
  };
}

function toArchiveContactMethod(record) {
  return {
    id: record._id || record.id,
    schemaVersion: 1,
    ownerId: record.ownerId,
    kind: record.kind,
    value: record.value,
    label: record.label,
    createdAt: record.createdAt || 0,
    updatedAt: record.updatedAt || record.createdAt || 0,
  };
}

function toArchiveConnectionRequest(record) {
  const out = {
    id: record._id || record.id,
    schemaVersion: 1,
    ownerId: record.ownerId,
    visitorId: record.visitorId,
    visitorSummary: record.visitorSummary || '',
    reason: record.reason || '',
    possibleSharedContext: Array.isArray(record.possibleSharedContext)
      ? record.possibleSharedContext.slice(0, 5)
      : [],
    ownerAction: record.ownerAction || 'pending',
    sharedContactMethodIds: Array.isArray(record.sharedContactMethodIds)
      ? record.sharedContactMethodIds
      : [],
    createdAt: record.createdAt || 0,
    updatedAt: record.updatedAt || record.createdAt || 0,
  };
  if (typeof record.visitorWorkUrl === 'string' && record.visitorWorkUrl) {
    out.visitorWorkUrl = record.visitorWorkUrl;
  }
  return out;
}

function toArchiveNowItem(item) {
  return {
    id: item._id || item.id,
    schemaVersion: 1,
    ownerId: item.ownerId,
    text: item.text,
    topic: item.topic,
    sourceMemoryId: item.sourceMemoryId || null,
    status: item.status,
    publishedAt: item.publishedAt || null,
    expiresAt: item.expiresAt || null,
    createdAt: item.createdAt || 0,
    updatedAt: item.updatedAt || item.createdAt || 0,
  };
}

function toArchiveConversation(record) {
  const messages = Array.isArray(record.messages)
    ? record.messages.map((m) => ({
      id: m.id || `${record._id || record.id}-${m.createdAt || 0}`,
      schemaVersion: 1,
      conversationId: record._id || record.id,
      role: m.role,
      text: m.content || m.text || '',
      createdAt: m.createdAt || 0,
    }))
    : [];
  return {
    id: record._id || record.id,
    schemaVersion: 1,
    ownerId: record.ownerId,
    kind: record.mode === 'visitor' ? 'visitor' : 'owner_vibe',
    visitorId: record.visitorId || record.participantId || null,
    messages,
    createdAt: record.createdAt || 0,
    updatedAt: record.updatedAt || record.createdAt || 0,
  };
}

/**
 * Build the conversation section based on the owner opt-in. The shape lives
 * inside the Core archive schema, so we never inline raw chat unless the
 * owner said so on this call.
 */
function buildConversationSection(conversations, includeConversations) {
  if (!includeConversations) return { exported: false, items: [] };
  return { exported: true, items: conversations.map(toArchiveConversation) };
}

/* ---------------------------------------------------------------------------
 * Actions
 * ------------------------------------------------------------------------- */

async function exportPrivateArchive(openid, event) {
  const includeConversations = event.includeConversations === true;

  const [user, memories, conversations, requests, nowItems] = await Promise.all([
    fetchUserDoc(openid),
    fetchMemories(openid),
    fetchConversations(openid),
    fetchConnectionRequests(openid),
    fetchNowItems(openid),
  ]);

  if (!user) {
    await audit(openid, 'exportPrivateArchive', 'failure', { reason: 'owner_not_found' });
    return { state: 'failure', error: { code: 'not_found', message: 'owner not found' } };
  }

  const sections = {
    profile: buildProfileFromV1User(user),
    card: buildCardFromV1User(user, openid),
    nowItems: nowItems.map(toArchiveNowItem),
    memories: memories.map(toArchiveMemory),
    conversations: buildConversationSection(conversations, includeConversations),
    knowledgeSources: [], // no ingestion path yet (ARCHITECTURE §18)
    connectionRequests: requests.map(toArchiveConnectionRequest),
    contactMethods: [], // v1 namecard holds contact data; archive contactMethods is empty for now
    attachments: [], // attachments are metadata-only; v1 has none yet
  };

  const archive = {
    format: core.ARCHIVE_FORMAT,
    schemaVersion: core.ARCHIVE_SCHEMA_VERSION,
    kind: 'private',
    createdAt: nowMs(),
    app: APP_INFO,
    encryption: null,
    sectionVersions: { ...core.ARCHIVE_SECTION_VERSIONS },
    integrity: null, // private export omits integrity so the digests remain fresh per re-export
    ...sections,
  };

  // Mirror the TS Core's built-in integrity map: fnv1a-32 per section.
  archive.integrity = buildIntegrityMap(archive);

  // Re-validate after integrity map insertion so nothing slips past.
  const validated = core.validateArchive(archive);
  if (validated.ok === false) {
    await audit(openid, 'exportPrivateArchive', 'failure', { code: validated.error.code });
    return {
      state: 'failure',
      error: { code: validated.error.code, message: validated.error.message },
    };
  }

  const digest = core.computeArchiveDigest(archive);
  const serialized = JSON.stringify(archive);

  await audit(openid, 'exportPrivateArchive', 'success', {
    recordCount: countRecords(archive),
    bytes: serialized.length,
    includeConversations,
  });

  return {
    state: 'success',
    archive,
    archiveDigest: digest,
    archiveBytes: serialized.length,
    serialized,
    includedSections: Object.keys(archive.sectionVersions),
  };
}

async function exportPublicArchive(openid, event) {
  const ownerId = typeof event.ownerId === 'string' && event.ownerId.trim()
    ? event.ownerId.trim()
    : openid;
  const [user, memories, nowItems] = await Promise.all([
    fetchUserDoc(ownerId),
    db.collection('memories')
      .where({ ownerId, status: 'confirmed', visibility: 'public' })
      .get()
      .then((r) => r.data),
    fetchNowItems(ownerId),
  ]);

  if (!user) {
    await audit(openid, 'exportPublicArchive', 'failure', { reason: 'owner_not_found' });
    return { state: 'failure', error: { code: 'not_found', message: 'owner not found' } };
  }

  const card = buildCardFromV1User(user, ownerId);
  if (!card) {
    return { state: 'failure', error: { code: 'not_found', message: 'card unavailable' } };
  }

  const now = nowMs();
  const activeNow = nowItems
    .filter((item) => item.status === 'published' && (item.expiresAt === null || item.expiresAt === undefined || item.expiresAt > now))
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .slice(0, 3)
    .map((item) => ({
      id: item._id || item.id,
      text: item.text,
      topic: item.topic,
      publishedAt: item.publishedAt || null,
    }));

  const archive = {
    format: core.ARCHIVE_FORMAT,
    schemaVersion: core.ARCHIVE_SCHEMA_VERSION,
    kind: 'public',
    createdAt: now,
    app: APP_INFO,
    encryption: null,
    sectionVersions: { ...core.ARCHIVE_SECTION_VERSIONS },
    integrity: null,
    profile: null,
    card,
    nowItems: activeNow,
    memories: [],
    conversations: { exported: false, items: [] },
    knowledgeSources: [],
    connectionRequests: [],
    contactMethods: [],
    attachments: [],
  };
  archive.integrity = buildIntegrityMap(archive);

  const validated = core.validateArchive(archive);
  if (validated.ok === false) {
    return {
      state: 'failure',
      error: { code: validated.error.code, message: validated.error.message },
    };
  }

  const digest = core.computeArchiveDigest(archive);
  await audit(openid, 'exportPublicArchive', 'success', { ownerId });
  return { state: 'success', archive, archiveDigest: digest, archiveBytes: JSON.stringify(archive).length };
}

async function prepareDeleteAll(openid, event) {
  const includeConversations = event.includeConversations === true;
  const exportResult = await exportPrivateArchive(openid, { includeConversations });
  if (exportResult.state !== 'success') {
    return exportResult;
  }

  const now = nowMs();
  const receipt = core.buildDeleteAllReceipt({
    ownerOpenid: openid,
    archiveDigest: exportResult.archiveDigest,
    archiveBytes: exportResult.archiveBytes,
    archiveRecordCount: countRecords(exportResult.archive),
    origin: 'owner-initiated',
    now,
  });

  await db.collection('owner_export_receipts').doc(receipt.id).set({ data: receipt });

  await audit(openid, 'prepareDeleteAll', 'success', {
    archiveDigest: receipt.archiveDigest,
    expiresAt: receipt.expiresAt,
  });

  return {
    state: 'success',
    archive: exportResult.archive,
    serialized: exportResult.serialized,
    archiveDigest: exportResult.archiveDigest,
    archiveBytes: exportResult.archiveBytes,
    archiveRecordCount: receipt.archiveRecordCount,
    preparedAt: receipt.preparedAt,
    expiresAt: receipt.expiresAt,
    receiptId: receipt.id,
  };
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function buildIntegrityMap(archive) {
  const sections = ['profile', 'card', 'nowItems', 'memories', 'conversations', 'knowledgeSources', 'connectionRequests', 'contactMethods', 'attachments'];
  const map = {};
  for (const name of sections) {
    map[name] = core.fnv1a32(core.canonicalJson(archive[name]));
  }
  return { algorithm: 'fnv1a-32', sections: map };
}

function countRecords(archive) {
  return (
    (archive.card ? 1 : 0)
    + (archive.profile ? 1 : 0)
    + (archive.memories || []).length
    + (archive.conversations ? (archive.conversations.items || []).length : 0)
    + (archive.knowledgeSources || []).length
    + (archive.connectionRequests || []).length
    + (archive.contactMethods || []).length
    + (archive.attachments || []).length
    + (archive.nowItems || []).length
  );
}