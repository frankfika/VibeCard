/**
 * Provider adapter tests (task 5.4).
 *
 * The OpenAI-compatible HTTP provider is exercised against a LOCAL stub
 * server only — never a real API. The stub wraps the deterministic mock
 * provider in an OpenAI-style envelope, so the same behavior assertions run
 * against both providers and must produce identical results. Switching
 * provider is configuration, not business logic.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const {
  PROVIDER_ERROR_CODES,
  ProviderError,
  isProviderError,
  requireProviderCapability,
  safeErrorForLog,
  resolveChatCompletionsUrl,
  createMockProvider,
  createHttpProvider,
  getProvider,
} = require('../lib/providers');
const { runOwnerAgent, runVisitorAgent, runCardDraft, runConnectionSummary } = require('../lib/agent');

const CHAT = [{ role: 'user', content: '我最近想认识真正做过 AI 社交产品的人。' }];

/** Start a stub OpenAI-compatible server. `handler(body, req)` -> { status, json }. */
function startStubServer(handler) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', async () => {
      const outcome = await handler(raw ? JSON.parse(raw) : {}, req);
      const body = JSON.stringify(outcome.json);
      res.writeHead(outcome.status, { 'Content-Type': 'application/json' });
      res.end(body);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

/** Envelope helper: wrap raw model text as an OpenAI chat-completion response. */
function envelope(content) {
  return { status: 200, json: { choices: [{ message: { role: 'assistant', content } }] } };
}

/** A stub server whose "model" is the deterministic mock provider itself. */
async function startMockBackedServer(seen = {}) {
  const mock = createMockProvider();
  return startStubServer(async (body, req) => {
    seen.authorization = req.headers.authorization;
    const system = (body.messages || []).find(m => m.role === 'system');
    const messages = (body.messages || []).filter(m => m.role !== 'system');
    const content = await mock.complete({ system: system ? system.content : '', messages });
    return envelope(content);
  });
}

/* ---------------------------------------------------------------------------
 * Same behavior with mock and OpenAI-compatible providers
 * ------------------------------------------------------------------------- */

test('behavior parity: mock and OpenAI-compatible providers produce identical agent results', async () => {
  const { server, baseUrl } = await startMockBackedServer();
  try {
    const mock = createMockProvider();
    const httpProvider = createHttpProvider({ baseUrl, apiKey: 'test-key', model: 'stub-model' });

    const ownerMock = await runOwnerAgent({ provider: mock, memories: [], messages: CHAT });
    const ownerHttp = await runOwnerAgent({ provider: httpProvider, memories: [], messages: CHAT });
    assert.deepEqual(ownerHttp, ownerMock);
    assert.equal(ownerHttp.ok, true);
    assert.ok(ownerHttp.result.memoryProposal);

    const visitorArgs = {
      card: { name: '陈放', headline: '在做 AI 名片', currentFocus: 'AI 分身' },
      publicMemories: [{ _id: 'm1', kind: 'fact', content: '做过 AI 小程序' }],
      agentMemories: [],
      nowItems: [{ _id: 'n1', text: '最近在打磨访客对话' }],
      messages: [{ role: 'user', content: '他最近在做什么？' }],
      roundCount: 0,
    };
    const visitorMock = await runVisitorAgent({ provider: mock, ...visitorArgs });
    const visitorHttp = await runVisitorAgent({ provider: httpProvider, ...visitorArgs });
    assert.deepEqual(visitorHttp, visitorMock);
    assert.equal(visitorHttp.ok, true);

    const request = { reason: '想深入交流一次 AI 分身的权限设计具体实现', possibleSharedContext: ['都在做个人 AI 产品'], visitorSummary: '独立开发者' };
    const summaryMock = await runConnectionSummary({ provider: mock, request });
    const summaryHttp = await runConnectionSummary({ provider: httpProvider, request });
    assert.deepEqual(summaryHttp, summaryMock);
    assert.equal(summaryHttp.ok, true);

    const memories = [{ kind: 'fact', content: '做过 AI 小程序', status: 'confirmed' }];
    const draftMock = await runCardDraft({ provider: mock, memories });
    const draftHttp = await runCardDraft({ provider: httpProvider, memories });
    assert.deepEqual(draftHttp, draftMock);
    assert.equal(draftHttp.ok, true);
  } finally {
    server.close();
  }
});

/* ---------------------------------------------------------------------------
 * Request shaping and credentials
 * ------------------------------------------------------------------------- */

test('http provider posts to /v1/chat/completions and sends the key only as a bearer header', async () => {
  const seen = {};
  const { server, baseUrl } = await startStubServer(async (body, req) => {
    seen.path = req.url;
    seen.authorization = req.headers.authorization;
    seen.model = body.model;
    seen.responseFormat = body.response_format;
    seen.systemFirst = body.messages[0].role === 'system';
    return envelope(JSON.stringify({ reply: '好', memoryProposal: null, cardUpdateSuggested: false }));
  });
  try {
    const provider = createHttpProvider({ baseUrl, apiKey: 'sk-secret-123', model: 'm-x' });
    assert.equal(provider.name, 'http');
    assert.equal(provider.hasKey, true);
    const raw = await provider.complete({ system: 'sys', messages: [{ role: 'user', content: 'hi' }] });
    assert.ok(raw.includes('好'));
    assert.equal(seen.path, '/v1/chat/completions');
    assert.equal(seen.authorization, 'Bearer sk-secret-123');
    assert.equal(seen.model, 'm-x');
    assert.deepEqual(seen.responseFormat, { type: 'json_object' });
    assert.equal(seen.systemFirst, true);
  } finally {
    server.close();
  }
});

test('keyless local endpoint (Ollama-style /v1 base) works without an Authorization header', async () => {
  const seen = {};
  const { server, baseUrl } = await startStubServer(async (body, req) => {
    seen.path = req.url;
    seen.authorization = req.headers.authorization;
    return envelope(JSON.stringify({ reply: '好', memoryProposal: null, cardUpdateSuggested: false }));
  });
  try {
    const provider = createHttpProvider({ baseUrl: `${baseUrl}/v1`, model: 'qwen-local' });
    assert.equal(provider.hasKey, false);
    await provider.complete({ system: '', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(seen.path, '/v1/chat/completions', 'a /v1 base keeps its path');
    assert.equal(seen.authorization, undefined, 'no key -> no Authorization header');
  } finally {
    server.close();
  }
});

test('resolveChatCompletionsUrl handles plain and /v1 bases', () => {
  assert.equal(resolveChatCompletionsUrl('https://api.example.com'), 'https://api.example.com/v1/chat/completions');
  assert.equal(resolveChatCompletionsUrl('https://api.example.com/'), 'https://api.example.com/v1/chat/completions');
  assert.equal(resolveChatCompletionsUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1/chat/completions');
  assert.equal(resolveChatCompletionsUrl('http://localhost:11434/v1/'), 'http://localhost:11434/v1/chat/completions');
});

/* ---------------------------------------------------------------------------
 * Typed error mapping — raw provider errors never leak
 * ------------------------------------------------------------------------- */

test('provider errors map to stable typed codes', async () => {
  const cases = [
    { status: 429, code: 'rate_limited' },
    { status: 401, code: 'permission_denied' },
    { status: 403, code: 'permission_denied' },
    { status: 500, code: 'model_unavailable' },
  ];
  for (const { status, code } of cases) {
    const { server, baseUrl } = await startStubServer(async () => ({
      status,
      json: { error: { message: `upstream detail with sk-secret-123 must not leak` } },
    }));
    try {
      const provider = createHttpProvider({ baseUrl, apiKey: 'sk-secret-123', model: 'm' });
      await assert.rejects(
        provider.complete({ system: '', messages: [] }),
        (error) => {
          assert.ok(isProviderError(error));
          assert.equal(error.code, code);
          assert.ok(!error.message.includes('sk-secret-123'), 'error must not leak upstream body');
          assert.ok(!error.message.includes('upstream detail'), 'error must not leak upstream body');
          return true;
        },
      );
    } finally {
      server.close();
    }
  }
});

test('bad envelope and non-JSON success responses map to invalid_model_output', async () => {
  const { server, baseUrl } = await startStubServer(async () => ({ status: 200, json: { nope: true } }));
  try {
    const provider = createHttpProvider({ baseUrl, apiKey: 'k', model: 'm' });
    await assert.rejects(provider.complete({ system: '', messages: [] }), (error) => {
      assert.equal(error.code, 'invalid_model_output');
      return true;
    });
  } finally {
    server.close();
  }
});

test('a hanging endpoint maps to model_unavailable after the timeout', async () => {
  const server = http.createServer(() => { /* never respond */ });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const provider = createHttpProvider({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      apiKey: 'k',
      model: 'm',
      timeoutMs: 50,
    });
    await assert.rejects(provider.complete({ system: '', messages: [] }), (error) => {
      assert.ok(isProviderError(error));
      assert.equal(error.code, 'model_unavailable');
      return true;
    });
  } finally {
    server.close();
  }
});

test('unreachable endpoint maps to model_unavailable', async () => {
  const provider = createHttpProvider({ baseUrl: 'http://127.0.0.1:1', apiKey: 'k', model: 'm', timeoutMs: 500 });
  await assert.rejects(provider.complete({ system: '', messages: [] }), (error) => {
    assert.equal(error.code, 'model_unavailable');
    return true;
  });
});

test('agent runners surface typed provider errors without retrying', async () => {
  let calls = 0;
  const limited = { async complete() { calls += 1; throw new ProviderError('rate_limited', 'provider rate limit reached'); } };
  const outcome = await runOwnerAgent({ provider: limited, memories: [], messages: CHAT });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, 'rate_limited');
  assert.equal(calls, 1, 'typed provider errors are not retried');
});

test('PROVIDER_ERROR_CODES is the stable §12 provider vocabulary', () => {
  assert.deepEqual(PROVIDER_ERROR_CODES, [
    'model_unavailable',
    'rate_limited',
    'permission_denied',
    'invalid_model_output',
    'unsupported_capability',
  ]);
});

/* ---------------------------------------------------------------------------
 * Capabilities
 * ------------------------------------------------------------------------- */

test('providers declare capabilities; unsupported capability fails clearly', async () => {
  const mock = createMockProvider();
  const httpP = createHttpProvider({ baseUrl: 'http://localhost:11434/v1', model: 'm' });
  for (const provider of [mock, httpP]) {
    assert.deepEqual(provider.capabilities, {
      text: true,
      structuredOutput: true,
      embeddings: false,
      vision: false,
      audio: false,
    });
    assert.throws(
      () => requireProviderCapability(provider, 'embeddings'),
      (error) => {
        assert.ok(isProviderError(error));
        assert.equal(error.code, 'unsupported_capability');
        return true;
      },
    );
    assert.doesNotThrow(() => requireProviderCapability(provider, 'text'));
  }
});

/* ---------------------------------------------------------------------------
 * Logging discipline
 * ------------------------------------------------------------------------- */

test('safeErrorForLog redacts keys and bearer tokens', () => {
  assert.equal(safeErrorForLog(new ProviderError('rate_limited', 'provider rate limit reached')), 'provider_rate_limited');
  const foreign = new Error('request to https://x?api_key=sk-secret-123 failed with Bearer abc.def.ghi');
  const logged = safeErrorForLog(foreign);
  assert.ok(!logged.includes('sk-secret-123'));
  assert.ok(!logged.includes('abc.def.ghi'));
  assert.equal(safeErrorForLog(null), 'unknown_error');
});

test('http provider error messages never contain the configured key', async () => {
  const { server, baseUrl } = await startStubServer(async () => ({ status: 500, json: {} }));
  try {
    const provider = createHttpProvider({ baseUrl, apiKey: 'sk-do-not-log-9', model: 'm' });
    await assert.rejects(provider.complete({ system: '', messages: [] }), (error) => {
      assert.ok(!String(error.message).includes('sk-do-not-log-9'));
      assert.ok(!String(error.stack || '').includes('sk-do-not-log-9'));
      return true;
    });
  } finally {
    server.close();
  }
});

/* ---------------------------------------------------------------------------
 * Configuration-driven selection (mock vs OpenAI-compatible vs BYOK/local)
 * ------------------------------------------------------------------------- */

test('getProvider: switching provider is configuration only', () => {
  assert.equal(getProvider({}).name, 'mock');
  assert.equal(getProvider({ AI_PROVIDER: 'mock', AI_API_BASE: 'https://x', AI_API_KEY: 'k', AI_MODEL: 'm' }).name, 'mock');
  // Managed / BYOK: base + model + key
  assert.equal(getProvider({ AI_API_BASE: 'https://api.example.com', AI_API_KEY: 'k', AI_MODEL: 'm' }).name, 'http');
  // Explicit OpenAI-compatible selection
  assert.equal(getProvider({ AI_PROVIDER: 'openai-compatible', AI_API_BASE: 'https://api.example.com', AI_API_KEY: 'k', AI_MODEL: 'm' }).name, 'http');
  // Keyless local endpoint (self-hosted Ollama/vLLM/llama.cpp)
  const local = getProvider({ AI_PROVIDER: 'openai-compatible', AI_API_BASE: 'http://localhost:11434/v1', AI_MODEL: 'qwen-local' });
  assert.equal(local.name, 'http');
  assert.equal(local.hasKey, false);
  // Extra static headers from trusted config
  const withHeaders = getProvider({
    AI_API_BASE: 'https://router.example.com',
    AI_API_KEY: 'k',
    AI_MODEL: 'm',
    AI_API_HEADERS: '{"X-Title":"vibecard"}',
  });
  assert.equal(withHeaders.name, 'http');
  // Malformed optional headers never take selection down
  assert.equal(getProvider({ AI_API_BASE: 'https://x', AI_API_KEY: 'k', AI_MODEL: 'm', AI_API_HEADERS: '{bad' }).name, 'http');
  // Incomplete config stays deterministic
  assert.equal(getProvider({ AI_API_BASE: 'https://x' }).name, 'mock');
});
