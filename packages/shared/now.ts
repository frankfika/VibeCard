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
