/**
 * Core tests: provider-neutral model boundary (task 5.4).
 *
 * Covers capability declarations and their failure mode, the typed provider
 * error taxonomy, and the validated `AgentModel` wrapper (parse -> validate
 * -> one retry -> typed error). Platform-free; no network anywhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MODEL_CAPABILITIES,
  TEXT_STRUCTURED_CAPABILITIES,
  PROVIDER_ERROR_CODES,
  ModelProviderError,
  isModelProviderError,
  providerSupports,
  requireProviderCapability,
  embedWithProvider,
  createAgentModel,
} from '../model-provider';
import type { ModelProvider } from '../model-provider';
import { createMockModelProvider } from '../mock-provider';
import {
  validateOwnerAgentResult,
  validateVisitorAgentResult,
  validateConnectionSummary,
} from '../agent-schema';

const CHAT = [{ role: 'user' as const, content: '我最近想认识真正做过 AI 社交产品的人。' }];

function textProvider(complete: ModelProvider['complete']): ModelProvider {
  return {
    name: 'stub',
    capabilities: { ...TEXT_STRUCTURED_CAPABILITIES },
    complete,
  };
}

/* ---------------------------------------------------------------------------
 * Capabilities
 * ------------------------------------------------------------------------- */

test('capability vocabulary covers text, structured output, embeddings, vision, audio', () => {
  assert.deepEqual(MODEL_CAPABILITIES, ['text', 'structuredOutput', 'embeddings', 'vision', 'audio']);
  assert.deepEqual(Object.keys(TEXT_STRUCTURED_CAPABILITIES).sort(), [...MODEL_CAPABILITIES].sort());
});

test('unsupported capability fails with a typed error, never a silent fallback', () => {
  const provider = createMockModelProvider();
  assert.equal(providerSupports(provider, 'text'), true);
  assert.equal(providerSupports(provider, 'embeddings'), false);
  assert.equal(providerSupports(provider, 'vision'), false);
  assert.equal(providerSupports(provider, 'audio'), false);
  assert.throws(
    () => requireProviderCapability(provider, 'embeddings'),
    (error: unknown) => {
      assert.ok(error instanceof ModelProviderError);
      assert.equal((error as ModelProviderError).code, 'unsupported_capability');
      return true;
    },
  );
});

test('embeddings requested from a text-only provider reject as unsupported_capability', async () => {
  const provider = createMockModelProvider();
  await assert.rejects(embedWithProvider(provider, ['hello']), (error: unknown) => {
    assert.ok(isModelProviderError(error));
    assert.equal((error as ModelProviderError).code, 'unsupported_capability');
    return true;
  });
});

test('a provider declaring embeddings must actually implement embed', async () => {
  const broken: ModelProvider = {
    name: 'broken',
    capabilities: { ...TEXT_STRUCTURED_CAPABILITIES, embeddings: true },
    async complete() { return '{}'; },
  };
  await assert.rejects(embedWithProvider(broken, ['x']), /no embed method/);

  const working: ModelProvider = {
    ...broken,
    name: 'working',
    async embed(texts: string[]) { return texts.map(() => [0.1, 0.2]); },
  };
  assert.deepEqual(await embedWithProvider(working, ['a', 'b']), [[0.1, 0.2], [0.1, 0.2]]);
});

test('createAgentModel requires the text capability', () => {
  const mute: ModelProvider = {
    name: 'mute',
    capabilities: { text: false, structuredOutput: false, embeddings: false, vision: false, audio: false },
    async complete() { return '{}'; },
  };
  assert.throws(() => createAgentModel(mute), (error: unknown) => {
    assert.equal((error as ModelProviderError).code, 'unsupported_capability');
    return true;
  });
});

/* ---------------------------------------------------------------------------
 * Error taxonomy
 * ------------------------------------------------------------------------- */

test('provider error codes are the stable typed vocabulary', () => {
  assert.deepEqual(PROVIDER_ERROR_CODES, [
    'model_unavailable',
    'rate_limited',
    'permission_denied',
    'invalid_model_output',
    'unsupported_capability',
  ]);
});

test('isModelProviderError recognizes coded errors only', () => {
  assert.equal(isModelProviderError(new ModelProviderError('rate_limited', 'x')), true);
  assert.equal(isModelProviderError({ code: 'model_unavailable' }), true);
  assert.equal(isModelProviderError(new Error('nope')), false);
  assert.equal(isModelProviderError({ code: 'something_else' }), false);
  assert.equal(isModelProviderError(null), false);
});

/* ---------------------------------------------------------------------------
 * AgentModel: validated operations
 * ------------------------------------------------------------------------- */

test('ownerMessage returns a schema-valid result from the mock provider', async () => {
  const model = createAgentModel(createMockModelProvider());
  const outcome = await model.ownerMessage({ system: 'sys', messages: CHAT });
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(validateOwnerAgentResult(outcome.value), null);
    assert.ok(outcome.value.memoryProposal);
  }
});

test('invalid JSON is retried exactly once, then invalid_model_output', async () => {
  let calls = 0;
  const model = createAgentModel(textProvider(async () => { calls += 1; return 'not json'; }));
  const outcome = await model.ownerMessage({ system: 'sys', messages: CHAT });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error.code, 'invalid_model_output');
  assert.equal(calls, 2);
});

test('schema-invalid output is retried once, then rejected', async () => {
  let calls = 0;
  const model = createAgentModel(textProvider(async () => {
    calls += 1;
    return JSON.stringify({ reply: 'ok', cardUpdateSuggested: 'no' });
  }));
  const outcome = await model.ownerMessage({ system: 'sys', messages: CHAT });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error.code, 'invalid_model_output');
  assert.equal(calls, 2);
});

test('typed provider errors surface without retry', async () => {
  let calls = 0;
  const model = createAgentModel(textProvider(async () => {
    calls += 1;
    throw new ModelProviderError('rate_limited', 'provider rate limit reached');
  }));
  const outcome = await model.ownerMessage({ system: 'sys', messages: CHAT });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error.code, 'rate_limited');
  assert.equal(calls, 1);
});

test('foreign provider errors map to model_unavailable with a static message', async () => {
  const model = createAgentModel(textProvider(async () => {
    throw new Error('socket hangup with Authorization: Bearer sk-secret-1');
  }));
  const outcome = await model.ownerMessage({ system: 'sys', messages: CHAT });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.error.code, 'model_unavailable');
    assert.ok(!outcome.error.message.includes('sk-secret-1'));
    assert.ok(!outcome.error.message.includes('socket'));
  }
});

test('ownerMessage drops referencedMemoryIds that are not confirmed memories', async () => {
  const model = createAgentModel(textProvider(async () => JSON.stringify({
    reply: '还记得你上次说的。',
    memoryProposal: null,
    cardUpdateSuggested: false,
    referencedMemoryIds: ['mem-real', 'mem-fake'],
  })));
  const outcome = await model.ownerMessage({
    system: 'sys',
    messages: CHAT,
    validMemoryIds: ['mem-real'],
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.deepEqual(outcome.value.referencedMemoryIds, ['mem-real']);

  const noneValid = await model.ownerMessage({ system: 'sys', messages: CHAT, validMemoryIds: [] });
  assert.equal(noneValid.ok, true);
  if (noneValid.ok) assert.equal(noneValid.value.referencedMemoryIds, undefined);
});

test('visitorMessage validates against the visitor schema', async () => {
  const model = createAgentModel(textProvider(async () => JSON.stringify({
    reply: '我是他的 AI 分身。',
    evidenceRefs: ['mem:1'],
    nextAction: 'continue',
  })));
  const outcome = await model.visitorMessage({ system: 'sys', messages: CHAT });
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal(validateVisitorAgentResult(outcome.value), null);
});

test('summarizeConnection validates against the summary schema', async () => {
  const model = createAgentModel(textProvider(async () => JSON.stringify({
    recommendation: 'need_more_context',
    why: ['理由不够具体'],
    uncertainty: '缺少共同点',
    suggestedTopic: '补充一个具体话题',
    evidenceRefs: ['req:reason'],
  })));
  const outcome = await model.summarizeConnection({ system: 'sys', messages: CHAT });
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal(validateConnectionSummary(outcome.value), null);
});

test('generateCardDraft validates and normalizes the draft in a single attempt', async () => {
  let calls = 0;
  const model = createAgentModel(textProvider(async () => {
    calls += 1;
    return JSON.stringify({
      headline: ' 在做 AI 名片 ',
      canHelpWith: [' 取舍 ', 7],
      keptFields: ['headline'],
    });
  }));
  const outcome = await model.generateCardDraft({ system: 'sys', messages: CHAT });
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.value.draft.headline, '在做 AI 名片');
    assert.deepEqual(outcome.value.draft.canHelpWith, ['取舍']);
    assert.deepEqual(outcome.value.keptFields, ['headline']);
  }
  assert.equal(calls, 1, 'card draft is a single attempt (mirrors the cloud runner)');
});

test('generateCardDraft rejects an empty draft as invalid_model_output', async () => {
  const model = createAgentModel(textProvider(async () => '{}'));
  const outcome = await model.generateCardDraft({ system: 'sys', messages: CHAT });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error.code, 'invalid_model_output');
});

/* ---------------------------------------------------------------------------
 * Reference deterministic mock
 * ------------------------------------------------------------------------- */

test('mock provider is deterministic and declares text + structured output', async () => {
  const a = createMockModelProvider();
  const b = createMockModelProvider();
  assert.equal(a.name, 'mock');
  assert.deepEqual(a.capabilities, TEXT_STRUCTURED_CAPABILITIES);
  const input = { system: 'sys', messages: CHAT };
  assert.equal(await a.complete(input), await b.complete(input));
});

test('mock provider covers all four agent paths with schema-valid output', async () => {
  const mock = createMockModelProvider();
  const model = createAgentModel(mock);

  const owner = await model.ownerMessage({ system: 'owner sys', messages: CHAT });
  assert.equal(owner.ok, true);

  const visitor = await model.visitorMessage({
    system: '你是主人的 AI 分身。\n- [mem:m1] 做过 AI 小程序',
    messages: [{ role: 'user', content: '怎么联系他？' }],
  });
  assert.equal(visitor.ok, true);
  if (visitor.ok) assert.equal(visitor.value.boundaryCode, 'contact_request');

  const summary = await model.summarizeConnection({
    system: '你在为主人总结一个连接请求。\n- [req:reason] 理由：想交流一次权限设计的具体实现方案\n- [req:shared_context] 可能的共同点：都在做个人 AI',
    messages: CHAT,
  });
  assert.equal(summary.ok, true);

  const draft = await model.generateCardDraft({
    system: '你在为主人的 VibeCard 起草更新建议。',
    messages: CHAT,
  });
  assert.equal(draft.ok, true);
});
