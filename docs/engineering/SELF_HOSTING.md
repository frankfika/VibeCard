# Self-Hosting VibeCard

> Server source: `packages/server/` · Deploy assets: `deploy/` · Behavior contract: [`AI_BEHAVIOR.md`](AI_BEHAVIOR.md) · Boundary: [`ARCHITECTURE.md`](ARCHITECTURE.md) §19

The open server runs the complete core product — owner agent (My Vibe),
public Card, visitor agent, Now updates, connection requests, portable
`.vibe` export/import — on your own machine or VPS.

**No VibeCard Cloud account or key is required.** The default model provider
is the deterministic mock (zero keys, zero network); any OpenAI-compatible
endpoint — managed, bring-your-own-key, or a local model server — drops in
via environment variables without code changes
([`MODEL_ADAPTERS.md`](MODEL_ADAPTERS.md)).

---

## 1. Quickstart (one command)

### With Docker

```bash
cp deploy/.env.example deploy/.env   # set VIBECARD_OWNER_TOKEN
docker compose -f deploy/docker-compose.yml up --build
```

The private API listens on `http://127.0.0.1:8787`; the built H5/PWA and its
same-origin API proxy listen on `http://127.0.0.1:8080`. Data is persisted in
the `vibecard-data` and `vibecard-web-data` volumes. Verify both layers:

```bash
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:8080/healthz
```

Open `http://127.0.0.1:8080`, choose self-hosted mode, and keep the default
service address. On a public deployment that default becomes the current HTTPS
origin; `/api/v1/*` stays same-origin and is forwarded inside Docker.

### Without Docker (Node 24+)

```bash
npm ci                                  # repo root, once
VIBECARD_OWNER_TOKEN=$(openssl rand -base64 32) npm start --prefix packages/server
```

Same result: `http://127.0.0.1:8787`, SQLite at `./data/vibecard.db`.

### First five minutes

```bash
TOKEN=your-owner-token
# 1. create an identity (or import a .vibe archive instead)
curl -X POST http://127.0.0.1:8787/api/v1/owner/identity \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"林舟"}'
# 2. talk to My Vibe (mock provider proposes a memory on memory-worthy text)
curl -X POST http://127.0.0.1:8787/api/v1/owner/vibe/messages \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"message":"记住：我最近在研究自托管部署。"}'
# 3. open your public Card exactly as a visitor sees it
curl http://127.0.0.1:8787/api/v1/public/card
```

---

## 2. Configuration

Everything is an environment variable; the full documented template is
[`deploy/.env.example`](../deploy/.env.example). Highlights:

| Variable | Default | Meaning |
|---|---|---|
| `VIBECARD_OWNER_TOKEN` | *(generated ephemeral)* | Single-owner bearer token for all `/api/v1/owner/*` endpoints |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | Bind address (localhost-first) |
| `VIBECARD_DB_PATH` | `./data/vibecard.db` | SQLite file; migrations run automatically at startup |
| `CORS_ORIGIN` | `*` | Allowed browser origin for the H5 client |
| `AI_PROVIDER` | auto (`mock`) | `mock` or `openai-compatible` |
| `AI_API_BASE` / `AI_MODEL` / `AI_API_KEY` | — | OpenAI-compatible endpoint (managed, BYOK, or local) |
| `AI_TIMEOUT_MS` | `15000` | Model request timeout |
| `REQUIRE_MODERATION` | `0` localhost quickstart | Set to `1` before public exposure; Core refuses unsafe startup and Web rejects public snapshot publication unless an HTTP moderation service is configured |
| `MODERATION_API_URL` | *(none)* | `POST {"text":"..."}` endpoint returning `{ "ok": true }` or `{ "ok": false, "reason": "..." }` |
| `MODERATION_API_KEY` | *(none)* | Optional bearer token sent only to the moderation endpoint |
| `MODERATION_TIMEOUT_MS` | `5000` | Moderation request timeout; timeout fails closed |
| `ENABLE_PUBLIC_SNAPSHOTS` | `0` | Operator-only compatibility endpoint; normal local/remote sharing creates no Web snapshot |
| `PUBLIC_SNAPSHOT_TTL_MS` | `604800000` (7d) | Compatibility snapshot lifetime; Web clamps it to at most 30 days |
| `RATE_LIMIT_CHAT_PER_HOUR` | `30` | Visitor chat token bucket (per visitor id + IP) |
| `RATE_LIMIT_REQUESTS_PER_HOUR` | `10` | Connection-request token bucket |
| `MAX_BODY_BYTES` | `2097152` | Max JSON body size |

If `VIBECARD_OWNER_TOKEN` is unset, the server starts with a random ephemeral
token and prints it — convenient for a first look, never for a real
deployment.

---

## 3. HTTP API map

All endpoints are versioned under `/api/v1` (plus `/healthz`), speak JSON,
and send CORS headers for browser clients.

### Owner (requires `Authorization: Bearer $VIBECARD_OWNER_TOKEN`)

| Method & path | Purpose |
|---|---|
| `POST /api/v1/owner/identity` | Create a fresh identity (`{name, avatarUrl?}`) |
| `POST /api/v1/owner/import` | Import a `.vibe` archive (`{archive, force?}`); migrates older versions |
| `GET /api/v1/owner/card` | Read the Card |
| `PUT /api/v1/owner/card` | Edit + publish the Card (the Card record *is* the public projection) |
| `POST /api/v1/owner/card/draft` | AI Card draft from confirmed memories (never auto-publishes) |
| `POST /api/v1/owner/vibe/messages` | Talk to My Vibe; returns reply + `memoryProposalId` / `nowDraftId` when proposed |
| `GET /api/v1/owner/memories?status=&visibility=` | List memories |
| `POST /api/v1/owner/memories/:id/confirm` | Confirm a proposal (`{content?, visibility?}`) |
| `POST /api/v1/owner/memories/:id/reject` | Reject a proposal |
| `PUT /api/v1/owner/memories/:id/edit` | Edit kind/content/visibility (status untouched) |
| `POST /api/v1/owner/memories/:id/pause` · `/resume` · `DELETE .../delete` | Lifecycle |
| `GET /api/v1/owner/now?status=` | List Now items (full history) |
| `POST /api/v1/owner/now` | Write a draft Now item |
| `POST /api/v1/owner/now/:id/publish` · `/archive` · `/hide` · `DELETE .../delete` | Now lifecycle |
| `GET` / `POST /api/v1/owner/contacts` · `DELETE .../contacts/:id` | Private contact methods (never public) |
| `GET /api/v1/owner/requests?action=` | Connection inbox |
| `GET /api/v1/owner/requests/:id/summary` | Evidence-based AI summary (never a score) |
| `POST /api/v1/owner/requests/:id/action` | `connect` (requires `sharedContactMethodIds`) / `later` / `decline` |
| `GET /api/v1/owner/export?kind=private\|public&includeConversations=1` | `.vibe` archive export |
| `POST /api/v1/owner/knowledge/import` | Import a validated `vibecard-knowledge-bundle` owned by the current identity |
| `GET /api/v1/owner/knowledge/export` | Export exact Base64 UTF-8 source text + metadata; chunks are rebuilt (no embeddings/provider metadata) |
| `POST /api/v1/owner/knowledge/search` | Owner retrieval across all allowed knowledge visibility levels |
| `POST /api/v1/owner/delete-all` | Erase everything; **requires a private export newer than the last write** |

### Public (unauthenticated, rate-limited, moderated)

| Method & path | Purpose |
|---|---|
| `GET /api/v1/public/card` | Public Card projection: Card + ≤3 active Now items, no contact data |
| `POST /api/v1/public/chat` | Visitor conversation with the public Vibe (public evidence only) |
| `POST /api/v1/public/requests` | Submit a connection request (specific reason required) |
| `GET /api/v1/public/requests/:id?visitorId=` | Visitor views their own request; unlocked contacts appear only after owner `connect` |
| `POST /api/v1/public/knowledge/search` | Moderated/rate-limited structured retrieval over `public` chunks only (`visitorId`, `query`) |

### Health

`GET /healthz` → `{ ok, db: { ok, schemaVersion }, provider: { name, capabilities }, identity }`.

---

## 4. Security defaults

- **Localhost-first bind.** Bare metal defaults to `127.0.0.1`; compose maps
  the container port to host loopback. Expose only behind a TLS reverse proxy.
- **Single-owner bearer token**, compared in constant time. Unauthenticated
  owner access is `401 unauthorized`.
- **Permission filtering before retrieval.** The visitor agent only ever sees
  confirmed `public` memories (quotable) plus confirmed `agent_only` memories
  (boundary-only, passed without ids). `connected` and `private` memories
  provably never enter a visitor prompt; a defensive second net
  (`forbiddenForVisitor`) drops anything that slipped through.
- **Contact data has no public path.** `VibeCard` cannot carry contact
  details by construction; values are released only into a `connect`ed
  request the owner explicitly acted on, and only to the requesting visitor.
- **AI output is schema-validated** (Core validators, one retry, then typed
  `invalid_model_output`). Raw model text never decides application state.
- **No debug leakage.** Error responses use the ARCHITECTURE §12 vocabulary
  with static messages; stack traces, provider bodies, and keys never appear
  in responses or logs (logs go through bearer/`sk-…`/URL-key redaction).
- **Rate limits** on visitor chat and request submission (in-memory token
  bucket per visitor id + IP), on top of the Core 24h one-request-per-pair
  and decline-cooldown gates.
- **Visitor round cap**: six rounds, then the conversation closes without a
  model call.

### Moderation hook

Every stranger-supplied text (chat messages, request fields, and every public
string projected into an anonymous Web Card snapshot) passes a
`moderate(text)` hook **before** storage or model invocation:

```ts
type ModerationHook = (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
```

Pass your hook to `createApp({ config, provider, moderate })`, or configure
`MODERATION_API_URL` for the packaged server. The default self-hosted hook is
a passthrough for loopback-only development. The copied Compose template binds
both ports to loopback and keeps `REQUIRE_MODERATION=0`, so the documented
visitor loop works without a placeholder service. Compose passes the same
moderation URL, key, timeout, and required flag to both Core and Web. Before
public exposure, set `REQUIRE_MODERATION=1` and a real `MODERATION_API_URL`;
startup and runtime then fail closed without that hook. A rejected, unavailable,
timed-out, or malformed verdict cannot create a public snapshot. The WeChat deployment plugs `msgSecCheck` into the same
seam. **The contract is
fail-closed**: if the hook throws or returns a malformed verdict, the request
fails with `moderation_unavailable` (503) and nothing is stored — stranger
content is never defaulted to safe. A negative verdict fails with
`moderation_rejected` (403).

Normal sharing does not call the anonymous snapshot endpoint. Local mode puts
only the public projection in the `?c=` URL; self-hosted and managed modes link
that projection to the canonical public runtime via `source`. Therefore clearing
a browser cannot strand a permanent server copy. `/api/cards` publication is
retained only as an operator compatibility feature, defaults to disabled, always
requires a working moderation hook when enabled, issues independent unguessable
IDs, and expires every record within the configured TTL (hard maximum 30 days).

---

## 5. Backups, restore, upgrade

### Backup

1. **Portable backup (recommended):** export the complete private archive —
   `GET /api/v1/owner/export?kind=private&includeConversations=1`, or offline:
   ```bash
   npm run backup --prefix packages/server -- --out backup.vibe
   ```
   The archive carries integrity checksums and contains every data layer
   except credentials (the format has no fields for secrets by construction).
   If knowledge was ingested, also export
   `GET /api/v1/owner/knowledge/export`. Knowledge text is deliberately kept
   in this separate versioned bundle because the `.vibe` knowledge section is
   metadata-only. Delete-all requires both exports to be fresh when knowledge
   sources exist, including whitespace-only sources that yield no chunks.
2. **Disaster copy (optional):** with the server stopped, also copy the
   SQLite file (`vibecard.db` plus any `-wal`/`-shm` siblings) and the
   `vibecard.db.owner.json` and `vibecard.db.knowledge.json` sidecars. With Docker, back up the
   `vibecard-data` volume.

### Restore

Into a fresh store (server stopped or a fresh container):

```bash
npm run restore --prefix packages/server -- --in backup.vibe          # refuses to overwrite
npm run restore --prefix packages/server -- --in backup.vibe --force  # overwrite an identity
```

or over HTTP with `POST /api/v1/owner/import`. Restore validates, migrates
older archive versions, and verifies checksums; public archives are rejected
(a projection can never prove private state). The automated backup/restore
test proves a full round trip preserves the complete Core fixture state.
After identity restore, import an accompanying knowledge bundle with:

```bash
jq -n --slurpfile bundle knowledge.json '{bundle:$bundle[0]}' |
  curl -X POST http://127.0.0.1:8787/api/v1/owner/knowledge/import \
    -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    --data-binary @-
```

The Server rejects malformed, future-version, tampered, foreign-owner, and
runtime-metadata-polluted bundles before changing stored retrieval state.

### Upgrade

1. Export a private archive (step 5.1).
2. Start the new version — SQLite migrations are versioned, up-only, and run
   automatically at startup inside a transaction (a failed migration leaves
   the old version intact).
3. Verify `/healthz` (`db.schemaVersion`) and the public Card.

If anything looks wrong, restore the archive into the previous version.

---

## 6. Files

```text
packages/server/
├── package.json            own test/start scripts (node --import tsx --test)
├── Dockerfile              image build (context: repo root)
├── src/
│   ├── main.ts             entrypoint
│   ├── app.ts              HTTP API + composition of Core, store, provider
│   ├── cli.ts              backup / restore CLI
│   ├── config.ts           env configuration (secure defaults)
│   ├── provider.ts         mock / OpenAI-compatible provider selection
│   ├── moderation.ts       pluggable fail-closed moderation hook
│   ├── rate-limit.ts       in-memory token buckets
│   ├── prompts.ts          agent prompt assembly (cloud-parity port)
│   └── redact.ts           log redaction
└── test/
    ├── smoke.test.ts       spawned-server end-to-end loop + restore + delete-all
    ├── permissions.test.ts auth, visibility, Now lifecycle, moderation, rate limits
    └── backup-restore.test.ts  fixture-state round trip via CLI

deploy/
├── docker-compose.yml      one service + data volume
└── .env.example            every variable documented, no real secrets
```
