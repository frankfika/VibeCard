/**
 * Knowledge-source ingestion adapters and chunk retrieval (task 5.6 Core).
 *
 * Pure, platform-free TypeScript. Adapters receive CONTENT AS INPUT — the
 * Core never reads files, fetches URLs, or touches a network. A platform
 * adapter (Mini Program file picker, self-hosted server fetcher) hands raw
 * text in; the Core records metadata + chunks with full provenance.
 *
 * Model:
 * - `ArchiveKnowledgeSource` (task 5.3/5.5) stays the canonical source record:
 *   metadata only, never bytes.
 * - `KnowledgeChunk` carries the ingested text plus provenance
 *   (sourceId, chunkIndex, adapter name, locator, ingestedAt). Chunks live
 *   with the ingestion adapter (or a future chunk repository); they are not
 *   part of the archive's source metadata record.
 * - Visibility: chunks inherit the visibility the owner assigns at ingest
 *   time; the default is owner-private (`private`) — imported raw data is
 *   never public by default (ARCHITECTURE §16 Raw Data layer).
 * - Chunk retrieval applies the same visibility-before-retrieval discipline
 *   as memory retrieval: visitors see `public` chunks only.
 */

import type { ArchiveKnowledgeSource } from './archive';
import type { MemoryVisibility } from './vibe';
import { queryTerms, keywordScore, recencyScore, DEFAULT_RETRIEVAL_LIMIT } from './retrieval';

/* ---------------------------------------------------------------------------
 * Chunks and provenance
 * ------------------------------------------------------------------------- */

export type KnowledgeSourceKind = ArchiveKnowledgeSource['kind'] | 'external';

/** Where a chunk came from. Metadata only — never bytes, never credentials. */
export interface KnowledgeProvenance {
  /** The KnowledgeSource record this chunk belongs to. */
  sourceId: string;
  /** Position of this chunk inside the source (0-based). */
  chunkIndex: number;
  /** Adapter that produced the chunk, e.g. 'file-text'. */
  adapterName: string;
  /** Source kind: file / url / note / external. */
  kind: KnowledgeSourceKind;
  /** Human title + locator (filename, URL, note label). */
  title: string;
  locator: string;
  /** Ingest timestamp (explicit — the Core reads no clock). */
  ingestedAt: number;
}

export interface KnowledgeChunk {
  id: string;
  schemaVersion: 1;
  ownerId: string;
  content: string;
  /** Inherits the source's owner-assigned visibility; default 'private'. */
  visibility: MemoryVisibility;
  provenance: KnowledgeProvenance;
  createdAt: number;
}

/** The result of ingesting one source: the canonical record plus its chunks. */
export interface KnowledgeIngestionResult {
  source: ArchiveKnowledgeSource;
  chunks: KnowledgeChunk[];
}

/* ---------------------------------------------------------------------------
 * Deterministic chunking
 * ------------------------------------------------------------------------- */

export const DEFAULT_CHUNK_SIZE = 500;

/**
 * Split text into deterministic fixed-window chunks on whitespace boundaries
 * where possible. Pure function of (text, maxChars): same input => same chunks.
 */
export function chunkContent(text: string, maxChars = DEFAULT_CHUNK_SIZE): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= maxChars) return [normalized];
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf(' ', maxChars);
    if (cut < maxChars / 2) cut = maxChars; // no good boundary: hard cut
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/* ---------------------------------------------------------------------------
 * Knowledge-source adapters
 *
 * One factory per source kind. Each adapter is a pure function: content in,
 * source record + chunks out. Ids are injected (idFactory) so the Core stays
 * deterministic; callers in a runtime pass a platform id generator.
 * ------------------------------------------------------------------------- */

export interface KnowledgeIngestInput {
  ownerId: string;
  /** Human-facing title (filename, page title, note label). */
  title: string;
  /** Locator metadata: filename, URL, note label, external system id. */
  locator: string;
  /** Raw text content supplied by the platform adapter. Never fetched here. */
  content: string;
  /** Owner-assigned visibility for every chunk. Defaults to 'private'. */
  visibility?: MemoryVisibility;
  /** Optional chunk size override. */
  maxCharsPerChunk?: number;
}

export interface KnowledgeSourceAdapter {
  readonly name: string;
  readonly kind: KnowledgeSourceKind;
  ingest(
    input: KnowledgeIngestInput,
    now: number,
    ids: { sourceId: string; chunkId: (chunkIndex: number) => string },
  ): KnowledgeIngestionResult;
}

function createAdapter(name: string, kind: KnowledgeSourceKind): KnowledgeSourceAdapter {
  return {
    name,
    kind,
    ingest(input, now, ids) {
      const visibility = input.visibility ?? 'private';
      const sourceKind: ArchiveKnowledgeSource['kind'] =
        kind === 'external' ? 'note' : kind;
      const source: ArchiveKnowledgeSource = {
        id: ids.sourceId,
        schemaVersion: 1,
        ownerId: input.ownerId,
        kind: sourceKind,
        title: input.title,
        source: input.locator,
        status: 'ingested',
        createdAt: now,
        updatedAt: now,
      };
      const chunks = chunkContent(input.content, input.maxCharsPerChunk).map(
        (content, chunkIndex): KnowledgeChunk => ({
          id: ids.chunkId(chunkIndex),
          schemaVersion: 1,
          ownerId: input.ownerId,
          content,
          visibility,
          provenance: {
            sourceId: ids.sourceId,
            chunkIndex,
            adapterName: name,
            kind,
            title: input.title,
            locator: input.locator,
            ingestedAt: now,
          },
          createdAt: now,
        }),
      );
      return { source, chunks };
    },
  };
}

/** Plain-text file ingest (bytes were already read by the platform adapter). */
export const fileKnowledgeAdapter: KnowledgeSourceAdapter = createAdapter('file-text', 'file');
/** Owner-authored note ingest. */
export const noteKnowledgeAdapter: KnowledgeSourceAdapter = createAdapter('note', 'note');
/** Link ingest — the page text was already fetched by the platform adapter. */
export const linkKnowledgeAdapter: KnowledgeSourceAdapter = createAdapter('link-text', 'url');
/** Generic external system ingest (e.g. a synced read-only knowledge base). */
export const externalKnowledgeAdapter: KnowledgeSourceAdapter = createAdapter('external', 'external');

export const KNOWLEDGE_SOURCE_ADAPTERS: readonly KnowledgeSourceAdapter[] = [
  fileKnowledgeAdapter,
  noteKnowledgeAdapter,
  linkKnowledgeAdapter,
  externalKnowledgeAdapter,
];

/* ---------------------------------------------------------------------------
 * Chunk retrieval — same visibility-before-retrieval discipline as memories
 * ------------------------------------------------------------------------- */

export type KnowledgeAudience = 'owner' | 'visitor';

/** Which rule allowed a chunk into the result. */
export interface KnowledgeVisibilityDecision {
  rule: 'owner_session' | 'visitor_public_chunk';
  visibility: MemoryVisibility;
  quotable: boolean;
}

export interface RetrievedKnowledgeChunk {
  chunkId: string;
  sourceId: string;
  score: number;
  matchedReasons: string[];
  visibility: KnowledgeVisibilityDecision;
  provenance: KnowledgeProvenance;
  chunk: KnowledgeChunk;
}

export interface KnowledgeRetrievalInput {
  ownerId: string;
  audience: KnowledgeAudience;
  chunks: readonly KnowledgeChunk[];
  queryText?: string;
  limit?: number;
  /** Explicit clock reading (ms). */
  now: number;
}

/**
 * Owner filter -> visibility for the audience (visitor: public only) ->
 * deterministic keyword + recency scoring, identical in spirit to stage-1
 * memory retrieval. A `private` chunk containing prompt-injection text can
 * only affect its own keyword score — never its permission.
 */
export function retrieveKnowledgeChunks(
  input: KnowledgeRetrievalInput,
): RetrievedKnowledgeChunk[] {
  const owned = input.chunks.filter((chunk) => chunk.ownerId === input.ownerId);
  const permitted =
    input.audience === 'owner'
      ? owned.map((chunk): [KnowledgeChunk, KnowledgeVisibilityDecision] => [
          chunk,
          { rule: 'owner_session', visibility: chunk.visibility, quotable: true },
        ])
      : owned
          .filter((chunk) => chunk.visibility === 'public')
          .map((chunk): [KnowledgeChunk, KnowledgeVisibilityDecision] => [
            chunk,
            { rule: 'visitor_public_chunk', visibility: chunk.visibility, quotable: true },
          ]);

  const terms = queryTerms(input.queryText);
  const limit = input.limit ?? DEFAULT_RETRIEVAL_LIMIT;

  const scored = permitted.map(([chunk, decision]): RetrievedKnowledgeChunk => {
    const keyword = keywordScore(chunk.content, terms);
    const recency = recencyScore(chunk.createdAt, input.now);
    const matchedReasons = [
      `recency:${recency.toFixed(3)}`,
      ...keyword.matched.map((term) => `keyword:${term}`),
    ];
    return {
      chunkId: chunk.id,
      sourceId: chunk.provenance.sourceId,
      score: recency + keyword.score,
      matchedReasons,
      visibility: decision,
      provenance: { ...chunk.provenance },
      chunk: { ...chunk, provenance: { ...chunk.provenance } },
    };
  });

  scored.sort(
    (a, b) => b.score - a.score || (a.chunkId < b.chunkId ? -1 : a.chunkId > b.chunkId ? 1 : 0),
  );
  return scored.slice(0, Math.max(0, limit));
}
