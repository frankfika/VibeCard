import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startApp, OWNER_TOKEN } from '../../server/test/helpers.ts';
import { createManagedGateway } from '../../cloud/src/gateway.ts';
import { runConnectionExample, runOwnerExample, runVisitorExample } from '../examples/client-flows.ts';

test('runnable SDK examples execute against the real self-hosted server', async () => {
  const server = await startApp();
  try {
    const identity = await fetch(`${server.base}/api/v1/owner/identity`, {
      method: 'POST',
      headers: { authorization: `Bearer ${OWNER_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'SDK Self-hosted Owner' }),
    });
    assert.equal(identity.status, 201);
    const owner = await runOwnerExample({ endpoint: server.base, ownerToken: OWNER_TOKEN });
    const visitor = await runVisitorExample({ endpoint: server.base });
    const connection = await runConnectionExample({ endpoint: server.base, ownerToken: OWNER_TOKEN }, { endpoint: server.base });
    assert.equal(owner.published.status, 'published');
    assert.equal(owner.confirmedMemory?.status, 'confirmed');
    assert.equal(visitor.card.name, 'SDK Self-hosted Owner');
    assert.equal(visitor.chat.conversationId.length > 0, true);
    assert.equal(connection.connected.ownerAction, 'connect');
    assert.equal(connection.connected.sharedContactMethodIds.length, 1);
    assert.equal(connection.summary.summary.evidenceRefs.length > 0, true);
    assert.equal(connection.archive.kind, 'private');
  } finally {
    await server.close();
  }
});

test('runnable SDK examples execute against the real managed namespace', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'vibecard-sdk-cloud-'));
  const gateway = createManagedGateway({
    dataDir,
    masterSecret: 'sdk-test-master-secret-that-is-long-enough',
    // Test-only deterministic moderator; production managed startup remains
    // fail-closed when no real moderation service is configured.
    moderatePublicText: async () => true,
  });
  const server = createServer((req, res) => { void gateway.handler(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('managed test server failed to bind');
  const endpoint = `http://127.0.0.1:${address.port}`;
  try {
    const createdResponse = await fetch(`${endpoint}/api/v1/cloud/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'SDK Managed Owner', slug: 'sdk-managed-owner' }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { id: string; slug: string; token: string };
    const namespace = { kind: 'managed' as const, accountId: created.id, cardSlug: created.slug };
    const owner = await runOwnerExample({ endpoint, namespace, auth: { getToken: () => created.token } });
    const visitor = await runVisitorExample({ endpoint, namespace });
    const connection = await runConnectionExample({ endpoint, namespace, auth: { getToken: () => created.token } }, { endpoint, namespace });
    assert.equal(owner.published.status, 'published');
    assert.equal(owner.confirmedMemory?.status, 'confirmed');
    assert.equal(visitor.card.name, 'SDK Managed Owner');
    assert.equal(visitor.chat.conversationId.length > 0, true);
    assert.equal(connection.connected.ownerAction, 'connect');
    assert.equal(connection.connected.sharedContactMethodIds.length, 1);
    assert.equal(connection.archive.kind, 'private');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await gateway.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
