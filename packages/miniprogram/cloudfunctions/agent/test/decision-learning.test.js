const test = require('node:test');
const assert = require('node:assert/strict');

const { runDecisionLearning } = require('../lib/agent');
const { createMockProvider } = require('../lib/providers');
const { validateDecisionLearningAgentResult } = require('../lib/schema');

test('decision learning returns at most one private preference/boundary proposal', async () => {
  const outcome = await runDecisionLearning({
    provider: createMockProvider(),
    kind: 'boundary',
    suggestedContent: '我希望连接邀请先说明具体问题。',
  });
  assert.equal(outcome.ok, true);
  assert.equal(validateDecisionLearningAgentResult(outcome.result), null);
  assert.equal(outcome.result.proposal.kind, 'boundary');
  assert.equal(outcome.result.proposal.suggestedVisibility, 'agent_only');
  assert.equal(Array.isArray(outcome.result.proposal), false);
});

test('invalid learning output retries once and is rejected', async () => {
  let calls = 0;
  const provider = { async complete() { calls += 1; return '{"proposal":{"kind":"fact","content":"x","suggestedVisibility":"public"}}'; } };
  const outcome = await runDecisionLearning({
    provider,
    kind: 'preference',
    suggestedContent: '我喜欢具体的交流邀请。',
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, 'invalid_model_output');
  assert.equal(calls, 2);
});
