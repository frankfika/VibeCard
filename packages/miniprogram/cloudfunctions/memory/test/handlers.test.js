/**
 * Handler-level tests for the memory cloud function.
 *
 * wx-server-sdk is stubbed with an in-memory database so the full action
 * surface (owner scoping, proposal -> confirm -> edit -> delete, visibility
 * filtering, conversation persistence) runs under plain node.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const OWNER = 'owner-openid';
const STRANGER = 'stranger-openid';

let currentOpenid = OWNER;

function createFakeCloud() {
  const store = { memories: new Map(), conversations: new Map() };
  let seq = 0;

  const db = {
    command: {
      push: (value) => ({ $push: value }),
    },
    collection(name) {
      const coll = store[name];
      return {
        where(conds) {
          return {
            orderBy() { return this; },
            limit() { return this; },
            async get() {
              const data = [...coll.entries()]
                .filter(([, v]) => Object.entries(conds).every(([k, val]) => v[k] === val))
                .map(([_id, v]) => ({ _id, ...v }));
              return { data };
            },
          };
        },
        async add({ data }) {
          seq += 1;
          const _id = `${name}-${seq}`;
          coll.set(_id, data);
          return { _id };
        },
        doc(_id) {
          return {
            async get() {
              if (!coll.has(_id)) throw new Error('Doc not found');
              return { data: coll.get(_id) };
            },
            async update({ data }) {
              if (!coll.has(_id)) throw new Error('Doc not found');
              const current = coll.get(_id);
              const next = { ...current };
              for (const [key, value] of Object.entries(data)) {
                if (value && typeof value === 'object' && value.$push) {
                  next[key] = [...(current[key] || []), value.$push];
                } else {
                  next[key] = value;
                }
              }
              coll.set(_id, next);
              return { stats: { updated: 1 } };
            },
            async set({ data }) {
              coll.set(_id, data);
              return { stats: { created: 1, updated: 0 } };
            },
          };
        },
      };
    },
  };

  return {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init() {},
    database() { return db; },
    getWXContext() { return { OPENID: currentOpenid }; },
  };
}

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'wx-server-sdk') return createFakeCloud();
  return originalLoad.call(this, request, ...rest);
};
const memoryFunction = require('../index.js');
Module._load = originalLoad;

const call = (event) => memoryFunction.main(event);

test('owner can create proposals at every visibility level and list them', async () => {
  for (const visibility of ['public', 'agent_only', 'connected', 'private']) {
    const { memory } = await call({ action: 'createMemoryProposal', kind: 'fact', content: `c-${visibility}`, visibility });
    assert.equal(memory.status, 'proposed');
    assert.equal(memory.visibility, visibility);
    assert.equal(memory.ownerId, OWNER);
  }
  const { memories } = await call({ action: 'listMemories' });
  assert.equal(memories.length, 4);

  const publicOnly = await call({ action: 'listMemories', visibility: 'public' });
  assert.equal(publicOnly.memories.length, 1);
  assert.equal(publicOnly.memories[0].visibility, 'public');
});

test('stable decision-learning source key is idempotent, including after rejection', async () => {
  const input = {
    action: 'createMemoryProposal',
    kind: 'boundary',
    content: '我希望连接邀请先说明具体问题。',
    visibility: 'agent_only',
    idempotencyKey: 'connection-decision:stable-test',
    sourceMessageIds: ['req-1'],
  };
  const first = await call(input);
  assert.equal(first.deduplicated, false);
  await call({ action: 'deleteMemory', memoryId: first.memory._id });
  const retry = await call(input);
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.memory._id, first.memory._id);
  assert.equal(retry.memory.status, 'deleted');
});

test('a stranger sees nothing and cannot touch owner memories', async () => {
  const { memory } = await call({ action: 'createMemoryProposal', kind: 'boundary', content: '不回应泛泛的资源互换', visibility: 'agent_only' });

  currentOpenid = STRANGER;
  const { memories } = await call({ action: 'listMemories' });
  assert.equal(memories.length, 0);
  await assert.rejects(call({ action: 'confirmMemory', memoryId: memory._id }), /not_found/);
  await assert.rejects(call({ action: 'editMemory', memoryId: memory._id, content: 'x' }), /not_found/);
  await assert.rejects(call({ action: 'deleteMemory', memoryId: memory._id }), /not_found/);
  currentOpenid = OWNER;
});

test('confirmation is required before a proposal becomes retrievable', async () => {
  const { memory } = await call({ action: 'createMemoryProposal', kind: 'preference', content: '想认识做过 AI 社交产品的人', visibility: 'public' });

  let active = await call({ action: 'listMemories', retrievableOnly: true });
  assert.equal(active.memories.some(m => m._id === memory._id), false);

  const { memory: confirmed } = await call({ action: 'confirmMemory', memoryId: memory._id });
  assert.equal(confirmed.status, 'confirmed');

  active = await call({ action: 'listMemories', retrievableOnly: true });
  assert.equal(active.memories.some(m => m._id === memory._id), true);

  // double-confirm is an invalid transition
  await assert.rejects(call({ action: 'confirmMemory', memoryId: memory._id }), /only_proposed_can_be_confirmed/);
});

test('owner can edit content at confirm time and afterwards', async () => {
  const { memory } = await call({ action: 'createMemoryProposal', kind: 'preference', content: '想认识投资人', visibility: 'private' });

  const { memory: confirmed } = await call({
    action: 'confirmMemory', memoryId: memory._id,
    content: '想认识真正做过产品的人', visibility: 'public',
  });
  assert.equal(confirmed.content, '想认识真正做过产品的人');
  assert.equal(confirmed.visibility, 'public');

  const { memory: edited } = await call({ action: 'editMemory', memoryId: memory._id, kind: 'current', visibility: 'agent_only' });
  assert.equal(edited.kind, 'current');
  assert.equal(edited.visibility, 'agent_only');
  assert.equal(edited.status, 'confirmed');
});

test('delete removes the memory from future retrieval', async () => {
  const { memory } = await call({ action: 'createMemoryProposal', kind: 'fact', content: '做过一个 AI 小程序', visibility: 'public' });
  await call({ action: 'confirmMemory', memoryId: memory._id });
  const { memory: deleted } = await call({ action: 'deleteMemory', memoryId: memory._id });
  assert.equal(deleted.status, 'deleted');

  const active = await call({ action: 'listMemories', retrievableOnly: true });
  assert.equal(active.memories.some(m => m._id === memory._id), false);
});

test('invalid payloads are rejected', async () => {
  await assert.rejects(call({ action: 'createMemoryProposal', kind: 'embedding', content: 'x', visibility: 'public' }), /invalid_kind/);
  await assert.rejects(call({ action: 'createMemoryProposal', kind: 'fact', content: '   ', visibility: 'public' }), /invalid_content/);
  await assert.rejects(call({ action: 'createMemoryProposal', kind: 'fact', content: 'x', visibility: 'friends' }), /invalid_visibility/);
  await assert.rejects(call({ action: 'unknownAction' }), /invalid_action/);
});

test('conversations persist messages and stay owner-scoped', async () => {
  const first = await call({ action: 'appendMessage', mode: 'owner', role: 'owner', content: '我最近想认识做过 AI 社交产品的人' });
  assert.ok(first.conversationId);
  assert.equal(first.message.role, 'owner');

  const second = await call({ action: 'appendMessage', conversationId: first.conversationId, role: 'vibe', content: '这句话值得被记住。' });
  assert.equal(second.conversationId, first.conversationId);

  const { conversation } = await call({ action: 'getConversation', conversationId: first.conversationId });
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.ownerId, OWNER);

  currentOpenid = STRANGER;
  await assert.rejects(call({ action: 'getConversation', conversationId: first.conversationId }), /not_found/);
  await assert.rejects(call({ action: 'appendMessage', conversationId: first.conversationId, role: 'owner', content: 'hack' }), /not_found/);
  currentOpenid = OWNER;
});
