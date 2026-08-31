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

// Owner-confirmed learning from connection decisions (task 2.6).
export {
  DECISION_LEARNING_SOURCE_PREFIX,
  connectionDecisionSignal,
  normalizeSafeDecisionTopic,
  thirdPartyFragments,
  validateExplicitDecisionPreference,
  containsForbiddenThirdPartyInformation,
  evaluateDecisionLearning,
  decisionLearningIdempotencyKey,
  finalizeDecisionLearningProposal,
} from './decision-learning';
export type {
  ExplicitDecisionPreference,
  DecisionLearningSignal,
  DecisionLearningEvidence,
  DecisionLearningProposal,
  DecisionLearningEligibility,
} from './decision-learning';
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
  validateDecisionLearningAgentResult,
  validateCardDraft,
} from './agent-schema';
export type {
  MemoryProposal,
  NowProposal,
  OwnerAgentResult,
  VisitorAgentResult,
  VisitorNextAction,
  ConnectionSummary,
  DecisionLearningAgentResult,
  SummaryRecommendation,
  CardDraft,
  CardDraftHighlight,
  CardDraftValidation,
} from './agent-schema';

// Provider-neutral model boundary (task 5.4, ARCHITECTURE §6): capability
// declarations, typed provider errors, and the validated AgentModel wrapper.
export {
  MODEL_CAPABILITIES,
  TEXT_STRUCTURED_CAPABILITIES,
  PROVIDER_ERROR_CODES,
  ModelProviderError,
  isModelProviderError,
  providerSupports,
  requireProviderCapability,
  embedWithProvider,
  createAgentModel,
} from './model-provider';
export type {
  ModelCapability,
  ModelProviderCapabilities,
  ProviderErrorCode,
  ChatMessage,
  CompletionInput,
  ModelProvider,
  ModelCallOutcome,
  AgentModel,
  AgentModelInput,
  OwnerModelInput,
  CardDraftModelResult,
} from './model-provider';

// Reference deterministic mock provider (task 5.4): zero keys, zero network,
// byte-identical to the cloud-function mock mirror.
export { createMockModelProvider } from './mock-provider';

// Pure v1 profile migration mapping (ARCHITECTURE §9).
export {
  V1_CONTACT_KEYS,
  V1_PRESENTATIONAL_NAMECARD_KEYS,
  sanitizeV1Namecard,
  isV1ProfileDeleted,
  v1ProfileToCardBase,
} from './migration';
export type { V1UserProfile, V1PresentationalNamecard, V1CardBase } from './migration';

// Portable Vibe Archive (task 5.3): versioned `.vibe` export/import format.
export {
  ARCHIVE_FORMAT,
  ARCHIVE_SCHEMA_VERSION,
  ARCHIVE_SUPPORTED_VERSIONS,
  ARCHIVE_SECTION_VERSIONS,
  ARCHIVE_DELETE_ALL_WINDOW_MS,
  canonicalJson,
  fnv1a32,
  exportPrivateArchive,
  exportPublicArchive,
  validateArchive,
  migrateArchive,
  importArchive,
  buildDeletionPlan,
  computeArchiveDigest,
  computeDeleteAllReceiptId,
  buildDeleteAllReceipt,
  validateDeleteAllConfirmation,
} from './archive';
export type {
  ArchiveAppInfo,
  ArchiveAttachment,
  ArchiveConversation,
  ArchiveConversationSection,
  ArchiveDeleteAllConfirmation,
  ArchiveDeleteAllReceipt,
  ArchiveDeletionPlan,
  ArchiveDigest,
  ArchiveError,
  ArchiveErrorCode,
  ArchiveKind,
  ArchiveKnowledgeSource,
  ArchiveMessage,
  ArchiveProfile,
  ArchiveResult,
  ArchiveSection,
  ExportPrivateArchiveInput,
  ExportPublicArchiveInput,
  ImportedArchiveState,
  PrivateVibeArchive,
  PublicVibeArchive,
  VibeArchive,
} from './archive';

// Storage repository interfaces (task 5.5, ARCHITECTURE §17): contracts only;
// engine adapters live under packages/platforms/.
export type {
  MemoryQuery,
  MemoryRepository,
  CardRepository,
  NowQuery,
  NowRepository,
  ConversationQuery,
  ConversationRepository,
  ConnectionQuery,
  ConnectionRepository,
  KnowledgeSourceQuery,
  KnowledgeSourceRepository,
  ContactMethodRepository,
  VibeRepositories,
} from './repositories';

// In-memory reference adapter (task 5.5): zero-setup repository set for
// tests/demos; also the second engine pinned by the conformance suite.
export { createInMemoryRepositories, createFixtureRepositories } from './in-memory-store';
export type { InMemorySeed } from './in-memory-store';

// Structured memory retrieval (task 5.6, ARCHITECTURE §7/§18 stage 1): the
// default path — deterministic, needs no embeddings or vector store.
export {
  DEFAULT_RETRIEVAL_LIMIT,
  RetrievalInputError,
  permissionFilteredCandidates,
  queryTerms,
  keywordScore,
  recencyScore,
  retrieveMemories,
} from './retrieval';
export type {
  RetrievalAudience,
  RetrievalInput,
  RetrievedMemory,
  VisibilityDecision,
} from './retrieval';

// RetrievalProvider seam (task 5.6, stages 2–3): optional embeddings behind
// the interface, an owner-scoped vector-store interface (reference in-memory
// implementation only — we do not build a vector database), and optional
// reranking. Semantic retrieval never changes Core records.
export {
  RetrievalProviderError,
  embeddingProviderFromModel,
  createHashEmbeddingProvider,
  createInMemoryVectorStore,
  createStructuredRetrievalProvider,
  createSemanticRetrievalProvider,
  indexMemoryEmbedding,
  ownerNamespace,
  passThroughReranker,
  createKindBoostReranker,
  retrieveWithOptionalRerank,
} from './retrieval-provider';
export type {
  EmbeddingProvider,
  VectorEntry,
  VectorHit,
  VectorStore,
  RetrievalProvider,
  SemanticRetrievalProviderOptions,
  Reranker,
} from './retrieval-provider';

// Knowledge-source adapters (task 5.6): file/note/link/external ingestion
// with deterministic chunking and full provenance; chunk retrieval applies
// the same visibility-before-retrieval discipline (owner-private default).
export {
  DEFAULT_CHUNK_SIZE,
  chunkContent,
  fileKnowledgeAdapter,
  noteKnowledgeAdapter,
  linkKnowledgeAdapter,
  externalKnowledgeAdapter,
  KNOWLEDGE_SOURCE_ADAPTERS,
  retrieveKnowledgeChunks,
} from './knowledge';

// Portable canonical knowledge bundle (managed <-> self-hosted).
export {
  KNOWLEDGE_BUNDLE_FORMAT,
  KNOWLEDGE_BUNDLE_SCHEMA_VERSION,
  KNOWLEDGE_BUNDLE_MAX_SOURCE_BYTES,
  KNOWLEDGE_BUNDLE_MAX_TOTAL_BYTES,
  exportKnowledgeBundle,
  importKnowledgeBundle,
} from './knowledge-bundle';
export type {
  PortableKnowledgeBundle,
  PortableKnowledgeSource,
  CanonicalKnowledgeSource,
  ImportedKnowledgeBundle,
  KnowledgeBundleErrorCode,
  KnowledgeBundleResult,
} from './knowledge-bundle';
export type {
  KnowledgeSourceKind,
  KnowledgeProvenance,
  KnowledgeChunk,
  KnowledgeIngestionResult,
  KnowledgeIngestInput,
  KnowledgeSourceAdapter,
  KnowledgeAudience,
  KnowledgeVisibilityDecision,
  RetrievedKnowledgeChunk,
  KnowledgeRetrievalInput,
} from './knowledge';

export * as vibeFixtures from './fixtures/vibe';
export * as nowFixtures from './fixtures/now';
