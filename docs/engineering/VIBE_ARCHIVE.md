# The Portable Vibe Archive (`.vibe`)

Status: v1, implemented in `packages/shared/archive.ts` (task 5.3).

A VibeCard owner must be able to move between the three runtime modes
(ARCHITECTURE §19 — local, self-hosted, VibeCard Cloud) without losing
anything. The `.vibe` archive is the vehicle: a **single versioned JSON
document** that a client may carry as a `.vibe` file (for example
`linzhou-2026-07.vibe`). This document is the format specification; the Core
module is the reference implementation.

Everything here is pure data. The Core never touches storage, the
filesystem, the network, or a model — clients serialize, encrypt, persist,
import, and delete.

## 1. Top-level shape

```jsonc
{
  "format": "vibecard-vibe-archive",   // constant marker
  "schemaVersion": 1,                  // top-level archive schema version
  "kind": "private",                   // "private" | "public"
  "createdAt": 1752000000000,          // export timestamp (ms)
  "app": { "name": "vibecard-miniprogram", "version": "1.4.0" },
  "encryption": null,                  // see §6 — always null in plaintext
  "sectionVersions": {                 // per-section schema versions
    "profile": 1, "card": 1, "now": 1, "memories": 1,
    "conversations": 1, "knowledgeSources": 1, "connections": 1,
    "contactMethods": 1, "attachments": 1
  },
  "integrity": {                       // optional checksums, or null
    "algorithm": "fnv1a-32",
    "sections": { "card": "........", "memories": "........" }
  },

  // --- sections ---
  "profile":           { ... } | null, // private only
  "card":              { ...VibeCard },
  "nowItems":          [ ... ],        // private: full NowItem history
                                       // public: PublicNowItem projection
  "memories":          [ ...Memory ],  // private only (all statuses)
  "conversations":     { "exported": false, "items": [ ... ] },
  "knowledgeSources":  [ ... ],        // private only (placeholder)
  "connectionRequests":[ ... ],        // private only
  "contactMethods":    [ ... ],        // private only — NEVER public
  "attachments":       [ ... ]         // metadata only, private only
}
```

Versioning rules:

- `schemaVersion` is the archive's own version, independent of the
  `schemaVersion` inside each domain record.
- Every section is independently versioned via `sectionVersions`; a future
  change can bump one section without re-versioning the whole archive.
- Version `0` (a hypothetical pre-1.0 prototype format) is readable only
  through `migrateArchive`, which upgrades it to v1. Versions newer than the
  reader supports fail with `future_version` — never with a best-effort
  partial import.

## 2. Section inventory

| Section | Private export | Public export | Contents |
|---|---|---|---|
| `profile` | yes | `null` | Minimal owner identity (`id`, `name`, `avatarUrl`) |
| `card` | yes | yes | The owner-confirmed `VibeCard` |
| `nowItems` | full history | active projection | Private: every `NowItem` incl. draft/archived/hidden/deleted. Public: at most 3 active `PublicNowItem`s via `projectActiveNowItems` |
| `memories` | yes | `[]` | Confirmed AND proposed (and paused/deleted) `Memory` records, all four visibilities |
| `conversations` | opt-in | empty | `{ exported, items }`; `items` is non-empty only when the owner explicitly selected conversation export |
| `knowledgeSources` | yes | `[]` | Placeholder metadata for future file/URL/note ingestion (ARCHITECTURE §18); no real ingestion exists yet |
| `connectionRequests` | yes | `[]` | Requests incl. the owner's decision (`ownerAction`, `sharedContactMethodIds`) |
| `contactMethods` | yes | `[]` | Owner-private contact data — the most sensitive section |
| `attachments` | yes | `[]` | Manifest entries: `fileName`, `sizeBytes`, `sha256`, `mediaType`, `note`, `relatedTo` — **metadata only** |

Conversation/message export shape (minimal, versioned, defined for export
purposes because the Core has no conversation contract yet):

```jsonc
{
  "id": "...", "schemaVersion": 1, "ownerId": "...",
  "kind": "owner_vibe" | "visitor",
  "visitorId": null | "...",
  "messages": [
    { "id": "...", "schemaVersion": 1, "conversationId": "...",
      "role": "owner" | "vibe" | "visitor" | "agent",
      "text": "...", "createdAt": 0 }
  ],
  "createdAt": 0, "updatedAt": 0
}
```

## 3. Public vs private — the boundary

Two different functions, not one function with a flag:

- `exportPrivateArchive(input)` — the complete owner state across all Four
  Data Layers (ARCHITECTURE §16), except credentials (§5).
- `exportPublicArchive(input)` — a strict projection: the Card plus the
  active-Now projection, exactly what a visitor may see. Private sections
  are **empty by construction** — the function never receives memories,
  contacts, conversations, or attachment notes, so it cannot leak them.

Validation enforces the boundary in both directions: a `kind: "public"`
document carrying a profile, any memory, contact method, connection request,
conversation, or attachment fails validation with
`public_boundary_violation`. The test suite additionally proves absence by
recursive scan: no non-public memory content, no contact values, no
conversation text, no attachment notes, and no non-active Now text appear
anywhere in a serialized public archive.

## 4. Validation and typed errors

`importArchive(raw)` = `migrateArchive` → `validateArchive` → normalize.
Every failure is a typed, discriminated result — never a thrown exception:

```ts
type ArchiveResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ArchiveErrorCode; message: string } };
```

| Code | Meaning |
|---|---|
| `invalid_shape` | Not an object, wrong format marker, or a malformed section |
| `unsupported_version` | A known-old version passed to `validateArchive` without migration, or no migration path exists |
| `future_version` | `schemaVersion` newer than this Core supports |
| `section_version_mismatch` | A `sectionVersions` entry disagrees with the archive version |
| `checksum_mismatch` | An `integrity` checksum does not match the section payload |
| `encrypted_archive` | `encryption` is non-null; the client must decrypt first (§6) |
| `public_boundary_violation` | Private data found inside a public archive |
| `wrong_kind` | e.g. a deletion plan requested from a public archive |

Checksums are optional and dependency-free: fnv1a-32 over a canonical JSON
serialization (object keys sorted recursively). When `integrity` is null,
validation skips checksums.

## 5. What the format can never contain

The format has **no fields for model keys, access tokens, or server
secrets**. This is structural, not a convention: there is nowhere in the
schema to express them, and export inputs are typed domain objects that do
not carry credential material. Client configuration (API keys, model
endpoints, sync credentials) lives outside the archive and must be
re-entered by the owner after import.

Attachments are likewise **metadata only**: an archive records that
`vibecard-draft.pdf` (204 800 bytes, sha256 `…`) existed and what it related
to, but never silently includes local file bytes. After import the owner
re-attaches files manually; the manifest tells them what is missing.

## 6. Optional client-side encryption

Private archives will usually contain private memory, contact methods, and
possibly conversations — clients SHOULD encrypt them at rest. Encryption
sits **outside the Core**:

1. The client serializes the archive to JSON.
2. The client encrypts the serialized bytes with an owner-held key
   (algorithm and KDF are the client's choice).
3. Before import, the client decrypts and hands the Core plaintext only.

The `encryption: { algorithm, hint } | null` field is metadata for the
envelope: an encrypted `.vibe` file may carry an outer marker describing how
it was encrypted (with `hint` for the owner's passphrase reminder). The Core
only ever sees the decrypted document, where `encryption` is null; a
non-null value fails validation with `encrypted_archive` so ciphertext is
never half-parsed.

## 7. Migrations

`migrateArchive(raw)` dispatches on the archive version through a table of
single-step migrations and chains them until the current version:

```ts
const MIGRATIONS = { 0: migrateV0toV1 /*, 1: migrateV1toV2, … */ };
```

The proven path is v0 → v1. The hypothetical v0 prototype format differed
from v1 by: top-level `version` instead of `schemaVersion`; a `meta` blob
instead of `createdAt`/`app`; section names `now`, `connections`,
`contacts`, `knowledge`; and Now items without `sourceMemoryId`. The
migration renames sections, splits `meta`, defaults `sourceMemoryId` to
null, initializes the new v1 fields (`profile`, `encryption`,
`sectionVersions`, `integrity`), and — critically — **preserves every id
unchanged**.

## 8. Identifiers

All stable identifiers round-trip unchanged: Card id, memory ids, Now item
ids, contact method ids, connection request ids, conversation/message ids,
knowledge-source ids, and attachment ids. **No id must be re-keyed on
import.** An import into a store that already holds colliding ids is a
client-level merge decision, not a format concern; the archive itself never
rewrites identity.

## 9. Export-then-delete

Canonical user data must be exportable **and** deletable (AGENTS.md §4).
After a private export has been verified (imported successfully elsewhere,
or at minimum re-validated), `buildDeletionPlan(archive)` returns exactly
which records the client must delete:

```ts
{
  ownerId, cardIds, nowItemIds, memoryIds, contactMethodIds,
  connectionRequestIds, conversationIds, messageIds, knowledgeSourceIds,
  attachmentManifestIds, attachmentFileNames
}
```

The boundary is deliberate: **the Core cannot delete client storage** — it
returns the plan; the client executes it against its own database and files.
Local files referenced by the attachment manifest are listed by name
separately so the client can ask the owner before deleting bytes. A
`kind: "public"` archive can never authorize deletion (`wrong_kind`): a
public projection is not proof that private state was preserved.
