# Adapter contract and contribution guide

Third-party integrations declare an `AdapterManifest` in
`packages/platforms/adapter-contract.ts`. The manifest names capabilities and
permissions explicitly; adapters never receive raw ORM or provider records.
The adapter ecosystem is deliberately not a social network, feed, ranking
system, or mandatory centralized marketplace.

Supported kinds are `model`, `storage`, `knowledge`, `theme`, `share`,
`importer`, and `exporter`.

## Manifest and data permissions

Every capability is bound to one input permission:

- `read_public_card`: receives a strict Core-owned public Card projection.
- `read_owner_data`: receives only the owner input required for the call.
- `write_owner_data`: receives a canonical write command selected by Core.
- `network`: permits an outbound provider operation with no canonical input.
- `store_credentials`: is ambient and never relabels public or owner data.

When a manifest has exactly one data permission, the runtime can infer its
capability binding. A manifest with multiple data permissions must declare
`capabilityPermissions`. Host-owned public capabilities such as `share_card`
and `export_public_card` always require `read_public_card`; a manifest cannot
override that rule by also asking for `network` or owner access.

```ts
const manifest = {
  id: 'example.notes',
  version: '1.0.0',
  kind: 'knowledge',
  capabilities: ['ingest_note'],
  permissions: ['read_owner_data'],
};
```

## Two execution boundaries

`AdapterRuntime` is the reviewed/cooperative in-process boundary. It validates
manifests on registration, rejects undeclared capabilities and permissions
before code runs, and applies the public Card allowlist before a
`read_public_card` call. Credentials are resolved lazily only when
`store_credentials` was declared. Implementation exceptions become the stable
`adapter_failed` error and disable the active generation.

`ProcessAdapterHost` is the boundary for unreviewed JavaScript adapters. The
trusted parent never imports their module. Each invocation starts a fresh Node
process and communicates over one bounded JSON protocol:

```ts
const host = new ProcessAdapterHost({
  allowedRoots: ['/opt/vibecard/adapters/example.notes'],
  timeoutMs: 2_000,
});

host.register({
  manifest,
  modulePath: '/opt/vibecard/adapters/example.notes/index.mjs',
});
host.enable(manifest.id);
const result = await host.invoke(manifest.id, {
  capability: 'ingest_note',
  permission: 'read_owner_data',
  input: canonicalOwnerSelectedNote,
});
```

The process host enforces these boundaries before adapter code runs:

- The module must resolve, including symlinks, below an explicitly allowed,
  non-root installation directory.
- Input and output are JSON-only and byte-bounded.
- Every call has a deadline and optional caller `AbortSignal`.
- macOS uses a mandatory Seatbelt child-process profile; Linux uses a
  mandatory Bubblewrap namespace. Construction fails closed when neither OS
  sandbox is available.
- Filesystem reads are limited to the adapter install root and the trusted
  runner by an independent Node permission allowlist. The OS sandbox makes the
  filesystem read-only, while native addons, worker threads, and child
  processes are denied by the combined process policies.
- Network is denied unless the manifest declares `network`.
- The child receives a scrubbed environment rather than server secrets.
- Only the selected adapter's credential is sent, only when it declares
  `store_credentials`, and only to that short-lived invocation process.
- Raw errors, logs, stdout, stderr, and stack traces do not cross the protocol.
- Oversized output, malformed output, crashes, or timeouts disable that
  generation and return a stable host error.

`allowedRoots` is trusted deployment policy, not adapter input. Configure one
narrow installation root per adapter (including only that adapter's vendored
dependencies). Never use a home directory, workspace root, shared package
cache, or system prefix: every readable file below the selected root is inside
that adapter's filesystem grant.

The process boundary limits filesystem, network, process, environment, memory,
time, and canonical-data access. A deployment with a stronger hostile-code
threat model can place the same protocol inside a dedicated OS account,
container, or microVM as additional defense in depth; the adapter API never
requires granting the plugin access to the main VibeCard process.

Production process adapters are ESM JavaScript (`.mjs`) and must export an
object with the exact registered manifest plus:

```ts
async run(invocation, { signal, getCredential }) {
  // Return a JSON-serializable value.
}
```

## Revocation and credentials

Disabling, removing, or replacing an adapter is a revocation event. Both hosts
invalidate the active generation, abort or kill in-flight work, withhold late
results, and delete its stored credential. A cached caller cannot keep using a
disabled generation. Removing an adapter does not delete canonical Card,
memory, knowledge, or connection data.

Credentials are never part of a manifest, invocation input, log, or canonical
export. The credential store is host-owned. Unreviewed adapters get no ambient
server environment and cannot request another adapter's credential.

## Reference adapters

Two reviewed adapters demonstrate different privacy boundaries:

- `reference-json-export.ts` exports only the already-projected public
  `VibeCard` and declares `read_public_card`.
- `reference-note-knowledge.ts` accepts owner-selected note text as input and
  delegates deterministic ingestion to the platform-free Core knowledge
  adapter. It defaults chunks to `private`, preserves provenance, performs no
  file/network access, and declares `read_owner_data`.

The process-host fixtures additionally prove that public projection still
happens before unreviewed code and that a declared network-only provider can
reach a provider without receiving owner data.

## Contribution conformance

Every reviewed reference or contributed adapter must run through
`runAdapterConformance` from `adapter-conformance.ts`. The reusable suite checks
manifest validity, disabled-by-default behavior, pre-execution capability and
permission rejection, a valid invocation, and disable/remove revocation. Add a
case with a representative valid input and semantic output assertions.

The platform security suite also covers:

- malicious public fields (`privateMemory`, contacts, database metadata);
- capability relabeling attempts;
- credential deletion and per-adapter credential delivery;
- in-flight disable, removal, and replacement;
- process path and symlink containment;
- denied filesystem reads/writes, network, subprocess, environment-secret,
  and undeclared-credential access;
- timeout, abort, malformed/crashed process, and output-size isolation.

Run:

```bash
npx tsc -p packages/platforms/tsconfig.json
node --import tsx --test packages/platforms/adapter-contract.test.ts
```

An adapter contribution is not accepted merely because its happy path works.
Its requested permissions must be minimal, its inputs and outputs must remain
canonical and versioned, and its negative privacy assertions must pass.
