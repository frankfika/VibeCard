/**
 * Provider-neutral model boundary (task 5.4 Core).
 *
 * Pure, platform-free TypeScript: no network, no SDK, no env access. A
 * `ModelProvider` is anything that can turn a prompt into raw model text;
 * conversion into Core schemas happens here through the existing validators
 * (`agent-schema.ts`), so raw model text never controls application state
 * (ARCHITECTURE §6, AI_BEHAVIOR §11).
 *
 * Capability declaration: every provider declares what it can do
 * (text / structuredOutput / embeddings / vision / audio). Requesting an
 * unsupported capability fails with a typed `unsupported_capability` error —
 * never a silent fallback.
 *
 * The WeChat cloud function `cloudfunctions/agent/lib/providers.js` is the
 * platform adapter mirror (error codes, mock provider); parity is enforced by
 * `test/parity.test.ts`.
 */

import {
  validateOwnerAgentResult,
  validateVisitorAgentResult,
  validateConnectionSummary,
  validateCardDraft,
} from './agent-schema';
import type {
  OwnerAgentResult,
  VisitorAgentResult,
  ConnectionSummary,
  CardDraft,
} from './agent-schema';

/* ---------------------------------------------------------------------------
 * Capabilities
 * ------------------------------------------------------------------------- */

export const MODEL_CAPABILITIES = [
  'text',
  'structuredOutput',
  'embeddings',
  'vision',
  'audio',
] as const;

export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export interface ModelProviderCapabilities {
  text: boolean;
  structuredOutput: boolean;
  embeddings: boolean;
  vision: boolean;
  audio: boolean;
}

/** A plain chat-completion model: text in, structured JSON text out. */
export const TEXT_STRUCTURED_CAPABILITIES: ModelProviderCapabilities = {
  text: true,
  structuredOutput: true,
  embeddings: false,
  vision: false,
  audio: false,
};

/* ---------------------------------------------------------------------------
 * Typed provider errors (ARCHITECTURE §12 vocabulary + unsupported_capability)
 * ------------------------------------------------------------------------- */

export const PROVIDER_ERROR_CODES = [
  'model_unavailable',
  'rate_limited',
  'permission_denied',
  'invalid_model_output',
  'unsupported_capability',
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

/**
 * The only error shape a provider may surface. Messages are static and
 * generic: keys, request bodies, prompt text, and stack traces never appear
 * in a provider error.
 */
export class ModelProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = 'ModelProviderError';
    this.code = code;
  }
}

export function isModelProviderError(error: unknown): error is ModelProviderError {
  return (
    !!error &&
    typeof error === 'object' &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (PROVIDER_ERROR_CODES as readonly string[]).includes((error as { code: string }).code)
  );
}

/* ---------------------------------------------------------------------------
 * Low-level provider interface
 * ------------------------------------------------------------------------- */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionInput {
  system?: string;
  messages: ChatMessage[];
}

/**
 * A model provider as seen by the agent boundary. `complete` returns raw
 * model text (expected to be JSON, validated downstream). Optional
 * capability methods (e.g. `embed`) exist only when the matching capability
 * flag is true.
 */
export interface ModelProvider {
  readonly name: string;
  readonly capabilities: ModelProviderCapabilities;
  complete(input: CompletionInput): Promise<string>;
  embed?(texts: string[]): Promise<number[][]>;
}

export function providerSupports(provider: ModelProvider, capability: ModelCapability): boolean {
  return !!provider && !!provider.capabilities && provider.capabilities[capability] === true;
}

/**
 * Fail clearly when a capability is not declared. Callers must use this
 * before invoking an optional capability — unsupported means a typed error,
 * never a silent fallback to another model.
 */
export function requireProviderCapability(provider: ModelProvider, capability: ModelCapability): void {
  if (!providerSupports(provider, capability)) {
    throw new ModelProviderError(
      'unsupported_capability',
      `provider does not support ${capability}`,
    );
  }
}

/** Embeddings are opt-in: only a provider declaring the capability may serve them. */
export async function embedWithProvider(provider: ModelProvider, texts: string[]): Promise<number[][]> {
  requireProviderCapability(provider, 'embeddings');
  if (typeof provider.embed !== 'function') {
    throw new ModelProviderError('unsupported_capability', 'provider declares embeddings but has no embed method');
  }
  return provider.embed(texts);
}

/* ---------------------------------------------------------------------------
 * High-level agent operations: raw text -> validated Core results
 * ------------------------------------------------------------------------- */

export type ModelCallOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ProviderErrorCode; message: string } };

export interface AgentModelInput {
  system: string;
  messages: ChatMessage[];
}

export interface OwnerModelInput extends AgentModelInput {
  /** Ids of the owner's confirmed memories; referenced ids outside this set are dropped. */
  validMemoryIds?: string[];
}

export interface CardDraftModelResult {
  draft: CardDraft;
  keptFields: string[];
}

/**
 * The four typed operations the agent boundary needs (ARCHITECTURE §6). Each
 * returns a schema-validated Core result or a typed error — invalid output is
 * retried exactly once, then rejected as `invalid_model_output`.
 */
export interface AgentModel {
  readonly provider: ModelProvider;
  ownerMessage(input: OwnerModelInput): Promise<ModelCallOutcome<OwnerAgentResult>>;
  visitorMessage(input: AgentModelInput): Promise<ModelCallOutcome<VisitorAgentResult>>;
  generateCardDraft(input: AgentModelInput): Promise<ModelCallOutcome<CardDraftModelResult>>;
  summarizeConnection(input: AgentModelInput): Promise<ModelCallOutcome<ConnectionSummary>>;
}

type StringValidator = (value: unknown) => string | null;

function toOutcomeError(error: unknown): { code: ProviderErrorCode; message: string } {
  if (isModelProviderError(error)) {
    return { code: error.code, message: error.message };
  }
  return { code: 'model_unavailable', message: 'the model is temporarily unavailable' };
}

/**
 * One completion + JSON parse + schema validation. Returns a string
 * validation code, a typed provider error, or the parsed value.
 */
async function callAndValidate(
  provider: ModelProvider,
  input: AgentModelInput,
  validate: StringValidator,
): Promise<{ value?: unknown; validationError?: string; providerError?: { code: ProviderErrorCode; message: string } }> {
  let raw: string;
  try {
    raw = await provider.complete(input);
  } catch (error) {
    return { providerError: toOutcomeError(error) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { validationError: 'invalid_json' };
  }
  const invalid = validate(parsed);
  if (invalid) return { validationError: invalid };
  return { value: parsed };
}

const INVALID_OUTPUT_ERROR = {
  code: 'invalid_model_output' as const,
  message: 'model output failed schema validation',
};

/**
 * Validate with exactly one retry on invalid output. Provider errors are not
 * retried — they are already typed (e.g. rate_limited must surface, not be
 * hammered twice).
 */
async function callValidatedWithRetry<T>(
  provider: ModelProvider,
  input: AgentModelInput,
  validate: StringValidator,
): Promise<ModelCallOutcome<T>> {
  let attempt = await callAndValidate(provider, input, validate);
  if (attempt.providerError) return { ok: false, error: attempt.providerError };
  if (attempt.validationError) {
    attempt = await callAndValidate(provider, input, validate);
    if (attempt.providerError) return { ok: false, error: attempt.providerError };
    if (attempt.validationError) return { ok: false, error: { ...INVALID_OUTPUT_ERROR } };
  }
  return { ok: true, value: attempt.value as T };
}

/**
 * Keep only referenced memory ids that exist among the owner's confirmed
 * memories (task 3.3 mirror of the cloud runner): unknown ids are dropped
 * silently, capped at 3, and the field is removed when nothing real remains.
 */
function filterReferencedMemoryIds(result: OwnerAgentResult, validMemoryIds?: string[]): void {
  if (!result || !Array.isArray(result.referencedMemoryIds)) return;
  const validIds = new Set(validMemoryIds || []);
  const kept = [...new Set(result.referencedMemoryIds.filter((id) => validIds.has(id)))].slice(0, 3);
  if (kept.length > 0) result.referencedMemoryIds = kept;
  else delete result.referencedMemoryIds;
}

/**
 * Wrap any `ModelProvider` as an `AgentModel`. The provider must declare the
 * `text` capability; structured-output validation is enforced by the schema
 * validators regardless of the `structuredOutput` flag (the flag declares
 * native JSON-mode support, used by adapters for request shaping).
 */
export function createAgentModel(provider: ModelProvider): AgentModel {
  requireProviderCapability(provider, 'text');

  return {
    provider,

    async ownerMessage(input) {
      const outcome = await callValidatedWithRetry<OwnerAgentResult>(
        provider,
        input,
        validateOwnerAgentResult,
      );
      if (!outcome.ok) return outcome;
      filterReferencedMemoryIds(outcome.value, input.validMemoryIds);
      return outcome;
    },

    async visitorMessage(input) {
      return callValidatedWithRetry<VisitorAgentResult>(provider, input, validateVisitorAgentResult);
    },

    async generateCardDraft(input) {
      // Single attempt (mirrors the cloud runner): the draft is a suggestion
      // regenerated on demand, so there is nothing idempotent to retry.
      const attempt = await callAndValidate(provider, input, (value) => {
        if (!value || typeof value !== 'object') return 'not_an_object';
        return null;
      });
      if (attempt.providerError) return { ok: false, error: attempt.providerError };
      if (attempt.validationError) return { ok: false, error: { ...INVALID_OUTPUT_ERROR } };
      const { draft, error } = validateCardDraft(attempt.value);
      if (error) {
        return { ok: false, error: { code: 'invalid_model_output', message: `card draft rejected: ${error}` } };
      }
      const keptFields = Array.isArray((attempt.value as { keptFields?: unknown }).keptFields)
        ? ((attempt.value as { keptFields: unknown[] }).keptFields as string[])
        : [];
      return { ok: true, value: { draft, keptFields } };
    },

    async summarizeConnection(input) {
      return callValidatedWithRetry<ConnectionSummary>(provider, input, validateConnectionSummary);
    },
  };
}
