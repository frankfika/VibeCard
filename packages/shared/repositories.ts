/**
 * Storage repository interfaces (task 5.5 Core).
 *
 * Pure, platform-free TypeScript: interfaces and query shapes only — no
 * storage engine, no Node-only modules, no cloud SDK. Implementations live in
 * `packages/platforms/` (e.g. `local-store` on node:sqlite) or behind the
 * WeChat Cloud collections (mapping documented in
 * `docs/engineering/STORAGE_ADAPTERS.md`).
 *
 * Design rules (ARCHITECTURE §4, §17):
 * - Repositories accept and return versioned Core records only. Storage-vendor
 *   metadata (SQLite rowids, cloud `_id`, index definitions) must never leak
 *   into these contracts; adapters map at the boundary.
 * - All reads that return lists use a single deterministic ordering:
 *   `updatedAt` (or `publishedAt` where noted) descending, ties broken by
 *   `id` ascending. Conformance tests assert this so every database adapter
 *   behaves identically to domain code.
 * - `save` is an upsert keyed by record `id`; ids are assigned by Core/domain
 *   code (never by the store), so ids are stable across export/import.
 * - `remove` is a hard delete of the stored record; it exists so an owner can
 *   execute an archive deletion plan. Domain "deleted" tombstones (Memory /
 *   NowItem status) are a separate, higher-level concept handled by Core
 *   lifecycle rules, not by repositories.
 * - Methods are async even for in-process stores so cloud adapters and local
 *   adapters share one call shape.
 */

import type {
  ConnectionAction,
  ConnectionRequest,
  ContactMethod,
  Memory,
  MemoryStatus,
  MemoryVisibility,
  VibeCard,
} from './vibe';
import type { NowItem, NowItemStatus } from './now';
import type { ArchiveConversation, ArchiveKnowledgeSource } from './archive';

/* ---------------------------------------------------------------------------
 * Memories
 * ------------------------------------------------------------------------- */

/** How the domain actually reads memories (ARCHITECTURE §4/§7). */
export interface MemoryQuery {
  ownerId: string;
  /** Filter by lifecycle status. Omit to return every status. */
  status?: MemoryStatus | readonly MemoryStatus[];
  /** Filter by visibility. Omit to return every visibility. */
  visibility?: MemoryVisibility | readonly MemoryVisibility[];
}

export interface MemoryRepository {
  get(id: string): Promise<Memory | null>;
  /** Ordered by `updatedAt` desc, then `id` asc. */
  list(query: MemoryQuery): Promise<Memory[]>;
  save(memory: Memory): Promise<void>;
  remove(id: string): Promise<void>;
}

/* ---------------------------------------------------------------------------
 * Cards
 * ------------------------------------------------------------------------- */

export interface CardRepository {
  get(id: string): Promise<VibeCard | null>;
  /** At most one canonical Card per owner in the current product. */
  getByOwner(ownerId: string): Promise<VibeCard | null>;
  save(card: VibeCard): Promise<void>;
  remove(id: string): Promise<void>;
}

/* ---------------------------------------------------------------------------
 * Now items
 *
 * Now is its own repository, NOT part of CardRepository: ARCHITECTURE §4
 * keeps `cards` and `now_items` as separate collections with separate indexes
 * (`ownerId + status + publishedAt`), Now items have their own lifecycle
 * (draft -> published -> archived/hidden/deleted), and the public projection
 * reads Now items without touching the Card record. Folding Now into the Card
 * repository would force every Card read to carry an unbounded Now history.
 * ------------------------------------------------------------------------- */

export interface NowQuery {
  ownerId: string;
  /** Filter by status. Omit to return every status (owner history view). */
  status?: NowItemStatus | readonly NowItemStatus[];
}

export interface NowRepository {
  get(id: string): Promise<NowItem | null>;
  /** Ordered by `updatedAt` desc, then `id` asc. */
  list(query: NowQuery): Promise<NowItem[]>;
  save(item: NowItem): Promise<void>;
  remove(id: string): Promise<void>;
}

/* ---------------------------------------------------------------------------
 * Conversations
 *
 * Uses the minimal versioned `ArchiveConversation` / `ArchiveMessage` Core
 * records: a conversation embeds its bounded message list, matching how the
 * WeChat `conversations` collection stores documents. Owner (`owner_vibe`)
 * and visitor conversations stay distinguishable via `kind` and are never
 * mixed into one list unless the caller asks for both.
 * ------------------------------------------------------------------------- */

export interface ConversationQuery {
  ownerId: string;
  kind?: ArchiveConversation['kind'];
  /** Visitor conversations only: filter by visitor id. */
  visitorId?: string;
}

export interface ConversationRepository {
  get(id: string): Promise<ArchiveConversation | null>;
  /** Ordered by `updatedAt` desc, then `id` asc. */
  list(query: ConversationQuery): Promise<ArchiveConversation[]>;
  /** Upsert the whole conversation record (messages embedded). */
  save(conversation: ArchiveConversation): Promise<void>;
  remove(id: string): Promise<void>;
}

/* ---------------------------------------------------------------------------
 * Connection requests
 * ------------------------------------------------------------------------- */

export interface ConnectionQuery {
  ownerId: string;
  /** Owner inbox filter, e.g. 'pending'. Omit for all actions. */
  action?: ConnectionAction | readonly ConnectionAction[];
}

export interface ConnectionRepository {
  get(id: string): Promise<ConnectionRequest | null>;
  /** Owner inbox. Ordered by `updatedAt` desc, then `id` asc. */
  listForOwner(query: ConnectionQuery): Promise<ConnectionRequest[]>;
  /** Everything one visitor sent (rate-limit and visitor-side views). */
  listForVisitor(visitorId: string): Promise<ConnectionRequest[]>;
  /**
   * One owner-visitor pair, newest first. This is the read shape
   * `checkConnectionCreateAllowed` needs (24h rate limit + decline cooldown).
   */
  listByPair(ownerId: string, visitorId: string): Promise<ConnectionRequest[]>;
  save(request: ConnectionRequest): Promise<void>;
  remove(id: string): Promise<void>;
}

/* ---------------------------------------------------------------------------
 * Knowledge-source metadata (metadata only — never file bytes)
 * ------------------------------------------------------------------------- */

export interface KnowledgeSourceQuery {
  ownerId: string;
  status?: ArchiveKnowledgeSource['status'] | readonly ArchiveKnowledgeSource['status'][];
}

export interface KnowledgeSourceRepository {
  get(id: string): Promise<ArchiveKnowledgeSource | null>;
  /** Ordered by `updatedAt` desc, then `id` asc. */
  list(query: KnowledgeSourceQuery): Promise<ArchiveKnowledgeSource[]>;
  save(source: ArchiveKnowledgeSource): Promise<void>;
  remove(id: string): Promise<void>;
}

/* ---------------------------------------------------------------------------
 * Contact methods (owner-private; never reachable from a public Card read)
 *
 * Present so a local/self-hosted owner can round-trip the full private
 * archive (task 5.3) and execute a deletion plan — the archive's
 * `contactMethods` section and `buildDeletionPlan().contactMethodIds` need a
 * storage home even though no repository sketch in ARCHITECTURE §17 lists it.
 * ------------------------------------------------------------------------- */

export interface ContactMethodRepository {
  get(id: string): Promise<ContactMethod | null>;
  /** Ordered by `createdAt` asc, then `id` asc (stable owner settings list). */
  listByOwner(ownerId: string): Promise<ContactMethod[]>;
  save(contact: ContactMethod): Promise<void>;
  remove(id: string): Promise<void>;
}

/* ---------------------------------------------------------------------------
 * Aggregate
 * ------------------------------------------------------------------------- */

/** The full set an owner runtime mode (local / self-hosted) composes. */
export interface VibeRepositories {
  memories: MemoryRepository;
  cards: CardRepository;
  now: NowRepository;
  conversations: ConversationRepository;
  connections: ConnectionRepository;
  knowledgeSources: KnowledgeSourceRepository;
  contactMethods: ContactMethodRepository;
}
