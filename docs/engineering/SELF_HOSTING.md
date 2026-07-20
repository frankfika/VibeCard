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

The server listens on `http://127.0.0.1:8787` (localhost-mapped by default)
with data persisted in the `vibecard-data` volume. Verify:

```bash
curl http://127.0.0.1:8787/healthz
```

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
| `POST /api/v1/owner/delete-all` | Erase everything; **requires a private export newer than the last write** |

### Public (unauthenticated, rate-limited, moderated)

| Method & path | Purpose |
|---|---|
| `GET /api/v1/public/card` | Public Card projection: Card + ≤3 active Now items, no contact data |
| `POST /api/v1/public/chat` | Visitor conversation with the public Vibe (public evidence only) |
| `POST /api/v1/public/requests` | Submit a connection request (specific reason required) |
| `GET /api/v1/public/requests/:id?visitorId=` | Visitor views their own request; unlocked contacts appear only after owner `connect` |

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

Every stranger-supplied text (chat messages, request fields) passes a
`moderate(text)` hook **before** storage or model invocation:

```ts
type ModerationHook = (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
```

Pass your hook to `createApp({ config, provider, moderate })`. The default
self-hosted hook is a passthrough (it never invents a verdict); the WeChat
deployment plugs `msgSecCheck` into the same seam. **The contract is
fail-closed**: if the hook throws or returns a malformed verdict, the request
fails with `moderation_unavailable` (503) and nothing is stored — stranger
content is never defaulted to safe. A negative verdict fails with
`moderation_rejected` (403).

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
2. **Disaster copy (optional):** with the server stopped, also copy the
   SQLite file (`vibecard.db` plus any `-wal`/`-shm` siblings) and the
   `vibecard.db.owner.json` sidecar. With Docker, back up the
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
