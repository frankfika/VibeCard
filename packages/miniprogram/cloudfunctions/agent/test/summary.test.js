/**
 * Connection summary tests (task 2.4).
 *
 * Covers AI_BEHAVIOR.md §8: the summary is not a score, every `why` hangs on
 * evidence, and weak evidence produces a cautious recommendation with an
 * explicit uncertainty.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const { runConnectionSummary } = require('../lib/agent');
const { validateConnectionSummary } = require('../lib/schema');
const { createMockProvider } = require('../lib/providers');

const STRONG_REQUEST = {
  visitorSummary: '在做个人 AI 小程序的独立开发者',
  reason: '我也在开发个人 AI 小程序，最近卡在私人记忆与公开身份的边界，希望交流一次权限设计。',
  possibleSharedContext: ['都在做个人 AI 分身', '都关心隐私边界'],
  visitorWorkUrl: 'https://example.com/demo',
};

const WEAK_REQUEST = {
  visitorSummary: '',
  reason: '想认识一下',
  possibleSharedContext: [],
};

test('strong evidence produces a worth_a_conversation summary with cited evidence', async () => {
  const outcome = await runConnectionSummary({ provider: createMockProvider(), request: STRONG_REQUEST });
  assert.equal(outcome.ok, true);
  const { summary } = outcome.result;
  assert.equal(validateConnectionSummary(summary), null);
  assert.equal(summary.recommendation, 'worth_a_conversation');
  assert.ok(summary.why.length > 0);
  assert.ok(summary.evidenceRefs.length > 0, 'why hangs on evidence');
  assert.ok(summary.uncertainty.trim().length > 0);
  assert.ok(summary.suggestedTopic.trim().length > 0);
  assert.equal('score' in summary, false, 'no score field ever');
});

test('weak evidence stays cautious: need_more_context with explicit uncertainty', async () => {
  const outcome = await runConnectionSummary({ provider: createMockProvider(), request: WEAK_REQUEST });
  assert.equal(outcome.ok, true);
  const { summary } = outcome.result;
  assert.equal(validateConnectionSummary(summary), null);
  assert.equal(summary.recommendation, 'need_more_context');
  assert.ok(summary.uncertainty.includes('空泛') || summary.uncertainty.includes('缺少'), 'uncertainty names what is missing');
  assert.equal('score' in summary, false);
});

test('conversation excerpt joins the evidence when present', async () => {
  let seenSystem = '';
  const spy = {
    async complete({ system }) {
      seenSystem = system;
      return JSON.stringify({
        recommendation: 'maybe_later',
        why: ['对话里提到想深入了解'],
        uncertainty: '对方的时间投入不明',
        suggestedTopic: '先聊一个具体话题',
        evidenceRefs: ['conv:excerpt'],
      });
    },
  };
  const outcome = await runConnectionSummary({
    provider: spy,
    request: STRONG_REQUEST,
    conversationExcerpt: 'visitor: 我认真看过你的名片',
  });
  assert.equal(outcome.ok, true);
  assert.ok(seenSystem.includes('[conv:excerpt]'));
  assert.ok(seenSystem.includes('visitor: 我认真看过你的名片'));
});

test('validator enforces the not-a-score contract', () => {
  const base = {
    recommendation: 'maybe_later',
    why: ['有证据的判断'],
    uncertainty: '不确定对方的真实意图',
    suggestedTopic: '聊共同话题',
    evidenceRefs: ['req:reason'],
  };
  assert.equal(validateConnectionSummary(base), null);
  assert.equal(validateConnectionSummary({ ...base, score: 92 }), 'score_not_allowed');
  assert.equal(validateConnectionSummary({ ...base, recommendation: 'passed' }), 'invalid_recommendation');
  assert.equal(validateConnectionSummary({ ...base, why: [] }), 'invalid_why');
  assert.equal(validateConnectionSummary({ ...base, why: ['  '] }), 'invalid_why');
  assert.equal(validateConnectionSummary({ ...base, uncertainty: '' }), 'invalid_uncertainty');
  assert.equal(validateConnectionSummary({ ...base, suggestedTopic: '' }), 'invalid_suggested_topic');
  assert.equal(validateConnectionSummary({ ...base, evidenceRefs: 'req:reason' }), 'invalid_evidence_refs');
  assert.equal(validateConnectionSummary(null), 'not_an_object');
});

test('invalid model output is rejected after one retry', async () => {
  let calls = 0;
  const bad = { async complete() { calls += 1; return JSON.stringify({ recommendation: 'worth_a_conversation' }); } };
  const outcome = await runConnectionSummary({ provider: bad, request: STRONG_REQUEST });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, 'invalid_model_output');
  assert.equal(calls, 2);
});

/* ---- entry-level: stubbed wx-server-sdk -------------------------------- */

test('summarizeConnection entry: owner-only, request + conversation evidence', async () => {
  let currentOpenid = 'owner-1';
  const store = {
    users: new Map(),
    memories: new Map(),
    requests: new Map([
      ['req-1', { ownerId: 'owner-1', visitorId: 'visitor-1', ...STRONG_REQUEST, conversationId: 'conv-1', ownerAction: 'pending' }],
      ['req-2', { ownerId: 'someone-else', visitorId: 'visitor-2', ...WEAK_REQUEST, ownerAction: 'pending' }],
    ]),
    conversations: new Map([
      ['conv-1', { ownerId: 'owner-1', mode: 'visitor', messages: [
        { id: 'msg-1', role: 'visitor', content: '我认真看过你的名片', createdAt: 1 },
        { id: 'msg-2', role: 'vibe', content: '谢谢你看得这么细', createdAt: 2 },
      ] }],
    ]),
  };
  const fakeCloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database() {
      return {
        collection(name) {
          const coll = store[name];
          return {
            where(conds) {
              return {
                async get() {
                  const data = [...coll.entries()]
                    .filter(([, v]) => Object.entries(conds).every(([k, val]) => v[k] === val))
                    .map(([_id, v]) => ({ _id, ...v }));
                  return { data };
                },
              };
            },
            doc(id) {
              return {
                async get() {
                  if (!coll.has(id)) throw new Error('Doc not found');
                  return { data: coll.get(id) };
                },
              };
            },
          };
        },
      };
    },
    getWXContext() { return { OPENID: currentOpenid }; },
  };
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'wx-server-sdk') return fakeCloud;
    return originalLoad.call(this, request, ...rest);
  };
  const agentFunction = require('../index.js');
  Module._load = originalLoad;

  const res = await agentFunction.main({ action: 'summarizeConnection', requestId: 'req-1' });
  assert.equal(res.ok, true);
  assert.equal(validateConnectionSummary(res.result.summary), null);
  assert.equal('score' in res.result.summary, false);

  // another owner's request is invisible
  const denied = await agentFunction.main({ action: 'summarizeConnection', requestId: 'req-2' });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'not_found');

  const missing = await agentFunction.main({ action: 'summarizeConnection', requestId: 'nope' });
  assert.equal(missing.error.code, 'not_found');

  const badInput = await agentFunction.main({ action: 'summarizeConnection' });
  assert.equal(badInput.error.code, 'invalid_request');
});
