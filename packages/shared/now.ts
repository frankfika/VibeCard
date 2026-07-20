// VibeCard 2.0 — Personal Now updates (task 4.5).
//
// Canonical contract fixed by the coordinating agent. Sub-agents (shared / web /
// miniprogram) must consume exactly these field names, states, and semantics and
// must not invent divergent Now models.
//
// Rules (AI_BEHAVIOR.md §13):
// - A Now item is an owner-confirmed public projection, never an automatic copy
//   of raw private conversation.
// - Publishing a Now item never changes the visibility of its source Memory.
// - The public Card shows at most the three newest published, non-expired items.
// - No feed, followers, likes, comments, ranking, or recommendation.

import type { Memory } from './vibe';

export type NowItemStatus =
  | 'draft' // proposed (e.g. by My Vibe) or being written; never public
  | 'published' // owner-confirmed; public while not expired
  | 'archived' // kept in history; not shown publicly
  | 'hidden' // kept but explicitly hidden by the owner; not shown publicly
  | 'deleted'; // tombstone; never shown, excluded from all retrieval

export type NowItemTopic =
  | 'current_work'
  | 'completed_work'
  | 'exploring'
  | 'looking_for'
  | 'offer_help';

export interface NowItem {
  id: string;
  schemaVersion: 1;
  ownerId: string;
  /** Public text written or confirmed by the owner. Never raw private chat. */
  text: string;
  topic: NowItemTopic;
  /** Optional link to the Memory this update was projected from. Publishing
   *  must not mutate that memory's visibility. */
  sourceMemoryId: string | null;
  status: NowItemStatus;
  /** Set when first published; null while in draft. */
  publishedAt: number | null;
  /** Optional expiry timestamp; expired items are never presented as current. */
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/* ---------------------------------------------------------------------------
 * Pure projection helpers (task 4.5).
 *
 * Platform-free: no WeChat/browser/DB/model SDKs, no Node-only APIs. Web,
 * Mini Program, and cloud functions must all select and order public Now
 * items through these helpers so owner and visitor surfaces show the same
 * published snapshot.
 * ------------------------------------------------------------------------- */

/**
 * True only for published, non-expired items. Expired items are never
 * presented as current (PRODUCT.md §3.3).
 */
export function isNowItemActive(item: NowItem, now: number): boolean {
  return item.status === 'published' && (item.expiresAt === null || item.expiresAt > now);
}

/** Active items only, newest `publishedAt` first. Input is not mutated. */
export function filterActiveNow(items: readonly NowItem[], now: number): NowItem[] {
  return items
    .filter((item) => isNowItemActive(item, now))
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
}

/**
 * At most `limit` (default 3) newest active items — the public Card shows at
 * most the three newest published, non-expired items (AI_BEHAVIOR.md §13).
 */
export function latestActiveNow(
  items: readonly NowItem[],
  now: number,
  limit = 3,
): NowItem[] {
  return filterActiveNow(items, now).slice(0, Math.max(0, limit));
}

/**
 * Projection discipline (AI_BEHAVIOR.md §13): publishing a Now item reads its
 * source Memory but must never change that memory's visibility. This helper
 * only reads; the real discipline is type-level — the Memory is accepted as
 * `Readonly<Memory>`, so projection code cannot mutate it through this
 * function. A memory may serve as a Now source regardless of its own
 * visibility; only the owner-confirmed Now text becomes public, never the
 * raw memory content. Deleted memories must not be projected.
 */
export function canProjectMemoryToNow(memory: Readonly<Memory>): boolean {
  return memory.status !== 'deleted';
}
