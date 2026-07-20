/**
 * Now grounding tests for the agent cloud function (task 4.5).
 *
 * AI_BEHAVIOR.md §13: when a visitor asks what the owner is doing recently,
 * the public agent prefers published, non-expired Now items, then public
 * current-focus memory; if neither exists it says it has no recent public
 * update — never invent. Owner-side nowProposal output is schema-validated.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { runVisitorAgent, runOwnerAgent } = require('../lib/agent');
const { validateOwnerAgentResult, validateVisitorAgentResult } = require('../lib/schema');
const { createMockProvider } = require('../lib/providers');

const CARD = {
  name: '方辰',
  headline: '先理解，再认识',
  currentFocus: '打磨访客和分身的前六轮对话',
  canHelpWith: ['AI 社交产品的取舍'],
  wantsToMeet: ['真正做过 AI 社交产品的人'],
  topics: ['个人 AI 分身', '隐私边界'],
};

const T0 = 1752000000000;
const hour = 3600000;

function nowItem(id, overrides) {
  return {
    _id: id,
    ownerId: 'owner',
    text: '最近在验证 AI 分身如何帮助两个人建立联系',
    topic: 'current_work',
    status: 'published',
    publishedAt: T0,
    expiresAt: null,
    ...overrides,
  };
}

function run(messages, extra = {}) {
  return runVisitorAgent({
    provider: createMockProvider(),
    card: CARD,
    publicMemories: [],
    agentMemories: [],
    messages,
    ...extra,
  });
}

test('recent-context question cites the published now item as evidence', async () => {
  const outcome = await run([{ role: 'user', content: '他最近在做什么？' }], {
    nowItems: [nowItem('now-1')],
  });
  assert.equal(outcome.ok, true);
  assert.equal(validateVisitorAgentResult(outcome.result), null);
  assert.ok(outcome.result.evidenceRefs.some((r) => r.startsWith('now:')));
});

test('without now items the agent falls back to public current-focus memory', async () => {
  const outcome = await run([{ role: 'user', content: '他最近在忙什么？' }], { nowItems: [] });
  assert.equal(outcome.ok, true);
  assert.ok(outcome.result.evidenceRefs.some((r) => r.startsWith('card:currentFocus')));
});

test('neither now items nor current-focus memory -> explicit uncertainty, no invention', async () => {
  const outcome = await run([{ role: 'user', content: '他最近在做什么？' }], {
    card: { name: '方辰', headline: '', currentFocus: '', canHelpWith: [], wantsToMeet: [], topics: [] },
    nowItems: [],
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.result.evidenceRefs, []);
  assert.ok(/还没有告诉我|不想替他/.test(outcome.result.reply));
});

test('now evidence lines list only the items passed in (already active-filtered upstream)', async () => {
  // runVisitorAgent receives only published, non-expired items from index.js;
  // this guards the evidence-context builder against silently dropping them.
  const outcome = await run([{ role: 'user', content: '他最近在做什么？' }], {
    nowItems: [nowItem('now-1'), nowItem('now-2', { text: '刚完成六轮对话的设计' })],
  });
  assert.equal(outcome.ok, true);
  assert.ok(outcome.result.evidenceRefs.some((r) => r === 'now:now-1'));
});

test('owner nowProposal is schema-validated: drafts only, strict topic enum', async () => {
  const provider = createMockProvider();
  const outcome = await runOwnerAgent({
    provider,
    memories: [],
    messages: [{ role: 'user', content: '最近在打磨访客对话的体验' }],
  });
  assert.equal(outcome.ok, true);
  assert.equal(validateOwnerAgentResult(outcome.result), null);
  assert.ok(outcome.result.nowProposal);
  assert.equal(outcome.result.nowProposal.topic, 'current_work');
  // the proposal carries no status — publishing is never the agent's call
  assert.equal('status' in outcome.result.nowProposal, false);
});

test('owner result schema rejects invalid nowProposal shapes', () => {
  const base = { reply: '好', memoryProposal: null, cardUpdateSuggested: false };
  assert.equal(validateOwnerAgentResult({ ...base, nowProposal: { text: '', topic: 'current_work' } }), 'invalid_now_proposal_text');
  assert.equal(validateOwnerAgentResult({ ...base, nowProposal: { text: 'x'.repeat(201), topic: 'current_work' } }), 'invalid_now_proposal_text');
  assert.equal(validateOwnerAgentResult({ ...base, nowProposal: { text: '在做 X', topic: 'rant' } }), 'invalid_now_proposal_topic');
  assert.equal(validateOwnerAgentResult({ ...base, nowProposal: { text: '在做 X', topic: 'current_work', expiresAt: 'soon' } }), 'invalid_now_proposal_expires_at');
  assert.equal(validateOwnerAgentResult({ ...base, nowProposal: { text: '在做 X', topic: 'current_work', expiresAt: null } }), null);
  assert.equal(validateOwnerAgentResult({ ...base, nowProposal: null }), null);
});
