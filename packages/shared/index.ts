export { allCards, getCardsByTags, shuffleArray } from './cards';
export type { Card } from './cards';
export { tags, tagCategories, presets, getTagsByCategory } from './tags';
export type { TagDefinition, TagCategory, Preset } from './tags';
export { companionTypes } from './companion-types';
export type { CompanionCategory, Activity } from './companion-types';

// VibeCard 2.0 domain contracts (task 0.1). Types only — no runtime cost.
export type {
  VibeCard,
  VibeCardHighlight,
  ContactMethod,
  ContactMethodKind,
  Memory,
  MemoryKind,
  MemoryVisibility,
  MemoryStatus,
  ConnectionRequest,
  ConnectionAction,
} from './vibe';
export type { NowItem, NowItemStatus, NowItemTopic } from './now';
export {
  isNowItemActive,
  filterActiveNow,
  latestActiveNow,
  canProjectMemoryToNow,
} from './now';

// ---------------------------------------------------------------------------
// Portable Core (task 5.2): pure platform-free domain rules. No WeChat APIs,
// no browser globals, no Node-only modules, no model SDK, no DB client.
// ---------------------------------------------------------------------------

// Memory confirmation and lifecycle rules.
export {
  MEMORY_KINDS,
  MEMORY_VISIBILITIES,
  MEMORY_STATUSES,
  isMemoryKind,
  isMemoryVisibility,
  isMemoryStatus,
  validateMemoryPayload,
  MemoryTransitionError,
  isMemoryActive,
  isMemoryRetrievable,
  buildProposedMemory,
  confirmMemory,
  editMemory,
  pauseMemory,
  resumeMemory,
  deleteMemory,
  rejectMemoryProposal,
} from './memory';
export type { MemoryDraftInput, MemoryConfirmPatch, MemoryEditPatch } from './memory';

// Visibility and role filtering (ARCHITECTURE §7).
export {
  isVisitorQuotable,
  isVisitorBoundaryUsable,
  memoriesForOwner,
  memoriesForVisitorQuote,
  memoriesForVisitorBoundary,
  memoriesForVisitorAgent,
  forbiddenForVisitor,
} from './visibility';

// Public Card projection.
export {
  PUBLIC_NOW_LIMIT,
  projectActiveNowItems,
  filterProjectableMemories,
  buildPublicCard,
} from './public-card';
export type { PublicNowItem, PublicCardSnapshot, BuildPublicCardInput } from './public-card';

// Connection-request state transitions.
export {
  CONNECTION_DAY_MS,
  MIN_REASON_LENGTH,
  OWNER_ACTIONS,
  ACTIONABLE_STATES,
  ConnectionTransitionError,
  validateConnectionRequestPayload,
  buildConnectionRequest,
  isVisitorBlocked,
  checkConnectionCreateAllowed,
  canViewConnectionRequest,
  applyOwnerAction,
  applyBlockToRequest,
  resolveSharedContacts,
} from './connection';
export type {
  OwnerAction,
  ConnectionRequestPayload,
  BuildConnectionRequestInput,
  OwnerBlockState,
  OwnerContactState,
  SharedContact,
  CreateGateInput,
} from './connection';

// Structured agent input/output schemas and validators (AI_BEHAVIOR §5/§6/§8/§9).
export {
  NOW_ITEM_TOPICS,
  VISITOR_NEXT_ACTIONS,
  SUMMARY_RECOMMENDATIONS,
  validateOwnerAgentResult,
  validateVisitorAgentResult,
  validateConnectionSummary,
  validateCardDraft,
} from './agent-schema';
export type {
  MemoryProposal,
  NowProposal,
  OwnerAgentResult,
  VisitorAgentResult,
  VisitorNextAction,
  ConnectionSummary,
  SummaryRecommendation,
  CardDraft,
  CardDraftHighlight,
  CardDraftValidation,
} from './agent-schema';

// Pure v1 profile migration mapping (ARCHITECTURE §9).
export {
  V1_CONTACT_KEYS,
  V1_PRESENTATIONAL_NAMECARD_KEYS,
  sanitizeV1Namecard,
  isV1ProfileDeleted,
  v1ProfileToCardBase,
} from './migration';
export type { V1UserProfile, V1PresentationalNamecard, V1CardBase } from './migration';

export * as vibeFixtures from './fixtures/vibe';
export * as nowFixtures from './fixtures/now';
