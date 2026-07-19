/**
 * VibeCard 2.0 minimal shared domain contracts.
 *
 * Source of truth:
 * - docs/product/PRODUCT.md
 * - docs/engineering/AI_BEHAVIOR.md
 *
 * Scope rule: only the three domain objects (`VibeCard`, `Memory`,
 * `ConnectionRequest`) and the enums they use. Do not add agent result
 * shapes, summaries, or legacy games/companion types here.
 */

/* ---------------------------------------------------------------------------
 * Memory
 * ------------------------------------------------------------------------- */

export type MemoryKind =
  | 'fact'
  | 'current'
  | 'preference'
  | 'boundary';

export type MemoryVisibility =
  | 'public'
  | 'agent_only'
  | 'connected'
  | 'private';

export type MemoryStatus =
  | 'proposed'
  | 'confirmed'
  | 'paused'
  | 'deleted';

/**
 * A durable memory exists only after the owner confirms an AI proposal.
 * `agent_only` memory may guide boundary decisions but must never be quoted
 * to a visitor. `private` memory never leaves the owner session.
 */
export interface Memory {
  id: string;
  schemaVersion: 1;
  ownerId: string;
  kind: MemoryKind;
  content: string;
  visibility: MemoryVisibility;
  status: MemoryStatus;
  sourceConversationId: string;
  sourceMessageIds: string[];
  createdAt: number;
  updatedAt: number;
}

/* ---------------------------------------------------------------------------
 * VibeCard (public projection) + private contact data
 * ------------------------------------------------------------------------- */

/**
 * Public-facing Card. This object is what a visitor can see.
 *
 * Privacy rule: it must never carry contact details. Contact data lives in
 * `ContactMethod`, which stays owner-side until the owner accepts a
 * connection and explicitly selects what to share.
 */
export interface VibeCard {
  id: string;
  schemaVersion: 1;
  ownerId: string;
  name: string;
  avatarUrl: string;
  headline: string;
  currentFocus: string;
  canHelpWith: string[];
  wantsToMeet: string[];
  topics: string[];
  highlights: VibeCardHighlight[];
  agentEnabled: boolean;
  updatedAt: number;
}

export interface VibeCardHighlight {
  id: string;
  title: string;
  url?: string;
}

export type ContactMethodKind =
  | 'wechat'
  | 'email'
  | 'phone'
  | 'telegram'
  | 'other';

/**
 * Owner-private contact data. Never included in `VibeCard` and never
 * returned from a public Card endpoint. A `ConnectionRequest` references
 * contact methods only by id, and only after the owner chooses `connect`.
 */
export interface ContactMethod {
  id: string;
  schemaVersion: 1;
  ownerId: string;
  kind: ContactMethodKind;
  /** The actual contact value (e.g. a WeChat ID). Owner session only. */
  value: string;
  /** Short owner-facing label, e.g. "工作微信". */
  label: string;
  createdAt: number;
  updatedAt: number;
}

/* ---------------------------------------------------------------------------
 * ConnectionRequest
 * ------------------------------------------------------------------------- */

export type ConnectionAction =
  | 'pending'
  | 'connect'
  | 'later'
  | 'decline';

/**
 * A visitor's specific request to connect with the owner.
 * `sharedContactMethodIds` stays empty until the owner accepts and picks
 * which contact methods to reveal.
 */
export interface ConnectionRequest {
  id: string;
  schemaVersion: 1;
  ownerId: string;
  visitorId: string;
  visitorSummary: string;
  reason: string;
  possibleSharedContext: string[];
  visitorWorkUrl?: string;
  ownerAction: ConnectionAction;
  sharedContactMethodIds: string[];
  createdAt: number;
  updatedAt: number;
}
