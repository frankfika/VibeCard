/**
 * Portable Vibe Archive (task 5.3).
 *
 * A versioned `.vibe` archive is a single JSON document (documented in
 * docs/engineering/VIBE_ARCHIVE.md) that a client may carry as a `.vibe`
 * file. It lets an owner move their whole VibeCard between the three runtime
 * modes (ARCHITECTURE §19) and proves the Four Data Layers boundaries
 * (ARCHITECTURE §16) survive export.
 *
 * Hard rules:
 * - The format has NO fields for model keys, access tokens, or server
 *   secrets. It must be impossible to express them here, not merely
 *   discouraged.
 * - `exportPublicArchive` is a strict public projection: Card + active Now
 *   items only. No memory of any visibility, no contact methods, no
 *   conversations, no private attachment notes — even public confirmed
 *   memory content does not travel in a public archive.
 * - `exportPrivateArchive` is the complete owner state, still without any
 *   credential material.
 * - All functions are pure. The Core never touches storage, the filesystem,
 *   or the network; clients serialize, persist, and delete.
 * - Optional client-side encryption happens outside the Core: the client
 *   encrypts the serialized JSON envelope and marks
 *   `encryption: { algorithm, hint }`. The Core validates plaintext only and
 *   refuses encrypted payloads with a typed error.
 */

import type {
  ConnectionRequest,
  ContactMethod,
  Memory,
  VibeCard,
} from './vibe';
import type { NowItem, NowItemStatus, NowItemTopic } from './now';
import type { PublicNowItem } from './public-card';
import { projectActiveNowItems } from './public-card';
import {
  isMemoryKind,
  isMemoryStatus,
  isMemoryVisibility,
} from './memory';

/* ---------------------------------------------------------------------------
 * Format identity and versions
 * ------------------------------------------------------------------------- */

export const ARCHIVE_FORMAT = 'vibecard-vibe-archive';
export const ARCHIVE_SCHEMA_VERSION = 1;
/** Versions this Core can read: v0 only via `migrateArchive`, v1 natively. */
export const ARCHIVE_SUPPORTED_VERSIONS: readonly number[] = [0, 1];

/**
 * Per-section schema versions for archive schemaVersion 1. Every section is
 * independently versioned so a future change can bump one section without
 * re-versioning the whole archive.
 */
export const ARCHIVE_SECTION_VERSIONS = {
  profile: 1,
  card: 1,
  now: 1,
  memories: 1,
  conversations: 1,
  knowledgeSources: 1,
  connections: 1,
  contactMethods: 1,
  attachments: 1,
} as const;

export type ArchiveSection = keyof typeof ARCHIVE_SECTION_VERSIONS;

export type ArchiveKind = 'public' | 'private';

export interface ArchiveAppInfo {
  name: string;
  version: string;
}

/* ---------------------------------------------------------------------------
 * Section shapes
 * ------------------------------------------------------------------------- */

/**
 * Minimal owner profile record. The Core has no user contract yet (users
 * ship in task 1.1); the archive carries this stable identity record so an
 * import can re-key everything else against the same owner.
 */
export interface ArchiveProfile {
  id: string;
  schemaVersion: 1;
  name: string;
  avatarUrl: string;
}

/** Minimal versioned message shape for explicit conversation export. */
export interface ArchiveMessage {
  id: string;
  schemaVersion: 1;
  conversationId: string;
  /** `vibe` is the owner's private AI; `agent` is the public-facing Vibe. */
  role: 'owner' | 'vibe' | 'visitor' | 'agent';
  text: string;
  createdAt: number;
}

/** Minimal versioned conversation shape for explicit conversation export. */
export interface ArchiveConversation {
  id: string;
  schemaVersion: 1;
  ownerId: string;
  kind: 'owner_vibe' | 'visitor';
  visitorId: string | null;
  messages: ArchiveMessage[];
  /** Server-validated, privacy-minimized topic labels from grounded visitor overlap. */
  verifiedSharedContext?: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Conversation export is always opt-in: `exported` is true only when the
 * owner explicitly selected conversation export for this archive.
 */
export interface ArchiveConversationSection {
  exported: boolean;
  items: ArchiveConversation[];
}

/**
 * Knowledge-source metadata placeholder (ARCHITECTURE §18: optional file and
 * knowledge-base ingestion comes later; no real ingestion exists yet). The
 * archive reserves the section so future ingested sources round-trip.
 */
export interface ArchiveKnowledgeSource {
  id: string;
  schemaVersion: 1;
  ownerId: string;
  kind: 'file' | 'url' | 'note';
  title: string;
  /** Locator metadata only: a filename, URL, or note label — never bytes. */
  source: string;
  status: 'pending' | 'ingested' | 'failed';
  createdAt: number;
  updatedAt: number;
}

/**
 * Attachment manifest entry: metadata only. An archive NEVER silently
 * includes local file bytes; it records what existed so the owner can
 * re-attach files manually after import.
 */
export interface ArchiveAttachment {
  id: string;
  schemaVersion: 1;
  fileName: string;
  sizeBytes: number;
  sha256: string | null;
  mediaType: string | null;
  /** Owner-facing note. Private archives only — never exported publicly. */
  note: string;
  relatedTo: { collection: string; id: string } | null;
  createdAt: number;
}

/* ---------------------------------------------------------------------------
 * Top-level archive document
 * ------------------------------------------------------------------------- */

export interface VibeArchive {
  format: typeof ARCHIVE_FORMAT;
  schemaVersion: typeof ARCHIVE_SCHEMA_VERSION;
  kind: ArchiveKind;
  createdAt: number;
  app: ArchiveAppInfo;
  /**
   * Encryption metadata. The Core handles plaintext only: when a client
   * encrypts the serialized envelope it decrypts before import and this
   * field is null in the plaintext document the Core sees.
   */
  encryption: { algorithm: string; hint: string } | null;
  sectionVersions: Record<ArchiveSection, number>;
  /**
   * Optional per-section checksums (fnv1a-32 over canonical JSON). When
   * present, validation verifies them; when null, validation skips them.
   */
  integrity: { algorithm: 'fnv1a-32'; sections: Record<string, string> } | null;
  /** Private archives only; null in public archives. */
  profile: ArchiveProfile | null;
  card: VibeCard;
  /** Private: full Now history (all statuses). Public: active projection. */
  nowItems: NowItem[] | PublicNowItem[];
  /** Private: confirmed AND proposed (and paused/deleted) memories. Public: []. */
  memories: Memory[];
  conversations: ArchiveConversationSection;
  knowledgeSources: ArchiveKnowledgeSource[];
  connectionRequests: ConnectionRequest[];
  /** Private archives only; [] in public archives. */
  contactMethods: ContactMethod[];
  attachments: ArchiveAttachment[];
}

/** Private archive with full Now history. */
export interface PrivateVibeArchive extends VibeArchive {
  kind: 'private';
  profile: ArchiveProfile;
  nowItems: NowItem[];
}

/** Public archive: a strict projection with empty private sections. */
export interface PublicVibeArchive extends VibeArchive {
  kind: 'public';
  profile: null;
  nowItems: PublicNowItem[];
}

/* ---------------------------------------------------------------------------
 * Typed errors
 * ------------------------------------------------------------------------- */

export type ArchiveErrorCode =
  | 'invalid_shape'
  | 'unsupported_version'
  | 'future_version'
  | 'section_version_mismatch'
  | 'checksum_mismatch'
  | 'encrypted_archive'
  | 'public_boundary_violation'
  | 'wrong_kind';

export interface ArchiveError {
  code: ArchiveErrorCode;
  message: string;
}

export type ArchiveResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ArchiveError };

function ok<T>(value: T): ArchiveResult<T> {
  return { ok: true, value };
}

function fail<T>(code: ArchiveErrorCode, message: string): ArchiveResult<T> {
  return { ok: false, error: { code, message } };
}

/* ---------------------------------------------------------------------------
 * Checksum helpers (dependency-free fnv1a-32 over canonical JSON)
 * ------------------------------------------------------------------------- */

/** Canonical JSON: object keys sorted recursively so checksums are stable. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',');
  return `{${body}}`;
}

/** fnv1a-32 hex digest. Hand-rolled so the Core stays dependency-free. */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in uint32 via Math.imul.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Sections covered by the integrity map, in a fixed order. */
const CHECKSUM_SECTIONS = [
  'profile',
  'card',
  'nowItems',
  'memories',
  'conversations',
  'knowledgeSources',
  'connectionRequests',
  'contactMethods',
  'attachments',
] as const;

function buildIntegrity(
  sections: Record<(typeof CHECKSUM_SECTIONS)[number], unknown>,
): VibeArchive['integrity'] {
  const map: Record<string, string> = {};
  for (const name of CHECKSUM_SECTIONS) {
    map[name] = fnv1a32(canonicalJson(sections[name]));
  }
  return { algorithm: 'fnv1a-32', sections: map };
}

/* ---------------------------------------------------------------------------
 * Export: private (complete) and public (strict projection)
 * ------------------------------------------------------------------------- */

export interface ExportPrivateArchiveInput {
  profile: ArchiveProfile;
  card: VibeCard;
  /** Full Now history: draft, published, archived, hidden, and deleted. */
  nowItems: readonly NowItem[];
  /** All memories, confirmed and proposed alike. */
  memories: readonly Memory[];
  contactMethods: readonly ContactMethod[];
  connectionRequests: readonly ConnectionRequest[];
  /** Conversation export is opt-in; pass items only when explicitly selected. */
  includeConversations: boolean;
  conversations?: readonly ArchiveConversation[];
  knowledgeSources?: readonly ArchiveKnowledgeSource[];
  attachments?: readonly ArchiveAttachment[];
  app: ArchiveAppInfo;
  /** Fixed timestamp; callers pass a deterministic value in tests. */
  createdAt: number;
  /** Set false to omit integrity checksums. Defaults to true. */
  withIntegrity?: boolean;
}

/**
 * Complete private export. Contains every data layer except credentials —
 * the format has no fields for keys or tokens by construction.
 */
export function exportPrivateArchive(input: ExportPrivateArchiveInput): PrivateVibeArchive {
  const conversations: ArchiveConversationSection = {
    exported: input.includeConversations,
    items: input.includeConversations ? [...(input.conversations ?? [])] : [],
  };
  const sections = {
    profile: input.profile,
    card: input.card,
    nowItems: [...input.nowItems],
    memories: [...input.memories],
    conversations,
    knowledgeSources: [...(input.knowledgeSources ?? [])],
    connectionRequests: [...input.connectionRequests],
    contactMethods: [...input.contactMethods],
    attachments: [...(input.attachments ?? [])],
  };
  return {
    format: ARCHIVE_FORMAT,
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    kind: 'private',
    createdAt: input.createdAt,
    app: input.app,
    encryption: null,
    sectionVersions: { ...ARCHIVE_SECTION_VERSIONS },
    integrity: input.withIntegrity === false ? null : buildIntegrity(sections),
    ...sections,
  };
}

export interface ExportPublicArchiveInput {
  card: VibeCard;
  /** Owner Now items; reduced to the public active projection internally. */
  nowItems: readonly NowItem[];
  app: ArchiveAppInfo;
  createdAt: number;
  /** "Now" used for active-Now projection; deterministic in tests. */
  now: number;
  withIntegrity?: boolean;
}

/**
 * Public-only export: the Card plus the active-Now projection — exactly what
 * a visitor may see, nothing more. Private sections are empty by
 * construction, not by filtering after the fact.
 */
export function exportPublicArchive(input: ExportPublicArchiveInput): PublicVibeArchive {
  const sections = {
    profile: null,
    card: input.card,
    nowItems: projectActiveNowItems(input.nowItems, input.now),
    memories: [] as Memory[],
    conversations: { exported: false, items: [] } as ArchiveConversationSection,
    knowledgeSources: [] as ArchiveKnowledgeSource[],
    connectionRequests: [] as ConnectionRequest[],
    contactMethods: [] as ContactMethod[],
    attachments: [] as ArchiveAttachment[],
  };
  return {
    format: ARCHIVE_FORMAT,
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    kind: 'public',
    createdAt: input.createdAt,
    app: input.app,
    encryption: null,
    sectionVersions: { ...ARCHIVE_SECTION_VERSIONS },
    integrity: input.withIntegrity === false ? null : buildIntegrity(sections),
    ...sections,
  };
}

/* ---------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------- */

const NOW_TOPICS: readonly NowItemTopic[] = [
  'current_work',
  'completed_work',
  'exploring',
  'looking_for',
  'offer_help',
];
const NOW_STATUSES: readonly NowItemStatus[] = [
  'draft',
  'published',
  'archived',
  'hidden',
  'deleted',
];
const CONTACT_KINDS = ['wechat', 'email', 'phone', 'telegram', 'other'] as const;
const CONNECTION_ACTIONS = ['pending', 'connect', 'later', 'decline'] as const;
const MESSAGE_ROLES = ['owner', 'vibe', 'visitor', 'agent'] as const;
const CONVERSATION_KINDS = ['owner_vibe', 'visitor'] as const;
const KNOWLEDGE_KINDS = ['file', 'url', 'note'] as const;
const KNOWLEDGE_STATUSES = ['pending', 'ingested', 'failed'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function checkMemory(value: unknown): value is Memory {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    value.schemaVersion === 1 &&
    isString(value.ownerId) &&
    isMemoryKind(value.kind) &&
    isString(value.content) &&
    isMemoryVisibility(value.visibility) &&
    isMemoryStatus(value.status) &&
    isString(value.sourceConversationId) &&
    isStringArray(value.sourceMessageIds) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function checkCard(value: unknown): value is VibeCard {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    value.schemaVersion === 1 &&
    isString(value.ownerId) &&
    isString(value.name) &&
    isString(value.avatarUrl) &&
    isString(value.headline) &&
    isString(value.currentFocus) &&
    isStringArray(value.canHelpWith) &&
    isStringArray(value.wantsToMeet) &&
    isStringArray(value.topics) &&
    Array.isArray(value.highlights) &&
    value.highlights.every(
      (h) =>
        isRecord(h) &&
        isString(h.id) &&
        isString(h.title) &&
        (h.url === undefined || isString(h.url)),
    ) &&
    typeof value.agentEnabled === 'boolean' &&
    isTimestamp(value.updatedAt)
  );
}

function checkNowItem(value: unknown): value is NowItem {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    value.schemaVersion === 1 &&
    isString(value.ownerId) &&
    isString(value.text) &&
    NOW_TOPICS.includes(value.topic as NowItemTopic) &&
    isNullableString(value.sourceMemoryId) &&
    NOW_STATUSES.includes(value.status as NowItemStatus) &&
    (value.publishedAt === null || isTimestamp(value.publishedAt)) &&
    (value.expiresAt === null || isTimestamp(value.expiresAt)) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function checkPublicNowItem(value: unknown): value is PublicNowItem {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.text) &&
    NOW_TOPICS.includes(value.topic as NowItemTopic) &&
    (value.publishedAt === null || isTimestamp(value.publishedAt))
  );
}

function checkContactMethod(value: unknown): value is ContactMethod {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    value.schemaVersion === 1 &&
    isString(value.ownerId) &&
    CONTACT_KINDS.includes(value.kind as ContactMethod['kind']) &&
    isString(value.value) &&
    isString(value.label) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function checkConnectionRequest(value: unknown): value is ConnectionRequest {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    value.schemaVersion === 1 &&
    isString(value.ownerId) &&
    isString(value.visitorId) &&
    isString(value.visitorSummary) &&
    isString(value.reason) &&
    isStringArray(value.possibleSharedContext) &&
    (value.visitorWorkUrl === undefined || isString(value.visitorWorkUrl)) &&
    CONNECTION_ACTIONS.includes(value.ownerAction as ConnectionRequest['ownerAction']) &&
    isStringArray(value.sharedContactMethodIds) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function checkProfile(value: unknown): value is ArchiveProfile {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    value.schemaVersion === 1 &&
    isString(value.name) &&
    isString(value.avatarUrl)
  );
}

function checkConversation(value: unknown): value is ArchiveConversation {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    value.schemaVersion === 1 &&
    isString(value.ownerId) &&
    CONVERSATION_KINDS.includes(value.kind as ArchiveConversation['kind']) &&
    isNullableString(value.visitorId) &&
    Array.isArray(value.messages) &&
    value.messages.every(
      (m) =>
        isRecord(m) &&
        isString(m.id) &&
        m.schemaVersion === 1 &&
        m.conversationId === value.id &&
        MESSAGE_ROLES.includes(m.role as ArchiveMessage['role']) &&
        isString(m.text) &&
        isTimestamp(m.createdAt),
    ) &&
    (value.verifiedSharedContext === undefined || isStringArray(value.verifiedSharedContext)) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function checkKnowledgeSource(value: unknown): value is ArchiveKnowledgeSource {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    value.schemaVersion === 1 &&
    isString(value.ownerId) &&
    KNOWLEDGE_KINDS.includes(value.kind as ArchiveKnowledgeSource['kind']) &&
    isString(value.title) &&
    isString(value.source) &&
    KNOWLEDGE_STATUSES.includes(value.status as ArchiveKnowledgeSource['status']) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function checkAttachment(value: unknown): value is ArchiveAttachment {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    value.schemaVersion === 1 &&
    isString(value.fileName) &&
    typeof value.sizeBytes === 'number' &&
    Number.isInteger(value.sizeBytes) &&
    (value.sizeBytes as number) >= 0 &&
    isNullableString(value.sha256) &&
    isNullableString(value.mediaType) &&
    isString(value.note) &&
    (value.relatedTo === null ||
      (isRecord(value.relatedTo) &&
        isString(value.relatedTo.collection) &&
        isString(value.relatedTo.id))) &&
    isTimestamp(value.createdAt)
  );
}

function checkConversationSection(value: unknown): value is ArchiveConversationSection {
  if (!isRecord(value)) return false;
  return (
    typeof value.exported === 'boolean' &&
    Array.isArray(value.items) &&
    value.items.every(checkConversation)
  );
}

/**
 * Validate a plaintext archive document of the CURRENT schema version.
 * Older supported versions must go through `migrateArchive` first (or just
 * call `importArchive`, which chains both).
 */
export function validateArchive(raw: unknown): ArchiveResult<VibeArchive> {
  if (!isRecord(raw)) {
    return fail('invalid_shape', 'Archive must be a JSON object.');
  }
  if (raw.format !== ARCHIVE_FORMAT) {
    return fail('invalid_shape', `format must be "${ARCHIVE_FORMAT}".`);
  }
  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion)) {
    return fail('invalid_shape', 'schemaVersion must be an integer.');
  }
  const version = raw.schemaVersion;
  if (version > ARCHIVE_SCHEMA_VERSION) {
    return fail(
      'future_version',
      `Archive schemaVersion ${version} is newer than supported ${ARCHIVE_SCHEMA_VERSION}.`,
    );
  }
  if (version !== ARCHIVE_SCHEMA_VERSION) {
    return fail(
      'unsupported_version',
      `Archive schemaVersion ${version} needs migration; run migrateArchive first.`,
    );
  }
  if (raw.kind !== 'public' && raw.kind !== 'private') {
    return fail('invalid_shape', 'kind must be "public" or "private".');
  }
  if (raw.encryption !== null) {
    if (
      isRecord(raw.encryption) &&
      isString(raw.encryption.algorithm) &&
      isString(raw.encryption.hint)
    ) {
      return fail(
        'encrypted_archive',
        'Archive is encrypted; the client must decrypt the envelope before import.',
      );
    }
    return fail('invalid_shape', 'encryption must be null or { algorithm, hint }.');
  }
  if (!isRecord(raw.sectionVersions)) {
    return fail('invalid_shape', 'sectionVersions must be an object.');
  }
  for (const section of Object.keys(ARCHIVE_SECTION_VERSIONS) as ArchiveSection[]) {
    if (raw.sectionVersions[section] !== ARCHIVE_SECTION_VERSIONS[section]) {
      return fail(
        'section_version_mismatch',
        `Section "${section}" version ${String(raw.sectionVersions[section])} ` +
          `does not match expected ${ARCHIVE_SECTION_VERSIONS[section]}.`,
      );
    }
  }
  if (!isTimestamp(raw.createdAt)) {
    return fail('invalid_shape', 'createdAt must be a timestamp.');
  }
  if (!isRecord(raw.app) || !isString(raw.app.name) || !isString(raw.app.version)) {
    return fail('invalid_shape', 'app must be { name, version }.');
  }

  if (!checkCard(raw.card)) return fail('invalid_shape', 'card section is malformed.');
  if (!Array.isArray(raw.nowItems)) return fail('invalid_shape', 'nowItems must be an array.');
  if (!Array.isArray(raw.memories) || !raw.memories.every(checkMemory)) {
    return fail('invalid_shape', 'memories section is malformed.');
  }
  if (!checkConversationSection(raw.conversations)) {
    return fail('invalid_shape', 'conversations section is malformed.');
  }
  if (!Array.isArray(raw.knowledgeSources) || !raw.knowledgeSources.every(checkKnowledgeSource)) {
    return fail('invalid_shape', 'knowledgeSources section is malformed.');
  }
  if (!Array.isArray(raw.connectionRequests) || !raw.connectionRequests.every(checkConnectionRequest)) {
    return fail('invalid_shape', 'connectionRequests section is malformed.');
  }
  if (!Array.isArray(raw.contactMethods) || !raw.contactMethods.every(checkContactMethod)) {
    return fail('invalid_shape', 'contactMethods section is malformed.');
  }
  if (!Array.isArray(raw.attachments) || !raw.attachments.every(checkAttachment)) {
    return fail('invalid_shape', 'attachments section is malformed.');
  }

  if (raw.kind === 'private') {
    if (!checkProfile(raw.profile)) {
      return fail('invalid_shape', 'private archives must carry a profile.');
    }
    if (!raw.nowItems.every(checkNowItem)) {
      return fail('invalid_shape', 'private nowItems must be full NowItem records.');
    }
  } else {
    if (raw.profile !== null) {
      return fail('public_boundary_violation', 'public archives must not carry a profile.');
    }
    if (!raw.nowItems.every(checkPublicNowItem)) {
      return fail('invalid_shape', 'public nowItems must be the public projection.');
    }
    const privateSections: Array<[string, unknown]> = [
      ['memories', raw.memories],
      ['knowledgeSources', raw.knowledgeSources],
      ['connectionRequests', raw.connectionRequests],
      ['contactMethods', raw.contactMethods],
      ['attachments', raw.attachments],
    ];
    for (const [name, value] of privateSections) {
      if (Array.isArray(value) && value.length > 0) {
        return fail(
          'public_boundary_violation',
          `public archives must have an empty ${name} section.`,
        );
      }
    }
    const conv = raw.conversations as ArchiveConversationSection;
    if (conv.exported || conv.items.length > 0) {
      return fail(
        'public_boundary_violation',
        'public archives must not carry conversations.',
      );
    }
  }

  if (raw.integrity !== null) {
    if (
      !isRecord(raw.integrity) ||
      raw.integrity.algorithm !== 'fnv1a-32' ||
      !isRecord(raw.integrity.sections)
    ) {
      return fail('invalid_shape', 'integrity must be null or { algorithm, sections }.');
    }
    const archive = raw as unknown as VibeArchive;
    for (const name of CHECKSUM_SECTIONS) {
      const expected = raw.integrity.sections[name];
      if (!isString(expected)) continue; // absent entries are not verified
      const actual = fnv1a32(canonicalJson(archive[name as keyof VibeArchive]));
      if (actual !== expected) {
        return fail('checksum_mismatch', `Section "${name}" checksum does not match.`);
      }
    }
  }

  return ok(raw as unknown as VibeArchive);
}

/* ---------------------------------------------------------------------------
 * Migrations
 * ------------------------------------------------------------------------- */

/**
 * Migration dispatch table, keyed by the version being migrated FROM. Each
 * step upgrades exactly one version; `migrateArchive` chains steps until the
 * current version is reached.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  0: migrateV0toV1,
};

/**
 * Hypothetical v0 archive (pre-1.0 prototype format):
 *
 * ```json
 * {
 *   "format": "vibecard-vibe-archive",
 *   "version": 0,
 *   "kind": "private",
 *   "meta": { "createdAt": 0, "appName": "...", "appVersion": "..." },
 *   "card": { ... },
 *   "now": [ { ...NowItem WITHOUT sourceMemoryId... } ],
 *   "memories": [...],
 *   "connections": [...],
 *   "contacts": [...],
 *   "conversations": { "exported": false, "items": [] },
 *   "knowledge": [...],
 *   "attachments": [...]
 * }
 * ```
 *
 * v1 changes: top-level `version` → `schemaVersion`, `meta` split into
 * `createdAt`/`app`, section renames (`now`→`nowItems`, `connections`→
 * `connectionRequests`, `contacts`→`contactMethods`, `knowledge`→
 * `knowledgeSources`), Now items gain `sourceMemoryId` (default null),
 * and new v1 fields (`profile`, `encryption`, `sectionVersions`,
 * `integrity`) are initialized. Ids are preserved unchanged.
 */
function migrateV0toV1(raw: Record<string, unknown>): Record<string, unknown> {
  const meta = isRecord(raw.meta) ? raw.meta : {};
  const v0Now = Array.isArray(raw.now) ? raw.now : [];
  const nowItems = v0Now.map((item) =>
    isRecord(item) ? { sourceMemoryId: null, ...item } : item,
  );
  const conversations = isRecord(raw.conversations)
    ? raw.conversations
    : { exported: false, items: [] };
  const sections = {
    profile: raw.profile ?? null,
    card: raw.card ?? null,
    nowItems,
    memories: Array.isArray(raw.memories) ? raw.memories : [],
    conversations,
    knowledgeSources: Array.isArray(raw.knowledge) ? raw.knowledge : [],
    connectionRequests: Array.isArray(raw.connections) ? raw.connections : [],
    contactMethods: Array.isArray(raw.contacts) ? raw.contacts : [],
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
  };
  return {
    format: ARCHIVE_FORMAT,
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    kind: raw.kind === 'public' ? 'public' : 'private',
    createdAt: isTimestamp(meta.createdAt) ? meta.createdAt : 0,
    app: {
      name: isString(meta.appName) ? meta.appName : 'unknown',
      version: isString(meta.appVersion) ? meta.appVersion : '0.0.0',
    },
    encryption: null,
    sectionVersions: { ...ARCHIVE_SECTION_VERSIONS },
    integrity: buildIntegrity(sections),
    ...sections,
  };
}

export type MigrateArchiveResult = ArchiveResult<Record<string, unknown>>;

/**
 * Migrate a raw archive document to the current schema version using the
 * version dispatch table. Returns the migrated document (not yet validated);
 * chain with `validateArchive`, or just call `importArchive`.
 */
export function migrateArchive(raw: unknown): MigrateArchiveResult {
  if (!isRecord(raw)) {
    return fail('invalid_shape', 'Archive must be a JSON object.');
  }
  if (raw.format !== ARCHIVE_FORMAT) {
    return fail('invalid_shape', `format must be "${ARCHIVE_FORMAT}".`);
  }
  const version =
    typeof raw.schemaVersion === 'number'
      ? raw.schemaVersion
      : typeof raw.version === 'number'
        ? raw.version
        : null;
  if (version === null || !Number.isInteger(version) || version < 0) {
    return fail('unsupported_version', 'Archive version is missing or invalid.');
  }
  if (version > ARCHIVE_SCHEMA_VERSION) {
    return fail(
      'future_version',
      `Archive schemaVersion ${version} is newer than supported ${ARCHIVE_SCHEMA_VERSION}.`,
    );
  }
  let current = raw;
  let currentVersion = version;
  while (currentVersion < ARCHIVE_SCHEMA_VERSION) {
    const step = MIGRATIONS[currentVersion];
    if (!step) {
      return fail(
        'unsupported_version',
        `No migration path from schemaVersion ${currentVersion}.`,
      );
    }
    current = step(current);
    currentVersion += 1;
  }
  return ok(current);
}

/* ---------------------------------------------------------------------------
 * Import
 * ------------------------------------------------------------------------- */

/**
 * Normalized domain objects, ready for a client to persist. Pure data only —
 * the Core never writes to storage.
 */
export interface ImportedArchiveState {
  kind: ArchiveKind;
  createdAt: number;
  app: ArchiveAppInfo;
  profile: ArchiveProfile | null;
  card: VibeCard;
  nowItems: NowItem[] | PublicNowItem[];
  memories: Memory[];
  conversations: ArchiveConversation[];
  knowledgeSources: ArchiveKnowledgeSource[];
  connectionRequests: ConnectionRequest[];
  contactMethods: ContactMethod[];
  attachments: ArchiveAttachment[];
}

/**
 * Full import pipeline: migrate (if needed) → validate → normalize. Invalid
 * and future-unsupported archives fail with typed errors; nothing is
 * persisted by the Core.
 */
export function importArchive(raw: unknown): ArchiveResult<ImportedArchiveState> {
  const migrated = migrateArchive(raw);
  if (migrated.ok === false) return fail(migrated.error.code, migrated.error.message);
  const validated = validateArchive(migrated.value);
  if (validated.ok === false) return fail(validated.error.code, validated.error.message);
  const archive = validated.value;
  return ok({
    kind: archive.kind,
    createdAt: archive.createdAt,
    app: archive.app,
    profile: archive.profile,
    card: archive.card,
    nowItems: archive.nowItems,
    memories: archive.memories,
    conversations: archive.conversations.items,
    knowledgeSources: archive.knowledgeSources,
    connectionRequests: archive.connectionRequests,
    contactMethods: archive.contactMethods,
    attachments: archive.attachments,
  });
}

/* ---------------------------------------------------------------------------
 * Deletion plan (export-then-delete support)
 * ------------------------------------------------------------------------- */

/**
 * Exactly which records a client must delete from local storage after a
 * verified private export. The Core cannot delete client storage itself — it
 * returns this plan and the client executes it; that boundary is
 * intentional (see docs/engineering/VIBE_ARCHIVE.md).
 */
export interface ArchiveDeletionPlan {
  ownerId: string;
  cardIds: string[];
  nowItemIds: string[];
  memoryIds: string[];
  contactMethodIds: string[];
  connectionRequestIds: string[];
  conversationIds: string[];
  messageIds: string[];
  knowledgeSourceIds: string[];
  /** Attachments are metadata-only in the archive; local FILES referenced by
   *  the manifest are listed separately so the client can ask the owner
   *  before deleting bytes. */
  attachmentManifestIds: string[];
  attachmentFileNames: string[];
}

/**
 * Build the deletion plan from a validated archive. Only complete private
 * exports may authorize deletion: a public export is a projection, never
 * proof that local private state was preserved.
 */
export function buildDeletionPlan(archive: VibeArchive): ArchiveResult<ArchiveDeletionPlan> {
  if (archive.kind !== 'private') {
    return fail(
      'wrong_kind',
      'Deletion plans require a private (complete) archive; a public export is only a projection.',
    );
  }
  const nowItems = archive.nowItems as NowItem[];
  return ok({
    ownerId: archive.card.ownerId,
    cardIds: [archive.card.id],
    nowItemIds: nowItems.map((item) => item.id),
    memoryIds: archive.memories.map((memory) => memory.id),
    contactMethodIds: archive.contactMethods.map((contact) => contact.id),
    connectionRequestIds: archive.connectionRequests.map((request) => request.id),
    conversationIds: archive.conversations.items.map((conversation) => conversation.id),
    messageIds: archive.conversations.items.flatMap((conversation) =>
      conversation.messages.map((message) => message.id),
    ),
    knowledgeSourceIds: archive.knowledgeSources.map((source) => source.id),
    attachmentManifestIds: archive.attachments.map((attachment) => attachment.id),
    attachmentFileNames: archive.attachments.map((attachment) => attachment.fileName),
  });
}
