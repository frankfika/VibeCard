import test from 'node:test';
import assert from 'node:assert/strict';
import { removeAdapterCredentials, validateAdapterManifest } from './adapter-contract.ts';
import { AdapterRuntime, MemoryAdapterCredentialStore, type Adapter, type AdapterInvocation } from './adapter-runtime.ts';
import { jsonPublicCardExporter } from './reference-json-export.ts';
import { referenceNoteKnowledgeAdapter } from './reference-note-knowledge.ts';
import { runAdapterConformance } from './adapter-conformance.ts';
import { ProcessAdapterHost } from './process-adapter-host.ts';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

const fixtureRoot = fileURLToPath(new URL('./test-fixtures/', import.meta.url));
const fixture = (name: string) => join(fixtureRoot, name);

test('adapter manifests declare capabilities and permissions', () => {
  const result = validateAdapterManifest({ id: 'ollama.local', version: '1.0.0', kind: 'model', capabilities: ['chat'], permissions: ['network'] });
  assert.equal(result.ok, true);
});

test('invalid adapter permissions are rejected and credentials can be removed', () => {
  const result = validateAdapterManifest({ id: 'share.bad', version: '1.0.0', kind: 'share', capabilities: [], permissions: ['read_owner_data'] });
  assert.equal(result.ok, false);
  assert.deepEqual(removeAdapterCredentials({ 'share.bad': 'secret', other: 'keep' }, 'share.bad'), { other: 'keep' });
});

test('runtime enforces declared capability and permission before adapter code runs', async () => {
  let runs = 0;
  const adapter: Adapter = {
    manifest: { id: 'reference.safe', version: '1.0.0', kind: 'share', capabilities: ['share_card'], permissions: ['read_public_card'] },
    async run({ input }) { runs += 1; return input; },
  };
  const runtime = new AdapterRuntime();
  runtime.register(adapter);
  runtime.enable('reference.safe');
  await assert.rejects(runtime.invoke('reference.safe', { capability: 'share_card', permission: 'read_owner_data', input: {} }), /permission_denied/);
  await assert.rejects(runtime.invoke('reference.safe', { capability: 'read_secrets', permission: 'read_public_card', input: {} }), /unsupported_capability/);
  assert.equal(runs, 0);
});

test('disable and remove revoke credentials and invalidate cached active state', async () => {
  const credentials = new MemoryAdapterCredentialStore();
  const seen: unknown[] = [];
  const adapter: Adapter = {
    manifest: { id: 'reference.credentialed', version: '1.0.0', kind: 'model', capabilities: ['chat'], permissions: ['network', 'store_credentials'] },
    async run(_invocation, context) { seen.push(context.getCredential()); return 'ok'; },
  };
  const runtime = new AdapterRuntime(credentials);
  runtime.register(adapter);
  runtime.enable('reference.credentialed', 'secret-one');
  await runtime.invoke('reference.credentialed', { capability: 'chat', permission: 'network', input: 'hello' });
  runtime.disable('reference.credentialed');
  assert.equal(runtime.isEnabled('reference.credentialed'), false);
  assert.equal(credentials.get('reference.credentialed'), undefined);
  await assert.rejects(runtime.invoke('reference.credentialed', { capability: 'chat', permission: 'network', input: 'retry' }), /adapter_disabled/);
  runtime.enable('reference.credentialed', 'secret-two');
  runtime.remove('reference.credentialed');
  assert.equal(credentials.get('reference.credentialed'), undefined);
  await assert.rejects(runtime.invoke('reference.credentialed', { capability: 'chat', permission: 'network', input: 'retry' }), /adapter_not_found/);
  assert.deepEqual(seen, ['secret-one']);
});

test('adapter failure stays isolated and invalidates cached active state', async () => {
  const failing: Adapter = {
    manifest: { id: 'reference.failing', version: '1.0.0', kind: 'knowledge', capabilities: ['search'], permissions: ['read_owner_data'] },
    async run() { throw new Error('raw provider stack and secret'); },
  };
  const runtime = new AdapterRuntime();
  runtime.register(failing);
  runtime.enable('reference.failing');
  await assert.rejects(runtime.invoke('reference.failing', { capability: 'search', permission: 'read_owner_data', input: 'query' }), error => {
    assert.equal((error as Error).message, 'adapter_failed');
    return true;
  });
  assert.equal(runtime.isEnabled('reference.failing'), false);
  await assert.rejects(runtime.invoke('reference.failing', { capability: 'search', permission: 'read_owner_data', input: 'retry' }), /adapter_disabled/);
});

test('reference public Card exporter passes the contribution conformance boundary', async () => {
  const runtime = new AdapterRuntime();
  runtime.register(jsonPublicCardExporter);
  runtime.enable(jsonPublicCardExporter.manifest.id);
  const card = { schemaVersion: 1 as const, id: 'card-1', ownerId: 'owner-1', name: 'Owner', avatarUrl: '', headline: '', currentFocus: '', canHelpWith: [], wantsToMeet: [], topics: [], highlights: [], agentEnabled: true, updatedAt: 1, privateMemory: 'never export', contactMethods: [{ value: 'secret' }], _id: 'database-row' };
  const output = await runtime.invoke<typeof card, string>(jsonPublicCardExporter.manifest.id, { capability: 'export_public_card', permission: 'read_public_card', input: card });
  assert.equal(JSON.parse(output).name, 'Owner');
  assert.equal('privateMemory' in JSON.parse(output), false);
  assert.equal('contactMethods' in JSON.parse(output), false);
  assert.equal('_id' in JSON.parse(output), false);
  await assert.rejects(runtime.invoke(jsonPublicCardExporter.manifest.id, { capability: 'export_public_card', permission: 'read_owner_data', input: card }), /permission_denied/);
});

test('a public Card capability cannot relabel raw input as network permission', async () => {
  let seen: unknown = null;
  const adapter: Adapter = {
    manifest: {
      id: 'reference.public-network', version: '1.0.0', kind: 'share',
      capabilities: ['share_card'], permissions: ['read_public_card', 'network'],
    },
    async run({ input }) { seen = input; return input; },
  };
  const runtime = new AdapterRuntime();
  runtime.register(adapter); runtime.enable(adapter.manifest.id);
  const injected = { id: 'card-1', ownerId: 'owner-1', name: 'Owner', privateMemory: 'secret', contactMethods: [{ value: 'private' }], _id: 'row' };
  await assert.rejects(
    runtime.invoke(adapter.manifest.id, { capability: 'share_card', permission: 'network', input: injected }),
    /permission_denied: network/,
  );
  assert.equal(seen, null, 'permission mismatch must be denied before adapter code runs');
  const projected = await runtime.invoke<typeof injected, Record<string, unknown>>(adapter.manifest.id, { capability: 'share_card', permission: 'read_public_card', input: injected });
  assert.equal('privateMemory' in projected, false);
  assert.equal('contactMethods' in projected, false);
  assert.equal('_id' in projected, false);
  assert.equal(validateAdapterManifest({
    ...adapter.manifest,
    capabilityPermissions: { share_card: 'network' },
  }).ok, false, 'the adapter manifest cannot override a host-owned public capability');
});

test('disabling an adapter aborts in-flight work and withholds its result and credential', async () => {
  let release!: () => void;
  let started!: () => void;
  const startedPromise = new Promise<void>(resolve => { started = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  const seen: unknown[] = [];
  const slow: Adapter = {
    manifest: { id: 'reference.slow', version: '1.0.0', kind: 'model', capabilities: ['chat'], permissions: ['network', 'store_credentials'] },
    async run(_invocation, context) { started(); await wait; seen.push(context.getCredential()); return 'late result'; },
  };
  const runtime = new AdapterRuntime();
  runtime.register(slow);
  runtime.enable('reference.slow', 'secret');
  const pending = runtime.invoke('reference.slow', { capability: 'chat', permission: 'network', input: 'hello' });
  await startedPromise;
  runtime.disable('reference.slow');
  release();
  await assert.rejects(pending, /adapter_disabled/);
  assert.deepEqual(seen, []);
});

test('registering a replacement aborts the old generation and revokes its credential', async () => {
  let release!: () => void;
  let started!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const startedPromise = new Promise<void>(resolve => { started = resolve; });
  const credentials = new MemoryAdapterCredentialStore();
  const manifest = { id: 'reference.replaceable', version: '1.0.0', kind: 'model' as const, capabilities: ['chat'], permissions: ['network', 'store_credentials'] as const };
  const oldAdapter: Adapter = {
    manifest: { ...manifest, permissions: [...manifest.permissions] },
    async run() { started(); await wait; return 'old late result'; },
  };
  const replacement: Adapter = {
    manifest: { ...manifest, version: '2.0.0', permissions: [...manifest.permissions] },
    async run() { return 'new result'; },
  };
  const runtime = new AdapterRuntime(credentials);
  runtime.register(oldAdapter); runtime.enable(manifest.id, 'old-secret');
  const pending = runtime.invoke(manifest.id, { capability: 'chat', permission: 'network', input: 'hello' });
  await startedPromise;
  runtime.register(replacement);
  release();
  await assert.rejects(pending, /adapter_disabled/);
  assert.equal(credentials.get(manifest.id), undefined);
  assert.equal(runtime.isEnabled(manifest.id), false);
  runtime.enable(manifest.id, 'new-secret');
  assert.equal(await runtime.invoke(manifest.id, { capability: 'chat', permission: 'network', input: 'hello' }), 'new result');
});

test('registration preserves prototype-based adapter implementations', async () => {
  class ClassAdapter implements Adapter<{ name: string }, string> {
    manifest = {
      id: 'class-adapter', version: '1.0.0', kind: 'exporter' as const,
      capabilities: ['export_public_card'], permissions: ['read_public_card' as const],
    };
    private readonly prefix = 'class';
    async run(invocation: AdapterInvocation<{ name: string }>) {
      return `${this.prefix}:${invocation.input.name}`;
    }
  }

  const runtime = new AdapterRuntime();
  runtime.register(new ClassAdapter());
  runtime.enable('class-adapter');
  assert.equal(await runtime.invoke('class-adapter', {
    capability: 'export_public_card', permission: 'read_public_card', input: { name: 'Projected' },
  }), 'class:Projected');
});

test('all reviewed reference adapters pass the same reusable contribution suite', async () => {
  const card = {
    schemaVersion: 1 as const, id: 'card-1', ownerId: 'owner-1', name: 'Owner', avatarUrl: '', headline: 'Builder',
    currentFocus: 'Private AI', canHelpWith: ['Product'], wantsToMeet: ['Builders'], topics: ['AI'], highlights: [],
    agentEnabled: true, updatedAt: 1, privateMemory: 'strip me', contactMethods: [{ value: 'strip me' }],
  };
  await runAdapterConformance({
    adapter: jsonPublicCardExporter,
    invocation: { capability: 'export_public_card', permission: 'read_public_card', input: card },
    assertOutput(output) {
      const parsed = JSON.parse(output);
      assert.equal(parsed.name, 'Owner');
      assert.equal('privateMemory' in parsed, false);
      assert.equal('contactMethods' in parsed, false);
    },
  });
  await runAdapterConformance({
    adapter: referenceNoteKnowledgeAdapter,
    invocation: {
      capability: 'ingest_note', permission: 'read_owner_data',
      input: {
        ownerId: 'owner-1', title: 'Design note', locator: 'note:privacy', content: 'Private by default.',
        now: 100, sourceId: 'source-1', chunkIdPrefix: 'chunk',
      },
    },
    assertOutput(output) {
      assert.equal(output.source.ownerId, 'owner-1');
      assert.equal(output.chunks.length, 1);
      assert.equal(output.chunks[0]?.visibility, 'private');
      assert.equal(output.chunks[0]?.provenance.adapterName, 'note');
    },
  });
});

test('reference knowledge adapter rejects malformed owner input instead of emitting invalid canonical records', async () => {
  const runtime = new AdapterRuntime();
  runtime.register(referenceNoteKnowledgeAdapter);
  runtime.enable(referenceNoteKnowledgeAdapter.manifest.id);
  await assert.rejects(runtime.invoke(referenceNoteKnowledgeAdapter.manifest.id, {
    capability: 'ingest_note', permission: 'read_owner_data',
    input: { ownerId: '', title: 'Bad', locator: 'note:bad', content: 'text', now: -1, sourceId: 'source', chunkIdPrefix: 'chunk' },
  }), error => {
    assert.equal((error as Error).message, 'adapter_failed');
    return true;
  });
});

test('process host projects public input before unreviewed adapter code and rejects path escape', async () => {
  const host = new ProcessAdapterHost({ allowedRoots: [fixtureRoot] });
  const descriptor = {
    manifest: {
      id: 'fixture.process-public', version: '1.0.0', kind: 'exporter' as const,
      capabilities: ['export_public_card'], permissions: ['read_public_card' as const],
    },
    modulePath: fixture('process-public-adapter.mjs'),
  };
  host.register(descriptor);
  host.enable(descriptor.manifest.id);
  const output = await host.invoke<Record<string, unknown>, Record<string, unknown>>(descriptor.manifest.id, {
    capability: 'export_public_card', permission: 'read_public_card', input: {
      id: 'card-1', ownerId: 'owner-1', name: 'Owner', privateMemory: 'secret', contactMethods: [{ value: 'secret' }],
    },
  });
  assert.equal(output.name, 'Owner');
  assert.equal('privateMemory' in output, false);
  assert.equal('contactMethods' in output, false);
  assert.throws(() => host.register({ ...descriptor, modulePath: '/etc/passwd' }), /outside_allowed_roots/);

  const temporaryRoot = mkdtempSync(join(tmpdir(), 'vibecard-adapter-root-'));
  try {
    const escapedLink = join(temporaryRoot, 'escaped-adapter.mjs');
    symlinkSync(fixture('process-public-adapter.mjs'), escapedLink);
    const narrowHost = new ProcessAdapterHost({ allowedRoots: [temporaryRoot] });
    assert.throws(() => narrowHost.register({ ...descriptor, modulePath: escapedLink }), /outside_allowed_roots/);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('process permissions deny undeclared filesystem, network, subprocess, environment, and credential access', async () => {
  const server = createServer((_request, response) => response.end('unexpected'));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const previousSecret = process.env.VIBECARD_ADAPTER_TEST_SECRET;
  process.env.VIBECARD_ADAPTER_TEST_SECRET = 'must-not-cross-boundary';
  try {
    const host = new ProcessAdapterHost({ allowedRoots: [fixtureRoot] });
    const descriptor = {
      manifest: {
        id: 'fixture.process-safe', version: '1.0.0', kind: 'knowledge' as const,
        capabilities: ['inspect_owner_input'], permissions: ['read_owner_data' as const],
      },
      modulePath: fixture('process-safe-adapter.mjs'), exportName: 'adapter',
    };
    host.register(descriptor);
    host.enable(descriptor.manifest.id);
    const output = await host.invoke<Record<string, string>, Record<string, unknown>>(descriptor.manifest.id, {
      capability: 'inspect_owner_input', permission: 'read_owner_data',
      input: { probeUrl: `http://127.0.0.1:${address.port}/escape` },
    });
    assert.deepEqual(output, {
      input: { probeUrl: `http://127.0.0.1:${address.port}/escape` },
      environmentSecretVisible: false,
      credentialVisible: false,
      filesystemReadSucceeded: false,
      filesystemWriteSucceeded: false,
      networkSucceeded: false,
      childProcessSucceeded: false,
    });
  } finally {
    if (previousSecret === undefined) delete process.env.VIBECARD_ADAPTER_TEST_SECRET;
    else process.env.VIBECARD_ADAPTER_TEST_SECRET = previousSecret;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('process host injects only the selected adapter credential and removes it on disable', async () => {
  const credentials = new MemoryAdapterCredentialStore();
  const host = new ProcessAdapterHost({ allowedRoots: [fixtureRoot] }, credentials);
  const descriptor = {
    manifest: {
      id: 'fixture.process-credential', version: '1.0.0', kind: 'model' as const,
      capabilities: ['complete'], permissions: ['network' as const, 'store_credentials' as const],
    },
    modulePath: fixture('process-credential-adapter.mjs'),
  };
  host.register(descriptor);
  host.enable(descriptor.manifest.id, { token: 'adapter-own-secret' });
  assert.deepEqual(await host.invoke(descriptor.manifest.id, {
    capability: 'complete', permission: 'network', input: 'hello',
  }), { input: 'hello', credentialMatches: true });
  host.disable(descriptor.manifest.id);
  assert.equal(credentials.get(descriptor.manifest.id), undefined);
  await assert.rejects(host.invoke(descriptor.manifest.id, {
    capability: 'complete', permission: 'network', input: 'retry',
  }), /adapter_disabled/);
  host.enable(descriptor.manifest.id, { token: 'adapter-own-secret' });
  host.remove(descriptor.manifest.id);
  assert.equal(credentials.get(descriptor.manifest.id), undefined);
  await assert.rejects(host.invoke(descriptor.manifest.id, {
    capability: 'complete', permission: 'network', input: 'removed',
  }), /adapter_not_found/);
});

test('process host grants network only to an adapter that declares it', async () => {
  const server = createServer((_request, response) => response.end('model-response'));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const host = new ProcessAdapterHost({ allowedRoots: [fixtureRoot] });
    const manifest = {
      id: 'fixture.process-network', version: '1.0.0', kind: 'model' as const,
      capabilities: ['complete'], permissions: ['network' as const],
    };
    host.register({ manifest, modulePath: fixture('process-network-adapter.mjs') });
    host.enable(manifest.id);
    assert.deepEqual(await host.invoke(manifest.id, {
      capability: 'complete', permission: 'network', input: { url: `http://127.0.0.1:${address.port}/complete` },
    }), { status: 200, text: 'model-response' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('process host enforces timeout, output bounds, abort, and lifecycle revocation', async () => {
  const slowManifest = {
    id: 'fixture.process-slow', version: '1.0.0', kind: 'knowledge' as const,
    capabilities: ['wait'], permissions: ['read_owner_data' as const],
  };
  const timeoutHost = new ProcessAdapterHost({ allowedRoots: [fixtureRoot], timeoutMs: 100 });
  timeoutHost.register({ manifest: slowManifest, modulePath: fixture('process-slow-adapter.mjs') });
  timeoutHost.enable(slowManifest.id);
  await assert.rejects(timeoutHost.invoke(slowManifest.id, {
    capability: 'wait', permission: 'read_owner_data', input: {},
  }), /adapter_timeout/);
  assert.equal(timeoutHost.isEnabled(slowManifest.id), false);

  const abortHost = new ProcessAdapterHost({ allowedRoots: [fixtureRoot], timeoutMs: 5_000 });
  abortHost.register({ manifest: slowManifest, modulePath: fixture('process-slow-adapter.mjs') });
  abortHost.enable(slowManifest.id);
  const controller = new AbortController();
  const pending = abortHost.invoke(slowManifest.id, {
    capability: 'wait', permission: 'read_owner_data', input: {},
  }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /adapter_aborted/);
  const pendingDisable = abortHost.invoke(slowManifest.id, {
    capability: 'wait', permission: 'read_owner_data', input: {},
  });
  abortHost.disable(slowManifest.id);
  await assert.rejects(pendingDisable, /adapter_disabled/);
  assert.equal(abortHost.isEnabled(slowManifest.id), false);

  const replacementHost = new ProcessAdapterHost({ allowedRoots: [fixtureRoot], timeoutMs: 5_000 });
  replacementHost.register({ manifest: slowManifest, modulePath: fixture('process-slow-adapter.mjs') });
  replacementHost.enable(slowManifest.id);
  const replacedPending = replacementHost.invoke(slowManifest.id, {
    capability: 'wait', permission: 'read_owner_data', input: {},
  });
  replacementHost.register({
    manifest: { ...slowManifest, version: '2.0.0' },
    modulePath: fixture('process-slow-v2-adapter.mjs'),
  });
  await assert.rejects(replacedPending, /adapter_disabled/);
  assert.equal(replacementHost.isEnabled(slowManifest.id), false);
  replacementHost.enable(slowManifest.id);
  assert.equal(await replacementHost.invoke(slowManifest.id, {
    capability: 'wait', permission: 'read_owner_data', input: {},
  }), 'replacement-result');

  const outputHost = new ProcessAdapterHost({ allowedRoots: [fixtureRoot], maxOutputBytes: 1_024 });
  const largeManifest = {
    id: 'fixture.process-large', version: '1.0.0', kind: 'knowledge' as const,
    capabilities: ['expand'], permissions: ['read_owner_data' as const],
  };
  outputHost.register({ manifest: largeManifest, modulePath: fixture('process-large-adapter.mjs') });
  outputHost.enable(largeManifest.id);
  await assert.rejects(outputHost.invoke(largeManifest.id, {
    capability: 'expand', permission: 'read_owner_data', input: {},
  }), /adapter_output_too_large/);
  assert.equal(outputHost.isEnabled(largeManifest.id), false);
});

test('process host contains a crashing adapter that corrupts its protocol channel', async () => {
  const host = new ProcessAdapterHost({ allowedRoots: [fixtureRoot] });
  const manifest = {
    id: 'fixture.process-malformed', version: '1.0.0', kind: 'knowledge' as const,
    capabilities: ['corrupt'], permissions: ['read_owner_data' as const],
  };
  host.register({ manifest, modulePath: fixture('process-malformed-adapter.mjs') });
  host.enable(manifest.id);
  await assert.rejects(host.invoke(manifest.id, {
    capability: 'corrupt', permission: 'read_owner_data', input: {},
  }), error => {
    assert.equal((error as Error).message, 'adapter_failed');
    return true;
  });
  assert.equal(host.isEnabled(manifest.id), false);
});
