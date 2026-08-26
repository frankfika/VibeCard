import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`server did not become ready: ${url}`);
}

test('production entrypoint serves the PWA, proxies Core API, and strips private Card fields', async t => {
  let moderationMode = 'allow';
  const moderated = [];
  const moderation = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      moderated.push({ authorization: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      if (moderationMode === 'down') return res.writeHead(500).end();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(moderationMode === 'blocked' ? { ok: false, reason: 'blocked' } : { ok: true }));
    });
  });
  const moderationPort = await listen(moderation);
  t.after(() => moderation.close());
  const upstream = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === '/api/v1/owner/probe') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, authorization: req.headers.authorization }));
      return;
    }
    res.writeHead(404).end();
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());

  const reservation = createServer();
  const webPort = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));

  const dataDir = join(tmpdir(), `vibecard-web-test-${process.pid}-${Date.now()}`);
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'cards.json'), JSON.stringify({
    'legacy-no-revoke': {
      id: 'legacy-no-revoke',
      profile: { name: 'Irrevocable legacy snapshot' },
      createdAt: 1,
      updatedAt: 1,
    },
  }));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(webPort),
      SERVE_WEB: '1',
      VIBECARD_API_UPSTREAM: `http://127.0.0.1:${upstreamPort}`,
      DATA_DIR: dataDir,
      CORS_ORIGIN: 'same-origin',
      ENABLE_PUBLIC_SNAPSHOTS: '1',
      PUBLIC_SNAPSHOT_TTL_MS: '60000',
      REQUIRE_MODERATION: '1',
      MODERATION_API_URL: `http://127.0.0.1:${moderationPort}/moderate`,
      MODERATION_API_KEY: 'moderation-release-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  const base = `http://127.0.0.1:${webPort}`;
  await waitFor(`${base}/healthz`);
  assert.equal((await fetch(`${base}/api/cards/legacy-no-revoke`)).status, 404);
  assert.equal('legacy-no-revoke' in JSON.parse(readFileSync(join(dataDir, 'cards.json'), 'utf8')), false);

  const nested = await fetch(`${base}/card/demo`);
  assert.equal(nested.status, 200);
  assert.match(await nested.text(), /<div id="root"><\/div>/);
  assert.equal(nested.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(nested.headers.get('x-frame-options'), 'DENY');

  const asset = readdirSync(new URL('../dist/assets/', import.meta.url)).find(name => name.endsWith('.js'));
  assert.ok(asset);
  const assetResponse = await fetch(`${base}/assets/${asset}`);
  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.headers.get('cache-control') || '', /immutable/);

  const proxied = await fetch(`${base}/api/v1/owner/probe`, {
    headers: { authorization: 'Bearer release-test-token' },
  });
  assert.deepEqual(await proxied.json(), { ok: true, authorization: 'Bearer release-test-token' });

  const created = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: {
      name: 'Release Fixture',
      handle: 'release-fixture',
      bio: 'Public text',
      contacts: [{ type: 'email', value: 'private@example.test' }],
      verified: { wechat: 'private-wechat' },
      threads: [{ content: 'private old feed' }],
      tags: [{ label: 'AI', icon: '✨', contactMethods: [{ value: 'nested-tag-secret' }] }],
      highlights: [{ id: 1, title: 'Public work', type: 'project', icon: '✨', link: '', privateMemory: 'nested-highlight-secret' }],
      nowItems: [{ id: 'now-1', schemaVersion: 1, ownerId: 'owner-secret', text: 'Public Now', topic: 'current_work', sourceMemoryId: 'memory-secret', status: 'published', publishedAt: 1, expiresAt: null, createdAt: 1, updatedAt: 1, contactMethods: [{ value: 'nested-now-secret' }] }],
    } }),
  });
  assert.equal(created.status, 201);
  assert.equal(moderated.at(-1).authorization, 'Bearer moderation-release-key');
  assert.match(moderated.at(-1).body.text, /Public text/);
  assert.doesNotMatch(moderated.at(-1).body.text, /private@example\.test|private-wechat|private old feed/);
  const createdBody = await created.json();
  const { id, revokeToken } = createdBody;
  assert.equal(typeof revokeToken, 'string');
  assert.equal(revokeToken.length > 30, true);
  assert.equal('revokeHash' in createdBody, false);
  const publicCard = await (await fetch(`${base}/api/cards/${id}`)).json();
  assert.equal(publicCard.profile.bio, 'Public text');
  assert.equal('contacts' in publicCard.profile, false);
  assert.equal('verified' in publicCard.profile, false);
  assert.equal('threads' in publicCard.profile, false);
  assert.equal(JSON.stringify(publicCard.profile).includes('nested-tag-secret'), false);
  assert.equal(JSON.stringify(publicCard.profile).includes('nested-highlight-secret'), false);
  assert.equal(JSON.stringify(publicCard.profile).includes('nested-now-secret'), false);
  assert.equal(JSON.stringify(publicCard.profile).includes('owner-secret'), false);
  assert.equal(JSON.stringify(publicCard.profile).includes('memory-secret'), false);
  assert.equal(publicCard.profile.nowItems[0].text, 'Public Now');
  assert.equal('revokeHash' in publicCard, false);
  assert.equal(JSON.stringify(publicCard).includes(revokeToken), false);
  assert.equal((await fetch(`${base}/api/cards/${id}`, { method: 'DELETE' })).status, 401);
  assert.equal((await fetch(`${base}/api/cards/${id}`, {
    method: 'DELETE', headers: { authorization: 'Bearer definitely-wrong' },
  })).status, 403);
  assert.equal((await fetch(`${base}/api/cards/${id}`)).status, 200);

  const persistedCount = () => Object.keys(JSON.parse(readFileSync(join(dataDir, 'cards.json'), 'utf8'))).length;
  const beforeRejected = persistedCount();
  moderationMode = 'blocked';
  const blocked = await fetch(`${base}/api/cards`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: { name: 'Blocked content' } }),
  });
  assert.equal(blocked.status, 403);
  assert.equal(persistedCount(), beforeRejected);
  moderationMode = 'down';
  const unavailable = await fetch(`${base}/api/cards`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: { name: 'Moderation outage' } }),
  });
  assert.equal(unavailable.status, 503);
  assert.equal(persistedCount(), beforeRejected);
  moderationMode = 'allow';

  const identicalCreated = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: {
      name: 'Release Fixture',
      handle: 'release-fixture',
      bio: 'Public text',
      contacts: [{ type: 'email', value: 'private@example.test' }],
      verified: { wechat: 'private-wechat' },
      threads: [{ content: 'private old feed' }],
      tags: [{ label: 'AI', icon: '✨', contactMethods: [{ value: 'nested-tag-secret' }] }],
      highlights: [{ id: 1, title: 'Public work', type: 'project', icon: '✨', link: '', privateMemory: 'nested-highlight-secret' }],
      nowItems: [{ id: 'now-1', schemaVersion: 1, ownerId: 'owner-secret', text: 'Public Now', topic: 'current_work', sourceMemoryId: 'memory-secret', status: 'published', publishedAt: 1, expiresAt: null, createdAt: 1, updatedAt: 1, contactMethods: [{ value: 'nested-now-secret' }] }],
    } }),
  });
  assert.equal(identicalCreated.status, 201);
  const identicalBody = await identicalCreated.json();
  assert.notEqual(identicalBody.id, id);
  assert.notEqual(identicalBody.revokeToken, revokeToken);

  const attemptedOverwrite = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: { name: 'Impostor', handle: 'release-fixture', bio: 'Changed' } }),
  });
  const second = await attemptedOverwrite.json();
  assert.notEqual(second.id, id);
  const originalAgain = await (await fetch(`${base}/api/cards/${id}`)).json();
  assert.equal(originalAgain.profile.name, 'Release Fixture');

  const revoked = await fetch(`${base}/api/cards/${id}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${revokeToken}` },
  });
  assert.equal(revoked.status, 204);
  assert.equal((await fetch(`${base}/api/cards/${id}`)).status, 404);
  assert.equal((await fetch(`${base}/api/cards/${identicalBody.id}`)).status, 200);
  assert.equal((await fetch(`${base}/api/cards/${identicalBody.id}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${identicalBody.revokeToken}` },
  })).status, 204);
});

test('production entrypoint fails clearly when Core API is not configured', async t => {
  const reservation = createServer();
  const webPort = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(webPort),
      SERVE_WEB: '1',
      VIBECARD_API_UPSTREAM: '',
      DATA_DIR: `${process.env.TMPDIR || '/tmp'}/vibecard-web-no-api-test-${process.pid}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  const base = `http://127.0.0.1:${webPort}`;
  await waitFor(`${base}/healthz`);

  const response = await fetch(`${base}/api/v1/owner/probe`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
  assert.equal((await response.json()).error.code, 'runtime_unavailable');
  const disabledSnapshot = await fetch(`${base}/api/cards`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: { name: 'Must not persist by default' } }),
  });
  assert.equal(disabledSnapshot.status, 404);
});

test('operator snapshot opt-in fails closed without a moderation service and stores nothing', async t => {
  const reservation = createServer();
  const webPort = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const dataDir = join(tmpdir(), `vibecard-web-missing-moderation-${process.pid}-${Date.now()}`);
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(webPort),
      DATA_DIR: dataDir,
      ENABLE_PUBLIC_SNAPSHOTS: '1',
      REQUIRE_MODERATION: '1',
      MODERATION_API_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  const base = `http://127.0.0.1:${webPort}`;
  await waitFor(`${base}/healthz`);
  const response = await fetch(`${base}/api/cards`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: { name: 'No moderation must mean no storage' } }),
  });
  assert.equal(response.status, 503);
  const cardsPath = join(dataDir, 'cards.json');
  assert.equal(existsSync(cardsPath) ? Object.keys(JSON.parse(readFileSync(cardsPath, 'utf8'))).length : 0, 0);
});
