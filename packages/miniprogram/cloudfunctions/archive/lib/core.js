/**
 * Archive cloud-function core (task 4.6).
 *
 * Pure helpers, no wx-server-sdk dependency so the surrounding index.js files
 * stay simple and the tests run under plain node. Behaviour mirrors the shared
 * TypeScript contract in packages/shared/archive.ts; the section shape, the
 * section-version constants, and the integrity map below are kept in lockstep
 * with that file (the conformance is enforced by cloud-function tests).
 *
 * The cloud function never imports from packages/shared because the runtime
 * has no TypeScript loader — duplicating the rules here is intentional, and
 * changes to archive.ts MUST be mirrored here in the same commit.
 */

const ARCHIVE_FORMAT = 'vibecard-vibe-archive';
const ARCHIVE_SCHEMA_VERSION = 1;
const ARCHIVE_SECTION_VERSIONS = {
  profile: 1,
  card: 1,
  now: 1,
  memories: 1,
  conversations: 1,
  knowledgeSources: 1,
  connections: 1,
  contactMethods: 1,
  attachments: 1,
};

const NOW_TOPICS = ['current_work', 'completed_work', 'exploring', 'looking_for', 'offer_help'];
const NOW_STATUSES = ['draft', 'published', 'archived', 'hidden', 'deleted'];
const CONTACT_KINDS = ['wechat', 'email', 'phone', 'telegram', 'other'];
const CONNECTION_ACTIONS = ['pending', 'connect', 'later', 'decline'];
const MESSAGE_ROLES = ['owner', 'vibe', 'visitor', 'agent'];
const CONVERSATION_KINDS = ['owner_vibe', 'visitor'];
const KNOWLEDGE_KINDS = ['file', 'url', 'note'];
const KNOWLEDGE_STATUSES = ['pending', 'ingested', 'failed'];
const MEMORY_KINDS = ['fact', 'current', 'preference', 'boundary'];
const MEMORY_VISIBILITIES = ['public', 'agent_only', 'connected', 'private'];
const MEMORY_STATUSES = ['proposed', 'confirmed', 'paused', 'deleted'];

const ARCHIVE_DELETE_ALL_WINDOW_MS = 5 * 60 * 1000;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isString(value) {
  return typeof value === 'string';
}
function isInteger(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function isStringArray(value) {
  return Array.isArray(value) && value.every(isString);
}
function isNullableString(value) {
  return value === null || isString(value);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
}

function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function checkMemory(value) {
  if (!isRecord(value)) return false;
  return (
    isString(value.id)
    && value.schemaVersion === 1
    && isString(value.ownerId)
    && MEMORY_KINDS.includes(value.kind)
    && isString(value.content)
    && MEMORY_VISIBILITIES.includes(value.visibility)
    && MEMORY_STATUSES.includes(value.status)
    && isString(value.sourceConversationId)
    && isStringArray(value.sourceMessageIds)
    && isInteger(value.createdAt)
    && isInteger(value.updatedAt)
  );
}

function checkContactMethod(value) {
  if (!isRecord(value)) return false;
  return (
    isString(value.id)
    && value.schemaVersion === 1
    && isString(value.ownerId)
    && CONTACT_KINDS.includes(value.kind)
    && isString(value.value)
    && isString(value.label)
    && isInteger(value.createdAt)
    && isInteger(value.updatedAt)
  );
}

function checkConnectionRequest(value) {
  if (!isRecord(value)) return false;
  return (
    isString(value.id)
    && value.schemaVersion === 1
    && isString(value.ownerId)
    && isString(value.visitorId)
    && isString(value.visitorSummary)
    && isString(value.reason)
    && isStringArray(value.possibleSharedContext)
    && (value.visitorWorkUrl === undefined || isString(value.visitorWorkUrl))
    && CONNECTION_ACTIONS.includes(value.ownerAction)
    && isStringArray(value.sharedContactMethodIds)
    && isInteger(value.createdAt)
    && isInteger(value.updatedAt)
  );
}

function checkNowItem(value) {
  if (!isRecord(value)) return false;
  return (
    isString(value.id)
    && value.schemaVersion === 1
    && isString(value.ownerId)
    && isString(value.text)
    && NOW_TOPICS.includes(value.topic)
    && isNullableString(value.sourceMemoryId)
    && NOW_STATUSES.includes(value.status)
    && (value.publishedAt === null || isInteger(value.publishedAt))
    && (value.expiresAt === null || isInteger(value.expiresAt))
    && isInteger(value.createdAt)
    && isInteger(value.updatedAt)
  );
}

function checkConversation(value) {
  if (!isRecord(value)) return false;
  return (
    isString(value.id)
    && value.schemaVersion === 1
    && isString(value.ownerId)
    && CONVERSATION_KINDS.includes(value.kind)
    && isNullableString(value.visitorId)
    && Array.isArray(value.messages)
    && value.messages.every(
      (m) => isRecord(m)
        && isString(m.id)
        && m.schemaVersion === 1
        && m.conversationId === value.id
        && MESSAGE_ROLES.includes(m.role)
        && isString(m.text)
        && isInteger(m.createdAt),
    )
    && (value.verifiedSharedContext === undefined || isStringArray(value.verifiedSharedContext))
    && isInteger(value.createdAt)
    && isInteger(value.updatedAt)
  );
}

function checkKnowledgeSource(value) {
  if (!isRecord(value)) return false;
  return (
    isString(value.id)
    && value.schemaVersion === 1
    && isString(value.ownerId)
    && KNOWLEDGE_KINDS.includes(value.kind)
    && isString(value.title)
    && isString(value.source)
    && KNOWLEDGE_STATUSES.includes(value.status)
    && isInteger(value.createdAt)
    && isInteger(value.updatedAt)
  );
}

function checkAttachment(value) {
  if (!isRecord(value)) return false;
  return (
    isString(value.id)
    && value.schemaVersion === 1
    && isString(value.fileName)
    && Number.isInteger(value.sizeBytes)
    && value.sizeBytes >= 0
    && isNullableString(value.sha256)
    && isNullableString(value.mediaType)
    && isString(value.note)
    && (value.relatedTo === null
      || (isRecord(value.relatedTo)
        && isString(value.relatedTo.collection)
        && isString(value.relatedTo.id)))
    && isInteger(value.createdAt)
  );
}

function checkProfile(value) {
  if (!isRecord(value)) return false;
  return (
    isString(value.id)
    && value.schemaVersion === 1
    && isString(value.name)
    && isString(value.avatarUrl)
  );
}

function checkCard(value) {
  if (!isRecord(value)) return false;
  return (
    isString(value.id)
    && value.schemaVersion === 1
    && isString(value.ownerId)
    && isString(value.name)
    && isString(value.avatarUrl)
    && isString(value.headline)
    && isString(value.currentFocus)
    && isStringArray(value.canHelpWith)
    && isStringArray(value.wantsToMeet)
    && isStringArray(value.topics)
    && Array.isArray(value.highlights)
    && value.highlights.every(
      (h) => isRecord(h)
        && isString(h.id)
        && isString(h.title)
        && (h.url === undefined || isString(h.url)),
    )
    && typeof value.agentEnabled === 'boolean'
    && isInteger(value.updatedAt)
  );
}

/**
 * Validate a plaintext archive document of the CURRENT schema version. Older
 * supported versions must go through migrateArchive first (or just call
 * importArchive, which chains both). Mirrors packages/shared/archive.ts.
 */
function validateArchive(raw) {
  if (!isRecord(raw)) {
    return { ok: false, error: { code: 'invalid_shape', message: 'Archive must be a JSON object.' } };
  }
  if (raw.format !== ARCHIVE_FORMAT) {
    return { ok: false, error: { code: 'invalid_shape', message: `format must be "${ARCHIVE_FORMAT}".` } };
  }
  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion)) {
    return { ok: false, error: { code: 'invalid_shape', message: 'schemaVersion must be an integer.' } };
  }
  const version = raw.schemaVersion;
  if (version > ARCHIVE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: 'future_version',
        message: `Archive schemaVersion ${version} is newer than supported ${ARCHIVE_SCHEMA_VERSION}.`,
      },
    };
  }
  if (version !== ARCHIVE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: 'unsupported_version',
        message: `Archive schemaVersion ${version} needs migration; run migrateArchive first.`,
      },
    };
  }
  if (raw.kind !== 'public' && raw.kind !== 'private') {
    return { ok: false, error: { code: 'invalid_shape', message: 'kind must be "public" or "private".' } };
  }
  if (raw.encryption !== null) {
    if (isRecord(raw.encryption) && isString(raw.encryption.algorithm) && isString(raw.encryption.hint)) {
      return {
        ok: false,
        error: {
          code: 'encrypted_archive',
          message: 'Archive is encrypted; the client must decrypt the envelope before import.',
        },
      };
    }
    return { ok: false, error: { code: 'invalid_shape', message: 'encryption must be null or { algorithm, hint }.' } };
  }
  if (!isRecord(raw.sectionVersions)) {
    return { ok: false, error: { code: 'invalid_shape', message: 'sectionVersions must be an object.' } };
  }
  for (const section of Object.keys(ARCHIVE_SECTION_VERSIONS)) {
    if (raw.sectionVersions[section] !== ARCHIVE_SECTION_VERSIONS[section]) {
      return {
        ok: false,
        error: {
          code: 'section_version_mismatch',
          message: `Section "${section}" version ${String(raw.sectionVersions[section])} does not match expected ${ARCHIVE_SECTION_VERSIONS[section]}.`,
        },
      };
    }
  }
  if (!isInteger(raw.createdAt)) {
    return { ok: false, error: { code: 'invalid_shape', message: 'createdAt must be a timestamp.' } };
  }
  if (!isRecord(raw.app) || !isString(raw.app.name) || !isString(raw.app.version)) {
    return { ok: false, error: { code: 'invalid_shape', message: 'app must be { name, version }.' } };
  }
  if (!checkCard(raw.card)) return { ok: false, error: { code: 'invalid_shape', message: 'card section is malformed.' } };
  if (!Array.isArray(raw.nowItems)) return { ok: false, error: { code: 'invalid_shape', message: 'nowItems must be an array.' } };
  if (!Array.isArray(raw.memories) || !raw.memories.every(checkMemory)) {
    return { ok: false, error: { code: 'invalid_shape', message: 'memories section is malformed.' } };
  }
  if (!isRecord(raw.conversations) || typeof raw.conversations.exported !== 'boolean' || !Array.isArray(raw.conversations.items) || !raw.conversations.items.every(checkConversation)) {
    return { ok: false, error: { code: 'invalid_shape', message: 'conversations section is malformed.' } };
  }
  if (!Array.isArray(raw.knowledgeSources) || !raw.knowledgeSources.every(checkKnowledgeSource)) {
    return { ok: false, error: { code: 'invalid_shape', message: 'knowledgeSources section is malformed.' } };
  }
  if (!Array.isArray(raw.connectionRequests) || !raw.connectionRequests.every(checkConnectionRequest)) {
    return { ok: false, error: { code: 'invalid_shape', message: 'connectionRequests section is malformed.' } };
  }
  if (!Array.isArray(raw.contactMethods) || !raw.contactMethods.every(checkContactMethod)) {
    return { ok: false, error: { code: 'invalid_shape', message: 'contactMethods section is malformed.' } };
  }
  if (!Array.isArray(raw.attachments) || !raw.attachments.every(checkAttachment)) {
    return { ok: false, error: { code: 'invalid_shape', message: 'attachments section is malformed.' } };
  }
  if (raw.kind === 'private') {
    if (!checkProfile(raw.profile)) {
      return { ok: false, error: { code: 'invalid_shape', message: 'private archives must carry a profile.' } };
    }
    if (!raw.nowItems.every(checkNowItem)) {
      return { ok: false, error: { code: 'invalid_shape', message: 'private nowItems must be full NowItem records.' } };
    }
  } else {
    if (raw.profile !== null) {
      return { ok: false, error: { code: 'public_boundary_violation', message: 'public archives must not carry a profile.' } };
    }
    if (raw.memories.length > 0 || raw.knowledgeSources.length > 0 || raw.connectionRequests.length > 0 || raw.contactMethods.length > 0 || raw.attachments.length > 0) {
      return { ok: false, error: { code: 'public_boundary_violation', message: 'public archives must have empty private sections.' } };
    }
    if (raw.conversations.exported || raw.conversations.items.length > 0) {
      return { ok: false, error: { code: 'public_boundary_violation', message: 'public archives must not carry conversations.' } };
    }
  }
  if (raw.integrity !== null) {
    if (!isRecord(raw.integrity) || raw.integrity.algorithm !== 'fnv1a-32' || !isRecord(raw.integrity.sections)) {
      return { ok: false, error: { code: 'invalid_shape', message: 'integrity must be null or { algorithm, sections }.' } };
    }
    for (const name of Object.keys(ARCHIVE_SECTION_VERSIONS)) {
      const expected = raw.integrity.sections[name];
      if (!isString(expected)) continue;
      const actual = fnv1a32(canonicalJson(raw[name]));
      if (actual !== expected) {
        return { ok: false, error: { code: 'checksum_mismatch', message: `Section "${name}" checksum does not match.` } };
      }
    }
  }
  return { ok: true, value: raw };
}

/** Compute a stable whole-archive digest (NOT the per-section integrity map). */
function computeArchiveDigest(archive) {
  return fnv1a32(canonicalJson(archive));
}

/** Deterministic receipt id, one live receipt per owner. */
function computeDeleteAllReceiptId(ownerOpenid) {
  return `archive_receipt_${fnv1a32(`owner:${ownerOpenid}`)}`;
}

function buildDeleteAllReceipt(input) {
  const window = typeof input.windowMs === 'number' && input.windowMs > 0
    ? input.windowMs
    : ARCHIVE_DELETE_ALL_WINDOW_MS;
  const now = input.now;
  return {
    schemaVersion: 1,
    id: computeDeleteAllReceiptId(input.ownerOpenid),
    ownerOpenid: input.ownerOpenid,
    archiveDigest: input.archiveDigest,
    preparedAt: now,
    expiresAt: now + window,
    archiveBytes: input.archiveBytes,
    archiveRecordCount: input.archiveRecordCount,
    consumedAt: null,
    origin: input.origin,
  };
}

function validateDeleteAllConfirmation(confirmation, receipt, now) {
  if (!confirmation) {
    return { ok: false, error: { code: 'token_missing', message: 'confirmation is required' } };
  }
  if (confirmation.id !== receipt.id) {
    return { ok: false, error: { code: 'token_mismatch', message: 'confirmation id does not match the active receipt' } };
  }
  if (confirmation.archiveDigest !== receipt.archiveDigest) {
    return { ok: false, error: { code: 'token_mismatch', message: 'confirmation digest does not match the active receipt' } };
  }
  if (confirmation.preparedAt !== receipt.preparedAt) {
    return { ok: false, error: { code: 'token_mismatch', message: 'confirmation preparedAt does not match the active receipt' } };
  }
  if (receipt.consumedAt !== null) {
    return { ok: false, error: { code: 'token_already_used', message: 'receipt has already been consumed' } };
  }
  if (receipt.expiresAt <= now) {
    return { ok: false, error: { code: 'token_expired', message: 'receipt has expired; export again before deleting' } };
  }
  return { ok: true, value: { receipt } };
}

/** True if every memory in the batch points at this owner. */
function everyOwnerIs(memory, openid) {
  return memory.ownerId === openid;
}

module.exports = {
  ARCHIVE_FORMAT,
  ARCHIVE_SCHEMA_VERSION,
  ARCHIVE_SECTION_VERSIONS,
  ARCHIVE_DELETE_ALL_WINDOW_MS,
  NOW_TOPICS,
  NOW_STATUSES,
  CONTACT_KINDS,
  CONNECTION_ACTIONS,
  MESSAGE_ROLES,
  CONVERSATION_KINDS,
  KNOWLEDGE_KINDS,
  KNOWLEDGE_STATUSES,
  MEMORY_KINDS,
  MEMORY_VISIBILITIES,
  MEMORY_STATUSES,
  canonicalJson,
  fnv1a32,
  validateArchive,
  computeArchiveDigest,
  computeDeleteAllReceiptId,
  buildDeleteAllReceipt,
  validateDeleteAllConfirmation,
  everyOwnerIs,
};