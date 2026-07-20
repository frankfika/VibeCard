/**
 * Adapter conformance test suite (task 5.5).
 *
 * `runRepositoryConformanceTests(label, makeAdapter)` pins the shared
 * behavior every repository adapter must provide, regardless of storage
 * engine: CRUD round-trips, query filters, deterministic ordering, owner
 * isolation, hard deletes, stable ids, and a full archive export/import
 * round-trip executed against repository reads and writes.
 *
 * Reuse for a future database (PostgreSQL, IndexedDB, ...): import this
 * factory, supply `makeAdapter`, run. The suite is engine-agnostic; it only
 * knows the Core contracts in `packages/shared/repositories.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type {
  ConnectionRequest,
  ContactMethod,
  Memory,
  VibeCard,
} from '../../shared/vibe';
import type { NowItem } from '../../shared/now';
import type {
  ArchiveConversation,
  ArchiveKnowledgeSource,
} from '../../shared/archive';
import {
  canonicalJson,
  exportPrivateArchive,
  importArchive,
} from '../../shared/archive';
import type { VibeRepositories } from '../../shared/repositories';

export interface AdapterHandle {
  repositories: VibeRepositories;
  /** Optional cleanup (close handles, delete temp files). */
  close?: () => void | Promise<void>;
}

export type AdapterFactory = () => AdapterHandle | Promise<AdapterHandle>;

const T0 = 1_752_000_000_000;
const hour = 3_600_000;
const OWNER = 'conf-owner-1';
const OTHER_OWNER = 'conf-owner-2';

/* ---------------------------------------------------------------------------
 * Deterministic record builders (ids injected, like Core does)
 * ------------------------------------------------------------------------- */

function memory(id: string, over: Partial<Memory> = {}): Memory {
  return {
    id,
    schemaVersion: 1,
    ownerId: OWNER,
    kind: 'fact',
    content: `memory content for ${id}`,
    visibility: 'public',
    status: 'confirmed',
    sourceConversationId: 'conf-conv-1',
    sourceMessageIds: ['conf-msg-1'],
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function card(id: string, over: Partial<VibeCard> = {}): VibeCard {
  return {
    id,
    schemaVersion: 1,
    ownerId: OWNER,
    name: 'Conformance Owner',
    avatarUrl: 'https://example.com/avatar.png',
    headline: 'headline',
    currentFocus: 'focus',
    canHelpWith: ['a'],
    wantsToMeet: ['b'],
    topics: ['c'],
    highlights: [{ id: 'h1', title: 'highlight' }],
    agentEnabled: true,
    updatedAt: T0,
    ...over,
  };
}

function nowItem(id: string, over: Partial<NowItem> = {}): NowItem {
  return {
    id,
    schemaVersion: 1,
    ownerId: OWNER,
    text: `now text for ${id}`,
    topic: 'current_work',
    sourceMemoryId: null,
    status: 'published',
    publishedAt: T0,
    expiresAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function conversation(id: string, over: Partial<ArchiveConversation> = {}): ArchiveConversation {
  return {
    id,
    schemaVersion: 1,
    ownerId: OWNER,
    kind: 'owner_vibe',
    visitorId: null,
    messages: [
      {
        id: `${id}-msg-1`,
        schemaVersion: 1,
        conversationId: id,
        role: 'owner',
        text: 'hello',
        createdAt: T0,
      },
    ],
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function request(id: string, over: Partial<ConnectionRequest> = {}): ConnectionRequest {
  return {
    id,
    schemaVersion: 1,
    ownerId: OWNER,
    visitorId: 'conf-visitor-1',
    visitorSummary: 'a visitor',
    reason: 'a specific reason to connect',
    possibleSharedContext: ['shared context'],
    ownerAction: 'pending',
    sharedContactMethodIds: [],
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function knowledgeSource(id: string, over: Partial<ArchiveKnowledgeSource> = {}): ArchiveKnowledgeSource {
  return {
    id,
    schemaVersion: 1,
    ownerId: OWNER,
    kind: 'note',
    title: `note ${id}`,
    source: `note://${id}`,
    status: 'ingested',
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function contact(id: string, over: Partial<ContactMethod> = {}): ContactMethod {
  return {
    id,
    schemaVersion: 1,
    ownerId: OWNER,
    kind: 'email',
    value: `${id}@example.com`,
    label: id,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

async function withAdapter(
  makeAdapter: AdapterFactory,
  fn: (repos: VibeRepositories) => Promise<void>,
): Promise<void> {
  const handle = await makeAdapter();
  try {
    await fn(handle.repositories);
  } finally {
    await handle.close?.();
  }
}

/* ---------------------------------------------------------------------------
 * The suite
 * ------------------------------------------------------------------------- */

export function runRepositoryConformanceTests(label: string, makeAdapter: AdapterFactory): void {
  const suite = (name: string, fn: (repos: VibeRepositories) => Promise<void>): void => {
    test(`${label}: ${name}`, () => withAdapter(makeAdapter, fn));
  };

  /* ----- MemoryRepository ----- */

  suite('memories: save/get round-trip with stable id', async (repos) => {
    const m = memory('m1');
    await repos.memories.save(m);
    assert.deepEqual(await repos.memories.get('m1'), m);
  });

  suite('memories: get of unknown id returns null', async (repos) => {
    assert.equal(await repos.memories.get('nope'), null);
  });

  suite('memories: re-save same id updates instead of duplicating', async (repos) => {
    await repos.memories.save(memory('m1'));
    const edited = memory('m1', { content: 'edited', updatedAt: T0 + hour });
    await repos.memories.save(edited);
    assert.deepEqual(await repos.memories.get('m1'), edited);
    const all = await repos.memories.list({ ownerId: OWNER });
    assert.equal(all.length, 1);
  });

  suite('memories: list filters by owner, status, and visibility', async (repos) => {
    await repos.memories.save(memory('m1', { status: 'confirmed', visibility: 'public' }));
    await repos.memories.save(memory('m2', { status: 'proposed', visibility: 'private' }));
    await repos.memories.save(memory('m3', { status: 'paused', visibility: 'agent_only' }));
    await repos.memories.save(memory('m4', { ownerId: OTHER_OWNER }));

    const confirmed = await repos.memories.list({ ownerId: OWNER, status: 'confirmed' });
    assert.deepEqual(confirmed.map((m) => m.id), ['m1']);
    const proposedOrPaused = await repos.memories.list({
      ownerId: OWNER,
      status: ['proposed', 'paused'],
    });
    assert.deepEqual(
      proposedOrPaused.map((m) => m.id).sort(),
      ['m2', 'm3'],
    );
    const privateOnly = await repos.memories.list({ ownerId: OWNER, visibility: 'private' });
    assert.deepEqual(privateOnly.map((m) => m.id), ['m2']);
    const everything = await repos.memories.list({ ownerId: OWNER });
    assert.equal(everything.length, 3); // other owner's record never leaks
  });

  suite('memories: list ordering is updatedAt desc, id asc on ties', async (repos) => {
    await repos.memories.save(memory('m-b', { updatedAt: T0 }));
    await repos.memories.save(memory('m-a', { updatedAt: T0 }));
    await repos.memories.save(memory('m-c', { updatedAt: T0 + hour }));
    const all = await repos.memories.list({ ownerId: OWNER });
    assert.deepEqual(all.map((m) => m.id), ['m-c', 'm-a', 'm-b']);
  });

  suite('memories: remove deletes from later retrieval', async (repos) => {
    await repos.memories.save(memory('m1'));
    await repos.memories.remove('m1');
    assert.equal(await repos.memories.get('m1'), null);
    assert.deepEqual(await repos.memories.list({ ownerId: OWNER }), []);
  });

  /* ----- CardRepository ----- */

  suite('cards: save/get/getByOwner round-trip', async (repos) => {
    const c = card('c1');
    await repos.cards.save(c);
    assert.deepEqual(await repos.cards.get('c1'), c);
    assert.deepEqual(await repos.cards.getByOwner(OWNER), c);
    assert.equal(await repos.cards.getByOwner(OTHER_OWNER), null);
    assert.equal(await repos.cards.get('nope'), null);
  });

  suite('cards: update and remove', async (repos) => {
    await repos.cards.save(card('c1'));
    const updated = card('c1', { headline: 'new headline', updatedAt: T0 + hour });
    await repos.cards.save(updated);
    assert.deepEqual(await repos.cards.getByOwner(OWNER), updated);
    await repos.cards.remove('c1');
    assert.equal(await repos.cards.get('c1'), null);
  });

  /* ----- NowRepository ----- */

  suite('now: save/get round-trip including null fields', async (repos) => {
    const n = nowItem('n1');
    await repos.now.save(n);
    assert.deepEqual(await repos.now.get('n1'), n);
    assert.equal(await repos.now.get('nope'), null);
  });

  suite('now: list filters by owner and status', async (repos) => {
    await repos.now.save(nowItem('n1', { status: 'published', updatedAt: T0 }));
    await repos.now.save(nowItem('n2', { status: 'draft', publishedAt: null, updatedAt: T0 + hour }));
    await repos.now.save(nowItem('n3', { ownerId: OTHER_OWNER }));
    assert.deepEqual(
      (await repos.now.list({ ownerId: OWNER, status: 'draft' })).map((n) => n.id),
      ['n2'],
    );
    assert.equal((await repos.now.list({ ownerId: OWNER })).length, 2);
    assert.deepEqual(
      (await repos.now.list({ ownerId: OWNER })).map((n) => n.id),
      ['n2', 'n1'], // updatedAt desc
    );
  });

  suite('now: remove deletes from later retrieval', async (repos) => {
    await repos.now.save(nowItem('n1'));
    await repos.now.remove('n1');
    assert.equal(await repos.now.get('n1'), null);
    assert.deepEqual(await repos.now.list({ ownerId: OWNER }), []);
  });

  /* ----- ConversationRepository ----- */

  suite('conversations: save/get round-trip with embedded messages', async (repos) => {
    const c = conversation('cv1');
    await repos.conversations.save(c);
    assert.deepEqual(await repos.conversations.get('cv1'), c);
    assert.equal(await repos.conversations.get('nope'), null);
  });

  suite('conversations: list filters by kind and visitorId; owner and visitor chats stay separate', async (repos) => {
    await repos.conversations.save(conversation('cv-owner'));
    await repos.conversations.save(
      conversation('cv-visit', {
        kind: 'visitor',
        visitorId: 'conf-visitor-1',
        updatedAt: T0 + hour,
        messages: [
          {
            id: 'cv-visit-msg-1',
            schemaVersion: 1,
            conversationId: 'cv-visit',
            role: 'visitor',
            text: 'hi',
            createdAt: T0 + hour,
          },
        ],
      }),
    );
    const ownerChats = await repos.conversations.list({ ownerId: OWNER, kind: 'owner_vibe' });
    assert.deepEqual(ownerChats.map((c) => c.id), ['cv-owner']);
    const visitorChats = await repos.conversations.list({
      ownerId: OWNER,
      kind: 'visitor',
      visitorId: 'conf-visitor-1',
    });
    assert.deepEqual(visitorChats.map((c) => c.id), ['cv-visit']);
    const all = await repos.conversations.list({ ownerId: OWNER });
    assert.deepEqual(all.map((c) => c.id), ['cv-visit', 'cv-owner']); // updatedAt desc
  });

  suite('conversations: save replaces the whole record (append = save with new message)', async (repos) => {
    const c = conversation('cv1');
    await repos.conversations.save(c);
    const extended: ArchiveConversation = {
      ...c,
      updatedAt: T0 + hour,
      messages: [
        ...c.messages,
        {
          id: 'cv1-msg-2',
          schemaVersion: 1,
          conversationId: 'cv1',
          role: 'vibe',
          text: 'reply',
          createdAt: T0 + hour,
        },
      ],
    };
    await repos.conversations.save(extended);
    assert.deepEqual(await repos.conversations.get('cv1'), extended);
    await repos.conversations.remove('cv1');
    assert.equal(await repos.conversations.get('cv1'), null);
  });

  /* ----- ConnectionRepository ----- */

  suite('connections: save/get round-trip with optional fields', async (repos) => {
    const r = request('r1', { visitorWorkUrl: 'https://work.example.com' });
    await repos.connections.save(r);
    assert.deepEqual(await repos.connections.get('r1'), r);
    assert.equal(await repos.connections.get('nope'), null);
  });

  suite('connections: owner inbox filters by action; visitor and pair reads work', async (repos) => {
    await repos.connections.save(request('r1', { ownerAction: 'pending', updatedAt: T0 }));
    await repos.connections.save(
      request('r2', { ownerAction: 'decline', visitorId: 'conf-visitor-2', updatedAt: T0 + hour }),
    );
    await repos.connections.save(request('r3', { ownerId: OTHER_OWNER, updatedAt: T0 + 2 * hour }));

    assert.deepEqual(
      (await repos.connections.listForOwner({ ownerId: OWNER, action: 'pending' })).map((r) => r.id),
      ['r1'],
    );
    assert.deepEqual(
      (await repos.connections.listForOwner({ ownerId: OWNER })).map((r) => r.id),
      ['r2', 'r1'],
    );
    assert.deepEqual(
      (await repos.connections.listForVisitor('conf-visitor-2')).map((r) => r.id),
      ['r2'],
    );
    assert.deepEqual(
      (await repos.connections.listByPair(OWNER, 'conf-visitor-1')).map((r) => r.id),
      ['r1'],
    );
  });

  suite('connections: owner decision update and remove', async (repos) => {
    await repos.connections.save(request('r1'));
    const decided = request('r1', {
      ownerAction: 'connect',
      sharedContactMethodIds: ['ct1'],
      updatedAt: T0 + hour,
    });
    await repos.connections.save(decided);
    assert.deepEqual(await repos.connections.get('r1'), decided);
    await repos.connections.remove('r1');
    assert.deepEqual(await repos.connections.listForOwner({ ownerId: OWNER }), []);
  });

  /* ----- KnowledgeSourceRepository ----- */

  suite('knowledge sources: save/get/list/remove with status filter', async (repos) => {
    await repos.knowledgeSources.save(knowledgeSource('k1', { status: 'ingested' }));
    await repos.knowledgeSources.save(
      knowledgeSource('k2', { status: 'pending', updatedAt: T0 + hour }),
    );
    assert.deepEqual(await repos.knowledgeSources.get('k1'), knowledgeSource('k1'));
    assert.deepEqual(
      (await repos.knowledgeSources.list({ ownerId: OWNER, status: 'pending' })).map((k) => k.id),
      ['k2'],
    );
    assert.deepEqual(
      (await repos.knowledgeSources.list({ ownerId: OWNER })).map((k) => k.id),
      ['k2', 'k1'],
    );
    await repos.knowledgeSources.remove('k1');
    assert.equal(await repos.knowledgeSources.get('k1'), null);
  });

  /* ----- ContactMethodRepository ----- */

  suite('contact methods: save/get/listByOwner (createdAt asc)/remove', async (repos) => {
    await repos.contactMethods.save(contact('ct-b', { createdAt: T0 + hour }));
    await repos.contactMethods.save(contact('ct-a', { createdAt: T0 }));
    assert.deepEqual(await repos.contactMethods.get('ct-b'), contact('ct-b', { createdAt: T0 + hour }));
    assert.deepEqual(
      (await repos.contactMethods.listByOwner(OWNER)).map((c) => c.id),
      ['ct-a', 'ct-b'],
    );
    assert.deepEqual(await repos.contactMethods.listByOwner(OTHER_OWNER), []);
    await repos.contactMethods.remove('ct-a');
    assert.equal(await repos.contactMethods.get('ct-a'), null);
  });

  /* ----- Archive round-trip against stored records ----- */

  suite('archive: export from one adapter instance, import into a fresh one, identical state', async () => {
    const source = await makeAdapter();
    let exported;
    try {
      const repos = source.repositories;
      await repos.cards.save(card('c1'));
      await repos.memories.save(memory('m1', { status: 'confirmed', visibility: 'public' }));
      await repos.memories.save(memory('m2', { status: 'proposed', visibility: 'private', updatedAt: T0 + hour }));
      await repos.now.save(nowItem('n1'));
      await repos.conversations.save(conversation('cv1'));
      await repos.connections.save(request('r1'));
      await repos.knowledgeSources.save(knowledgeSource('k1'));
      await repos.contactMethods.save(contact('ct1'));

      exported = exportPrivateArchive({
        profile: { id: OWNER, schemaVersion: 1, name: 'Conformance Owner', avatarUrl: 'https://example.com/avatar.png' },
        card: (await repos.cards.getByOwner(OWNER))!,
        nowItems: await repos.now.list({ ownerId: OWNER }),
        memories: await repos.memories.list({ ownerId: OWNER }),
        contactMethods: await repos.contactMethods.listByOwner(OWNER),
        connectionRequests: await repos.connections.listForOwner({ ownerId: OWNER }),
        includeConversations: true,
        conversations: await repos.conversations.list({ ownerId: OWNER }),
        knowledgeSources: await repos.knowledgeSources.list({ ownerId: OWNER }),
        app: { name: 'conformance', version: '1.0.0' },
        createdAt: T0,
      });
    } finally {
      await source.close?.();
    }

    // Serialize like a real `.vibe` file transfer, then import.
    const imported = importArchive(JSON.parse(JSON.stringify(exported)));
    assert.ok(imported.ok, `import failed: ${imported.ok === false ? imported.error.message : ''}`);
    if (!imported.ok) return;

    const target = await makeAdapter();
    try {
      const repos = target.repositories;
      await repos.cards.save(imported.value.card);
      for (const m of imported.value.memories) await repos.memories.save(m);
      for (const n of imported.value.nowItems as NowItem[]) await repos.now.save(n);
      for (const c of imported.value.conversations) await repos.conversations.save(c);
      for (const r of imported.value.connectionRequests) await repos.connections.save(r);
      for (const k of imported.value.knowledgeSources) await repos.knowledgeSources.save(k);
      for (const c of imported.value.contactMethods) await repos.contactMethods.save(c);

      // Re-export from the fresh adapter with the same timestamp: the
      // canonical byte shape must be identical, proving stable ids and lossless
      // persistence of every section.
      const reExported = exportPrivateArchive({
        profile: imported.value.profile!,
        card: (await repos.cards.getByOwner(OWNER))!,
        nowItems: await repos.now.list({ ownerId: OWNER }),
        memories: await repos.memories.list({ ownerId: OWNER }),
        contactMethods: await repos.contactMethods.listByOwner(OWNER),
        connectionRequests: await repos.connections.listForOwner({ ownerId: OWNER }),
        includeConversations: true,
        conversations: await repos.conversations.list({ ownerId: OWNER }),
        knowledgeSources: await repos.knowledgeSources.list({ ownerId: OWNER }),
        app: { name: 'conformance', version: '1.0.0' },
        createdAt: T0,
      });
      assert.equal(canonicalJson(reExported), canonicalJson(exported));
    } finally {
      await target.close?.();
    }
  });
}
