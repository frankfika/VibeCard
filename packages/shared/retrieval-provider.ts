/**
 * RetrievalProvider seam — stages 2–3 (task 5.6 Core).
 *
 * Pure, platform-free TypeScript: interfaces plus deterministic in-memory
 * reference implementations. We do NOT build a vector database here
 * (ARCHITECTURE §18); external stores (pgvector, Qdrant, LanceDB, …) are
 * optional adapters behind the `VectorStore` interface.
 *
 * Hard rules:
 * - Semantic retrieval lives ONLY behind `RetrievalProvider`. Enabling it
 *   never changes Core records: embeddings/vector data live in the adapter,
 *   keyed by memoryId. Deleting the vector store loses no canonical data.
 * - Every provider ends at `permissionFilteredCandidates` before returning,
 *   so visibility discipline is identical on the structured and semantic
 *   paths — vector similarity can re-rank permitted memories, never admit
 *   a forbidden one.
 * - Vector namespaces are owner-scoped (`owner:${ownerId}`); a query can
 *   only ever touch one owner's namespace.
 * - Vendor metadata stays out of Core records: `VectorEntry` references
 *   memoryIds only.
 */

import type { ModelProvider } from './model-provider';
import { embedWithProvider } from './model-provider';
import type { MemoryRepository } from './repositories';
import type { RetrievedMemory, RetrievalInput } from './retrieval';
import { permissionFilteredCandidates, queryTerms, retrieveMemories } from './retrieval';

/* ---------------------------------------------------------------------------
 * EmbeddingProvider — aligned with ModelProvider.embed (task 5.4)
 * ------------------------------------------------------------------------- */

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** Adapt any ModelProvider that declares the `embeddings` capability. */
export function embeddingProviderFromModel(provider: ModelProvider): EmbeddingProvider {
  return {
    name: `model:${provider.name}`,
    // Dimensions are provider-defined; declared lazily after the first call.
    dimensions: 0,
    embed: (texts) => embedWithProvider(provider, texts),
  };
}

/**
 * Deterministic reference embedding for tests/local mode: a hashed bag of
 * tokens AND character bigrams (FNV-1a 32-bit into `dimensions` buckets,
 * L2-normalized). Bigrams make it robust for unsegmented scripts (e.g.
 * Chinese, where a full sentence is one whitespace-token) — a two-character
 * query still overlaps content containing it. Semantic enough that related
 * texts score higher than disjoint ones under cosine similarity, with zero
 * network, zero keys, and byte-stable outputs.
 */
export function createHashEmbeddingProvider(dimensions = 64): EmbeddingProvider {
  if (!Number.isInteger(dimensions) || dimensions < 8) {
    throw new RetrievalProviderError('hash embedding dimensions must be an integer >= 8');
  }
  const hash = (text: string): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  };
  return {
    name: 'hash-bow',
    dimensions,
    async embed(texts) {
      return texts.map((text) => {
        const vector = new Array<number>(dimensions).fill(0);
        for (const term of queryTerms(text)) {
          vector[hash(term) % dimensions] += 1;
          for (let i = 0; i + 1 < term.length; i += 1) {
            vector[hash(term.slice(i, i + 2)) % dimensions] += 1;
          }
        }
        const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
        return norm === 0 ? vector : vector.map((v) => v / norm);
      });
    },
  };
}

/* ---------------------------------------------------------------------------
 * VectorStore — owner-scoped namespaces; memoryIds only, no vendor metadata
 * ------------------------------------------------------------------------- */

export interface VectorEntry {
  /** The Core record id this vector describes (a memoryId). */
  id: string;
  vector: number[];
}

export interface VectorHit {
  id: string;
  /** Cosine similarity in [-1, 1] for the reference store; adapters document their own metric. */
  score: number;
}

export interface VectorStore {
  readonly name: string;
  /** Insert or replace entries in one owner's namespace. */
  upsert(namespace: string, entries: readonly VectorEntry[]): Promise<void>;
  /** Top-`limit` hits by descending score, ties by id asc. */
  query(namespace: string, vector: readonly number[], limit: number): Promise<VectorHit[]>;
  /** Delete specific ids (memory edits/deletes propagate here). */
  remove(namespace: string, ids: readonly string[]): Promise<void>;
  /**
   * Drop an entire namespace. Proves removability: after this call the store
   * holds nothing about the owner, while canonical memory records (which
   * never contained vector data) are untouched.
   */
  dropNamespace(namespace: string): Promise<void>;
}

/** Namespace convention: one per owner, so cross-owner reads are impossible by construction. */
export function ownerNamespace(ownerId: string): string {
  return `owner:${ownerId}`;
}

/** In-memory reference store. Cosine similarity; deterministic ordering. */
export function createInMemoryVectorStore(): VectorStore {
  const namespaces = new Map<string, Map<string, number[]>>();
  return {
    name: 'in-memory-vector-store',
    async upsert(namespace, entries) {
      let ns = namespaces.get(namespace);
      if (!ns) {
        ns = new Map();
        namespaces.set(namespace, ns);
      }
      for (const entry of entries) ns.set(entry.id, [...entry.vector]);
    },
    async query(namespace, vector, limit) {
      const ns = namespaces.get(namespace);
      if (!ns) return [];
      const qNorm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      const hits: VectorHit[] = [];
      for (const [id, candidate] of ns) {
        let dot = 0;
        let cNorm = 0;
        for (let i = 0; i < vector.length; i += 1) {
          dot += vector[i] * (candidate[i] ?? 0);
          cNorm += (candidate[i] ?? 0) ** 2;
        }
        const denom = qNorm * Math.sqrt(cNorm);
        hits.push({ id, score: denom === 0 ? 0 : dot / denom });
      }
      hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return hits.slice(0, Math.max(0, limit));
    },
    async remove(namespace, ids) {
      const ns = namespaces.get(namespace);
      if (!ns) return;
      for (const id of ids) ns.delete(id);
    },
    async dropNamespace(namespace) {
      namespaces.delete(namespace);
    },
  };
}

/* ---------------------------------------------------------------------------
 * RetrievalProvider (ARCHITECTURE §17 sketch)
 * ------------------------------------------------------------------------- */

export interface RetrievalProvider {
  readonly name: string;
  /** True when this provider needs an embedding model and/or vector store. */
  readonly semantic: boolean;
  retrieve(input: RetrievalInput): Promise<RetrievedMemory[]>;
}

/** Stage 1 as a provider: the default; needs no embeddings or vector store. */
export function createStructuredRetrievalProvider(): RetrievalProvider {
  return {
    name: 'structured',
    semantic: false,
    retrieve: (input) => retrieveMemories(input),
  };
}

export interface SemanticRetrievalProviderOptions {
  embeddingProvider: EmbeddingProvider;
  vectorStore: VectorStore;
  memoryRepository: MemoryRepository;
  /**
   * How many vector hits to consider before the permission filter; the
   * post-filter `input.limit` still applies. Defaults to 3x the limit.
   */
  candidateMultiplier?: number;
}

/**
 * Stage 2 provider: vector similarity ranks candidates, then the SAME
 * visibility filter as stage 1 decides what may actually be returned.
 * Non-indexed memories simply never surface; forbidden ones never do either.
 */
export function createSemanticRetrievalProvider(
  options: SemanticRetrievalProviderOptions,
): RetrievalProvider {
  const { embeddingProvider, vectorStore, memoryRepository } = options;
  return {
    name: `semantic:${embeddingProvider.name}/${vectorStore.name}`,
    semantic: true,
    async retrieve(input) {
      const limit = input.limit ?? 8;
      const candidateLimit = limit * (options.candidateMultiplier ?? 3);
      const [queryVector] = await embeddingProvider.embed([input.queryText ?? '']);
      const hits = await vectorStore.query(ownerNamespace(input.ownerId), queryVector, candidateLimit);

      const fetched = await Promise.all(hits.map((hit) => memoryRepository.get(hit.id)));
      const present = fetched.filter((memory): memory is NonNullable<typeof memory> => memory !== null);

      // Visibility BEFORE return — the identical discipline as stage 1.
      const candidates = permissionFilteredCandidates(present, input.ownerId, input.audience);
      const allowed = new Map(candidates.map((c) => [c.memory.id, c]));
      const kindFilter = input.kinds ? new Set(input.kinds) : null;

      const results: RetrievedMemory[] = [];
      for (const hit of hits) {
        const candidate = allowed.get(hit.id);
        if (!candidate) continue; // permission-filtered: not returned, ever
        if (kindFilter && !kindFilter.has(candidate.memory.kind)) continue;
        const similarity = Math.max(0, hit.score);
        results.push({
          memoryId: candidate.memory.id,
          score: similarity,
          matchedReasons: [`semantic:${similarity.toFixed(3)}`],
          visibility: candidate.decision,
          sourceConversationId: candidate.memory.sourceConversationId,
          sourceMessageIds: [...candidate.memory.sourceMessageIds],
          memory: { ...candidate.memory, sourceMessageIds: [...candidate.memory.sourceMessageIds] },
        });
      }
      // Deterministic: score desc, then id asc.
      results.sort(
        (a, b) => b.score - a.score || (a.memoryId < b.memoryId ? -1 : a.memoryId > b.memoryId ? 1 : 0),
      );
      return results.slice(0, limit);
    },
  };
}

/** Index a memory's content into the owner's vector namespace (adapter-side data only). */
export async function indexMemoryEmbedding(
  embeddingProvider: EmbeddingProvider,
  vectorStore: VectorStore,
  ownerId: string,
  memoryId: string,
  content: string,
): Promise<void> {
  const [vector] = await embeddingProvider.embed([content]);
  await vectorStore.upsert(ownerNamespace(ownerId), [{ id: memoryId, vector }]);
}

/* ---------------------------------------------------------------------------
 * Reranking — stage 3, optional, applied AFTER retrieval
 * ------------------------------------------------------------------------- */

export interface Reranker {
  readonly name: string;
  rerank(items: readonly RetrievedMemory[], input: RetrievalInput): RetrievedMemory[];
}

/** Reference pass-through: proves the seam without changing anything. */
export const passThroughReranker: Reranker = {
  name: 'pass-through',
  rerank: (items) => [...items],
};

/**
 * Simple deterministic reference reranker: multiplies each score by a fixed
 * per-kind boost, then re-sorts (score desc, id asc). Shows how a heavier
 * reranker (cross-encoder, etc.) would plug in behind the same interface.
 */
export function createKindBoostReranker(boosts: Partial<Record<string, number>>): Reranker {
  return {
    name: 'kind-boost',
    rerank: (items) =>
      items
        .map((item) => {
          const boost = boosts[item.memory.kind] ?? 1;
          const score = item.score * boost;
          return {
            ...item,
            score,
            matchedReasons: [...item.matchedReasons, `rerank:${item.memory.kind}x${boost}`],
          };
        })
        .sort(
          (a, b) => b.score - a.score || (a.memoryId < b.memoryId ? -1 : a.memoryId > b.memoryId ? 1 : 0),
        ),
  };
}

/** Compose: retrieve with a provider, then optionally rerank. */
export async function retrieveWithOptionalRerank(
  provider: RetrievalProvider,
  input: RetrievalInput,
  reranker?: Reranker,
): Promise<RetrievedMemory[]> {
  const items = await provider.retrieve(input);
  return reranker ? reranker.rerank(items, input) : items;
}

export class RetrievalProviderError extends Error {
  readonly code = 'retrieval_provider_error';
}
