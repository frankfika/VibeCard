# Storage Adapters And The Local Reference Store (Task 5.5)

Status: implemented on branch `feature/task-5.5-storage-adapters`.

This document covers the repository interfaces, the local SQLite reference
store, the adapter conformance suite, and the mapping from the existing
WeChat Cloud collections onto the repository contracts.

## 1. Repository Interfaces (`packages/shared/repositories.ts`)

Pure, platform-free TypeScript contracts. Implementations live outside the
Core. Rules enforced by contract and by the conformance suite:

- Repositories accept and return versioned Core records only. Storage-vendor
  metadata (SQLite rowids, cloud `_id`, index definitions) never appears in
  the contracts; adapters map at the boundary.
- All list reads use one deterministic ordering: `updatedAt` descending,
  ties broken by `id` ascending (`listByOwner` for contact methods is
  `createdAt` asc, id asc, since it backs a stable owner settings list).
- `save` is an upsert keyed by the Core-assigned record `id`; ids are stable
  across export/import.
- `remove` is a hard delete used to execute archive deletion plans. Domain
  tombstones (`status: 'deleted'`) remain a Core lifecycle concern.
- Everything is async so local and remote adapters share one call shape.

Interfaces:

| Interface | Key reads |
| --- | --- |
| `MemoryRepository` | `get`, `list({ ownerId, status?, visibility? })`, `save`, `remove` |
| `CardRepository` | `get`, `getByOwner`, `save`, `remove` |
| `NowRepository` | `get`, `list({ ownerId, status? })`, `save`, `remove` |
| `ConversationRepository` | `get`, `list({ ownerId, kind?, visitorId? })`, `save` (whole record, messages embedded), `remove` |
| `ConnectionRepository` | `get`, `listForOwner({ ownerId, action? })`, `listForVisitor`, `listByPair`, `save`, `remove` |
| `KnowledgeSourceRepository` | `get`, `list({ ownerId, status? })`, `save`, `remove` |
| `ContactMethodRepository` | `get`, `listByOwner`, `save`, `remove` |
| `VibeRepositories` | aggregate of all of the above |

Design decisions:

- **Now is its own repository, not part of `CardRepository`.** ARCHITECTURE
  §4 keeps `cards` and `now_items` as separate collections with separate
  indexes; Now items have an independent lifecycle
  (draft → published → archived/hidden/deleted); and the public projection
  reads Now items without touching the Card record. Folding them together
  would force every Card read to carry an unbounded Now history.
- **`ContactMethodRepository` exists even though ARCHITECTURE §17 does not
  sketch it**: the private archive (task 5.3) carries a `contactMethods`
  section and `buildDeletionPlan()` emits `contactMethodIds`, so a local or
  self-hosted owner needs a storage home for contact methods to round-trip
  archives and execute deletion plans. It is owner-session only; no public
  Card read path touches it.
- **Conversations use the `ArchiveConversation` Core record** (messages
  embedded, bounded), matching how the WeChat `conversations` collection
  stores documents. Owner (`owner_vibe`) and visitor conversations stay
  distinguishable via `kind`.

## 2. Local Reference Store (`packages/platforms/local-store/`)

- **Engine**: `node:sqlite` (`DatabaseSync`, Node ≥ 22 built-in). No native
  dependencies, no network, no service. Chosen over IndexedDB (browser-only)
  and JSONL (no transactional integrity) because it gives real transactions
  and runs anywhere Node runs.
- **Schema**: one table per collection; the full Core record lives in a
  `data` JSON column; only filter/index columns are extracted. Reads always
  deserialize `data`, so rowids/columns/indexes never leak into domain code.
- **Migrations**: explicit, up-only, versioned in a `schema_migrations`
  table (`version`, `name`, `applied_at`). Each migration runs inside one
  `BEGIN IMMEDIATE` / `COMMIT` transaction together with its version-row
  insert, so a crash or throw mid-migration leaves the database at either
  the old version or the new one — never in between. Current schema is
  version 2 (`create-core-tables`, `add-query-indexes`; the indexes mirror
  ARCHITECTURE §4). Tested: ordering/recording, no-op re-open, failed
  migration rolls back partial writes including DDL and the store migrates
  forward afterwards, and a crash simulation (connection closed with an open
  transaction) preserves committed state.
- **Concurrent writes**: `PRAGMA journal_mode = WAL` (readers never block
  the writer), `PRAGMA busy_timeout = 5000` (a second writer waits instead
  of failing with `SQLITE_BUSY`). Within one process `DatabaseSync`
  statements are synchronous, so interleaved async writers serialize
  naturally; across connections SQLite serializes writers. Tested: two
  connections write interleaved batches and read each other's committed
  data; same-id upserts from two connections converge to one record.
- **Entry point**: `createLocalRepositories(path | DatabaseSync)` →
  `LocalRepositories` (a `VibeRepositories` plus `close()` and a
  diagnostics-only `schemaVersion()`).
- **Tests**: `cd packages/platforms/local-store && npm test`
  (`node --import tsx --test test/*.test.ts`; no npm-workspace registration
  required).

## 3. Adapter Conformance Suite (`packages/platforms/local-store/conformance.ts`)

`runRepositoryConformanceTests(label, makeAdapter)` pins engine-agnostic
behavior for every repository: save/get round-trips with stable ids,
unknown-id → `null`, upsert-instead-of-duplicate, owner isolation, every
query filter (status/visibility/action/kind/visitorId, single and array),
deterministic ordering, hard deletes removing records from later retrieval,
and a full private-archive export → serialize → import → persist into a
fresh adapter instance → re-export, asserting byte-identical canonical JSON.

The suite runs against **two** engines today (20 tests each):

- the SQLite local store (file-backed, temp dir per instance)
- the Core in-memory reference adapter (`createInMemoryRepositories`)

Pinning both proves the suite tests the contract, not SQLite quirks. A
future database (PostgreSQL, IndexedDB, …) reuses the suite by supplying
only `makeAdapter`.

## 4. WeChat Cloud Mapping (Option b — documented mapping, no rewrite)

We chose **option (b): a documented interface mapping plus the fixture-backed
in-memory reference adapter in the Core**, rather than wrapping a cloud
function's data layer (option a). Reasons:

- The cloud functions are the live production backend. Their data access is
  interleaved with `wx-server-sdk` context (`OPENID`), content moderation,
  and rate limiting; extracting a "thin" adapter would mean editing
  deployed code paths for no behavioral gain, violating the task's
  do-not-rewrite constraint in spirit.
- The collections already map almost 1:1 onto the repository contracts, so
  an honest document plus a runnable second adapter (the in-memory one,
  which the conformance suite executes) demonstrates conformance without
  touching deploy semantics. A real cloud adapter can be added later as a
  new module in `packages/platforms/` and immediately validated by the same
  conformance suite.

### Collection → repository mapping

| Cloud collection | Repository | Notes |
| --- | --- | --- |
| `memories` | `MemoryRepository` | `list({ownerId, status, visibility})` ↔ `db.collection('memories').where({ownerId, status, visibility})`; cloud `_id` ↔ Core `id`; retrieval already filters `status: 'confirmed'` server-side (ARCHITECTURE §7). |
| `cards` | `CardRepository` | `getByOwner` ↔ `where({ownerId}).limit(1)`; public reads project the same `VibeCard` shape (never contact data). |
| `now_items` | `NowRepository` | `list({ownerId, status})` ↔ `where({ownerId, status}).orderBy('publishedAt','desc')`; the public Card path selects via Core `latestActiveNow` on the same records. |
| `conversations` | `ConversationRepository` | Whole-document upsert with embedded bounded messages matches the cloud document shape; `kind` ↔ owner/visitor mode field; `visitorId` ↔ participant id. |
| `connection_requests` | `ConnectionRepository` | `listForOwner({action})` ↔ owner inbox query; `listByPair` ↔ the `where({ownerId, visitorId})` read used by the 24h rate-limit/decline-cooldown gate (`checkConnectionCreateAllowed`); `listForVisitor` ↔ visitor-side history. |
| `users` (contact methods, block state) | `ContactMethodRepository` (contact methods only) | Contact methods live in the owner-only `users` document today; the repository contract is the extraction point when they move to per-owner records in self-hosted mode. Block state stays an owner-settings concern outside repositories. |
| (none yet) | `KnowledgeSourceRepository` | Reserved by the archive format (§knowledgeSources); no cloud collection exists yet — ingestion ships with task 5.6. |

Lifecycle rules (memory confirmation, connection transitions, Now
projection, visibility filtering) stay in the Core (`memory.ts`,
`connection.ts`, `now.ts`, `visibility.ts`) and their cloud mirrors under
`cloudfunctions/*/lib/core.js`; parity is enforced by
`packages/shared/test/parity.test.ts`. Repositories only persist and query
the resulting records — no domain rules move into adapters.

## 5. Local Mode Capability Proof

`packages/platforms/local-store/test/local-mode.test.ts` runs the full
owner flow against a file-backed store with zero network: create the
fixture Card (林舟), propose → confirm a memory through Core lifecycle
functions, publish and update a Now item projected from that memory,
export a private archive from repository reads, execute the archive
deletion plan (store verified empty), import the archive into a fresh
store, and recover the same fixture identity with byte-identical canonical
re-export.
