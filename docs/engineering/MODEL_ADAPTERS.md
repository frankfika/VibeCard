# VibeCard Model Adapters

> Interface source: `packages/shared/model-provider.ts` (Core, platform-free)
> Live adapters: `packages/miniprogram/cloudfunctions/agent/lib/providers.js`
> Behavioral contract: [`AI_BEHAVIOR.md`](AI_BEHAVIOR.md) · Boundary: [`ARCHITECTURE.md`](ARCHITECTURE.md) §6, errors §12

This document describes how the agent talks to models: the provider-neutral
interface, capability declarations, the deterministic mock, the
OpenAI-compatible HTTP adapter (managed, BYOK, local), error taxonomy, and
key-handling rules.

**Self-hosted users never need to call VibeCard Cloud.** Every adapter is
configured with plain server-side environment variables; a local model server
(Ollama, vLLM, llama.cpp) or any OpenAI-compatible endpoint is sufficient to
run the complete agent behavior.

---

## 1. The Provider-Neutral Interface

Core (`packages/shared/model-provider.ts`) defines the boundary. It is pure
TypeScript — no network, no SDK, no env access:

```ts
interface ModelProvider {
  readonly name: string;
  readonly capabilities: ModelProviderCapabilities;
  complete(input: CompletionInput): Promise<string>; // raw model text
  embed?(texts: string[]): Promise<number[][]>;      // only if embeddings
}

interface ModelProviderCapabilities {
  text: boolean;
  structuredOutput: boolean; // native JSON-mode support
  embeddings: boolean;
  vision: boolean;
  audio: boolean;
}
```

`createAgentModel(provider)` wraps any provider with the four typed
operations the agent boundary actually uses (ARCHITECTURE §6):

```ts
agentModel.ownerMessage(input)        -> ModelCallOutcome<OwnerAgentResult>
agentModel.visitorMessage(input)      -> ModelCallOutcome<VisitorAgentResult>
agentModel.generateCardDraft(input)   -> ModelCallOutcome<{ draft, keptFields }>
agentModel.summarizeConnection(input) -> ModelCallOutcome<ConnectionSummary>
```

Every operation converts raw model text into Core schemas and validates it
with the existing validators (`packages/shared/agent-schema.ts`). Invalid
output is retried exactly once, then rejected as `invalid_model_output`. Raw
model text never controls application state.

The WeChat cloud function (`cloudfunctions/agent/lib/agent.js`) runs the same
logic as a hand-maintained JS mirror; `packages/shared/test/parity.test.ts`
proves both sides agree on validated outcomes, error codes, retry budgets,
and mock outputs.

### Adding a provider without touching client pages

A provider is configuration plus one object with `name`, `capabilities`, and
`complete`. Clients only ever receive schema-validated Core results or typed
errors, so no client page changes when a provider is added or swapped.

---

## 2. Capability Declaration

Every provider declares `text`, `structuredOutput`, `embeddings`, `vision`,
and `audio`. The rule is strict:

> Requesting an unsupported capability fails with a typed
> `unsupported_capability` error — never a silent fallback to another model.

Use `requireProviderCapability(provider, 'embeddings')` (Core) or the mirror
in `lib/providers.js` before invoking an optional capability. Both shipped
adapters declare `{ text: true, structuredOutput: true, embeddings: false,
vision: false, audio: false }`.

---

## 3. The Deterministic Mock Provider

- Core reference: `createMockModelProvider()` in
  `packages/shared/mock-provider.ts` (platform-free, zero keys, zero network).
- Cloud mirror: `createMockProvider()` in
  `cloudfunctions/agent/lib/providers.js`.

Outputs are byte-identical across the two (parity-tested). The mock covers
all four agent paths — owner replies with memory/Now proposals, visitor
boundary handling (contact requests, prompt injection, recognition moments),
connection summaries, and Card drafts — so tests, demos, and keyless fallback
never hard-fail. Without any configured endpoint, `getProvider()` returns the
mock.

---

## 4. The OpenAI-Compatible HTTP Adapter

`createHttpProvider` in `cloudfunctions/agent/lib/providers.js` speaks the
chat-completions protocol over plain Node `http`/`https` — no SDK dependency.
It posts to `<base>/v1/chat/completions`, or to `<base>/chat/completions`
when the base already ends in `/v1` (the native shape of Ollama, vLLM, and
llama.cpp). `http://` bases are allowed for loopback/LAN model servers;
managed keys should always use `https://`.

### Configuration (server-side environment only)

| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `mock` or `openai-compatible` (default: auto-detect) |
| `AI_API_BASE` | Endpoint base, e.g. `https://api.example.com` or `http://localhost:11434/v1` |
| `AI_MODEL` | Model name served by the endpoint |
| `AI_API_KEY` | Optional bearer key; omit for keyless local endpoints |
| `AI_API_HEADERS` | Optional JSON object of extra static headers (e.g. router tags) |
| `AI_TIMEOUT_MS` | Optional request timeout (default 15000) |

### Managed / BYOK

BYOK uses exactly the same shape: the user-supplied key and endpoint live in
the trusted runtime configuration (cloud-function env, or the self-hosted
server's env), never in client code, never in a database readable by clients,
never in logs.

```bash
AI_PROVIDER=openai-compatible
AI_API_BASE=https://api.example.com
AI_API_KEY=<user-supplied key>
AI_MODEL=<model name>
```

### Local and private model services (Ollama, vLLM, llama.cpp)

Run any server that exposes an OpenAI-compatible chat-completions endpoint
and point the adapter at it — keyless is fine on a trusted network:

```bash
# Ollama example
ollama serve && ollama pull qwen2.5
AI_PROVIDER=openai-compatible
AI_API_BASE=http://localhost:11434/v1
AI_MODEL=qwen2.5
```

The model must return JSON matching the agent output schemas (the adapter
requests `response_format: { type: "json_object" }`; servers without JSON
mode still work when the model follows the prompt's JSON-only instruction).
Outputs are schema-validated either way, and invalid output follows the same
retry-once-then-typed-error path.

Switching between mock, managed, BYOK, and local is configuration only — no
business-logic or client changes (proven by
`cloudfunctions/agent/test/providers.test.js`, which runs the identical
behavior assertions against the mock and the HTTP adapter over a local stub
server).

---

## 5. Error Taxonomy

Provider failures surface only as stable typed errors (ARCHITECTURE §12 plus
`unsupported_capability`):

| Code | Meaning |
|---|---|
| `model_unavailable` | Network failure, timeout, 5xx, unreachable endpoint |
| `rate_limited` | Provider returned 429 |
| `permission_denied` | Provider rejected credentials (401/403) |
| `invalid_model_output` | Unparseable envelope or schema-invalid output after one retry |
| `unsupported_capability` | A capability was requested that the provider does not declare |

Rules:

- Raw provider error bodies are drained and discarded; typed error messages
  are static and generic.
- Typed provider errors are **not** retried (a 429 must surface, not be
  hammered twice). Only schema-invalid output gets one retry.
- Client-facing action codes come from the same vocabulary; the agent action
  layer maps uncategorized failures to `model_unavailable`.

---

## 6. Key Handling And Logging Rules

- Keys exist only in trusted runtime configuration (cloud-function env or
  self-hosted server env). Never in client code, never in public Card data,
  never in the mini program bundle.
- The key is used exactly once per request: as the `Authorization: Bearer`
  header. It is omitted entirely for keyless local endpoints.
- Provider error messages, stack traces, and upstream bodies never include
  the key; tests assert this.
- Log lines go through `safeErrorForLog`, which redacts bearer tokens,
  `sk-…` key shapes, and `key`/`token` URL parameters, and truncates.
- Logs never include full contact details, private memory content, or
  unredacted private prompts (ARCHITECTURE §13).

---

## 7. Files

```text
packages/shared/model-provider.ts              Core interface, capabilities, errors, AgentModel
packages/shared/mock-provider.ts               Core reference deterministic mock
packages/shared/test/model-provider.test.ts    Core boundary tests
packages/shared/test/parity.test.ts            Core <-> cloud mirror parity (incl. mock + errors)
packages/miniprogram/cloudfunctions/agent/lib/providers.js   Mock + HTTP adapters, config selection
packages/miniprogram/cloudfunctions/agent/lib/agent.js       Validated runners, typed error mapping
packages/miniprogram/cloudfunctions/agent/test/providers.test.js  Adapter tests (local stub server)
```
