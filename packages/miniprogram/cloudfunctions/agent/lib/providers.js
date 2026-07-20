/**
 * AI provider boundary (tasks 1.2, 5.4).
 *
 * A provider is anything matching the Core `ModelProvider` contract:
 * `name`, `capabilities`, and `complete({ system, messages }) -> string`
 * returning raw model text (expected to be JSON, validated downstream).
 *
 * - Mock provider: fully deterministic, used for tests and as a no-key
 *   fallback so the demo never hard-fails.
 * - HTTP provider: OpenAI-compatible chat-completions endpoint (managed
 *   cloud model, BYOK, or a local/self-hosted server such as Ollama, vLLM,
 *   or llama.cpp). Configured via cloud env vars; the key never leaves the
 *   cloud function and is never logged.
 *
 * Error taxonomy (ARCHITECTURE §12): provider/network failures reject with a
 * typed `ProviderError` whose code is one of PROVIDER_ERROR_CODES. Raw
 * provider error bodies, keys, and stack traces never surface.
 *
 * This file is the platform adapter mirror of the Core
 * `packages/shared/model-provider.ts` + `mock-provider.ts`; parity of error
 * codes and mock outputs is enforced by `packages/shared/test/parity.test.ts`.
 */

const http = require('http');
const https = require('https');

/* ---------------------------------------------------------------------------
 * Typed provider errors (mirror of the Core vocabulary)
 * ------------------------------------------------------------------------- */

const PROVIDER_ERROR_CODES = [
  'model_unavailable',
  'rate_limited',
  'permission_denied',
  'invalid_model_output',
  'unsupported_capability',
];

class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

function isProviderError(error) {
  return !!error && typeof error.code === 'string' && PROVIDER_ERROR_CODES.includes(error.code);
}

const TEXT_STRUCTURED_CAPABILITIES = {
  text: true,
  structuredOutput: true,
  embeddings: false,
  vision: false,
  audio: false,
};

function providerSupports(provider, capability) {
  return !!provider && !!provider.capabilities && provider.capabilities[capability] === true;
}

/**
 * Fail clearly on an undeclared capability — never a silent fallback.
 * Mirror of the Core `requireProviderCapability`.
 */
function requireProviderCapability(provider, capability) {
  if (!providerSupports(provider, capability)) {
    throw new ProviderError('unsupported_capability', `provider does not support ${capability}`);
  }
}

/**
 * Redaction for log lines: strip anything that looks like a bearer token or
 * common API-key shape, and truncate. Provider errors already carry static
 * messages; this is the safety net for foreign errors.
 */
function safeErrorForLog(error) {
  if (!error) return 'unknown_error';
  if (isProviderError(error)) return `provider_${error.code}`;
  const message = typeof error.message === 'string' ? error.message : 'unknown_error';
  return message
    .replace(/bearer\s+\S+/gi, 'bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .replace(/[?&](api[-_]?key|key|token)=\S+/gi, '$1=[redacted]')
    .slice(0, 200);
}

/* ---------------------------------------------------------------------------
 * Deterministic mock provider
 * ------------------------------------------------------------------------- */

const MEMORY_WORTHY = ['想认识', '最近', '喜欢', '不喜欢', '不希望', '不要', '边界', '在做', '记住'];

const INJECTION_PATTERN = /ignore\s+(all\s+|previous\s+)?instructions|system\s*prompt|打印.*提示|显示.*提示词|你的提示词|忽略.*指令|我是主人/i;
const CONTACT_REQUEST_PATTERN = /微信号?|联系方式|手机号|电话|邮箱|怎么联系|contact|wechat/i;
const GROUNDED_PATTERN = /在做什么|最近|做什么|专注|方向|想了解|想认识|能帮|擅长/;

/**
 * Deterministic visitor-mode reply, keyed off the last visitor message and
 * the evidence ids present in the system prompt. The mock never quotes
 * memory content — it only cites evidence ids — so it can never leak
 * agent_only material into a reply.
 */
function mockVisitorReply(system, text) {
  if (INJECTION_PATTERN.test(text)) {
    return {
      reply: '这个我做不到。我只是他的 AI 分身，只能聊和他有关的事。如果你想认识他，可以告诉我具体的理由。',
      evidenceRefs: [],
      nextAction: 'continue',
      boundaryCode: 'prompt_injection',
    };
  }
  if (CONTACT_REQUEST_PATTERN.test(text)) {
    return {
      reply: '联系方式我不会给，这要他本人决定。你可以告诉我为什么想认识他，我会原样转达，由他来选要不要交换。',
      evidenceRefs: [],
      nextAction: 'invite_connection_reason',
      boundaryCode: 'contact_request',
    };
  }
  // Recognition moment (task 3.3): the visitor states a concrete overlap
  // with the owner's public evidence -> the mock cites one sharedContext item.
  if (/我也/.test(text)) {
    return {
      reply: '这个交集挺具体的，值得放进你想认识他的理由里。是什么让你也开始做这件事的？',
      evidenceRefs: [],
      nextAction: 'invite_connection_reason',
      sharedContext: ['双方都在做个人 AI 分身'],
    };
  }
  if (GROUNDED_PATTERN.test(text)) {
    let refs = [...system.matchAll(/\[(now:[^\]]+|mem:[^\]]+|card:[^\]]+)\]/g)].map(m => m[1]).slice(0, 2);
    // Recent-context questions (task 4.5): prefer Now items, then public
    // current-focus memory; if neither exists, admit uncertainty below
    // instead of citing unrelated evidence.
    if (/最近/.test(text)) {
      refs = [...system.matchAll(/\[(now:[^\]]+|card:currentFocus)\]/g)].map(m => m[1]).slice(0, 2);
    }
    if (refs.length > 0) {
      return {
        reply: '这个我知道一些，都写在他的公开名片上。你可以顺着证据里的方向问得更具体一点，或者告诉我你为什么想认识他。',
        evidenceRefs: refs,
        nextAction: 'continue',
      };
    }
  }
  return {
    reply: '这件事他还没有告诉我，我不想替他猜。',
    evidenceRefs: [],
    nextAction: 'continue',
  };
}

/**
 * Deterministic connection summary. Strength is derived from the evidence
 * lines themselves: a specific reason plus shared context is strong;
 * anything thinner stays cautious.
 */
function mockConnectionSummary(system) {
  const reason = (system.match(/理由：([^\n]*)/) || [])[1] || '';
  const context = (system.match(/可能的共同点：([^\n]*)/) || [])[1] || '';
  const strong = reason.trim().length >= 20 && context.trim().length > 0 && context.trim() !== '（无）';
  if (strong) {
    return {
      recommendation: 'worth_a_conversation',
      why: ['对方给出了具体的认识理由', '双方有明确的共同话题'],
      uncertainty: '对方更想深入合作，还是只交流一次想法',
      suggestedTopic: '从你们都关心的共同话题切入，聊聊彼此正在做的事',
      evidenceRefs: ['req:reason', 'req:shared_context'],
    };
  }
  return {
    recommendation: 'need_more_context',
    why: ['对方提交了连接请求，但写下的理由还不够具体'],
    uncertainty: '理由偏空泛、缺少共同点，无法判断真实的连接意图',
    suggestedTopic: '请对方补充一个具体想交流的话题，再作判断',
    evidenceRefs: ['req:reason'],
  };
}

function createMockProvider() {
  return {
    name: 'mock',
    capabilities: { ...TEXT_STRUCTURED_CAPABILITIES },
    async complete({ system, messages }) {
      // Deterministic Card draft for the draft-generation path.
      if (system && system.includes('VibeCard 起草更新建议')) {
        return JSON.stringify({
          headline: '在做一张会越来越懂你的 AI 名片',
          currentFocus: '打磨访客和分身的前六轮对话，让「先理解，再认识」真的成立。',
          canHelpWith: ['AI 社交产品的取舍', '微信小程序从 0 到 1'],
          wantsToMeet: ['真正做过 AI 社交产品的人'],
          topics: ['个人 AI 分身', '隐私边界'],
          highlights: [{ title: 'VibeCard：一张会越来越懂你的 AI 名片' }],
          keptFields: [],
        });
      }
      // Deterministic connection summary for the owner-inbox path.
      if (system && system.includes('总结一个连接请求')) {
        return JSON.stringify(mockConnectionSummary(system));
      }
      // Deterministic visitor-mode replies, identified by the persona marker.
      if (system && system.includes('AI 分身')) {
        const lastVisitor = [...messages].reverse().find(m => m.role === 'user');
        return JSON.stringify(mockVisitorReply(system, lastVisitor ? lastVisitor.content : ''));
      }
      const lastUser = [...messages].reverse().find(m => m.role === 'user');
      const text = lastUser ? lastUser.content : '';
      const worthy = MEMORY_WORTHY.some(k => text.includes(k));
      // Recognition moment (task 3.3): the owner talks about something they
      // said before -> the mock cites the first confirmed memory id it can
      // see in the system prompt.
      const recall = /上次|之前|还记得/.test(text);
      const memoryIds = system ? [...system.matchAll(/^- \[mem:([^\]]+)\]/gm)].map(m => m[1]) : [];
      const result = {
        reply: worthy
          ? '这句话值得被记住。我大概懂你的意思了，还有别的想让我知道的吗？'
          : '嗯，我听着。说得多一点，我就更懂你一点。',
        memoryProposal: worthy
          ? {
              kind: 'preference',
              content: text.length > 40 ? `${text.slice(0, 40)}…` : text,
              suggestedVisibility: 'private',
              sourceMessageIds: [],
            }
          : null,
        cardUpdateSuggested: false,
        // Now proposal (task 4.5): a concrete recent update is proposed as a
        // draft only — never published by the agent.
        nowProposal: /最近在|刚完成|完成了/.test(text)
          ? {
              text: text.length > 60 ? `${text.slice(0, 60)}…` : text,
              topic: /刚完成|完成了/.test(text) ? 'completed_work' : 'current_work',
              expiresAt: null,
            }
          : null,
        ...(recall && memoryIds.length > 0 ? { referencedMemoryIds: memoryIds.slice(0, 1) } : {}),
      };
      return JSON.stringify(result);
    },
  };
}

/* ---------------------------------------------------------------------------
 * OpenAI-compatible HTTP provider
 * ------------------------------------------------------------------------- */

/**
 * Resolve the chat-completions URL. A base URL ending in `/v1` (the native
 * shape served by Ollama, vLLM, and llama.cpp) gets `/chat/completions`
 * appended; any other base gets the full `/v1/chat/completions` path.
 */
function resolveChatCompletionsUrl(baseUrl) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

/** Map an HTTP status to a stable typed error. The response body is discarded. */
function errorForStatus(statusCode) {
  if (statusCode === 429) return new ProviderError('rate_limited', 'provider rate limit reached');
  if (statusCode === 401 || statusCode === 403) {
    return new ProviderError('permission_denied', 'provider rejected the configured credentials');
  }
  return new ProviderError('model_unavailable', 'the model is temporarily unavailable');
}

/**
 * OpenAI-compatible chat-completions provider.
 *
 * - `apiKey` is optional so keyless local endpoints (Ollama, llama.cpp)
 *   work; when present it is sent as a bearer token and never logged.
 * - `headers` merges extra static headers (e.g. a router's tracking header);
 *   they come from trusted runtime config, never from client input.
 * - http:// bases are allowed for loopback/LAN model servers; managed keys
 *   should always use https:// bases.
 */
function createHttpProvider({ baseUrl, apiKey, model, headers = {}, timeoutMs = 15000 }) {
  if (!baseUrl || !model) {
    throw new ProviderError('model_unavailable', 'http provider requires baseUrl and model');
  }
  const endpoint = resolveChatCompletionsUrl(baseUrl);
  const url = new URL(endpoint);
  const transport = url.protocol === 'http:' ? http : https;

  return {
    name: 'http',
    capabilities: { ...TEXT_STRUCTURED_CAPABILITIES },
    endpoint,
    model,
    hasKey: !!apiKey,
    async complete({ system, messages }) {
      const body = JSON.stringify({
        model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages,
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      });

      return new Promise((resolve, reject) => {
        const req = transport.request(
          {
            method: 'POST',
            hostname: url.hostname,
            path: url.pathname + url.search,
            port: url.port || (url.protocol === 'http:' ? 80 : 443),
            headers: {
              'Content-Type': 'application/json',
              ...headers,
              // The key is only ever used here, server-side, and never logged.
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
              'Content-Length': Buffer.byteLength(body),
            },
            timeout: timeoutMs,
          },
          (res) => {
            // Drain and discard error bodies: they can echo request material
            // and must never reach logs or clients.
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
              if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(errorForStatus(res.statusCode));
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                const content = parsed.choices?.[0]?.message?.content;
                if (typeof content !== 'string') reject(new ProviderError('invalid_model_output', 'provider returned an unrecognized envelope'));
                else resolve(content);
              } catch {
                reject(new ProviderError('invalid_model_output', 'provider returned an unrecognized envelope'));
              }
            });
          },
        );
        req.on('timeout', () => { req.destroy(new ProviderError('model_unavailable', 'provider request timed out')); });
        req.on('error', (error) => {
          reject(isProviderError(error) ? error : new ProviderError('model_unavailable', 'the model is temporarily unavailable'));
        });
        req.write(body);
        req.end();
      });
    },
  };
}

/* ---------------------------------------------------------------------------
 * Configuration-driven provider selection
 * ------------------------------------------------------------------------- */

/**
 * Pick a provider from the cloud environment. Without a configured endpoint
 * the mock provider keeps everything deterministic — secrets never ship to
 * any client.
 *
 * Configuration (all server-side only):
 *   AI_PROVIDER        'mock' | 'openai-compatible' (default: auto)
 *   AI_API_BASE        endpoint base, e.g. https://api.example.com or
 *                      http://localhost:11434/v1 (Ollama)
 *   AI_MODEL           model name served by the endpoint
 *   AI_API_KEY         optional bearer key (BYOK); omit for keyless local
 *   AI_API_HEADERS     optional JSON object of extra static headers
 *   AI_TIMEOUT_MS      optional request timeout (default 15000)
 *
 * The same shape serves managed keys, BYOK, and local/self-hosted endpoints;
 * self-hosted deployments never need to call VibeCard Cloud.
 */
function getProvider(env = process.env) {
  if (env.AI_PROVIDER === 'mock') return createMockProvider();
  const wantsHttp = env.AI_PROVIDER === 'openai-compatible' || env.AI_PROVIDER === 'http';
  if (env.AI_API_BASE && env.AI_MODEL && (env.AI_API_KEY || wantsHttp)) {
    let extraHeaders = {};
    if (env.AI_API_HEADERS) {
      try {
        const parsed = JSON.parse(env.AI_API_HEADERS);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) extraHeaders = parsed;
      } catch {
        // Malformed optional headers must not take the agent down; ignore them.
      }
    }
    const timeoutMs = Number.parseInt(env.AI_TIMEOUT_MS || '', 10);
    return createHttpProvider({
      baseUrl: env.AI_API_BASE,
      apiKey: env.AI_API_KEY || '',
      model: env.AI_MODEL,
      headers: extraHeaders,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000,
    });
  }
  return createMockProvider();
}

module.exports = {
  PROVIDER_ERROR_CODES,
  ProviderError,
  isProviderError,
  TEXT_STRUCTURED_CAPABILITIES,
  providerSupports,
  requireProviderCapability,
  safeErrorForLog,
  resolveChatCompletionsUrl,
  createMockProvider,
  createHttpProvider,
  getProvider,
};
