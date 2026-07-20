/**
 * End-to-end smoke test (task 5.7 acceptance): spawns the real server
 * process on an ephemeral port with the deterministic mock provider and no
 * network, then walks the complete product loop:
 *
 *   health → import fixture private archive → publish/verify Card → visitor
 *   opens Card → visitor chat → submit connection request → owner inbox →
 *   owner connects with a contact method → visitor sees unlocked contact →
 *   backup → restore into a fresh server → fixture state preserved →
 *   delete-all after export.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vibeFixtures } from '../../shared/index';

import { fixturePrivateArchive, OWNER_TOKEN, api, owner } from './helpers';

const serverDir = fileURLToPath(new URL('..', import.meta.url));

interface SpawnedServer {
  base: string;
  child: ChildProcess;
  dir: string;
}

async function spawnServer(): Promise<SpawnedServer> {
  const dir = mkdtempSync(join(tmpdir(), 'vibecard-smoke-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: '0',
      HOST: '127.0.0.1',
      VIBECARD_DB_PATH: join(dir, 'vibecard.db'),
      VIBECARD_OWNER_TOKEN: OWNER_TOKEN,
      AI_PROVIDER: 'mock',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start in 30s')), 30_000);
    let buffer = '';
    child.stdout!.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/listening on http:\/\/(\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://${match[1]}`);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}`));
    });
    child.stderr!.on('data', () => undefined);
  });
  return { base, child, dir };
}

async function stopServer(server: SpawnedServer): Promise<void> {
  server.child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      server.child.kill('SIGKILL');
      resolve();
    }, 5000);
    server.child.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  rmSync(server.dir, { recursive: true, force: true });
}

let server: SpawnedServer;

before(async () => {
  server = await spawnServer();
});

after(async () => {
  await stopServer(server);
});

test('smoke: full owner + visitor loop over HTTP', async () => {
  const { base } = server;

  // 1. Health: db migrated, mock provider, no identity yet.
  const health = await api(base, 'GET', '/healthz');
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.db.ok, true);
  assert.ok(health.body.db.schemaVersion >= 1);
  assert.equal(health.body.provider.name, 'mock');
  assert.equal(health.body.identity, false);

  // 2. Import the fixture private archive as the owner identity.
  const archive = fixturePrivateArchive();
  const imported = await owner(base, 'POST', '/api/v1/owner/import', { archive });
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
  assert.equal(imported.body.ownerId, vibeFixtures.fixtureOwner.id);

  // 3. Edit + publish the Card; verify the public projection.
  const published = await owner(base, 'PUT', '/api/v1/owner/card', {
    headline: ' smoke test headline',
    currentFocus: '打磨自托管版本的 VibeCard。',
  });
  assert.equal(published.status, 200);
  assert.equal(published.body.headline, 'smoke test headline');

  const publicCard = await api(base, 'GET', '/api/v1/public/card');
  assert.equal(publicCard.status, 200);
  assert.equal(publicCard.body.headline, 'smoke test headline');
  assert.equal(publicCard.body.name, vibeFixtures.fixtureOwner.name);
  assert.ok(Array.isArray(publicCard.body.now));

  // 4. Write + publish a Now item; it appears on the public Card.
  const draft = await owner(base, 'POST', '/api/v1/owner/now', {
    text: '刚刚跑通了自托管全链路冒烟测试。',
    topic: 'completed_work',
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.status, 'draft');
  const publishedNow = await owner(base, 'POST', `/api/v1/owner/now/${draft.body.id}/publish`);
  assert.equal(publishedNow.status, 200);
  assert.equal(publishedNow.body.status, 'published');
  const cardWithNow = await api(base, 'GET', '/api/v1/public/card');
  assert.ok(cardWithNow.body.now.some((item: any) => item.text.includes('冒烟测试')));

  // 5. Visitor chats with the public agent (mock provider, evidence-grounded).
  const chat = await api(base, 'POST', '/api/v1/public/chat', {
    body: { visitorId: 'visitor-smoke', message: '他最近在做什么？' },
  });
  assert.equal(chat.status, 200, JSON.stringify(chat.body));
  assert.ok(typeof chat.body.reply === 'string' && chat.body.reply.length > 0);
  assert.equal(chat.body.nextAction, 'continue');
  assert.ok(Array.isArray(chat.body.evidenceRefs));
  assert.ok(chat.body.conversationId);

  // 6. Visitor submits a specific connection request.
  const submitted = await api(base, 'POST', '/api/v1/public/requests', {
    body: {
      visitorId: 'visitor-smoke',
      reason: '我也在做自托管的个人 AI 名片，想交流一次权限与备份设计的具体做法。',
      visitorSummary: '冒烟测试访客，独立开发者。',
      possibleSharedContext: ['都在做个人 AI 分身'],
    },
  });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  assert.equal(submitted.body.ownerAction, 'pending');
  const requestId = submitted.body.id;

  // 7. Owner inbox shows it; the AI summary is evidence-based, not a score.
  const inbox = await owner(base, 'GET', '/api/v1/owner/requests');
  assert.equal(inbox.status, 200);
  assert.ok(inbox.body.some((r: any) => r.id === requestId));
  const summary = await owner(base, 'GET', `/api/v1/owner/requests/${requestId}/summary`);
  assert.equal(summary.status, 200);
  assert.ok(['worth_a_conversation', 'maybe_later', 'need_more_context', 'not_relevant_now'].includes(summary.body.summary.recommendation));
  assert.ok(!('score' in summary.body.summary));

  // 8. Owner connects, selecting the fixture WeChat contact method.
  const decided = await owner(base, 'POST', `/api/v1/owner/requests/${requestId}/action`, {
    action: 'connect',
    sharedContactMethodIds: ['fixture-contact-wechat'],
  });
  assert.equal(decided.status, 200, JSON.stringify(decided.body));
  assert.equal(decided.body.ownerAction, 'connect');
  assert.deepEqual(decided.body.sharedContactMethodIds, ['fixture-contact-wechat']);

  // 9. The visitor now sees the unlocked contact; nobody else does.
  const visitorView = await api(base, 'GET', `/api/v1/public/requests/${requestId}?visitorId=visitor-smoke`);
  assert.equal(visitorView.status, 200);
  assert.ok(
    visitorView.body.sharedContacts.some((c: any) => c.value === vibeFixtures.fixtureOwnerContactMethods[0]!.value),
  );
  const strangerView = await api(base, 'GET', `/api/v1/public/requests/${requestId}?visitorId=somebody-else`);
  assert.equal(strangerView.status, 404);

  // 10. Backup: export the complete private archive (with conversations).
  const backup = await owner(base, 'GET', '/api/v1/owner/export?kind=private&includeConversations=1');
  assert.equal(backup.status, 200);
  assert.equal(backup.body.kind, 'private');
  assert.equal(backup.body.card.headline, 'smoke test headline');
  assert.ok(backup.body.memories.length >= 6);
  assert.ok(backup.body.contactMethods.length === 2);
  assert.ok(backup.body.conversations.exported === true);

  // 11. Restore into a FRESH server: fixture state must survive the round trip.
  const restored = await spawnServer();
  try {
    const reimport = await owner(restored.base, 'POST', '/api/v1/owner/import', { archive: backup.body });
    assert.equal(reimport.status, 200, JSON.stringify(reimport.body));
    assert.equal(reimport.body.ownerId, vibeFixtures.fixtureOwner.id);

    const restoredCard = await api(restored.base, 'GET', '/api/v1/public/card');
    assert.equal(restoredCard.body.headline, 'smoke test headline');
    assert.ok(restoredCard.body.now.some((item: any) => item.text.includes('冒烟测试')));

    const restoredMemories = await owner(restored.base, 'GET', '/api/v1/owner/memories');
    const originalIds = archive.memories.map((m) => m.id).sort();
    const restoredIds = restoredMemories.body.map((m: any) => m.id).sort();
    assert.deepEqual(restoredIds, originalIds);

    const restoredContacts = await owner(restored.base, 'GET', '/api/v1/owner/contacts');
    assert.equal(restoredContacts.body.length, 2);

    const restoredRequests = await owner(restored.base, 'GET', '/api/v1/owner/requests');
    assert.ok(restoredRequests.body.some((r: any) => r.id === requestId && r.ownerAction === 'connect'));

    // 12. Delete-all requires a fresh export first, then erases everything.
    const tooEarly = await owner(restored.base, 'POST', '/api/v1/owner/delete-all', { confirm: 'DELETE' });
    assert.equal(tooEarly.status, 409);
    assert.equal(tooEarly.body.error.code, 'export_required');
    const reExport = await owner(restored.base, 'GET', '/api/v1/owner/export?kind=private');
    assert.equal(reExport.status, 200);
    const wiped = await owner(restored.base, 'POST', '/api/v1/owner/delete-all', { confirm: 'DELETE' });
    assert.equal(wiped.status, 200, JSON.stringify(wiped.body));
    assert.equal(wiped.body.ok, true);
    const gone = await api(restored.base, 'GET', '/api/v1/public/card');
    assert.equal(gone.status, 404);
  } finally {
    await stopServer(restored);
  }
});
