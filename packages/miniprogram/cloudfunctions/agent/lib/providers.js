/**
 * AI provider boundary (task 1.2).
 *
 * A provider is anything with `complete({ system, messages }) -> string`
 * returning raw model text (expected to be JSON, validated downstream).
 *
 * - Mock provider: fully deterministic, used for tests and as a no-key
 *   fallback so the demo never hard-fails.
 * - HTTP provider: OpenAI-compatible chat-completions endpoint, configured
 *   via cloud env vars (AI_API_BASE / AI_API_KEY / AI_MODEL). The key never
 *   leaves the cloud function and is never logged.
 */

const https = require('https');

const MEMORY_WORTHY = ['想认识', '最近', '喜欢', '不喜欢', '不希望', '不要', '边界', '在做', '记住'];

function createMockProvider() {
  return {
    name: 'mock',
    async complete({ messages }) {
      const lastUser = [...messages].reverse().find(m => m.role === 'user');
      const text = lastUser ? lastUser.content : '';
      const worthy = MEMORY_WORTHY.some(k => text.includes(k));
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
      };
      return JSON.stringify(result);
    },
  };
}

function createHttpProvider({ baseUrl, apiKey, model, timeoutMs = 15000 }) {
  return {
    name: 'http',
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

      const url = new URL('/v1/chat/completions', baseUrl);

      return new Promise((resolve, reject) => {
        const req = https.request(
          {
            method: 'POST',
            hostname: url.hostname,
            path: url.pathname,
            port: url.port || 443,
            headers: {
              'Content-Type': 'application/json',
              // The key is only ever used here, server-side, and never logged.
              Authorization: `Bearer ${apiKey}`,
              'Content-Length': Buffer.byteLength(body),
            },
            timeout: timeoutMs,
          },
          (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
              if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`provider_http_${res.statusCode}`));
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                const content = parsed.choices?.[0]?.message?.content;
                if (typeof content !== 'string') reject(new Error('provider_bad_envelope'));
                else resolve(content);
              } catch {
                reject(new Error('provider_bad_envelope'));
              }
            });
          },
        );
        req.on('timeout', () => { req.destroy(new Error('provider_timeout')); });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    },
  };
}

/**
 * Pick a provider from the cloud environment. Without a configured key the
 * mock provider keeps everything deterministic — secrets never ship to any
 * client.
 */
function getProvider(env = process.env) {
  if (env.AI_PROVIDER === 'mock') return createMockProvider();
  if (env.AI_API_BASE && env.AI_API_KEY && env.AI_MODEL) {
    return createHttpProvider({ baseUrl: env.AI_API_BASE, apiKey: env.AI_API_KEY, model: env.AI_MODEL });
  }
  return createMockProvider();
}

module.exports = { createMockProvider, createHttpProvider, getProvider };
