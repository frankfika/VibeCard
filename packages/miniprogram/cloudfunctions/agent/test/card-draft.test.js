/**
 * Card draft tests (task 1.4): confirmed-memory-only drafts, schema
 * validation, no empty sections, never-published-automatically semantics.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { runCardDraft } = require('../lib/agent');
const { validateCardDraft } = require('../lib/schema');
const { createMockProvider } = require('../lib/providers');

const CONFIRMED = [
  { kind: 'current', visibility: 'public', status: 'confirmed', content: '在打磨 VibeCard 的访客对话' },
  { kind: 'preference', visibility: 'public', status: 'confirmed', content: '想认识做过 AI 社交产品的人' },
];

test('mock provider yields a valid, non-empty draft from confirmed memories', async () => {
  const outcome = await runCardDraft({ provider: createMockProvider(), memories: CONFIRMED });
  assert.equal(outcome.ok, true);
  const { draft } = outcome.result;
  assert.equal(validateCardDraft(draft).error, undefined);
  assert.ok(draft.headline);
  assert.ok(Array.isArray(draft.wantsToMeet));
});

test('no confirmed memories -> typed error, no draft', async () => {
  const proposedOnly = [{ kind: 'fact', visibility: 'private', status: 'proposed', content: 'x' }];
  const outcome = await runCardDraft({ provider: createMockProvider(), memories: proposedOnly });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, 'no_confirmed_memories');
});

test('empty sections are stripped from the draft', () => {
  const { draft } = validateCardDraft({
    headline: '  在做 AI 名片  ',
    currentFocus: '',
    canHelpWith: [],
    wantsToMeet: ['  做过 AI 社交产品的人 ', ''],
    topics: 'not-an-array',
  });
  // topics is invalid -> whole validation fails
  assert.equal(draft, undefined);

  const cleaned = validateCardDraft({
    headline: '在做 AI 名片',
    currentFocus: '',
    canHelpWith: [],
    wantsToMeet: ['做过 AI 社交产品的人'],
  }).draft;
  assert.deepEqual(Object.keys(cleaned).sort(), ['headline', 'wantsToMeet']);
});

test('draft never carries contact details or owner identity fields', () => {
  const { draft } = validateCardDraft({
    headline: '在做 AI 名片',
    name: '不应出现',
    wechat: 'secret-id',
    phone: '13800000000',
    email: 'a@b.com',
  });
  assert.equal(draft.name, undefined);
  assert.equal(draft.wechat, undefined);
  assert.equal(draft.phone, undefined);
  assert.equal(draft.email, undefined);
  assert.equal(draft.headline, '在做 AI 名片');
});

test('completely empty model output is rejected', () => {
  assert.equal(validateCardDraft({}).error, 'empty_draft');
  assert.equal(validateCardDraft(null).error, 'not_an_object');
});

test('invalid model JSON -> typed invalid_model_output; provider down -> model_unavailable', async () => {
  const badJson = { async complete() { return 'no json'; } };
  const outcome = await runCardDraft({ provider: badJson, memories: CONFIRMED });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, 'invalid_model_output');

  const down = { async complete() { throw new Error('provider_timeout'); } };
  const downOutcome = await runCardDraft({ provider: down, memories: CONFIRMED });
  assert.equal(downOutcome.ok, false);
  assert.equal(downOutcome.error.code, 'model_unavailable');
});
