/**
 * Unit tests for the Now domain core (task 4.5).
 *
 * Covers the canonical semantics from packages/shared/now.ts and
 * AI_BEHAVIOR.md §13: active = published && not expired; the public Card
 * shows at most 3 newest active items; draft/archived/hidden/deleted/expired
 * items are never public.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../lib/core');

const T0 = 1752000000000;
const hour = 3600000;

function item(overrides) {
  return {
    schemaVersion: 1,
    ownerId: 'owner-1',
    text: '最近在打磨访客对话',
    topic: 'current_work',
    sourceMemoryId: null,
    status: 'draft',
    publishedAt: null,
    expiresAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

test('payload validation mirrors the shared contract', () => {
  assert.equal(core.validateNowPayload({ text: '在做 X', topic: 'current_work' }), null);
  assert.equal(core.validateNowPayload({ text: '', topic: 'current_work' }), 'invalid_text');
  assert.equal(core.validateNowPayload({ text: 'x'.repeat(201), topic: 'current_work' }), 'invalid_text');
  assert.equal(core.validateNowPayload({ text: '在做 X', topic: 'rant' }), 'invalid_topic');
  assert.equal(core.validateNowPayload({ text: '在做 X', topic: 'current_work', expiresAt: 'soon' }), 'invalid_expires_at');
  assert.equal(core.validateNowPayload({ text: '在做 X', topic: 'current_work', expiresAt: T0 + hour }), null);
});

test('new items always start as drafts — never auto-published', () => {
  const draft = core.buildNowItem({ ownerId: 'o', text: ' 草稿 ', topic: 'exploring' }, T0);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.publishedAt, null);
  assert.equal(draft.text, '草稿');
  assert.equal(draft.sourceMemoryId, null);
});

test('active = published and not expired', () => {
  assert.equal(core.isActiveNowItem(item({ status: 'published', publishedAt: T0 }), T0 + hour), true);
  assert.equal(core.isActiveNowItem(item({ status: 'published', publishedAt: T0, expiresAt: T0 + 2 * hour }), T0 + hour), true);
  assert.equal(core.isActiveNowItem(item({ status: 'published', publishedAt: T0, expiresAt: T0 + hour }), T0 + 2 * hour), false);
  for (const status of ['draft', 'archived', 'hidden', 'deleted']) {
    assert.equal(core.isActiveNowItem(item({ status }), T0), false, status);
  }
});

test('public projection keeps at most 3 newest active items, safe fields only', () => {
  const items = [
    item({ id: 'a', status: 'published', publishedAt: T0 - 4 * hour }),
    item({ id: 'b', status: 'published', publishedAt: T0 - 3 * hour }),
    item({ id: 'c', status: 'published', publishedAt: T0 - 2 * hour }),
    item({ id: 'd', status: 'published', publishedAt: T0 - hour }),
    item({ id: 'expired', status: 'published', publishedAt: T0, expiresAt: T0 - hour }),
    item({ id: 'draft', status: 'draft' }),
    item({ id: 'archived', status: 'archived', publishedAt: T0 }),
    item({ id: 'hidden', status: 'hidden', publishedAt: T0 }),
    item({ id: 'deleted', status: 'deleted', publishedAt: T0 }),
  ];
  const active = core.activeNowItems(items, T0);
  assert.deepEqual(active.map((i) => i.id), ['d', 'c', 'b']);
  // projection carries no ownerId / sourceMemoryId / lifecycle internals
  assert.deepEqual(Object.keys(active[0]).sort(), ['id', 'publishedAt', 'text', 'topic']);
});

test('empty state invents nothing', () => {
  assert.deepEqual(core.activeNowItems([], T0), []);
  assert.deepEqual(core.activeNowItems([item({ status: 'draft' })], T0), []);
});

test('publish sets publishedAt once; republish keeps the first timestamp', () => {
  const draft = item({ status: 'draft' });
  const published = core.applyPublish(draft, T0);
  assert.equal(published.status, 'published');
  assert.equal(published.publishedAt, T0);
  const archived = core.applyArchive(published, T0 + hour);
  const republished = core.applyPublish(archived, T0 + 2 * hour);
  assert.equal(republished.publishedAt, T0);
});

test('deleted items are a tombstone: no publish, archive, or hide', () => {
  const deleted = core.applyDelete(item({ status: 'published', publishedAt: T0 }), T0 + hour);
  assert.equal(deleted.status, 'deleted');
  assert.throws(() => core.applyPublish(deleted, T0), /deleted_item_cannot_be_published/);
  assert.throws(() => core.applyArchive(deleted, T0), /deleted_item_cannot_be_archived/);
  assert.throws(() => core.applyHide(deleted, T0), /deleted_item_cannot_be_hidden/);
});

test('edit changes text/topic/expiresAt but never status or publishedAt', () => {
  const published = item({ status: 'published', publishedAt: T0 });
  const edited = core.applyEdit(published, { text: '改写后的动态', topic: 'exploring', expiresAt: T0 + 3 * hour }, T0 + hour);
  assert.equal(edited.text, '改写后的动态');
  assert.equal(edited.topic, 'exploring');
  assert.equal(edited.expiresAt, T0 + 3 * hour);
  assert.equal(edited.status, 'published');
  assert.equal(edited.publishedAt, T0);
});
