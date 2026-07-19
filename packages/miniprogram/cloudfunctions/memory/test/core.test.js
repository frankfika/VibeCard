const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/core');

const OWNER = 'owner-openid';
const OTHER = 'someone-else';

test('validation accepts the four kinds and four visibility levels', () => {
  for (const kind of core.MEMORY_KINDS) {
    for (const visibility of core.MEMORY_VISIBILITIES) {
      assert.equal(core.validateMemoryPayload({ kind, content: 'x', visibility }), null, `${kind}/${visibility}`);
    }
  }
});

test('validation rejects bad kind, empty content, bad visibility', () => {
  assert.equal(core.validateMemoryPayload({ kind: 'embedding', content: 'x', visibility: 'public' }), 'invalid_kind');
  assert.equal(core.validateMemoryPayload({ kind: 'fact', content: '  ', visibility: 'public' }), 'invalid_content');
  assert.equal(core.validateMemoryPayload({ kind: 'fact', content: 'x', visibility: 'friends' }), 'invalid_visibility');
});

test('a new memory starts as proposed and is not retrievable', () => {
  const memory = core.buildMemory({ ownerId: OWNER, kind: 'fact', content: ' 做过 AI 社交产品 ', visibility: 'public' }, 1000);
  assert.equal(memory.status, 'proposed');
  assert.equal(memory.schemaVersion, 1);
  assert.equal(memory.content, '做过 AI 社交产品');
  assert.equal(core.isRetrievable(memory), false);
  assert.equal(core.isVisitorQuotable(memory), false);
  assert.equal(core.isAgentUsable(memory), false);
});

test('only the owner may access a memory', () => {
  const memory = core.buildMemory({ ownerId: OWNER, kind: 'fact', content: 'x', visibility: 'public' }, 1000);
  assert.equal(core.isOwner(memory, OWNER), true);
  assert.equal(core.isOwner(memory, OTHER), false);
  assert.equal(core.isOwner(null, OWNER), false);
});

test('confirm transitions proposed -> confirmed, with optional overrides', () => {
  const proposed = core.buildMemory({ ownerId: OWNER, kind: 'preference', content: '想认识做过 AI 社交产品的人', visibility: 'private' }, 1000);
  const confirmed = core.applyConfirm(proposed, { visibility: 'public' }, 2000);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.visibility, 'public');
  assert.equal(confirmed.updatedAt, 2000);

  const confirmedAsIs = core.applyConfirm(proposed, {}, 2000);
  assert.equal(confirmedAsIs.visibility, 'private');
});

test('confirming a non-proposed memory is rejected', () => {
  const proposed = core.buildMemory({ ownerId: OWNER, kind: 'fact', content: 'x', visibility: 'public' }, 1000);
  const confirmed = core.applyConfirm(proposed, {}, 2000);
  assert.throws(() => core.applyConfirm(confirmed, {}, 3000), /only_proposed_can_be_confirmed/);
  const deleted = core.applyDelete(confirmed, 3000);
  assert.throws(() => core.applyConfirm(deleted, {}, 4000), /only_proposed_can_be_confirmed/);
});

test('edit changes kind/content/visibility but not status', () => {
  const proposed = core.buildMemory({ ownerId: OWNER, kind: 'current', content: '在做 VibeCard', visibility: 'private' }, 1000);
  const edited = core.applyEdit(proposed, { kind: 'fact', content: '新内容', visibility: 'connected' }, 2000);
  assert.equal(edited.kind, 'fact');
  assert.equal(edited.content, '新内容');
  assert.equal(edited.visibility, 'connected');
  assert.equal(edited.status, 'proposed');
});

test('delete soft-deletes and excludes the memory from retrieval', () => {
  const proposed = core.buildMemory({ ownerId: OWNER, kind: 'fact', content: 'x', visibility: 'public' }, 1000);
  const confirmed = core.applyConfirm(proposed, {}, 2000);
  assert.equal(core.isRetrievable(confirmed), true);
  const deleted = core.applyDelete(confirmed, 3000);
  assert.equal(deleted.status, 'deleted');
  assert.equal(core.isRetrievable(deleted), false);
  assert.equal(core.isVisitorQuotable(deleted), false);
  assert.equal(core.isAgentUsable(deleted), false);
});

test('visibility matrix: what may be quoted to a visitor vs used by the agent', () => {
  const cases = [
    { visibility: 'public', quotable: true, agentUsable: true },
    { visibility: 'agent_only', quotable: false, agentUsable: true },
    { visibility: 'connected', quotable: false, agentUsable: false },
    { visibility: 'private', quotable: false, agentUsable: false },
  ];
  for (const { visibility, quotable, agentUsable } of cases) {
    const memory = core.applyConfirm(
      core.buildMemory({ ownerId: OWNER, kind: 'boundary', content: `c-${visibility}`, visibility }, 1000),
      {},
      2000,
    );
    assert.equal(core.isVisitorQuotable(memory), quotable, `visitor ${visibility}`);
    assert.equal(core.isAgentUsable(memory), agentUsable, `agent ${visibility}`);
  }
});

test('paused memories are hidden from retrieval but not destroyed', () => {
  const memory = { ...core.buildMemory({ ownerId: OWNER, kind: 'fact', content: 'x', visibility: 'public' }, 1000), status: 'paused' };
  assert.equal(core.isRetrievable(memory), false);
  assert.equal(core.isVisitorQuotable(memory), false);
});
