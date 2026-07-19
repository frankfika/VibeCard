/**
 * Recognition-moment contract tests (task 3.3).
 *
 * OwnerAgentResult.referencedMemoryIds: the model cites ids of confirmed
 * memories it actually referenced; the server keeps only ids that exist in
 * this run's confirmed memories (unknown ids dropped silently), capped at 3.
 *
 * VisitorAgentResult.sharedContext: concrete overlaps between what the
 * visitor said and the public evidence; shape-validated, trimmed, capped at
 * 60 chars per item and 3 items; empty after filtering deletes the field.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { runOwnerAgent, runVisitorAgent } = require('../lib/agent');
const { validateOwnerAgentResult, validateVisitorAgentResult } = require('../lib/schema');
const { createMockProvider } = require('../lib/providers');

/* ---- OwnerAgentResult.referencedMemoryIds ------------------------------- */

const OWNER_MEMORIES = [
  { _id: 'mem-real-1', kind: 'current', visibility: 'private', status: 'confirmed', content: '在打磨参赛演示' },
  { _id: 'mem-real-2', kind: 'fact', visibility: 'public', status: 'confirmed', content: '做过 AI 小程序' },
];

function ownerProviderWith(referencedMemoryIds) {
  return {
    async complete() {
      return JSON.stringify({
        reply: '你上次说在打磨参赛演示——后来怎么样了？',
        memoryProposal: null,
        cardUpdateSuggested: false,
        ...(referencedMemoryIds !== undefined ? { referencedMemoryIds } : {}),
      });
    },
  };
}

const OWNER_CHAT = [{ role: 'user', content: '随便聊聊' }];

test('validateOwnerAgentResult: referencedMemoryIds shape', () => {
  const base = { reply: 'x', memoryProposal: null, cardUpdateSuggested: false };
  assert.equal(validateOwnerAgentResult(base), null, 'absent is fine');
  assert.equal(validateOwnerAgentResult({ ...base, referencedMemoryIds: ['mem-1'] }), null);
  assert.equal(validateOwnerAgentResult({ ...base, referencedMemoryIds: [] }), null);
  assert.equal(validateOwnerAgentResult({ ...base, referencedMemoryIds: 'mem-1' }), 'invalid_referenced_memory_ids');
  assert.equal(validateOwnerAgentResult({ ...base, referencedMemoryIds: [42] }), 'invalid_referenced_memory_ids');
});

test('runOwnerAgent keeps only real memory ids, capped at 3', async () => {
  const outcome = await runOwnerAgent({
    provider: ownerProviderWith(['mem-real-1', 'mem-fake', 'mem-real-2', 'mem-real-1']),
    memories: OWNER_MEMORIES,
    messages: OWNER_CHAT,
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.result.referencedMemoryIds, ['mem-real-1', 'mem-real-2'], 'fake id and duplicate dropped');
});

test('runOwnerAgent drops the field when every id is fabricated', async () => {
  const outcome = await runOwnerAgent({
    provider: ownerProviderWith(['mem-fake-1', 'mem-fake-2']),
    memories: OWNER_MEMORIES,
    messages: OWNER_CHAT,
  });
  assert.equal(outcome.ok, true);
  assert.equal('referencedMemoryIds' in outcome.result, false);
});

test('runOwnerAgent without the field stays without it', async () => {
  const outcome = await runOwnerAgent({
    provider: ownerProviderWith(undefined),
    memories: OWNER_MEMORIES,
    messages: OWNER_CHAT,
  });
  assert.equal(outcome.ok, true);
  assert.equal('referencedMemoryIds' in outcome.result, false);
});

test('owner system prompt carries memory ids so the model can cite them', async () => {
  let seenSystem = '';
  const spy = {
    async complete({ system }) {
      seenSystem = system;
      return JSON.stringify({ reply: '好', memoryProposal: null, cardUpdateSuggested: false });
    },
  };
  await runOwnerAgent({ provider: spy, memories: OWNER_MEMORIES, messages: OWNER_CHAT });
  assert.ok(seenSystem.includes('[mem:mem-real-1]'));
  assert.ok(seenSystem.includes('[mem:mem-real-2]'));
  assert.ok(seenSystem.includes('referencedMemoryIds'));
});

test('mock provider emits referencedMemoryIds on a recall cue', async () => {
  const outcome = await runOwnerAgent({
    provider: createMockProvider(),
    memories: OWNER_MEMORIES,
    messages: [{ role: 'user', content: '上次说的那件事，后来怎么样了？' }],
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.result.referencedMemoryIds, ['mem-real-1']);
});

/* ---- VisitorAgentResult.sharedContext ----------------------------------- */

const CARD = { name: '方辰', headline: '先理解，再认识', currentFocus: '打磨访客对话', canHelpWith: [], wantsToMeet: [], topics: [] };
const PUBLIC_MEMORIES = [
  { _id: 'mem-pub-1', kind: 'fact', visibility: 'public', status: 'confirmed', content: '做过一个 AI 小程序' },
];

test('validateVisitorAgentResult: sharedContext shape', () => {
  const base = { reply: 'x', evidenceRefs: [], nextAction: 'continue' };
  assert.equal(validateVisitorAgentResult(base), null, 'absent is fine');
  assert.equal(validateVisitorAgentResult({ ...base, sharedContext: '都在做 AI 分身' }), 'invalid_shared_context');
  assert.equal(validateVisitorAgentResult({ ...base, sharedContext: [42] }), 'invalid_shared_context');
});

test('validateVisitorAgentResult: sharedContext is trimmed, sliced, capped, emptied', () => {
  const long = `双方都在做个人 AI 分身，而且都在研究隐私边界与权限设计这件具体的事情，还都在参加比赛。`; // > 60 chars
  const value = {
    reply: 'x',
    evidenceRefs: [],
    nextAction: 'continue',
    sharedContext: ['  双方都在做 AI 分身  ', long, '  ', '第三条', '第四条（应被截掉）'],
  };
  assert.equal(validateVisitorAgentResult(value), null);
  assert.equal(value.sharedContext.length, 3, 'capped at 3');
  assert.equal(value.sharedContext[0], '双方都在做 AI 分身', 'trimmed');
  assert.ok(value.sharedContext[1].length <= 60, 'each item <= 60 chars');
  assert.ok(!value.sharedContext.includes(''), 'empty items dropped');

  const allEmpty = { reply: 'x', evidenceRefs: [], nextAction: 'continue', sharedContext: ['   ', ''] };
  assert.equal(validateVisitorAgentResult(allEmpty), null);
  assert.equal('sharedContext' in allEmpty, false, 'empty after filtering deletes the field');
});

test('runVisitorAgent passes sharedContext through, normalized', async () => {
  const provider = {
    async complete() {
      return JSON.stringify({
        reply: '这个交集挺具体的。',
        evidenceRefs: [],
        nextAction: 'invite_connection_reason',
        sharedContext: ['  双方都在做个人 AI 分身  '],
      });
    },
  };
  const outcome = await runVisitorAgent({
    provider,
    card: CARD,
    publicMemories: PUBLIC_MEMORIES,
    agentMemories: [],
    messages: [{ role: 'user', content: '我也在做个人 AI 分身' }],
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.result.sharedContext, ['双方都在做个人 AI 分身']);
});

test('runVisitorAgent without real overlap has no sharedContext', async () => {
  const outcome = await runVisitorAgent({
    provider: createMockProvider(),
    card: CARD,
    publicMemories: PUBLIC_MEMORIES,
    agentMemories: [],
    messages: [{ role: 'user', content: '他喜欢吃什么水果？' }],
  });
  assert.equal(outcome.ok, true);
  assert.equal('sharedContext' in outcome.result, false);
});

test('mock provider emits sharedContext when the visitor states an overlap', async () => {
  const outcome = await runVisitorAgent({
    provider: createMockProvider(),
    card: CARD,
    publicMemories: PUBLIC_MEMORIES,
    agentMemories: [],
    messages: [{ role: 'user', content: '我也在做个人 AI 分身，想跟他交流一下' }],
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.result.sharedContext, ['双方都在做个人 AI 分身']);
  assert.equal(outcome.result.nextAction, 'invite_connection_reason');
});
