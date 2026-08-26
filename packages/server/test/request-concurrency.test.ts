import test from 'node:test';
import assert from 'node:assert/strict';

import { api, fixturePrivateArchive, OWNER_TOKEN, startApp } from './helpers';

test('public request gate and owner decision are serialized per request identity', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const imported = await api(app.base, 'POST', '/api/v1/owner/import', {
    token: OWNER_TOKEN,
    body: { archive: fixturePrivateArchive(), force: true },
  });
  assert.equal(imported.status, 200);

  const requestBody = {
    visitorId: 'visitor-concurrent-gate',
    reason: '我认真看过你的个人 AI 项目，想具体交流隐私权限设计。',
  };
  const created = await Promise.all([
    api(app.base, 'POST', '/api/v1/public/requests', { body: requestBody }),
    api(app.base, 'POST', '/api/v1/public/requests', { body: requestBody }),
  ]);
  assert.deepEqual(created.map((response) => response.status).sort(), [201, 429]);
  const requestId = created.find((response) => response.status === 201)!.body.id;
  const inboxBefore = await api(app.base, 'GET', '/api/v1/owner/requests', { token: OWNER_TOKEN });
  const expectedUpdatedAt = inboxBefore.body.find((request: { id: string }) => request.id === requestId).updatedAt;

  const decisions = await Promise.all([
    api(app.base, 'POST', `/api/v1/owner/requests/${requestId}/action`, {
      token: OWNER_TOKEN,
      body: { action: 'later', expectedUpdatedAt },
    }),
    api(app.base, 'POST', `/api/v1/owner/requests/${requestId}/action`, {
      token: OWNER_TOKEN,
      body: { action: 'decline', expectedUpdatedAt },
    }),
  ]);
  assert.deepEqual(decisions.map((response) => response.status).sort(), [200, 409]);

  const inbox = await api(app.base, 'GET', '/api/v1/owner/requests', { token: OWNER_TOKEN });
  const stored = inbox.body.find((request: { id: string }) => request.id === requestId);
  const winner = decisions.find((response) => response.status === 200)!.body.ownerAction;
  assert.equal(stored.ownerAction, winner);
});

test('a same-tick mutation invalidates the private-export delete guard', async (t) => {
  const app = await startApp({ now: () => 1_700_000_000_000 });
  t.after(() => app.close());
  await api(app.base, 'POST', '/api/v1/owner/import', {
    token: OWNER_TOKEN,
    body: { archive: fixturePrivateArchive(), force: true },
  });
  const exported = await api(app.base, 'GET', '/api/v1/owner/export?kind=private', { token: OWNER_TOKEN });
  assert.equal(exported.status, 200);
  const changed = await api(app.base, 'PUT', '/api/v1/owner/card', {
    token: OWNER_TOKEN,
    body: { currentFocus: '导出后同一毫秒的新变更' },
  });
  assert.equal(changed.status, 200);
  const deletion = await api(app.base, 'POST', '/api/v1/owner/delete-all', {
    token: OWNER_TOKEN,
    body: { confirm: 'DELETE' },
  });
  assert.equal(deletion.status, 409);
  assert.equal(deletion.body.error.code, 'export_required');
});

test('delete-all cannot race a slow public write or leave orphaned data', async (t) => {
  let releaseModeration!: () => void;
  let moderationStarted!: () => void;
  const started = new Promise<void>((resolve) => { moderationStarted = resolve; });
  const blocked = new Promise<void>((resolve) => { releaseModeration = resolve; });
  const app = await startApp({
    moderate: async () => {
      moderationStarted();
      await blocked;
      return { ok: true };
    },
  });
  t.after(() => app.close());
  await api(app.base, 'POST', '/api/v1/owner/import', {
    token: OWNER_TOKEN,
    body: { archive: fixturePrivateArchive(), force: true },
  });
  await api(app.base, 'GET', '/api/v1/owner/export?kind=private', { token: OWNER_TOKEN });

  const pendingWrite = api(app.base, 'POST', '/api/v1/public/requests', {
    body: {
      visitorId: 'visitor-slow-write',
      reason: '我认真看过你的公开项目，想交流具体的隐私架构实现。',
    },
  });
  await started;
  const pendingDelete = api(app.base, 'POST', '/api/v1/owner/delete-all', {
    token: OWNER_TOKEN,
    body: { confirm: 'DELETE' },
  });
  const deletedWhileWriteBlocked = await Promise.race([
    pendingDelete.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
  ]);
  assert.equal(deletedWhileWriteBlocked, true, 'a slow stranger cannot block owner deletion');
  const deletion = await pendingDelete;
  assert.equal(deletion.status, 200);
  releaseModeration();
  const rejectedWrite = await pendingWrite;
  assert.equal(rejectedWrite.status, 409);
  assert.equal(rejectedWrite.body.error.code, 'concurrent_update');
  const after = await api(app.base, 'GET', '/api/v1/owner/requests', { token: OWNER_TOKEN });
  assert.equal(after.status, 404);
});
