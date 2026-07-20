/**
 * Public Card projection (task 5.2 Core).
 *
 * Pure, platform-free TypeScript. Projects the owner-approved Card base
 * (v1 profile text) plus active memories and active Now items into the public
 * snapshot a visitor may see.
 *
 * Hard rules (ARCHITECTURE.md §7, AI_BEHAVIOR.md §9/§13):
 * - contact details never enter the projection (see migration.ts)
 * - only confirmed public memories may feed the projection — the db query
 *   applies this filter first; this module is the defensive second net
 * - at most the 3 newest published, non-expired Now items, reduced to
 *   public-safe fields (never ownerId, sourceMemoryId, or lifecycle internals)
 * - no non-public memory content ever appears
 *
 * The WeChat cloud function `cloudfunctions/card/lib/core.js` is the platform
 * adapter mirror; parity is enforced by `test/parity.test.ts`.
 */

import type { Memory, VibeCard } from './vibe';
import type { NowItem, NowItemTopic } from './now';
import { latestActiveNow } from './now';
import { isV1ProfileDeleted, v1ProfileToCardBase } from './migration';
import type { V1UserProfile } from './migration';

/** Max Now items on the public Card (AI_BEHAVIOR §13). */
export const PUBLIC_NOW_LIMIT = 3;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Public-safe Now item as embedded in the Card snapshot: no ownerId, no
 * sourceMemoryId, no lifecycle timestamps.
 */
export interface PublicNowItem {
  id: string;
  text: string;
  topic: NowItemTopic;
  publishedAt: number | null;
}

/** The public Card snapshot: the VibeCard plus its active Now items. */
export interface PublicCardSnapshot extends VibeCard {
  now: PublicNowItem[];
}

/** A stored Now record may carry a platform `_id` alongside the domain `id`. */
type StoredNowItem = NowItem & { _id?: string };

/**
 * Second-net Now projection: at most `limit` newest active items by
 * publishedAt (selection and ordering come from now.ts so every surface
 * agrees), reduced to public-safe fields. Empty input projects to [] — the
 * empty state invents nothing.
 */
export function projectActiveNowItems(
  nowItems: readonly StoredNowItem[] | null | undefined,
  now: number,
  limit: number = PUBLIC_NOW_LIMIT,
): PublicNowItem[] {
  // Text filter applies before the limit so an empty text cannot consume a slot.
  const candidates = (nowItems ?? []).filter((item) => item && isNonEmptyString(item.text));
  return latestActiveNow(candidates, now, limit)
    .map((item) => ({
      // latestActiveNow returns the same records typed as NowItem; read the
      // optional platform `_id` back off the stored record.
      id: (item as StoredNowItem)._id ?? item.id,
      text: item.text,
      topic: item.topic,
      publishedAt: item.publishedAt ?? null,
    }));
}

/**
 * Second-net memory filter: only confirmed public memories may ever feed the
 * projection. The store query already applies this filter; anything else
 * arriving here is a bug and gets dropped silently.
 */
export function filterProjectableMemories(
  memories: readonly Memory[] | null | undefined,
): Memory[] {
  return (memories ?? []).filter(
    (m) => m && m.status === 'confirmed' && m.visibility === 'public' && isNonEmptyString(m.content),
  );
}

function latestContent(memories: readonly Memory[], kind: Memory['kind']): string {
  const found = memories
    .filter((m) => m.kind === kind)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  return found ? found.content : '';
}

function contentsOf(memories: readonly Memory[], kind: Memory['kind']): string[] {
  return memories
    .filter((m) => m.kind === kind)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((m) => m.content)
    .slice(0, 5);
}

export interface BuildPublicCardInput {
  ownerId: string;
  /** v1 users document; may carry private fields — they are never read into
   *  the projection beyond the presentational namecard subset. */
  user: V1UserProfile | null | undefined;
  /** Owner memories (defensively re-filtered to confirmed public). */
  memories: readonly Memory[] | null | undefined;
  /** Owner now_items (defensively re-filtered to active-only). */
  nowItems?: readonly StoredNowItem[] | null;
}

/**
 * Build the public VibeCard projection. Deleted owner profiles still project
 * (callers gate on isV1ProfileDeleted first); the projection itself never
 * invents content.
 */
export function buildPublicCard(
  { ownerId, user, memories, nowItems }: BuildPublicCardInput,
  now: number,
): PublicCardSnapshot {
  const base = v1ProfileToCardBase(user);
  const projectable = filterProjectableMemories(memories);

  return {
    id: `card-${ownerId}`,
    schemaVersion: 1,
    ownerId,
    name: base.name,
    avatarUrl: base.avatarUrl,
    headline: base.headline,
    currentFocus: latestContent(projectable, 'current'),
    canHelpWith: contentsOf(projectable, 'fact'),
    wantsToMeet: contentsOf(projectable, 'preference'),
    topics: base.topics,
    highlights: [],
    now: projectActiveNowItems(nowItems, now),
    agentEnabled: true,
    updatedAt: now,
  };
}

export { isV1ProfileDeleted };
