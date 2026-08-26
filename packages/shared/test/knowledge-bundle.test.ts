import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWLEDGE_BUNDLE_MAX_TOTAL_BYTES,
  exportKnowledgeBundle,
  importKnowledgeBundle,
  noteKnowledgeAdapter,
} from '../index.ts';

const ownerId = 'owner-portable';
const ingested = noteKnowledgeAdapter.ingest(
  { ownerId, title: 'Portable note', locator: 'note:portable', content: 'portable public retrieval', visibility: 'public' },
  1_000,
  { sourceId: 'source-1', chunkId: index => `chunk-${index}` },
);
const bundle = () => exportKnowledgeBundle({ ownerId, sources: [{ ...ingested.source, content: 'portable public retrieval', visibility: 'public', adapterKind: 'note' }], app: { name: 'test', version: '1' }, createdAt: 2_000 });

test('portable knowledge bundle validates canonical source text chunks', () => {
  const result = importKnowledgeBundle(bundle(), ownerId);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.chunks[0]?.content, 'portable public retrieval');
});

test('10 MB canonical source encodes and decodes within the Pro limit', { timeout: 10_000 }, () => {
  const content = `\u0000\"\\\r\n${'x'.repeat(9_999_995)}`;
  const result = noteKnowledgeAdapter.ingest({ ownerId, title: '10 MB', locator: 'note:10mb', content, visibility: 'private' }, 1, { sourceId: 'ten-mb', chunkId: index => `ten-mb:${index}` });
  const portable = exportKnowledgeBundle({ ownerId, sources: [{ ...result.source, content, visibility: 'private', adapterKind: 'note' }], app: { name: 'test', version: '1' }, createdAt: 1 });
  assert.ok(JSON.stringify(portable).length < 14_000_000, 'base64 bounds JSON expansion even for escapable source bytes');
  const imported = importKnowledgeBundle(portable, ownerId);
  assert.equal(imported.ok, true);
  if (imported.ok) assert.equal(imported.value.sources[0]?.content, content);
  assert.ok(Math.ceil(KNOWLEDGE_BUNDLE_MAX_TOTAL_BYTES / 3) * 4 + 2_000_000 < 32 * 1024 * 1024, '10 MB reference Pro plan plus metadata fits a bounded authenticated envelope');
});

test('validator handles the 1000-source plan boundary linearly', () => {
  const sources = Array.from({ length: 1_000 }, (_, index) => {
    const result = noteKnowledgeAdapter.ingest({ ownerId, title: `S${index}`, locator: `n:${index}`, content: '', visibility: 'private' }, 1, { sourceId: `s-${index}`, chunkId: chunk => `s-${index}:${chunk}` });
    return { ...result.source, content: '', visibility: 'private' as const, adapterKind: 'note' as const };
  });
  assert.equal(importKnowledgeBundle(exportKnowledgeBundle({ ownerId, sources, app: { name: 'test', version: '1' }, createdAt: 1 }), ownerId).ok, true);
});

test('knowledge bundle rejects malformed, future, tampered, cross-owner and runtime metadata', () => {
  assert.equal(importKnowledgeBundle(null).ok, false);
  assert.equal(importKnowledgeBundle({ ...bundle(), schemaVersion: 2 }).ok, false);
  const tampered = structuredClone(bundle()); tampered.sources[0]!.contentBase64 = 'Y2hhbmdlZA==';
  assert.equal(importKnowledgeBundle(tampered).ok, false);
  const crossOwner = importKnowledgeBundle(bundle(), 'owner-other');
  assert.deepEqual(crossOwner.ok ? null : crossOwner.error.code, 'owner_mismatch');
  const polluted = structuredClone(bundle()) as any; polluted.sources[0].provider = 'managed';
  assert.equal(importKnowledgeBundle(polluted).ok, false);
  const derived = structuredClone(bundle()) as any; derived.sources[0].embedding = [1, 2, 3];
  assert.equal(importKnowledgeBundle(derived).ok, false);
});
