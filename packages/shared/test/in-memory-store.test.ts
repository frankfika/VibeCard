/**
 * Core tests: in-memory reference repository adapter (task 5.5).
 *
 * Full cross-engine behavior (CRUD, filters, ordering, archive round-trip) is
 * pinned by the adapter conformance suite in packages/platforms/local-store;
 * these tests only prove the Core-shipped adapter itself: fixture seeding,
 * owner isolation, and copy-on-read/write isolation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFixtureRepositories, createInMemoryRepositories } from '../in-memory-store';
import {
  fixtureOwner,
  fixtureOwnerCard,
  fixtureOwnerMemories,
} from '../fixtures/vibe';
import { buildProposedMemory } from '../memory';

test('fixture repositories expose the deterministic fixture story', async () => {
  const repos = createFixtureRepositories();
  const card = await repos.cards.getByOwner(fixtureOwner.id);
  assert.deepEqual(card, fixtureOwnerCard);
  const memories = await repos.memories.list({ ownerId: fixtureOwner.id });
  assert.equal(memories.length, fixtureOwnerMemories.length + 2); // + sensitive fixtures
  const requests = await repos.connections.listForOwner({ ownerId: fixtureOwner.id });
  assert.equal(requests.length, 2);
});

test('owner isolation: queries never leak across owners', async () => {
  const repos = createFixtureRepositories();
  assert.deepEqual(await repos.memories.list({ ownerId: 'someone-else' }), []);
  assert.equal(await repos.cards.getByOwner('someone-else'), null);
  assert.deepEqual(await repos.now.list({ ownerId: 'someone-else' }), []);
});

test('returned records are copies; caller mutation cannot corrupt the store', async () => {
  const repos = createInMemoryRepositories();
  const memory = buildProposedMemory(
    { ownerId: 'o1', kind: 'fact', content: 'x', visibility: 'private' },
    1,
    'm1',
  );
  await repos.memories.save(memory);
  const read = await repos.memories.get('m1');
  assert.ok(read);
  read.content = 'tampered';
  const again = await repos.memories.get('m1');
  assert.equal(again?.content, 'x');
});

test('remove deletes records from later retrieval', async () => {
  const repos = createFixtureRepositories();
  await repos.memories.remove(fixtureOwnerMemories[0].id);
  assert.equal(await repos.memories.get(fixtureOwnerMemories[0].id), null);
  const remaining = await repos.memories.list({ ownerId: fixtureOwner.id });
  assert.ok(!remaining.some((m) => m.id === fixtureOwnerMemories[0].id));
});
