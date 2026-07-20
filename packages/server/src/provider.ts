/**
 * Model provider selection (task 5.7).
 *
 * Config-driven, zero required keys: the deterministic Core mock by default;
 * an OpenAI-compatible chat-completions endpoint (managed, BYOK, or a local
 * server like Ollama / vLLM / llama.cpp) when `AI_PROVIDER=openai-compatible`.
 * Behavior mirrors docs/engineering/MODEL_ADAPTERS.md — same endpoint shape,
 * error taxonomy, and key-handling rules as the WeChat cloud adapter, using
 * only Node built-ins (global fetch + AbortController, no SDK).
 */

import {
  ModelProviderError,
  TEXT_STRUCTURED_CAPABILITIES,
  createMockModelProvider,
} from '../../shared/index';
import type { CompletionInput, ModelProvider } from '../../shared/index';
import type { ServerConfig } from './config';

/** `<base>/v1/chat/completions`, or `<base>/chat/completions` when base ends in /v1. */
function endpointFor(base: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`;
}

function readContent(payload: unknown): string {
  const choices = (payload as { choices?: unknown[] } | null)?.choices;
  const first = Array.isArray(choices) ? (choices[0] as Record<string, unknown> | undefined) : undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === 'string') return content;
  throw new ModelProviderError('invalid_model_output', 'endpoint returned an unreadable envelope');
}

export function createHttpProvider(options: {
  base: string;
  model: string;
  apiKey: string | null;
  extraHeaders: Record<string, string> | null;
  timeoutMs: number;
}): ModelProvider {
  const url = endpointFor(options.base);
  return {
    name: 'openai-compatible',
    capabilities: { ...TEXT_STRUCTURED_CAPABILITIES },
    async complete(input: CompletionInput): Promise<string> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          ...(options.extraHeaders ?? {}),
        };
        // The key is used exactly once per request, only as the bearer header;
        // it is omitted entirely for keyless local endpoints.
        if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model: options.model,
            messages: [
              ...(input.system ? [{ role: 'system', content: input.system }] : []),
              ...input.messages,
            ],
            response_format: { type: 'json_object' },
          }),
        });
        if (response.status === 429) {
          throw new ModelProviderError('rate_limited', 'provider rate limit reached');
        }
        if (response.status === 401 || response.status === 403) {
          throw new ModelProviderError('permission_denied', 'provider rejected the configured credentials');
        }
        if (!response.ok) {
          // Upstream bodies are drained and discarded; they never surface.
          await response.arrayBuffer().catch(() => undefined);
          throw new ModelProviderError('model_unavailable', 'the model is temporarily unavailable');
        }
        return readContent(await response.json());
      } catch (error) {
        if (error instanceof ModelProviderError) throw error;
        throw new ModelProviderError('model_unavailable', 'the model is temporarily unavailable');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Pick the configured provider. Auto-detect: `AI_API_BASE` present implies
 * openai-compatible; otherwise the keyless deterministic mock. An explicit
 * `openai-compatible` without a base is a configuration error, not a silent
 * fallback to the mock.
 */
export function selectProvider(config: ServerConfig): ModelProvider {
  if (config.aiProvider === 'mock') return createMockModelProvider();
  if (!config.aiApiBase) {
    throw new ModelProviderError(
      'model_unavailable',
      'AI_PROVIDER=openai-compatible requires AI_API_BASE',
    );
  }
  return createHttpProvider({
    base: config.aiApiBase,
    model: config.aiModel ?? 'default',
    apiKey: config.aiApiKey,
    extraHeaders: config.aiApiHeaders,
    timeoutMs: config.aiTimeoutMs,
  });
}
