/**
 * Core tests: Portable Vibe Archive (task 5.3).
 *
 * Acceptance coverage:
 * - export → delete → import recovers the same fixture identity (deterministic)
 * - public export contains no private/connected/agent_only memory and no
 *   contact method (recursive scan for forbidden keys and values)
 * - invalid and future-unsupported archives fail with typed error codes
 * - v0 → v1 migration path works
 * - stable ids preserved across round-trip
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Memory } from '../vibe';
import {
  fixtureConnectionRequest,
  fixtureOwner,
  fixtureOwnerCard,
  fixtureOwnerContactMethods,
  fixtureOwnerMemories,
  fixtureOwnerSensitiveMemories,
  fixtureWeakConnectionRequest,
} from '../fixtures/vibe';
import { fixtureNowItems, fixtureNowReferenceNow } from '../fixtures/now';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_SCHEMA_VERSION,
  ARCHIVE_SECTION_VERSIONS,
  buildDeletionPlan,
  exportPrivateArchive,
  exportPublicArchive,
  importArchive,
  migrateArchive,
  validateArchive,
} from '../archive';
import type {
  ArchiveConversation,
  ExportPrivateArchiveInput,
  PrivateVibeArchive,
  VibeArchive,
} from '../archive';

const T0 = 1_752_000_000_000; // same fixed timestamp as the fixtures
const hour = 3_600_000;

const ALL_FIXTURE_MEMORIES: Memory[] = [
  ...fixtureOwnerMemories,
  ...fixtureOwnerSensitiveMemories,
];
const ALL_FIXTURE_REQUESTS = [fixtureConnectionRequest, fixtureWeakConnectionRequest];

const fixtureConversations: ArchiveConversation[] = [
  {
    id: 'fixture-conversation-owner-3',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    kind: 'owner_vibe',
    visitorId: null,
    messages: [
      {
        id: 'fixture-message-4',
        schemaVersion: 1,
        conversationId: 'fixture-conversation-owner-3',
        role: 'owner',
        text: '其实比起线上长聊，我更想先约一次二十分钟的语音。',
        createdAt: T0 - 2 * hour,
      },
      {
        id: 'fixture-message-4b',
        schemaVersion: 1,
        conversationId: 'fixture-conversation-owner-3',
        role: 'vibe',
        text: '要我把这条记成一条偏好吗？',
        createdAt: T0 - 2 * hour + 60_000,
      },
    ],
    createdAt: T0 - 2 * hour,
    updatedAt: T0 - 2 * hour + 60_000,
  },
];

const APP = { name: 'vibecard-test', version: '0.0.0-test' };

function privateInput(): ExportPrivateArchiveInput {
  return {
    profile: {
      id: fixtureOwner.id,
      schemaVersion: 1,
      name: fixtureOwner.name,
      avatarUrl: fixtureOwner.avatarUrl,
    },
    card: fixtureOwnerCard,
    nowItems: fixtureNowItems,
    memories: ALL_FIXTURE_MEMORIES,
    contactMethods: fixtureOwnerContactMethods,
    connectionRequests: ALL_FIXTURE_REQUESTS,
    includeConversations: true,
    conversations: fixtureConversations,
    knowledgeSources: [
      {
        id: 'fixture-knowledge-note-1',
        schemaVersion: 1,
        ownerId: fixtureOwner.id,
        kind: 'note',
        title: '关于个人数据主权的阅读笔记',
        source: 'reading-notes-data-sovereignty.md',
        status: 'pending',
        createdAt: T0 - hour,
        updatedAt: T0 - hour,
      },
    ],
    attachments: [
      {
        id: 'fixture-attachment-1',
        schemaVersion: 1,
        fileName: 'vibecard-draft.pdf',
        sizeBytes: 204_800,
        sha256: 'a'.repeat(64),
        mediaType: 'application/pdf',
        note: '名片草稿，仅元数据入档，文件本体不随档迁移。',
        relatedTo: { collection: 'cards', id: fixtureOwnerCard.id },
        createdAt: T0 - hour,
      },
    ],
    app: APP,
    createdAt: T0,
  };
}

/** Recursively collect every string key and string value in a JSON tree. */
function scanJson(value: unknown, found: { keys: string[]; values: string[] }): void {
  if (typeof value === 'string') {
    found.values.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => scanJson(item, found));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      found.keys.push(key);
      scanJson(item, found);
    }
  }
}

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* -------------------------------------------------------------------------
 * Round-trip: export → (delete) → import recovers fixture identity
 * ------------------------------------------------------------------------- */

test('private export → import round-trips the full fixture identity', () => {
  const archive = exportPrivateArchive(privateInput());
  // Simulate export to a .vibe file and the owner deleting local state: the
  // only surviving copy is the serialized JSON document.
  const parsed = roundTrip(archive);
  const imported = importArchive(parsed);
  assert.ok(imported.ok, imported.ok ? '' : imported.error.message);
  const state = imported.value;

  assert.equal(state.kind, 'private');
  assert.equal(state.createdAt, T0);
  assert.deepEqual(state.profile, privateInput().profile);
  assert.deepEqual(state.card, fixtureOwnerCard);
  assert.deepEqual(state.nowItems, fixtureNowItems); // full history, incl. deleted
  assert.deepEqual(state.memories, ALL_FIXTURE_MEMORIES); // confirmed AND proposed
  assert.deepEqual(state.contactMethods, fixtureOwnerContactMethods);
  assert.deepEqual(state.connectionRequests, ALL_FIXTURE_REQUESTS);
  assert.deepEqual(state.conversations, fixtureConversations);
  assert.equal(state.knowledgeSources.length, 1);
  assert.equal(state.attachments.length, 1);
  // Attachments are metadata-only: no byte payload anywhere in the archive.
  const scanned = { keys: [] as string[], values: [] as string[] };
  scanJson(parsed, scanned);
  assert.ok(!scanned.keys.includes('bytes'));
  assert.ok(!scanned.keys.includes('data'));
});

test('stable ids are preserved unchanged across the round-trip', () => {
  const archive = roundTrip(exportPrivateArchive(privateInput()));
  const imported = importArchive(archive);
  assert.ok(imported.ok);
  const state = imported.value;

  assert.equal(state.card.id, 'fixture-card-linzhou');
  assert.deepEqual(
    (state.nowItems as typeof fixtureNowItems).map((item) => item.id),
    fixtureNowItems.map((item) => item.id),
  );
  assert.deepEqual(
    state.memories.map((memory) => memory.id),
    ALL_FIXTURE_MEMORIES.map((memory) => memory.id),
  );
  assert.deepEqual(
    state.contactMethods.map((contact) => contact.id),
    fixtureOwnerContactMethods.map((contact) => contact.id),
  );
  assert.deepEqual(
    state.connectionRequests.map((request) => request.id),
    ALL_FIXTURE_REQUESTS.map((request) => request.id),
  );
  assert.deepEqual(
    state.conversations.map((conversation) => conversation.id),
    fixtureConversations.map((conversation) => conversation.id),
  );
});

test('deletion plan lists exactly the exported records and nothing else', () => {
  const archive = exportPrivateArchive(privateInput());
  const plan = buildDeletionPlan(archive);
  assert.ok(plan.ok);
  assert.equal(plan.value.ownerId, fixtureOwner.id);
  assert.deepEqual(plan.value.cardIds, [fixtureOwnerCard.id]);
  assert.deepEqual(
    plan.value.nowItemIds.sort(),
    fixtureNowItems.map((item) => item.id).sort(),
  );
  assert.deepEqual(
    plan.value.memoryIds.sort(),
    ALL_FIXTURE_MEMORIES.map((memory) => memory.id).sort(),
  );
  assert.deepEqual(
    plan.value.contactMethodIds.sort(),
    fixtureOwnerContactMethods.map((contact) => contact.id).sort(),
  );
  assert.deepEqual(
    plan.value.connectionRequestIds.sort(),
    ALL_FIXTURE_REQUESTS.map((request) => request.id).sort(),
  );
  assert.deepEqual(plan.value.conversationIds, ['fixture-conversation-owner-3']);
  assert.deepEqual(plan.value.messageIds.sort(), ['fixture-message-4', 'fixture-message-4b'].sort());
  assert.deepEqual(plan.value.attachmentFileNames, ['vibecard-draft.pdf']);
});

test('a public export can never authorize deletion', () => {
  const publicArchive = exportPublicArchive({
    card: fixtureOwnerCard,
    nowItems: fixtureNowItems,
    app: APP,
    createdAt: T0,
    now: fixtureNowReferenceNow,
  });
  const plan = buildDeletionPlan(publicArchive);
  assert.equal(plan.ok, false);
  assert.ok(!plan.ok && plan.error.code === 'wrong_kind');
});

/* -------------------------------------------------------------------------
 * Public export: strict projection, provably free of private data
 * ------------------------------------------------------------------------- */

test('public export is Card + active-Now projection only', () => {
  const archive = exportPublicArchive({
    card: fixtureOwnerCard,
    nowItems: fixtureNowItems,
    app: APP,
    createdAt: T0,
    now: fixtureNowReferenceNow,
  });
  assert.equal(archive.kind, 'public');
  assert.equal(archive.profile, null);
  assert.deepEqual(archive.memories, []);
  assert.deepEqual(archive.contactMethods, []);
  assert.deepEqual(archive.connectionRequests, []);
  assert.deepEqual(archive.knowledgeSources, []);
  assert.deepEqual(archive.attachments, []);
  assert.deepEqual(archive.conversations, { exported: false, items: [] });
  // Active projection: the two published non-expired items, newest first.
  assert.deepEqual(
    archive.nowItems.map((item) => item.id),
    ['fixture-now-published-focus', 'fixture-now-published-expiring'],
  );

  const imported = importArchive(roundTrip(archive));
  assert.ok(imported.ok);
  assert.equal(imported.value.kind, 'public');
});

test('public export contains no private data — recursive scan proof', () => {
  const archive = roundTrip(
    exportPublicArchive({
      card: fixtureOwnerCard,
      nowItems: fixtureNowItems,
      app: APP,
      createdAt: T0,
      now: fixtureNowReferenceNow,
    }),
  );
  const scanned = { keys: [] as string[], values: [] as string[] };
  scanJson(archive, scanned);

  // No non-public memory content, whatever its visibility or status.
  const forbiddenContents = [
    ...fixtureOwnerSensitiveMemories.map((memory) => memory.content), // connected + private
    ALL_FIXTURE_MEMORIES.find((memory) => memory.visibility === 'agent_only')!.content,
    ALL_FIXTURE_MEMORIES.find((memory) => memory.status === 'proposed')!.content,
  ];
  for (const content of forbiddenContents) {
    assert.ok(!scanned.values.includes(content), `leaked memory content: ${content}`);
  }
  // No contact method values or contact-shaped keys.
  assert.ok(!scanned.values.includes('fixture-wechat-linzhou'));
  assert.ok(!scanned.values.includes('linzhou@mail.example.com'));
  assert.ok(!scanned.keys.includes('value'));
  assert.ok(!scanned.values.includes('connected'));
  assert.ok(!scanned.values.includes('agent_only'));
  // No conversation text.
  assert.ok(!scanned.values.includes('其实比起线上长聊，我更想先约一次二十分钟的语音。'));
  // No private attachment note.
  assert.ok(!scanned.values.includes('名片草稿，仅元数据入档，文件本体不随档迁移。'));
  // No non-active Now text (draft / archived / hidden / deleted / expired).
  const nonActiveTexts = fixtureNowItems
    .filter((item) => !['fixture-now-published-focus', 'fixture-now-published-expiring'].includes(item.id))
    .map((item) => item.text);
  for (const text of nonActiveTexts) {
    assert.ok(!scanned.values.includes(text), `leaked non-active Now text: ${text}`);
  }
});

test('opt-out: conversations stay out of a private export unless selected', () => {
  const input = privateInput();
  input.includeConversations = false;
  const archive = exportPrivateArchive(input);
  assert.equal(archive.conversations.exported, false);
  assert.deepEqual(archive.conversations.items, []);
  const scanned = { keys: [] as string[], values: [] as string[] };
  scanJson(archive, scanned);
  assert.ok(!scanned.values.includes('其实比起线上长聊，我更想先约一次二十分钟的语音。'));
});

/* -------------------------------------------------------------------------
 * Typed validation errors
 * ------------------------------------------------------------------------- */

test('non-object and wrong-format archives fail with invalid_shape', () => {
  for (const raw of [null, 42, 'nope', [], { format: 'something-else' }]) {
    const result = importArchive(raw);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.error.code === 'invalid_shape');
  }
});

test('a malformed section fails with invalid_shape', () => {
  const archive = roundTrip(exportPrivateArchive(privateInput()));
  (archive.memories as unknown[]).push({ id: 123 });
  archive.integrity = null; // drop checksums so shape validation is what fails
  const result = validateArchive(archive);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.error.code === 'invalid_shape');
});

test('a future schema version fails with future_version', () => {
  const archive = roundTrip(exportPrivateArchive(privateInput())) as VibeArchive;
  const future = { ...archive, schemaVersion: ARCHIVE_SCHEMA_VERSION + 1 };
  const viaValidate = validateArchive(future);
  assert.equal(viaValidate.ok, false);
  assert.ok(!viaValidate.ok && viaValidate.error.code === 'future_version');
  const viaImport = importArchive(future);
  assert.equal(viaImport.ok, false);
  assert.ok(!viaImport.ok && viaImport.error.code === 'future_version');
});

test('an unknown old version fails with unsupported_version', () => {
  const archive = roundTrip(exportPrivateArchive(privateInput())) as unknown as Record<string, unknown>;
  const migrated = migrateArchive({ ...archive, schemaVersion: undefined, version: 7 });
  assert.equal(migrated.ok, false);
  assert.ok(!migrated.ok && migrated.error.code === 'future_version'); // 7 > current
  const noPath = validateArchive({ ...archive, schemaVersion: 0 });
  assert.equal(noPath.ok, false);
  assert.ok(!noPath.ok && noPath.error.code === 'unsupported_version');
});

test('a tampered section version fails with section_version_mismatch', () => {
  const archive = roundTrip(exportPrivateArchive(privateInput()));
  archive.sectionVersions = { ...ARCHIVE_SECTION_VERSIONS, memories: 99 };
  const result = validateArchive(archive);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.error.code === 'section_version_mismatch');
});

test('a tampered section fails with checksum_mismatch', () => {
  const archive = roundTrip(exportPrivateArchive(privateInput()));
  archive.memories = archive.memories.map((memory) =>
    memory.id === 'fixture-memory-private-health-note'
      ? { ...memory, content: 'tampered' }
      : memory,
  );
  const result = validateArchive(archive);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.error.code === 'checksum_mismatch');
});

test('an encrypted envelope fails with encrypted_archive (client must decrypt first)', () => {
  const archive = roundTrip(exportPrivateArchive(privateInput()));
  const encrypted = { ...archive, encryption: { algorithm: 'xchacha20poly1305', hint: 'owner passphrase' } };
  const result = validateArchive(encrypted);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.error.code === 'encrypted_archive');
});

test('private sections inside a public archive fail with public_boundary_violation', () => {
  const archive = roundTrip(
    exportPublicArchive({
      card: fixtureOwnerCard,
      nowItems: fixtureNowItems,
      app: APP,
      createdAt: T0,
      now: fixtureNowReferenceNow,
    }),
  );
  const tampered = { ...archive, memories: roundTrip(ALL_FIXTURE_MEMORIES), integrity: null };
  const result = validateArchive(tampered);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.error.code === 'public_boundary_violation');
});

/* -------------------------------------------------------------------------
 * Migration: v0 → v1
 * ------------------------------------------------------------------------- */

function buildV0Archive(): Record<string, unknown> {
  // Hypothetical pre-1.0 prototype format; see migrateV0toV1 in archive.ts.
  const stripSourceMemoryId = (item: (typeof fixtureNowItems)[number]) => {
    const { sourceMemoryId: _dropped, ...rest } = item;
    return rest;
  };
  return {
    format: ARCHIVE_FORMAT,
    version: 0,
    kind: 'private',
    meta: { createdAt: T0, appName: APP.name, appVersion: APP.version },
    profile: privateInput().profile,
    card: roundTrip(fixtureOwnerCard),
    now: fixtureNowItems.map(stripSourceMemoryId),
    memories: roundTrip(ALL_FIXTURE_MEMORIES),
    connections: roundTrip(ALL_FIXTURE_REQUESTS),
    contacts: roundTrip(fixtureOwnerContactMethods),
    conversations: { exported: false, items: [] },
    knowledge: [],
    attachments: [],
  };
}

test('v0 archives migrate to v1 and import cleanly', () => {
  const v0 = buildV0Archive();

  const migrated = migrateArchive(v0);
  assert.ok(migrated.ok, migrated.ok ? '' : migrated.error.message);
  assert.equal(migrated.value.schemaVersion, ARCHIVE_SCHEMA_VERSION);
  assert.deepEqual(migrated.value.sectionVersions, { ...ARCHIVE_SECTION_VERSIONS });

  const imported = importArchive(v0);
  assert.ok(imported.ok, imported.ok ? '' : imported.error.message);
  const state = imported.value;
  // Ids survive the migration unchanged.
  assert.equal(state.card.id, fixtureOwnerCard.id);
  assert.deepEqual(
    state.memories.map((memory) => memory.id),
    ALL_FIXTURE_MEMORIES.map((memory) => memory.id),
  );
  assert.deepEqual(
    state.connectionRequests.map((request) => request.id),
    ALL_FIXTURE_REQUESTS.map((request) => request.id),
  );
  // v0 Now items lacked sourceMemoryId; the migration defaults it to null.
  const nowItems = state.nowItems as typeof fixtureNowItems;
  assert.equal(nowItems.length, fixtureNowItems.length);
  assert.ok(nowItems.every((item) => item.sourceMemoryId === null));
  assert.deepEqual(
    nowItems.map((item) => item.id),
    fixtureNowItems.map((item) => item.id),
  );
  // Migrated archives carry fresh integrity checksums and still validate.
  const revalidated = validateArchive(migrated.value);
  assert.ok(revalidated.ok);
});

test('v0 round-trip equals a native v1 export except for Now sourceMemoryId defaults', () => {
  const importedV0 = importArchive(buildV0Archive());
  const importedV1 = importArchive(roundTrip(exportPrivateArchive({
    ...privateInput(),
    includeConversations: false,
    conversations: undefined,
    knowledgeSources: [],
    attachments: [],
  })));
  assert.ok(importedV0.ok && importedV1.ok);
  assert.deepEqual(importedV0.value.memories, importedV1.value.memories);
  assert.deepEqual(importedV0.value.card, importedV1.value.card);
  assert.deepEqual(importedV0.value.contactMethods, importedV1.value.contactMethods);
  const v0Now = importedV0.value.nowItems as typeof fixtureNowItems;
  const v1Now = importedV1.value.nowItems as typeof fixtureNowItems;
  assert.deepEqual(
    v0Now.map((item) => item.id),
    v1Now.map((item) => item.id),
  );
});

test('archives already at the current version pass migrateArchive unchanged', () => {
  const archive = roundTrip(exportPrivateArchive(privateInput()));
  const migrated = migrateArchive(archive);
  assert.ok(migrated.ok);
  assert.equal((migrated.value as PrivateVibeArchive).kind, 'private');
  const validated = validateArchive(migrated.value);
  assert.ok(validated.ok);
});
