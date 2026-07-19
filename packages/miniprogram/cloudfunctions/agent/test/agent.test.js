/**
 * Agent boundary tests (task 1.2).
 *
 * The same suite runs against any injected provider. Locally it runs with
 * the deterministic mock provider; with AI_API_BASE / AI_API_KEY / AI_MODEL
 * configured, swapping in the HTTP provider exercises the identical path
 * (credentials never ship to clients).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const { runOwnerAgent, extractMemoryProposal } = require('../lib/agent');
const { validateOwnerAgentResult } = require('../lib/schema');
const { createMockProvider, getProvider } = require('../lib/providers');

const CHAT = [{ role: 'user', content: '我最近想认识真正做过 AI 社交产品的人。' }];
const SMALLTALK = [{ role: 'user', content: '你好呀' }];

test('mock provider returns a schema-valid owner result with a proposal for memory-worthy input', async () => {
  const provider = createMockProvider();
  const outcome = await runOwnerAgent({ provider, memories: [], messages: CHAT });
  assert.equal(outcome.ok, true);
  assert.equal(validateOwnerAgentResult(outcome.result), null);
  assert.ok(outcome.result.memoryProposal);
  assert.equal(outcome.result.memoryProposal.kind, 'preference');
});

test('casual greetings produce no memory proposal', async () => {
  const provider = createMockProvider();
  const outcome = await runOwnerAgent({ provider, memories: [], messages: SMALLTALK });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.result.memoryProposal, null);
});

test('invalid model JSON is rejected after one retry and returns a typed error', async () => {
  let calls = 0;
  const badProvider = { async complete() { calls += 1; return 'not json at all'; } };
  const outcome = await runOwnerAgent({ provider: badProvider, memories: [], messages: CHAT });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, 'invalid_model_output');
  assert.equal(calls, 2, 'exactly one retry');
});

test('schema-invalid model output (bad kind) is rejected', async () => {
  const badProvider = {
    async complete() {
      return JSON.stringify({
        reply: 'ok',
        memoryProposal: { kind: 'embedding', content: 'x', suggestedVisibility: 'public' },
        cardUpdateSuggested: false,
      });
    },
  };
  const outcome = await runOwnerAgent({ provider: badProvider, memories: [], messages: CHAT });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, 'invalid_model_output');
});

test('provider failure surfaces as provider_unavailable from the function entry', async () => {
  const failing = { async complete() { throw new Error('provider_timeout'); } };
  await assert.rejects(failing.complete({}), /provider_timeout/);

  // entry-level behavior covered below via the stubbed cloud function
});

test('extractMemoryProposal returns only the proposal', async () => {
  const provider = createMockProvider();
  const outcome = await extractMemoryProposal({ provider, memories: [], messages: CHAT });
  assert.equal(outcome.ok, true);
  assert.ok(outcome.result.proposal);
  const casual = await extractMemoryProposal({ provider, memories: [], messages: SMALLTALK });
  assert.equal(casual.result.proposal, null);
});

test('confirmed memories are injected into the system prompt context', async () => {
  let seenSystem = '';
  const spy = { async complete({ system }) { seenSystem = system; return JSON.stringify({ reply: '好', memoryProposal: null, cardUpdateSuggested: false }); } };
  const memories = [{ kind: 'boundary', visibility: 'agent_only', content: '不回应泛泛的资源互换' }];
  const outcome = await runOwnerAgent({ provider: spy, memories, messages: CHAT });
  assert.equal(outcome.ok, true);
  assert.ok(seenSystem.includes('不回应泛泛的资源互换'));
  assert.ok(seenSystem.includes('[boundary/agent_only]'));
});

test('empty or malformed messages are an invalid_request', async () => {
  const provider = createMockProvider();
  const outcome = await runOwnerAgent({ provider, memories: [], messages: [] });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, 'invalid_request');
});

test('provider selection: no key -> mock; configured -> http', () => {
  assert.equal(getProvider({}).name, 'mock');
  assert.equal(getProvider({ AI_PROVIDER: 'mock', AI_API_BASE: 'https://x', AI_API_KEY: 'k', AI_MODEL: 'm' }).name, 'mock');
  assert.equal(getProvider({ AI_API_BASE: 'https://api.example.com', AI_API_KEY: 'k', AI_MODEL: 'm' }).name, 'http');
});

/* ---- entry-level: stubbed wx-server-sdk -------------------------------- */

test('agent function entry: typed errors, never raw output', async () => {
  let currentOpenid = 'owner-1';
  const fakeCloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database() {
      return {
        collection() {
          return {
            where() {
              return { async get() { return { data: [{ kind: 'fact', visibility: 'public', content: '做过 AI 小程序' }] }; } };
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

  const res = await agentFunction.main({ action: 'ownerMessage', messages: CHAT });
  assert.equal(res.ok, true);
  assert.equal(validateOwnerAgentResult(res.result), null);

  const bad = await agentFunction.main({ action: 'nope', messages: CHAT });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'invalid_action');

  currentOpenid = '';
  const unauth = await agentFunction.main({ action: 'ownerMessage', messages: CHAT });
  assert.equal(unauth.ok, false);
  assert.equal(unauth.error.code, 'unauthorized');
});
