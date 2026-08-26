import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createManagedGateway } from '../src/gateway.ts';
import { startApp, OWNER_TOKEN } from '../../server/test/helpers.ts';

async function start(dataDir: string) {
  const gateway = createManagedGateway({ dataDir, masterSecret: 'test-master-secret-that-is-long-enough', moderatePublicText: async () => true });
  const server = createServer((req, res) => { void gateway.handler(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind');
  return {
    base: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await gateway.close();
    },
  };
}

test('managed account sync, stable public agent, notifications, backup and restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-'));
  let cloud = await start(dir);
  try {
    const createdResponse = await fetch(`${cloud.base}/api/v1/cloud/accounts`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Cloud Fixture', slug: 'cloud-fixture', region: 'ap-shanghai', retentionDays: 90 }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { id: string; slug: string; token: string; publicApi: string };
    assert.equal(created.slug, 'cloud-fixture');
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };

    for (const deviceId of ['phone', 'laptop']) {
      const response = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices`, { method: 'POST', headers: auth, body: JSON.stringify({ deviceId }) });
      assert.equal(response.status, 201);
    }
    const settings = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/settings`, { headers: auth }).then(response => response.json()) as { devices: number; region: string; retentionDays: number; storageScope: string };
    assert.deepEqual(settings, { id: created.id, slug: created.slug, devices: 2, region: 'ap-shanghai', retentionDays: 90, storageScope: `regions/ap-shanghai/${created.id}` });

    const publicCard = await fetch(`${cloud.base}${created.publicApi}/card`).then(response => response.json()) as { name: string };
    assert.equal(publicCard.name, 'Cloud Fixture');
    const publicChat = await fetch(`${cloud.base}${created.publicApi}/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitorId: 'visitor-chat-fixture', message: '你能介绍一下这位主人正在做什么吗？' }),
    });
    assert.equal(publicChat.status, 200, 'managed public chat is reachable through the Card slug namespace');
    const request = await fetch(`${cloud.base}${created.publicApi}/requests`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitorId: 'visitor-fixture', reason: '我也在做可迁移的个人 AI，想交流开放数据格式。', visitorSummary: 'Builder' }),
    });
    assert.equal(request.status, 201);
    const notifications = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/notifications`, { headers: auth }).then(response => response.json()) as unknown[];
    assert.equal(notifications.length, 1);

    const archiveResponse = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private`, { headers: auth });
    assert.equal(archiveResponse.status, 200);
    const archive = await archiveResponse.json() as { kind: string; card: { name: string } };
    assert.equal(archive.kind, 'private');
    assert.equal(archive.card.name, 'Cloud Fixture');

    await cloud.close();
    cloud = await start(dir);
    const afterRestart = await fetch(`${cloud.base}${created.publicApi}/card`).then(response => response.json()) as { name: string };
    assert.equal(afterRestart.name, 'Cloud Fixture');
    const exportedAgain = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private`, { headers: auth });
    assert.equal(exportedAgain.status, 200, 'account token and portable export survive restart');
  } finally {
    await cloud.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test('account credentials are required and never appear in public responses', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-auth-'));
  const cloud = await start(dir);
  try {
    const created = await fetch(`${cloud.base}/api/v1/cloud/accounts`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Private Owner' }),
    }).then(response => response.json()) as { id: string; token: string; publicApi: string };
    const denied = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/settings`);
    assert.equal(denied.status, 401);
    const publicPayload = await fetch(`${cloud.base}${created.publicApi}/card`).then(response => response.text());
    assert.equal(publicPayload.includes(created.token), false);
    assert.equal(publicPayload.includes('tokenHash'), false);
  } finally {
    await cloud.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('managed usage is visible, BYOK is switchable, and billing failure does not block export', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-plan-'));
  const cloud = await start(dir);
  try {
    const created = await fetch(`${cloud.base}/api/v1/cloud/accounts`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Plan Owner', plan: 'pro' }),
    }).then(response => response.json()) as { id: string; token: string };
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    const byok = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/ai`, {
      method: 'PUT', headers: auth, body: JSON.stringify({ mode: 'byok', base: 'https://8.8.8.8', model: 'hosted-model', apiKey: 'secret-provider-key' }),
    });
    assert.equal(byok.status, 200);
    const plan = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/plan`, { headers: auth }).then(response => response.json()) as { aiMode: string; usage: { modelCalls: number } };
    assert.equal(plan.aiMode, 'byok');
    assert.equal(plan.usage.modelCalls, 0);
    const billing = await fetch(`${cloud.base}/api/v1/cloud/admin/accounts/${created.id}/billing`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-vibecard-master-secret': 'test-master-secret-that-is-long-enough' }, body: JSON.stringify({ status: 'past_due' }),
    });
    assert.equal(billing.status, 200);
    // Export remains available even when a paid plan is delinquent.
    const archive = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private`, { headers: auth });
    assert.equal(archive.status, 200);
  } finally {
    await cloud.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('a managed archive migrates to self-hosted and the stable public link redirects safely', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-migrate-'));
  const cloud = await start(dir);
  const selfHosted = await startApp();
  try {
    const created = await fetch(`${cloud.base}/api/v1/cloud/accounts`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Portable Owner', slug: 'portable-owner', region: 'ap-shanghai' }),
    }).then(response => response.json()) as { id: string; slug: string; token: string; publicApi: string };
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    const draft = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/now`, {
      method: 'POST', headers: auth, body: JSON.stringify({ text: '迁移前已发布的动态', topic: 'current_work' }),
    }).then(response => response.json()) as { id: string };
    const published = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/now/${draft.id}/publish`, { method: 'POST', headers: auth, body: '{}' });
    assert.equal(published.status, 200);

    const archiveResponse = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private`, { headers: auth });
    assert.equal(archiveResponse.status, 200);
    const archive = await archiveResponse.json() as Record<string, unknown>;
    const serialized = JSON.stringify(archive);
    for (const forbidden of [created.token, created.slug, 'ap-shanghai', 'tokenHash', 'billingStatus', 'notifications', 'publicRedirectUrl']) {
      assert.equal(serialized.includes(forbidden), false, `portable archive leaked cloud metadata: ${forbidden}`);
    }
    const imported = await fetch(`${selfHosted.base}/api/v1/owner/import`, {
      method: 'POST',
      headers: { authorization: `Bearer ${OWNER_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ archive }),
    });
    assert.equal(imported.status, 200);
    const migratedCard = await fetch(`${selfHosted.base}/api/v1/public/card`).then(response => response.json()) as { name: string; now: { text: string }[] };
    assert.equal(migratedCard.name, 'Portable Owner');
    assert.equal(migratedCard.now.some(item => item.text === '迁移前已发布的动态'), true);

    const redirectTarget = 'https://self-hosted.example/api/v1/public';
    const redirectSaved = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/settings/public-redirect`, {
      method: 'PUT', headers: auth, body: JSON.stringify({ url: redirectTarget }),
    });
    assert.equal(redirectSaved.status, 200);
    const redirected = await fetch(`${cloud.base}${created.publicApi}/card?from=old-link`, { redirect: 'manual' });
    assert.equal(redirected.status, 308);
    assert.equal(redirected.headers.get('location'), `${redirectTarget}/card?from=old-link`);
    assert.equal(redirected.headers.get('cache-control'), 'public, max-age=300');
    const redirectedPost = await fetch(`${cloud.base}${created.publicApi}/requests?from=post`, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'method must be preserved' }),
    });
    assert.equal(redirectedPost.status, 308, '308 preserves POST instead of rewriting it as GET');
    assert.equal(redirectedPost.headers.get('location'), `${redirectTarget}/requests?from=post`);
    assert.equal(redirectedPost.headers.get('cache-control'), 'public, max-age=300');
    const encoded = await fetch(`${cloud.base}${created.publicApi}/conversation/a%20b/%E4%B8%AD%E6%96%87?next=x%20y`, { redirect: 'manual' });
    assert.equal(encoded.headers.get('location'), `${redirectTarget}/conversation/a%20b/%E4%B8%AD%E6%96%87?next=x%20y`);
    const insecure = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/settings/public-redirect`, {
      method: 'PUT', headers: auth, body: JSON.stringify({ url: 'http://unsafe.example/card' }),
    });
    assert.equal(insecure.status, 400);
    for (const invalidUrl of [
      'https://safe.example/base?tenant=1',
      'https://safe.example/base#fragment',
      `https://cloud.example/api/v1/cloud/cards/${created.slug}`,
      `https://cloud.example/api/v1/cloud//cards/${created.slug}`,
      `https://cloud.example/%61pi/v1/cloud/cards/${created.slug}`,
      `https://cloud.example/api%2Fv1%2Fcloud%2Fcards%2F${created.slug}`,
    ]) {
      const invalid = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/settings/public-redirect`, {
        method: 'PUT', headers: auth, body: JSON.stringify({ url: invalidUrl }),
      });
      assert.equal(invalid.status, 400);
    }
  } finally {
    await selfHosted.close();
    await cloud.close();
    await rm(dir, { recursive: true, force: true });
  }
});
