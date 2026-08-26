# Managed Cloud Reference Service

`packages/cloud/` is a small reference gateway for an optional managed
deployment. It composes one existing open `packages/server` instance per
account instead of introducing a second domain model.

## Contract

- `POST /api/v1/cloud/accounts` creates an account, returns a bearer token once,
  and creates a stable public slug.
- Owner calls are namespaced under
  `/api/v1/cloud/accounts/:id/owner/*`; public calls use
  `/api/v1/cloud/cards/:slug/*`.
- Device registration is metadata only. Cross-device sync uses the same
  portable `.vibe` archive contract; no raw unselected conversation upload is
  required.
- Connection requests create an account notification. The owner still makes
  the final contact-unlock decision through the open Server API.
- Region and retention are explicit account metadata. The gateway does not
  silently copy data between regions.

## Plans and portability

The reference plans expose model-call and knowledge-byte quotas, estimated
usage, billing state, and managed/BYOK mode. BYOK credentials are encrypted
with the gateway master secret at rest and are never returned by the plan API.
Delinquent billing blocks managed model calls only; it does not block owner
access, export, or deletion. Switching back to BYOK does not change canonical
permissions.

The reference Pro knowledge quota is 10 MB total (10× Free, with a 10 MB
single-source ceiling). This is intentionally the largest envelope verified
for the reference gateway's bounded JSON export/import path. Knowledge export
allows one in-memory export globally and returns `503 export_busy` for a
concurrent attempt. Operators may advertise larger tiers only after adding
and validating a streaming or paginated portable-export implementation.

Every account can export a private `.vibe` archive through the same open
Server endpoint. The archive contains no account token, billing metadata, or
provider key, so it can be restored into `packages/server` self-hosted mode.
Cloud-specific IDs and notifications remain gateway metadata and do not
contaminate the portable archive.

Managed knowledge text uses a second, versioned owner-only artifact:
`GET /api/v1/cloud/accounts/:id/knowledge/export` returns a
`vibecard-knowledge-bundle` v1 document. It contains validated Core source
records plus exact Base64-encoded UTF-8 source text, not embeddings, chunks, vector indexes, provider
configuration, account ids, plan/billing fields, source-sync versions, or
credentials. Its `ownerId` is the canonical owner from the private `.vibe`
archive, never the managed account id. Retrieval chunks are rebuilt
deterministically on import, leaving one canonical text representation. The bundle has a deterministic
integrity digest and is accepted by the open Server only after strict version,
shape, owner, uniqueness, UTF-8/digest, source-count, and decoded-byte validation.

To leave managed hosting:

1. Export the private `.vibe` archive.
2. Export the portable knowledge bundle after the latest knowledge change.
3. Import the `.vibe` into a fresh open Server.
4. Import the bundle with `POST /api/v1/owner/knowledge/import`.
5. Verify owner and public retrieval, then configure the managed-link redirect.

The Cloud integration suite performs this exact HTTP round trip and compares
the managed and self-hosted structured retrieval source ordering. It also
proves private chunks remain absent from public results. Managed delete-all
continues to require a fresh knowledge-bundle export; a `.vibe` export alone
cannot authorize deletion of knowledge text.

## Leaving managed hosting without breaking shared links

After importing the private `.vibe` archive into an HTTPS self-hosted service,
the owner may set `PUT /api/v1/cloud/accounts/:id/settings/public-redirect`
with `{ "url": "https://new.example.com/api/v1/public" }`. The stable managed
Card namespace then returns HTTP 308 for Card, visitor-chat, and request paths,
preserving the method, remaining path, and query string. Only HTTPS URLs
without embedded credentials, query strings, or fragments are accepted, and a
target pointing back to the same managed Card namespace is rejected. Encoded
path segments are preserved byte-for-byte rather than double-encoded. The
owner can pass `null` to stop redirecting while the managed account still
exists. Before migration, proxied managed responses default to `no-store`
unless the upstream explicitly supplies a cache policy, preventing stale Card
content from masking a newly configured redirect.

Operators must retain this small redirect record for the published link's
promised lifetime even after canonical private data is deleted. If an operator
cannot offer that retention, the UI must disclose the link expiry before the
owner migrates; it must not silently leave old Cards pointing at another
person's data.

The integration suite exports a real managed fixture, imports it into a fresh
self-hosted Server, verifies the Card and published Now state, and asserts that
the archive contains no token, slug, plan, region, notification, or redirect
metadata.

## Service-level options and responsibilities

The repository does not itself operate a service or promise an SLA. A managed
operator must select and publish one of these concrete contracts instead of
using an undefined “production ready” claim:

| Option | Availability target | Backup / recovery target | Support target | Suitable for |
| --- | ---: | --- | --- | --- |
| Reference / best effort | No SLA | Owner export only; no operator RPO/RTO | Public issue tracker, no response promise | Evaluation and development |
| Standard managed | 99.5% monthly | Daily encrypted backup; RPO 24h, RTO 24h; quarterly restore exercise | Security acknowledgement within 2 business days | Personal Cards |
| Pro managed | 99.9% monthly | Encrypted backup at least every 4h; RPO 4h, RTO 8h; monthly restore exercise | Security acknowledgement within 4 hours, incident updates every 2 hours | Paid professional use |

The operator owns TLS, infrastructure and model-provider availability,
monitoring, backup encryption, restore exercises, incident communication,
regional subprocessors, deletion jobs, and redirect retention. The owner owns
credential protection, Card/Now publication choices, contact disclosure,
source rights, private exports, and selecting the correct region. Model output
quality is not an uptime failure; inability to retrieve the owner/public API is.
Scheduled maintenance counts as downtime unless the selected contract says
otherwise in advance.

Every deployment must publish its selected option, measurement window,
exclusions, incident contact, security disclosure address, subprocessor list,
and the exact redirect-retention period. Until that record exists, the service
is Reference / best effort regardless of configured plan names.

The gateway is a reference implementation, not a claim of production
availability. A production deployment still needs TLS, secret rotation,
region-specific storage, billing-provider webhooks, backups, monitoring, and
an incident response process.
