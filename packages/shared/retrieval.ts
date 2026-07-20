/**
 * Structured memory retrieval — stage 1, the default (task 5.6 Core).
 *
 * Pure, platform-free TypeScript. Implements ARCHITECTURE.md §7 and §18
 * stage 1:
 *
 *   filter by owner
 *   -> filter by confirmed (active) status
 *   -> filter by visibility for the requesting audience BEFORE anything else
 *   -> score: recency weighting + memory-kind filtering + keyword matching
 *   -> deterministic output, bounded by `limit`
 *
 * Determinism rules:
 * - `now` is an explicit required input; nothing here reads a clock.
 * - No randomness anywhere; ties resolve by memory id ascending.
 *
 * Security rules:
 * - Visibility filtering reuses `visibility.ts` verbatim and runs before any
 *   scoring. Content (including prompt-injection text stored inside a memory)
 *   can only affect a memory's OWN score, never its permissions.
 * - Owner filtering happens on the raw list first, so cross-owner records can
 *   never leak even if a caller passes a mixed collection.
 */

import type { Memory, MemoryKind } from './vibe';
import {
  isVisitorBoundaryUsable,
  isVisitorQuotable,
  memoriesForOwner,
} from './visibility';
import type { MemoryRepository } from './repositories';

/* ---------------------------------------------------------------------------
 * Audiences and visibility decisions
 * ------------------------------------------------------------------------- */

/**
 * Who the retrieval is for. Maps 1:1 onto the three permission sets in
 * `visibility.ts`:
 * - `owner`            — the owner's own session; all four visibilities.
 * - `visitor_quote`    — evidence a visitor agent may quote; public only.
 * - `visitor_boundary` — agent_only memories usable for a connect/no-connect
 *   boundary decision; never quotable.
 */
export type RetrievalAudience = 'owner' | 'visitor_quote' | 'visitor_boundary';

/** Which visibility rule allowed a memory into the result, and what may be done with it. */
export interface VisibilityDecision {
  rule: 'owner_session' | 'visitor_quotable_public' | 'visitor_boundary_agent_only';
  visibility: Memory['visibility'];
  /** Whether the content may be quoted to the requesting audience. */
  quotable: boolean;
}

/* ---------------------------------------------------------------------------
 * Input / output
 * ------------------------------------------------------------------------- */

export interface RetrievalInput {
  /** Canonical owner id. Records owned by anyone else are dropped first. */
  ownerId: string;
  audience: RetrievalAudience;
  /** Free-text query used for keyword/topic matching. May be empty. */
  queryText?: string;
  /** Restrict to these memory kinds. Omit for all kinds. */
  kinds?: readonly MemoryKind[];
  /** Max results. Defaults to DEFAULT_RETRIEVAL_LIMIT. */
  limit?: number;
  /** Required explicit clock reading (ms since epoch). */
  now: number;
  /**
   * Source of memories: either an already-fetched list or a repository.
   * Exactly one of the two must be provided.
   */
  memories?: readonly Memory[];
  repository?: MemoryRepository;
}

export interface RetrievedMemory {
  memoryId: string;
  /** Deterministic score in [0, +inf); higher is more relevant. */
  score: number;
  /** Human/machine-readable reasons that contributed to the match. */
  matchedReasons: string[];
  /** The exact rule that allowed this memory into the result. */
  visibility: VisibilityDecision;
  /** Source ids so callers can trace evidence back to its origin. */
  sourceConversationId: string;
  sourceMessageIds: string[];
  /** The full record (already permission-filtered) for prompt assembly. */
  memory: Memory;
}

export const DEFAULT_RETRIEVAL_LIMIT = 8;

/* ---------------------------------------------------------------------------
 * Deterministic scoring
 *
 * score(memory) = KIND_MATCH + RECENCY + KEYWORD
 *
 * - KIND_MATCH: +1.0 when `kinds` is omitted or contains the memory's kind,
 *   otherwise the memory is excluded (kind filter is a filter, not a boost).
 * - RECENCY: 1 / (1 + ageInDays / 30). A memory from now scores 1.0; one
 *   30 days old scores 0.5; it decays smoothly toward 0 but never reaches
 *   it, so old relevant memories can still surface.
 * - KEYWORD: for each distinct lowercase query term (whitespace-split,
 *   length >= 2) that appears as a substring of the memory's lowercase
 *   content: +1.0, capped at 3.0. When `queryText` is empty this term is 0
 *   and ranking is purely recency within the permission/kind filter.
 *
 * Everything is a pure function of (memory, queryText, now): no randomness,
 * no injected clock, no locale-sensitive casing beyond toLowerCase.
 * ------------------------------------------------------------------------- */

const RECENCY_HALF_LIFE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEYWORD_MATCH_WEIGHT = 1.0;
const KEYWORD_SCORE_CAP = 3.0;

export function recencyScore(updatedAt: number, now: number): number {
  const ageDays = Math.max(0, (now - updatedAt) / DAY_MS);
  return 1 / (1 + ageDays / RECENCY_HALF_LIFE_DAYS);
}

/** Split query text into distinct lowercase terms (length >= 2). */
export function queryTerms(queryText: string | undefined): string[] {
  if (!queryText) return [];
  const terms = queryText
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 2);
  return [...new Set(terms)];
}

export function keywordScore(content: string, terms: readonly string[]): { score: number; matched: string[] } {
  if (terms.length === 0) return { score: 0, matched: [] };
  const haystack = content.toLowerCase();
  const matched = terms.filter((term) => haystack.includes(term));
  return {
    score: Math.min(matched.length * KEYWORD_MATCH_WEIGHT, KEYWORD_SCORE_CAP),
    matched,
  };
}

/* ---------------------------------------------------------------------------
 * Permission-filtered candidate selection (visibility BEFORE retrieval)
 * ------------------------------------------------------------------------- */

interface Candidate {
  memory: Memory;
  decision: VisibilityDecision;
}

/**
 * Owner filter -> active status -> visibility for the audience. This is the
 * ONLY path candidates enter retrieval; semantic providers must also end
 * here before returning anything.
 */
export function permissionFilteredCandidates(
  memories: readonly Memory[],
  ownerId: string,
  audience: RetrievalAudience,
): Candidate[] {
  const owned = memories.filter((memory) => memory.ownerId === ownerId);
  if (audience === 'owner') {
    return memoriesForOwner(owned).map((memory) => ({
      memory,
      decision: {
        rule: 'owner_session',
        visibility: memory.visibility,
        quotable: true,
      },
    }));
  }
  if (audience === 'visitor_quote') {
    return owned.filter(isVisitorQuotable).map((memory) => ({
      memory,
      decision: {
        rule: 'visitor_quotable_public',
        visibility: memory.visibility,
        quotable: true,
      },
    }));
  }
  return owned.filter(isVisitorBoundaryUsable).map((memory) => ({
    memory,
    decision: {
      rule: 'visitor_boundary_agent_only',
      visibility: memory.visibility,
      quotable: false,
    },
  }));
}

/* ---------------------------------------------------------------------------
 * The stage-1 retrieval function
 * ------------------------------------------------------------------------- */

/**
 * Structured retrieval over repository-fetched or in-memory Memory records.
 * Fully deterministic: same inputs (including `now`) => same outputs.
 */
export async function retrieveMemories(input: RetrievalInput): Promise<RetrievedMemory[]> {
  if (!input.ownerId) throw new RetrievalInputError('ownerId is required');
  if (typeof input.now !== 'number' || !Number.isFinite(input.now)) {
    throw new RetrievalInputError('now must be an explicit finite timestamp');
  }
  if (input.memories && input.repository) {
    throw new RetrievalInputError('pass either memories or repository, not both');
  }
  if (!input.memories && !input.repository) {
    throw new RetrievalInputError('pass either memories or repository');
  }

  const all = input.repository
    ? await input.repository.list({ ownerId: input.ownerId })
    : [...input.memories!];

  const candidates = permissionFilteredCandidates(all, input.ownerId, input.audience);
  const terms = queryTerms(input.queryText);
  const kindFilter = input.kinds ? new Set(input.kinds) : null;
  const limit = input.limit ?? DEFAULT_RETRIEVAL_LIMIT;

  const scored: RetrievedMemory[] = [];
  for (const { memory, decision } of candidates) {
    if (kindFilter && !kindFilter.has(memory.kind)) continue;
    const reasons: string[] = [];
    if (kindFilter) reasons.push(`kind:${memory.kind}`);
    const recency = recencyScore(memory.updatedAt, input.now);
    reasons.push(`recency:${recency.toFixed(3)}`);
    const keyword = keywordScore(memory.content, terms);
    for (const term of keyword.matched) reasons.push(`keyword:${term}`);
    scored.push({
      memoryId: memory.id,
      score: recency + keyword.score,
      matchedReasons: reasons,
      visibility: decision,
      sourceConversationId: memory.sourceConversationId,
      sourceMessageIds: [...memory.sourceMessageIds],
      memory: { ...memory, sourceMessageIds: [...memory.sourceMessageIds] },
    });
  }

  // Deterministic ordering: score desc, then id asc.
  scored.sort(
    (a, b) => b.score - a.score || (a.memoryId < b.memoryId ? -1 : a.memoryId > b.memoryId ? 1 : 0),
  );
  return scored.slice(0, Math.max(0, limit));
}

/** Input misuse is a programming error; permissions failures are empty results. */
export class RetrievalInputError extends Error {
  readonly code = 'invalid_retrieval_input';
}
