# VibeCard Architecture: Competition MVP To Open Source Core

> Product scope: [`../product/PRODUCT.md`](../product/PRODUCT.md)  
> Execution order: [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md)  
> AI contracts: [`AI_BEHAVIOR.md`](AI_BEHAVIOR.md)

This document describes both the smallest competition architecture and the
boundaries that let it grow into a fully open-source, self-hostable,
cross-platform personal AI system.

---

# 1. Architecture Goal

Support one shared loop across WeChat Mini Program and Web:

```text
Owner talks to My Vibe
-> Owner confirms a memory
-> Owner publishes selected memory to VibeCard
-> Visitor talks to the public-facing Vibe
-> Visitor submits a specific connection request
-> Owner decides whether to share contact information
```

The architecture must keep private owner memory separate from public Card data.

WeChat Cloud Development is the first deployment adapter, not the permanent
domain boundary.

---

# 2. Existing Code To Reuse

## Web

```text
packages/web/
```

Reuse:

- React and TypeScript application shell
- Card creation and editing
- Public Card and embed views
- Share drawer, QR code, and short links
- Existing profile migration
- Playwright setup

## WeChat Mini Program

```text
packages/miniprogram/
```

Reuse:

- Native Mini Program shell
- Card creation and editing
- Share entry
- WeChat login
- Cloud Development
- User, moderation, reporting, and blocking functions

## Shared

```text
packages/shared/
```

The completed competition baseline uses three domain contracts and deterministic fixtures:

- `VibeCard`
- `Memory`
- `ConnectionRequest`

Milestone 4.5 adds the versioned `NowItem` contract without adding social-graph
or feed contracts.

## Legacy Capabilities

Keep in place but outside the current navigation:

- Threads
- Games
- Discover
- Vibe Points
- Web3 identity and contracts
- Platform adapters

Do not migrate relationship or private memory data on-chain.

---

# 3. System Shape

```text
WeChat Mini Program          Web / Public Card
          |                         |
          +----------+--------------+
                     |
              WeChat Cloud Functions
                     |
       +-------------+-------------+
       |             |             |
     user          agent       connection
       |             |             |
       +-------------+-------------+
                     |
              WeChat Cloud Database
                     |
       users / memories / cards / now_items /
       conversations / connection_requests
```

For the competition MVP, do not introduce:

- Microservices
- A separate vector database
- A knowledge graph
- A message queue
- Multi-agent negotiation
- A second backend for Web

Web and Mini Program use the same logical cloud data and agent behavior.
After the competition, the same behavior moves behind platform-independent
interfaces. WeChat remains one client and one deployment adapter.

---

# 4. Six Data Collections

Existing legacy collections may remain. The Now-enhanced competition product
centers on six logical collections.

## `users`

Purpose:

- WeChat identity
- Owner settings
- Private contact methods
- Block state
- V1 profile migration metadata

Contact methods live here or in an owner-only subobject. They do not belong in the public Card object.

## `memories`

Uses the `Memory` contract from `AI_BEHAVIOR.md`.

Required indexes:

- `ownerId + status`
- `ownerId + visibility + updatedAt`

Only confirmed, active memory may be retrieved.

## `cards`

Uses the `VibeCard` contract from `AI_BEHAVIOR.md`.

Contains only public Card fields. A Card is an owner-approved projection, not the full owner profile.

Required index:

- Public Card slug or ID

## `now_items`

Stores owner-confirmed recent public updates separately from private memory.

Required indexes:

- `ownerId + status + publishedAt`
- `ownerId + expiresAt`

Only published, non-expired items enter the public Card projection. There is no
global-feed, follower, ranking, like, or comment index.

## `conversations`

Stores:

- Owner or visitor mode
- Participant IDs
- Message references or bounded recent messages
- Created and updated time
- Closed or active status

Keep owner and visitor conversations distinguishable. Do not mix private owner chat into a visitor session.

## `connection_requests`

Uses the `ConnectionRequest` contract from `AI_BEHAVIOR.md`.

Stores:

- Visitor-confirmed reason
- Owner-facing summary
- Owner action
- Selected contact method IDs after acceptance

Required indexes:

- `ownerId + ownerAction + createdAt`
- `visitorId + createdAt`

---

# 5. Cloud Function Boundaries

## Existing `login`

Keep current WeChat identity creation.

## Existing `user`

Extend only when needed for:

- V2 profile migration
- Card owner settings
- Private contact method selection
- Agent enabled state

## New `agent`

Actions added milestone by milestone:

```text
ownerMessage
extractMemoryProposal
generateCardDraft
visitorMessage
summarizeConnection
```

Responsibilities:

- Load the correct role
- Apply memory visibility before retrieval
- Call moderation when required
- Call the configured model provider
- Validate structured output
- Return typed results or typed errors

## New `connection`

Actions:

```text
createRequest
listInbox
getRequest
actOnRequest
```

Responsibilities:

- Enforce identity and rate limits
- Check report and block state
- Store visitor-confirmed intent
- Apply owner action
- Unlock only the contact method selected by the owner

## Existing `content-check`

Reuse after changing stranger-content failure behavior:

- Retry transient failure
- Return unavailable or pending when still failing
- Never default stranger-generated content to safe

## Existing `report`

Reuse report and block state for visitor conversations and requests.

---

# 6. AI Provider Boundary

The client never calls a model provider directly.

```ts
interface AgentProvider {
  ownerMessage(input: OwnerMessageInput): Promise<OwnerAgentResult>;
  visitorMessage(input: VisitorMessageInput): Promise<VisitorAgentResult>;
  generateCardDraft(input: CardDraftInput): Promise<VibeCard>;
  summarizeConnection(input: ConnectionInput): Promise<ConnectionSummary>;
}
```

Requirements:

- Provider credentials stay in cloud-function configuration
- A deterministic mock provider is available for tests and demo fallback
- Every provider result is schema-validated
- Raw model text never controls application state
- Invalid output retries once, then returns a typed error

The first implementation may use one configured cloud model. The open-source
phase adds OpenAI-compatible, bring-your-own-key, local-model, and private-model
adapters without changing the agent business contract.

---

# 7. Memory Retrieval

The MVP does not require embeddings.

Start with:

1. Filter by owner
2. Filter by confirmed and active status
3. Filter by visibility for the current role
4. Select recent and relevant memory by kind and simple keyword/topic matching
5. Keep the prompt context bounded

If quality later requires semantic search, add it behind the same retrieval interface. Do not change the public `Memory` contract for embeddings.

## Owner Mode

May retrieve:

- `public`
- `agent_only`
- `connected`
- `private`

## Visitor Mode

May quote:

- `public`

May use only for a boundary decision, without quoting:

- `agent_only`

May not retrieve:

- `connected`
- `private`

Permission filtering occurs before content enters the model prompt.

---

# 8. Main Flows

## Owner Memory Flow

```text
Owner sends message
-> agent.ownerMessage
-> normal reply
-> optional single memory proposal
-> owner confirms, edits, or rejects
-> connection/user data layer persists decision
```

The chat reply must not fail only because memory extraction fails.

## Card Draft Flow

```text
Owner requests Card update
-> retrieve confirmed memory
-> agent.generateCardDraft
-> show owner a preview or diff
-> owner accepts
-> write public cards collection
```

AI never publishes automatically.

## Visitor Flow

```text
Visitor opens public Card
-> receive public Card projection
-> create visitor conversation
-> agent.visitorMessage with public evidence
-> visitor confirms connection reason
-> connection.createRequest
```

Contact details are not loaded into the visitor conversation.

## Owner Request Flow

```text
Owner opens inbox
-> connection.getRequest
-> read concise summary and original reason
-> choose connect / later / decline
-> if connect, select one contact method
-> show Vibe matched
```

---

# 9. V1 Compatibility

Existing users have profile data in Web local storage and Mini Program `users.namecard`.

Migration rules:

- Read v1 data without forcing a new onboarding
- Map existing name, avatar, bio, tags, intent, highlights, and event to a Card draft
- Keep existing owner-written text
- Do not publish new AI-generated fields without confirmation
- Do not expose previously stored contact details on the V2 public Card
- Record schema version after the owner accepts the V2 Card

Migration should be additive. Do not destroy v1 data during the competition build.

---

# 10. Client Responsibilities

## Mini Program

- Primary competition experience
- Owner login and private Vibe
- Card creation and sharing
- Visitor deep link
- Connection inbox and action

## Web

- Public Card and shared-link landing
- Visitor conversation
- Owner experience for development and fallback
- End-to-end test surface

## Shared

- Domain contracts
- Output types
- Deterministic fixtures
- Pure helpers without platform APIs

Clients do not implement independent permission or connection-recommendation logic.

---

# 11. Target Folder Additions

Add only when the matching development-plan task starts:

```text
packages/shared/
├── vibe.ts
└── fixtures/
    └── vibe.ts

packages/miniprogram/cloudfunctions/
├── agent/
└── connection/

packages/miniprogram/miniprogram/pages/
├── agent-chat/
├── requests/
└── request-detail/

packages/web/src/pages/
├── AgentPage.tsx
├── RequestsPage.tsx
└── VisitorAgentPage.tsx
```

Names may follow existing local conventions, but avoid creating duplicate owner and visitor domain models.

---

# 12. Reliability

Every AI action returns one of:

```text
success
model_unavailable
moderation_unavailable
invalid_model_output
permission_denied
rate_limited
blocked
not_found
```

Clients must provide:

- Loading
- Empty
- Retry
- Permission denied
- Agent disabled
- Model unavailable

Retries must be idempotent for request submission and memory confirmation.

---

# 13. Security Checklist

- Model keys exist only in server configuration
- Public Card response contains no private contact data
- Memory permissions are applied before retrieval
- AI output is schema-validated
- Visitor content is moderated
- Visitor requests are rate-limited
- Report and block state is enforced before model calls
- Logs omit secrets, full contacts, and private memory text
- Prompt injection fixtures pass
- Owner decides exactly which contact method is shared

---

# 14. Deferred Competition Features

After the competition only:

- Desktop Vibe Pet
- Voice capture
- File and link ingestion
- Semantic/vector retrieval
- Bring-your-own-key
- Local and private models
- NFC Card management
- Additional platform adapters

All future clients must reuse the same `VibeCard`, `Memory`, `ConnectionRequest`, and visibility rules.

---

# 15. Open Source Architecture Principles

The post-competition product is not a hosted community with an open client. The
complete runnable personal AI system must be open source.

Principles:

- A user can run VibeCard without an official VibeCard account
- A user can choose local, self-hosted, or managed infrastructure
- No mandatory model, database, vector store, or knowledge-base vendor
- All user data can be exported, imported, and deleted
- Public sharing does not grant access to private memory
- Official cloud and self-hosted deployments use the same public contracts
- Platform clients do not fork memory, permission, or connection logic
- Community feeds, follower graphs, ranking, and recommendation are not core infrastructure

The commercial product is managed operation of the open system: availability,
sync, backups, model usage, retrieval, public-agent hosting, notifications, and
support.

---

# 16. Four Data Layers

Long-term storage must preserve four explicit boundaries:

| Layer | Examples | Default exposure |
|---|---|---|
| Raw Data | Conversations, imported files, notes, links | Owner-local or owner-private |
| Private Memory | Confirmed facts, preferences, boundaries, current context | Owner and permitted agent only |
| Public Identity | Card, selected highlights, published Now items | Public snapshot |
| Interaction Data | Visitor sessions, connection requests, owner decisions | Relevant owner and visitor |

Publishing is a projection from private state into public identity. It is never
an automatic copy of raw data.

For the competition, a Now item may be embedded in the public Card snapshot.
The open-source Core later gives it a versioned repository interface so history
and archival do not turn into a social-feed model.

---

# 17. Portable Core Boundaries

The open-source extraction should create small interfaces around existing
behavior, only as the matching roadmap task begins.

```ts
interface MemoryRepository {
  list(query: MemoryQuery): Promise<Memory[]>;
  save(memory: Memory): Promise<void>;
  delete(id: string): Promise<void>;
}

interface RetrievalProvider {
  retrieve(input: RetrievalInput): Promise<RetrievedMemory[]>;
}

interface ModelProvider {
  complete(input: ModelInput): Promise<ModelOutput>;
}

interface PublicCardRepository {
  get(cardId: string): Promise<PublicCardSnapshot | null>;
  publish(snapshot: PublicCardSnapshot): Promise<void>;
}

interface ConnectionRepository {
  create(request: ConnectionRequest): Promise<void>;
  listForOwner(ownerId: string): Promise<ConnectionRequest[]>;
  decide(input: ConnectionDecision): Promise<void>;
}
```

Rules:

- Permission filtering happens before `ModelProvider` receives context
- Embedding identifiers and vendor metadata do not enter public domain contracts
- Clients receive structured outputs, not provider-specific response objects
- Repositories accept versioned domain records
- Platform authentication maps into a Core actor identity at the adapter boundary

---

# 18. Memory And Retrieval Strategy

VibeCard should not build a new vector database.

The open-source value is the Personal AI Memory Engine above storage:

```text
ingest
-> propose memory
-> owner confirms
-> classify visibility and freshness
-> retrieve for a role
-> project to Card / Now
-> answer or create a connection request
```

Retrieval evolves without changing product contracts:

1. Structured filters, time weighting, kinds, and keyword matching
2. Optional embeddings behind `RetrievalProvider`
3. Optional reranking for larger knowledge sets
4. Optional file and knowledge-base ingestion

Suggested adapters may include local SQLite, IndexedDB, PostgreSQL with vector
support, and external open-source vector stores. None is required by the Core.

---

# 19. Three Runtime Modes

## Local

- Private conversation and memory stay on the device
- User chooses a local or bring-your-own model
- Card can be exported as a static snapshot
- No official account is required

## Self-Hosted

- User deploys the open server and H5 client
- User chooses database, retrieval, model, domain, and storage
- Public agent and connection requests remain available while the owner is offline

## VibeCard Cloud

- Managed deployment of the same open contracts
- Stable share URL, sync, backups, managed memory and retrieval
- Model routing, usage credits, abuse protection, notifications, and support
- Private source data is collected only for explicitly enabled services

Users must be able to move between modes through a documented, versioned export
format.

---

# 20. Cross-Platform Order

Implement clients in this order:

1. WeChat Mini Program for the competition and Chinese sharing loop
2. H5 / PWA as the default open and self-hostable client
3. Embeddable public Card and agent SDK
4. Desktop Vibe Pet for local ingestion, training, and quick capture
5. iOS / Android when notifications, voice, offline use, and device integration justify native clients
6. Additional platform adapters only when they reuse Core contracts

Do not build separate backends per client. A new platform is an adapter and an
experience shell around the same identity, memory, permission, public snapshot,
and connection behavior.
