/**
 * Core tests: RetrievalProvider seam — embeddings, vector store, reranking
 * (task 5.6, stages 2–3).
 *
 * Proofs required by the acceptance criteria:
 * - semantic retrieval lives behind the provider interface only
 * - enabling semantic retrieval does not change Core records
 * - a vector adapter can be removed without losing canonical memory data
 * - the same visibility discipline applies on the semantic path
 * - cross-owner isolation holds at the vector-namespace level
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Memory } from '../vibe';
import { fixtureOwner } from '../fixtures/vibe';
import { createInMemoryRepositories } from '../in-memory-store';
import { createMockModelProvider } from '../mock-provider';
import { isModelProviderError } from '../model-provider';
import { retrieveMemories } from '../retrieval';
import {
  createHashEmbeddingProvider,
  createInMemoryVectorStore,
  createKindBoostReranker,
  createSemanticRetrievalProvider,
  createStructuredRetrievalProvider,
  embeddingProviderFromModel,
  indexMemoryEmbedding,
  ownerNamespace,
  passThroughReranker,
  retrieveWithOptionalRerank,
} from '../retrieval-provider';

const NOW = 1_752_100_000_000;
const DAY = 24 * 60 * 60 * 1000;

function makeMemory(patch: Partial<Memory> & { id: string }): Memory {
  return {
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    kind: 'fact',
    content: 'placeholder',
    visibility: 'public',
    status: 'confirmed',
    sourceConversationId: 'conv-x',
    sourceMessageIds: ['msg-x'],
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    ...patch,
  };
}

const PRIVACY = makeMemory({
  id: 'm-privacy',
  kind: 'preference',
  content: '在意隐私边界和个人数据主权。',
  updatedAt: NOW - 2 * DAY,
});
const COOKING = makeMemory({
  id: 'm-cooking',
  content: '周末喜欢研究烘焙和咖啡。',
  updatedAt: NOW - DAY,
});
const SECRET = makeMemory({
  id: 'm-secret',
  visibility: 'private',
  content: '隐私相关的私人笔记，只对本人可见。',
  updatedAt: NOW - DAY,
});
const OTHER_OWNER = makeMemory({
  id: 'm-other',
  ownerId: 'owner-other',
  content: '另一个主人的隐私记忆。',
  updatedAt: NOW - DAY,
});

function setup() {
  const repos = createInMemoryRepositories({
    memories: [PRIVACY, COOKING, SECRET, OTHER_OWNER],
  });
  const embedding = createHashEmbeddingProvider(64);
  const store = createInMemoryVectorStore();
  return { repos, embedding, store };
}

async function indexAll(embedding: ReturnType<typeof createHashEmbeddingProvider>, store: ReturnType<typeof createInMemoryVectorStore>) {
  for (const m of [PRIVACY, COOKING, SECRET, OTHER_OWNER]) {
    await indexMemoryEmbedding(embedding, store, m.ownerId, m.id, m.content);
  }
}

test('structured provider matches the stage-1 function exactly (semantic: false)', async () => {
  const provider = createStructuredRetrievalProvider();
  assert.equal(provider.semantic, false);
  const input = {
    ownerId: fixtureOwner.id,
    audience: 'owner' as const,
    memories: [PRIVACY, COOKING],
    now: NOW,
  };
  assert.deepEqual(await provider.retrieve(input), await retrieveMemories(input));
});

test('semantic provider ranks by vector similarity yet applies the SAME visibility filter', async () => {
  const { repos, embedding, store } = setup();
  await indexAll(embedding, store);
  const provider = createSemanticRetrievalProvider({
    embeddingProvider: embedding,
    vectorStore: store,
    memoryRepository: repos.memories,
  });
  assert.equal(provider.semantic, true);

  const visitor = await provider.retrieve({
    ownerId: fixtureOwner.id,
    audience: 'visitor_quote',
    queryText: '隐私',
    now: NOW,
  });
  // m-privacy is semantically closest AND public, so it ranks first; m-secret
  // contains the query word too but is private — similarity can never admit it.
  assert.equal(visitor[0].memoryId, 'm-privacy');
  assert.ok(visitor.every((r) => r.memory.visibility === 'public'));
  assert.ok(!visitor.some((r) => r.memoryId === 'm-secret'));
  assert.equal(visitor[0].visibility.rule, 'visitor_quotable_public');
  assert.ok(visitor[0].matchedReasons[0].startsWith('semantic:'));

  const owner = await provider.retrieve({
    ownerId: fixtureOwner.id,
    audience: 'owner',
    queryText: '隐私',
    now: NOW,
  });
  assert.ok(owner.some((r) => r.memoryId === 'm-secret')); // owner session may see it
});

test('cross-owner isolation holds inside vector namespaces', async () => {
  const { repos, embedding, store } = setup();
  await indexAll(embedding, store);
  const provider = createSemanticRetrievalProvider({
    embeddingProvider: embedding,
    vectorStore: store,
    memoryRepository: repos.memories,
  });
  // Querying owner B with owner A's exact words can still only touch B's namespace.
  const results = await provider.retrieve({
    ownerId: 'owner-other',
    audience: 'owner',
    queryText: '隐私相关的私人笔记',
    now: NOW,
  });
  assert.ok(results.every((r) => r.memory.ownerId === 'owner-other'));
  assert.ok(!results.some((r) => r.memoryId === 'm-secret'));
  // Namespaces are independent maps.
  assert.notEqual(ownerNamespace('a'), ownerNamespace('b'));
});

test('semantic on/off never changes Core records', async () => {
  const { repos, embedding, store } = setup();
  const before = await repos.memories.list({ ownerId: fixtureOwner.id });
  await indexAll(embedding, store);
  const provider = createSemanticRetrievalProvider({
    embeddingProvider: embedding,
    vectorStore: store,
    memoryRepository: repos.memories,
  });
  await provider.retrieve({
    ownerId: fixtureOwner.id,
    audience: 'owner',
    queryText: '隐私',
    now: NOW,
  });
  const after = await repos.memories.list({ ownerId: fixtureOwner.id });
  assert.deepEqual(after, before); // records byte-identical: no embedding fields, no vendor metadata
  assert.ok(after.every((m) => !('embedding' in m) && !('vector' in m)));
});

test('vector adapter removal loses no canonical memory data', async () => {
  const { repos, embedding, store } = setup();
  await indexAll(embedding, store);
  // Sanity: semantic retrieval works while the store is populated.
  const provider = createSemanticRetrievalProvider({
    embeddingProvider: embedding,
    vectorStore: store,
    memoryRepository: repos.memories,
  });
  const withVectors = await provider.retrieve({
    ownerId: fixtureOwner.id,
    audience: 'owner',
    queryText: '隐私',
    now: NOW,
  });
  assert.ok(withVectors.length > 0);

  // Remove the entire vector adapter (both owners' namespaces).
  await store.dropNamespace(ownerNamespace(fixtureOwner.id));
  await store.dropNamespace(ownerNamespace('owner-other'));

  // Semantic retrieval now returns nothing…
  const afterDrop = await provider.retrieve({
    ownerId: fixtureOwner.id,
    audience: 'owner',
    queryText: '隐私',
    now: NOW,
  });
  assert.deepEqual(afterDrop, []);
  // …but canonical memories are fully intact and structured retrieval is unaffected.
  const canonical = await repos.memories.list({ ownerId: fixtureOwner.id });
  assert.deepEqual(
    canonical.map((m) => m.id).sort(),
    ['m-cooking', 'm-privacy', 'm-secret'],
  );
  const structured = await retrieveMemories({
    ownerId: fixtureOwner.id,
    audience: 'owner',
    repository: repos.memories,
    queryText: '隐私',
    now: NOW,
  });
  assert.ok(structured.length > 0);
});

test('memory delete propagates to the vector store by id', async () => {
  const { repos, embedding, store } = setup();
  await indexAll(embedding, store);
  await repos.memories.remove(PRIVACY.id);
  await store.remove(ownerNamespace(fixtureOwner.id), [PRIVACY.id]);
  const provider = createSemanticRetrievalProvider({
    embeddingProvider: embedding,
    vectorStore: store,
    memoryRepository: repos.memories,
  });
  const results = await provider.retrieve({
    ownerId: fixtureOwner.id,
    audience: 'owner',
    queryText: '隐私',
    now: NOW,
  });
  assert.ok(!results.some((r) => r.memoryId === 'm-privacy'));
});

test('rerankers: pass-through is a no-op; kind boost re-orders deterministically', async () => {
  const provider = createStructuredRetrievalProvider();
  const input = {
    ownerId: fixtureOwner.id,
    audience: 'owner' as const,
    memories: [PRIVACY, COOKING],
    now: NOW,
  };
  const plain = await retrieveWithOptionalRerank(provider, input);
  const passed = await retrieveWithOptionalRerank(provider, input, passThroughReranker);
  assert.deepEqual(passed, plain);

  // Boost 'preference' so the older PRIVACY memory beats the newer COOKING one.
  const boosted = await retrieveWithOptionalRerank(
    provider,
    input,
    createKindBoostReranker({ preference: 5 }),
  );
  assert.equal(boosted[0].memoryId, 'm-privacy');
  assert.ok(boosted[0].matchedReasons.some((r) => r.startsWith('rerank:preference')));
});

test('EmbeddingProvider aligns with ModelProvider.embed; missing capability is a typed error', async () => {
  const model = createMockModelProvider(); // declares no `embeddings` capability
  const adapted = embeddingProviderFromModel(model);
  await assert.rejects(adapted.embed(['x']), (error) => {
    assert.ok(isModelProviderError(error));
    assert.equal(error.code, 'unsupported_capability');
    return true;
  });
});

test('hash embedding is deterministic and semantically meaningful enough to rank', async () => {
  const embedding = createHashEmbeddingProvider(32);
  const [a1, a2, b] = await embedding.embed(['隐私 边界 数据', '隐私 边界 数据', '烘焙 咖啡 周末']);
  assert.deepEqual(a1, a2); // same input => same vector
  const store = createInMemoryVectorStore();
  await store.upsert(ownerNamespace('o'), [
    { id: 'near', vector: a1 },
    { id: 'far', vector: b },
  ]);
  const hits = await store.query(ownerNamespace('o'), a2, 2);
  assert.equal(hits[0].id, 'near');
  assert.ok(hits[0].score > hits[1].score);
});
