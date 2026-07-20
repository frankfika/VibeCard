/**
 * Local mode capability proof (task 5.5 acceptance).
 *
 * End-to-end owner flow at the repository level, fully local (a SQLite file
 * in a temp dir, zero network): create a Card, confirm a memory through the
 * Core lifecycle, publish and update a Now item, export a private archive
 * (task 5.3), execute the deletion plan, import the archive into a fresh
 * store, and recover the same fixture identity.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildProposedMemory,
  confirmMemory,
} from '../../../shared/memory';
import { canProjectMemoryToNow, latestActiveNow } from '../../../shared/now';
import type { NowItem } from '../../../shared/now';
import {
  buildDeletionPlan,
  canonicalJson,
  exportPrivateArchive,
  importArchive,
} from '../../../shared/archive';
import {
  fixtureOwner,
  fixtureOwnerCard,
  fixtureOwnerContactMethods,
} from '../../../shared/fixtures/vibe';
import { createLocalRepositories } from '../src/sqlite-repositories';

const T0 = 1_752_000_000_000;

test('local-only owner flow: card -> memory -> Now -> export -> delete -> import -> same identity', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibecard-local-mode-'));
  try {
    const storePath = join(dir, 'owner.db');
    const repos = createLocalRepositories(storePath);

    // 1. Create the owner's Card (fixture identity: 林舟).
    await repos.cards.save(fixtureOwnerCard);
    for (const contact of fixtureOwnerContactMethods) {
      await repos.contactMethods.save(contact);
    }

    // 2. My Vibe proposes a memory; the owner confirms it (Core lifecycle),
    //    and the confirmed record is persisted.
    const proposed = buildProposedMemory(
      {
        ownerId: fixtureOwner.id,
        kind: 'current',
        content: '最近在打磨 VibeCard 的访客对话前六轮。',
        visibility: 'public',
        sourceConversationId: 'local-conv-1',
        sourceMessageIds: ['local-msg-1'],
      },
      T0,
      'local-memory-1',
    );
    const confirmed = confirmMemory(proposed, {}, T0 + 1_000);
    await repos.memories.save(confirmed);
    assert.equal((await repos.memories.get('local-memory-1'))?.status, 'confirmed');

    // 3. Publish a Now item projected from the confirmed memory, then update
    //    its text. Publishing must not change the source memory's visibility.
    assert.ok(canProjectMemoryToNow(confirmed));
    const published: NowItem = {
      id: 'local-now-1',
      schemaVersion: 1,
      ownerId: fixtureOwner.id,
      text: '最近在打磨访客对话的前六轮。',
      topic: 'current_work',
      sourceMemoryId: confirmed.id,
      status: 'published',
      publishedAt: T0 + 2_000,
      expiresAt: null,
      createdAt: T0 + 2_000,
      updatedAt: T0 + 2_000,
    };
    await repos.now.save(published);
    const updatedNow: NowItem = { ...published, text: '最近在打磨访客对话的前六轮，已有第一版。', updatedAt: T0 + 3_000 };
    await repos.now.save(updatedNow);
    const active = latestActiveNow(await repos.now.list({ ownerId: fixtureOwner.id }), T0 + 4_000);
    assert.deepEqual(active.map((n) => n.id), ['local-now-1']);
    assert.equal((await repos.memories.get(confirmed.id))?.visibility, 'public');

    // 4. Export a complete private archive from repository reads only.
    const archive = exportPrivateArchive({
      profile: {
        id: fixtureOwner.id,
        schemaVersion: 1,
        name: fixtureOwner.name,
        avatarUrl: fixtureOwner.avatarUrl,
      },
      card: (await repos.cards.getByOwner(fixtureOwner.id))!,
      nowItems: await repos.now.list({ ownerId: fixtureOwner.id }),
      memories: await repos.memories.list({ ownerId: fixtureOwner.id }),
      contactMethods: await repos.contactMethods.listByOwner(fixtureOwner.id),
      connectionRequests: await repos.connections.listForOwner({ ownerId: fixtureOwner.id }),
      includeConversations: false,
      knowledgeSources: await repos.knowledgeSources.list({ ownerId: fixtureOwner.id }),
      app: { name: 'vibecard-local', version: '0.1.0' },
      createdAt: T0 + 5_000,
    });
    const serialized = JSON.stringify(archive);

    // 5. Execute the archive deletion plan against the store.
    const plan = buildDeletionPlan(archive);
    assert.ok(plan.ok);
    if (!plan.ok) return;
    for (const id of plan.value.cardIds) await repos.cards.remove(id);
    for (const id of plan.value.nowItemIds) await repos.now.remove(id);
    for (const id of plan.value.memoryIds) await repos.memories.remove(id);
    for (const id of plan.value.contactMethodIds) await repos.contactMethods.remove(id);
    assert.equal(await repos.cards.getByOwner(fixtureOwner.id), null);
    assert.deepEqual(await repos.memories.list({ ownerId: fixtureOwner.id }), []);
    assert.deepEqual(await repos.now.list({ ownerId: fixtureOwner.id }), []);
    assert.deepEqual(await repos.contactMethods.listByOwner(fixtureOwner.id), []);
    repos.close();

    // 6. Import the archive into a FRESH local store and recover the same
    //    fixture identity and record ids.
    const restored = createLocalRepositories(join(dir, 'restored.db'));
    const imported = importArchive(JSON.parse(serialized));
    assert.ok(imported.ok);
    if (!imported.ok) return;
    await restored.cards.save(imported.value.card);
    for (const m of imported.value.memories) await restored.memories.save(m);
    for (const n of imported.value.nowItems as NowItem[]) await restored.now.save(n);
    for (const c of imported.value.contactMethods) await restored.contactMethods.save(c);

    const restoredCard = await restored.cards.getByOwner(fixtureOwner.id);
    assert.deepEqual(restoredCard, fixtureOwnerCard, 'same fixture identity recovered');
    assert.equal(restoredCard?.name, fixtureOwner.name);
    const restoredMemory = await restored.memories.get('local-memory-1');
    assert.equal(restoredMemory?.status, 'confirmed');
    // Contract ordering is createdAt asc, id asc on ties (both fixture
    // contacts share a createdAt), so compare against the id-sorted ids.
    assert.deepEqual(
      (await restored.contactMethods.listByOwner(fixtureOwner.id)).map((c) => c.id),
      fixtureOwnerContactMethods.map((c) => c.id).sort(),
    );

    // Re-export from the restored store: canonically identical state.
    const reExported = exportPrivateArchive({
      profile: imported.value.profile!,
      card: restoredCard!,
      nowItems: await restored.now.list({ ownerId: fixtureOwner.id }),
      memories: await restored.memories.list({ ownerId: fixtureOwner.id }),
      contactMethods: await restored.contactMethods.listByOwner(fixtureOwner.id),
      connectionRequests: await restored.connections.listForOwner({ ownerId: fixtureOwner.id }),
      includeConversations: false,
      knowledgeSources: await restored.knowledgeSources.list({ ownerId: fixtureOwner.id }),
      app: { name: 'vibecard-local', version: '0.1.0' },
      createdAt: T0 + 5_000,
    });
    assert.equal(canonicalJson(reExported), canonicalJson(archive));
    restored.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
