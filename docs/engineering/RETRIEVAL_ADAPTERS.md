# Retrieval And Knowledge Adapters (Task 5.6)

> Source of truth for retrieval staging: [`ARCHITECTURE.md`](ARCHITECTURE.md) §7 and §18.
> Visibility rules: [`AI_BEHAVIOR.md`](AI_BEHAVIOR.md) §4; prompt-injection posture: §10.

This document describes the retrieval modules landed in `packages/shared/`:
`retrieval.ts`, `retrieval-provider.ts`, and `knowledge.ts`. All three are pure,
platform-free TypeScript — no Node-only modules, no browser globals, no WeChat
APIs, no vendor SDKs (guarded by `test/platform-free.test.ts`).

## Staged Strategy

Retrieval evolves without changing product contracts (ARCHITECTURE §18):

| Stage | What | Where | Status |
|---|---|---|---|
| 1 | Structured filters, recency, kinds, keyword matching | `retrieval.ts` | **Default. Complete.** |
| 2 | Optional embeddings behind `RetrievalProvider` | `retrieval-provider.ts` | Interface + reference impl |
| 3 | Optional reranking for larger knowledge sets | `retrieval-provider.ts` (`Reranker`) | Interface + reference impls |
| 4 | File / note / link / external knowledge ingestion | `knowledge.ts` | Interfaces + reference impls |

Stage 1 is the default and needs **zero embeddings and zero vector store**.
Stages 2–4 are opt-in adapters; turning them on never changes Core records.

## Stage 1: Structured Retrieval (`retrieval.ts`)

`retrieveMemories(input)` runs over an in-memory `Memory[]` list or a
`MemoryRepository`:

```text
filter by ownerId          (cross-owner records dropped first)
-> confirmed (active) only (via memory.ts lifecycle rules)
-> visibility for audience (via visibility.ts — BEFORE anything else)
-> kind filter (kinds param is a filter, not a boost)
-> deterministic scoring
-> sort score desc, id asc; truncate to limit
```

Audiences map 1:1 onto the permission sets in `visibility.ts`:

- `owner` — all four visibilities, quotable (`owner_session`)
- `visitor_quote` — confirmed `public` only, quotable (`visitor_quotable_public`)
- `visitor_boundary` — confirmed `agent_only` only, **never quotable** (`visitor_boundary_agent_only`)

### Scoring function

Fully deterministic — a pure function of `(memory, queryText, now)`. `now` is a
required explicit input; nothing reads a clock and nothing is random.

```text
score = RECENCY + KEYWORD

RECENCY = 1 / (1 + ageInDays / 30)
          1.0 for "just updated", 0.5 at 30 days, decays smoothly toward 0

KEYWORD = min(1.0 * matchedTerms, 3.0)
          query terms = distinct lowercase tokens (unicode letter/number
          runs, length >= 2); a term matches by substring in lowercase content

KIND    = candidate excluded when `kinds` is set and doesn't contain the kind
```

Every `RetrievedMemory` carries `memoryId`, `score`, `matchedReasons`
(e.g. `kind:preference`, `recency:0.500`, `keyword:隐私`), the full
`VisibilityDecision` (which rule allowed it and whether it is quotable), and
source ids (`sourceConversationId`, `sourceMessageIds`) for evidence tracing.

## Stage 2: RetrievalProvider, Embeddings, Vector Store (`retrieval-provider.ts`)

Semantic retrieval lives **only** behind `RetrievalProvider`:

```ts
interface RetrievalProvider {
  readonly name: string;
  readonly semantic: boolean;
  retrieve(input: RetrievalInput): Promise<RetrievedMemory[]>;
}
```

- `createStructuredRetrievalProvider()` — stage 1 as a provider (`semantic: false`).
- `createSemanticRetrievalProvider({ embeddingProvider, vectorStore, memoryRepository })`
  — embeds the query, fetches top-N hits from the owner's vector namespace,
  loads the memories, then applies **the identical
  `permissionFilteredCandidates` visibility filter** before returning.
  Similarity can re-rank permitted memories; it can never admit a forbidden one.

`EmbeddingProvider` aligns with the task-5.4 `ModelProvider.embed` capability:
`embeddingProviderFromModel(provider)` wraps any provider that declares
`embeddings`; a provider without the capability fails with the typed
`unsupported_capability` error, never a silent fallback. The reference
`createHashEmbeddingProvider()` is a deterministic FNV-1a bag-of-tokens +
character-bigrams embedding (bigrams keep unsegmented scripts like Chinese
comparable) for tests and local mode — zero network, zero keys.

`VectorStore` is an interface, not a database:

```ts
interface VectorStore {
  upsert(namespace, entries: { id /* memoryId */, vector }[]): Promise<void>;
  query(namespace, vector, limit): Promise<VectorHit[]>;
  remove(namespace, ids): Promise<void>;       // memory edits/deletes propagate
  dropNamespace(namespace): Promise<void>;     // full removal, no data loss
}
```

Rules:

- Namespaces are owner-scoped (`owner:${ownerId}`); a query can only ever
  touch one owner's namespace, so cross-owner reads are impossible by
  construction.
- Vector entries reference **memoryIds only**. Embeddings and vendor metadata
  never enter Core records (`Memory` has no embedding fields; proven by test —
  records are byte-identical with semantic retrieval on and off).
- **We do not build a vector database.** `createInMemoryVectorStore()` is a
  cosine-similarity reference implementation proving the seam. Suggested
  external stores — PostgreSQL + pgvector, Qdrant, LanceDB, SQLite vector
  extensions — are optional adapters behind this interface; none is required
  by the Core.
- Removability: `dropNamespace` deletes everything the adapter holds about an
  owner while canonical memories and structured retrieval stay fully intact
  (proven by test).

## Stage 3: Reranking

```ts
interface Reranker {
  rerank(items: RetrievedMemory[], input: RetrievalInput): RetrievedMemory[];
}
```

Applied **after** retrieval, via `retrieveWithOptionalRerank(provider, input,
reranker?)`. References: `passThroughReranker` (no-op, proves the seam) and
`createKindBoostReranker(boosts)` (deterministic per-kind score multiplier,
re-sorted score desc / id asc). A cross-encoder or LLM reranker would plug in
behind the same interface.

## Stage 4: Knowledge-Source Adapters (`knowledge.ts`)

Adapters ingest file / note / link / external content into
`ArchiveKnowledgeSource` records (metadata only — the canonical store from
tasks 5.3/5.5) plus `KnowledgeChunk[]`. **The Core never reads files or
fetches URLs**: a platform adapter (Mini Program file picker, self-hosted
fetcher, sync client) supplies raw text as input.

```text
KnowledgeIngestInput { ownerId, title, locator, content, visibility?, maxCharsPerChunk? }
  -> adapter.ingest(input, now, ids)
  -> { source: ArchiveKnowledgeSource, chunks: KnowledgeChunk[] }
```

Reference adapters: `fileKnowledgeAdapter`, `noteKnowledgeAdapter`,
`linkKnowledgeAdapter`, `externalKnowledgeAdapter` (all in
`KNOWLEDGE_SOURCE_ADAPTERS`). Chunking (`chunkContent`) is a deterministic
fixed-window split on whitespace boundaries (default 500 chars): same input,
same chunks, every time.

### Provenance model

Every chunk carries full provenance:

```ts
provenance: {
  sourceId,        // the KnowledgeSource record it belongs to
  chunkIndex,      // 0-based position inside the source
  adapterName,     // e.g. 'file-text'
  kind,            // 'file' | 'url' | 'note' | 'external'
  title, locator,  // filename / URL / note label / external id
  ingestedAt,      // explicit timestamp — the Core reads no clock
}
```

Note: the archive's `ArchiveKnowledgeSource.kind` vocabulary is
`'file' | 'url' | 'note'`; external sources map onto `'note'` at the source
record while chunk provenance preserves `kind: 'external'`. This keeps the
archive contract untouched (recorded as an intentional deviation).

### Visibility discipline for chunks

Chunks inherit the owner-assigned visibility at ingest time; the default is
**owner-private** (`private`) — imported raw data is never public by default
(ARCHITECTURE §16 Raw Data layer). `retrieveKnowledgeChunks` applies the same
visibility-before-retrieval discipline as memory retrieval:

- `owner` audience: all of the owner's chunks (`owner_session`, quotable)
- `visitor` audience: `public` chunks only (`visitor_public_chunk`, quotable)

Scoring mirrors stage 1 (recency + keyword, deterministic, explicit `now`).
Each `RetrievedKnowledgeChunk` carries `chunkId`, `sourceId`, score, matched
reasons, the visibility decision, and full provenance.

## Security Posture (tested)

- **Prompt injection is data, not instructions.** Content stored inside a
  memory or chunk can only affect that record's own keyword/semantic score.
  A `private` memory containing "ignore previous instructions…" is still
  never returned for a visitor audience — even when the visitor queries for
  the injected words — because permission filtering runs on metadata before
  content is ever scored.
- **Cross-owner isolation at every stage.** Owner filtering happens on raw
  lists before anything else; vector namespaces are per-owner; chunk
  retrieval filters by owner first. Owner A's records never surface for
  owner B on the structured, semantic, or knowledge paths.
- **Visibility decisions are explicit output**, not implicit behavior: every
  returned item states the rule that allowed it and whether it is quotable.
