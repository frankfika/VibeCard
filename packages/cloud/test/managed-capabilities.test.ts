import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createManagedGateway } from '../src/gateway.ts';
import { TEXT_STRUCTURED_CAPABILITIES, type EmbeddingProvider, type ModelProvider } from '../../shared/index.ts';
import { fixturePrivateArchive, owner, startApp } from '../../server/test/helpers.ts';

const MASTER = 'test-master-secret-that-is-long-enough';

async function start(dataDir: string, now?: () => number, moderatePublicText: ((text: string) => Promise<boolean>) | null = async () => true, provider?: ModelProvider, knowledgeExportBarrier?: (accountId: string) => Promise<void>, embeddingProvider?: EmbeddingProvider, knowledgeCommitBarrier?: (accountId: string) => Promise<void>) {
  const gateway = createManagedGateway({ dataDir, masterSecret: MASTER, ...(now ? { now } : {}), ...(moderatePublicText ? { moderatePublicText } : {}), ...(provider ? { provider } : {}), ...(knowledgeExportBarrier ? { knowledgeExportBarrier } : {}), ...(embeddingProvider ? { embeddingProvider } : {}), ...(knowledgeCommitBarrier ? { knowledgeCommitBarrier } : {}) });
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

async function createAccount(base: string, input: Record<string, unknown> = {}) {
  const response = await fetch(`${base}/api/v1/cloud/accounts`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Managed Owner', region: 'ap-shanghai', ...input }),
  });
  return { response, body: await response.json() as { id: string; token: string; publicApi: string; error?: { code: string } } };
}

test('delta sync preserves visibility, propagates deletion, rejects stale writes, and excludes unselected raw conversations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-sync-'));
  const cloud = await start(dir);
  try {
    const created = (await createAccount(cloud.base)).body;
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    for (const deviceId of ['phone', 'laptop']) {
      assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices`, { method: 'POST', headers: auth, body: JSON.stringify({ deviceId }) })).status, 201);
    }
    const baseline = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices/phone/sync?since=0`, { headers: auth }).then(response => response.json()) as any;
    const baselineCursor = baseline.cursor as number;
    const portable = fixturePrivateArchive();
    const optedIn = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices/phone/sync`, {
      method: 'POST', headers: auth, body: JSON.stringify({ baseCursor: baselineCursor, archive: portable }),
    });
    assert.equal(optedIn.status, 200);
    const identityAfterOptIn = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private`, { headers: auth }).then(response => response.json()) as any;
    assert.equal(identityAfterOptIn.profile.id, portable.profile.id, 'local identity is adopted rather than recreated during opt-in');

    const chat = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/vibe/messages`, {
      method: 'POST', headers: { ...auth, 'x-vibecard-device-id': 'phone' },
      body: JSON.stringify({ message: '我最近持续在研究跨设备私人记忆同步。', clientMessageId: 'sync-message-1' }),
    }).then(response => response.json()) as { memoryProposalId: string };
    assert.ok(chat.memoryProposalId);
    const confirmed = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/memories/${chat.memoryProposalId}/confirm`, {
      method: 'POST', headers: { ...auth, 'x-vibecard-device-id': 'phone' }, body: JSON.stringify({ visibility: 'private' }),
    });
    assert.equal(confirmed.status, 200);

    const laptop = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices/laptop/sync?since=${baselineCursor}`, { headers: auth }).then(response => response.json()) as any;
    const memoryChange = laptop.changes.find((change: any) => change.entityId === chat.memoryProposalId && change.operation === 'upsert');
    assert.equal(memoryChange.record.visibility, 'private', 'visibility survives cross-device sync exactly');
    assert.equal(JSON.stringify(laptop).includes('我最近持续在研究跨设备私人记忆同步。'), true);
    assert.equal(JSON.stringify(laptop).includes('messages'), false, 'raw conversation was not selected for sync');
    const syncAtRest = await readFile(join(dir, 'regions', 'ap-shanghai', created.id, 'sync.json'), 'utf8');
    assert.equal(syncAtRest.includes('跨设备私人记忆同步'), false, 'private sync journal is encrypted at rest');

    const deleted = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/memories/${chat.memoryProposalId}/delete`, {
      method: 'DELETE', headers: { ...auth, 'x-vibecard-device-id': 'phone' }, body: '{}',
    });
    assert.equal(deleted.status, 200);
    const afterDelete = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices/laptop/sync?since=${laptop.cursor}`, { headers: auth }).then(response => response.json()) as any;
    assert.ok(afterDelete.changes.some((change: any) => change.entityId === chat.memoryProposalId && change.operation === 'delete'));

    const archive = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private&includeConversations=1`, { headers: auth }).then(response => response.json());
    const stale = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices/phone/sync`, {
      method: 'POST', headers: auth, body: JSON.stringify({ baseCursor: baselineCursor, archive }),
    });
    assert.equal(stale.status, 409);
    assert.equal(((await stale.json()) as any).error.code, 'sync_conflict');
    const rawNotSelected = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices/phone/sync`, {
      method: 'POST', headers: auth, body: JSON.stringify({ baseCursor: afterDelete.cursor, archive }),
    });
    assert.equal(rawNotSelected.status, 400);
    assert.equal(((await rawNotSelected.json()) as any).error.code, 'raw_data_not_selected');
  } finally {
    await cloud.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('region storage, encrypted managed backup, exact restore, and retention expiry are enforced', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-backup-'));
  let current = 2_000_000_000_000;
  const cloud = await start(dir, () => current);
  try {
    const created = (await createAccount(cloud.base, { retentionDays: 1 })).body;
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    const device = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices`, { method: 'POST', headers: auth, body: JSON.stringify({ deviceId: 'offline-device' }) }).then(response => response.json()) as any;
    const accountDir = join(dir, 'regions', 'ap-shanghai', created.id);
    assert.equal(existsSync(join(accountDir, 'core.db')), true, 'canonical store resides under the selected region scope');
    const knowledge = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, {
      method: 'POST', headers: auth, body: JSON.stringify({ kind: 'note', title: 'Backup note', locator: 'note:backup', content: '备份也必须覆盖托管知识内容', visibility: 'private' }),
    }).then(response => response.json()) as any;
    const cardBefore = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/card`, { headers: auth }).then(response => response.json()) as any;
    const backupResponse = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/backups`, { method: 'POST', headers: auth, body: '{}' });
    assert.equal(backupResponse.status, 201);
    const backup = await backupResponse.json() as any;
    const backupFile = await readFile(join(accountDir, 'backups.json'), 'utf8');
    assert.equal(backupFile.includes(cardBefore.name), false, 'private backup content is encrypted at rest');
    for (const [path, expected] of [
      [dir, 0o700], [join(dir, 'accounts.json'), 0o600], [accountDir, 0o700],
      [join(accountDir, 'core.db'), 0o600], [join(accountDir, 'knowledge.json'), 0o600],
      [join(accountDir, 'backups.json'), 0o600], [join(accountDir, 'sync.json'), 0o600],
    ] as const) assert.equal((await stat(path)).mode & 0o777, expected, `${path} has owner-only permissions`);

    const changed = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/card`, {
      method: 'PUT', headers: auth, body: JSON.stringify({ headline: 'temporary post-backup value' }),
    });
    assert.equal(changed.status, 200);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/${knowledge.source.id}`, { method: 'DELETE', headers: auth })).status, 200);
    const restored = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/backups/${backup.id}/restore`, {
      method: 'POST', headers: auth, body: JSON.stringify({ confirm: 'RESTORE' }),
    });
    assert.equal(restored.status, 200);
    const cardAfter = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/card`, { headers: auth }).then(response => response.json()) as any;
    assert.equal(cardAfter.headline, cardBefore.headline);
    const restoredKnowledge = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { headers: auth }).then(response => response.json()) as any[];
    assert.equal(restoredKnowledge.some(source => source.id === knowledge.source.id), true, 'managed knowledge is part of backup/restore');

    current += 2 * 86_400_000;
    const expired = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/backups`, { headers: auth }).then(response => response.json()) as any[];
    assert.equal(expired.length, 0, 'retention policy removes expired backup material');
    await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/card`, { method: 'PUT', headers: auth, body: JSON.stringify({ headline: 'after retention cutoff' }) });
    const expiredCursor = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices/offline-device/sync?since=${device.cursor}`, { headers: auth }).then(response => response.json()) as any;
    assert.equal(expiredCursor.resetRequired, true, 'offline devices receive a full snapshot after retained deltas expire');
    assert.equal(JSON.stringify(expiredCursor.snapshot).includes('messages'), false);
  } finally {
    await cloud.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('upgrade migrates the legacy root account store into its declared region without identity loss', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-region-migrate-'));
  let cloud = await start(dir);
  let created: any;
  try {
    created = (await createAccount(cloud.base, { name: 'Legacy Region Owner' })).body;
  } finally { await cloud.close(); }
  const regionalBase = join(dir, 'regions', 'ap-shanghai', created.id, 'core.db');
  const legacyBase = join(dir, `${created.id}.db`);
  await rename(regionalBase, legacyBase);
  await rename(`${regionalBase}.owner.json`, `${legacyBase}.owner.json`);
  cloud = await start(dir);
  try {
    const auth = { authorization: `Bearer ${created.token}` };
    const card = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/card`, { headers: auth }).then(response => response.json()) as any;
    assert.equal(card.name, 'Legacy Region Owner');
    assert.equal(existsSync(regionalBase), true);
    assert.equal(existsSync(legacyBase), false);
  } finally { await cloud.close(); await rm(dir, { recursive: true, force: true }); }
});

test('managed knowledge accounts bytes, syncs source versions, retrieves semantically with visibility first, and deletes all derived data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-knowledge-'));
  const cloud = await start(dir);
  try {
    const created = (await createAccount(cloud.base, { plan: 'pro' })).body;
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    const add = async (payload: Record<string, unknown>) => {
      const response = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { method: 'POST', headers: auth, body: JSON.stringify(payload) });
      return { response, body: await response.json() as any };
    };
    const privateSource = await add({ kind: 'note', title: 'Private', locator: 'private-note', content: '绝密火星计划只有主人可见', visibility: 'private', sourceVersion: 'v1' });
    assert.equal(privateSource.response.status, 201);
    const publicText = '开放协议支持可迁移的个人 AI 记忆';
    const publicSource = await add({ kind: 'external', title: 'Public docs', locator: 'docs:42', content: publicText, visibility: 'public', sourceVersion: 'v1' });
    assert.equal(publicSource.response.status, 201);

    const plan = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/plan`, { headers: auth }).then(response => response.json()) as any;
    assert.equal(plan.usage.knowledgeBytes, Buffer.byteLength('绝密火星计划只有主人可见') + Buffer.byteLength(publicText));
    assert.ok(plan.limits.maxSourceBytes > 256_000, 'pro advertises a larger per-file limit');
    assert.ok(plan.limits.memoryRecords > 500, 'pro advertises a larger memory limit');

    const publicSearch = await fetch(`${cloud.base}${created.publicApi}/knowledge/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '可迁移协议' }) }).then(response => response.json()) as any;
    assert.ok(publicSearch.results.some((result: any) => result.sourceId === publicSource.body.source.id));
    assert.equal(JSON.stringify(publicSearch).includes('绝密火星计划'), false, 'private chunks are filtered before the visitor vector namespace is queried');
    assert.ok(publicSearch.results.every((result: any) => result.visibility.visibility === 'public'));
    const ownerSearch = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/search`, { method: 'POST', headers: auth, body: JSON.stringify({ query: '火星计划', semantic: true }) }).then(response => response.json()) as any;
    assert.ok(ownerSearch.results.some((result: any) => result.sourceId === privateSource.body.source.id));
    const usageAfterSearch = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/plan`, { headers: auth }).then(response => response.json()) as any;
    assert.equal(usageAfterSearch.usage.retrievalCalls, 2, 'owner and public managed retrieval are metered visibly');

    const unchanged = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/${publicSource.body.source.id}`, {
      method: 'PUT', headers: auth, body: JSON.stringify({ kind: 'external', title: 'Public docs', locator: 'docs:42', content: 'must not replace', visibility: 'public', sourceVersion: 'v1' }),
    }).then(response => response.json()) as any;
    assert.equal(unchanged.unchanged, true);
    const updatedText = '开放协议现在支持来源同步和删除传播';
    const updated = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/${publicSource.body.source.id}`, {
      method: 'PUT', headers: auth, body: JSON.stringify({ kind: 'external', title: 'Public docs', locator: 'docs:42', content: updatedText, visibility: 'public', sourceVersion: 'v2' }),
    });
    assert.equal(updated.status, 200);
    const removed = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/${publicSource.body.source.id}`, { method: 'DELETE', headers: auth });
    assert.equal(removed.status, 200);
    const afterDelete = await fetch(`${cloud.base}${created.publicApi}/knowledge/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '来源同步' }) }).then(response => response.json()) as any;
    assert.equal(afterDelete.results.some((result: any) => result.sourceId === publicSource.body.source.id), false);
    for (let index = 2; index < 60; index += 1) {
      const response = await fetch(`${cloud.base}${created.publicApi}/knowledge/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '可迁移协议' }) });
      assert.equal(response.status, 200);
    }
    const rateLimited = await fetch(`${cloud.base}${created.publicApi}/knowledge/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '可迁移协议' }) });
    assert.equal(rateLimited.status, 429);
    const exported = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/export`, { headers: auth }).then(response => response.json()) as any;
    assert.equal(JSON.stringify(exported).includes('apiKey'), false);
    assert.equal(exported.sources.some((source: any) => source.id === privateSource.body.source.id), true, 'canonical knowledge remains portable');
    const operations = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/operations`, { headers: auth }).then(response => response.json()) as any;
    assert.match(operations.supportBoundary, /cannot read owner content/);
  } finally {
    await cloud.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('free managed knowledge byte quota is enforced on the server without partial storage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-knowledge-quota-'));
  const cloud = await start(dir);
  try {
    const created = (await createAccount(cloud.base)).body;
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    const content = 'x'.repeat(250_000);
    for (let index = 0; index < 4; index += 1) {
      const response = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ kind: 'file', title: `Part ${index}`, locator: `part-${index}.txt`, content, visibility: 'private' }),
      });
      assert.equal(response.status, 201);
    }
    const over = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ kind: 'note', title: 'Over quota', locator: 'over', content: 'x', visibility: 'private' }),
    });
    assert.equal(over.status, 429);
    assert.equal(((await over.json()) as any).error.code, 'quota_exceeded');
    const plan = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/plan`, { headers: auth }).then(response => response.json()) as any;
    assert.equal(plan.usage.knowledgeBytes, 1_000_000);
    const sources = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { headers: auth }).then(response => response.json()) as any[];
    assert.equal(sources.length, 4, 'rejected ingest creates no partial source');
  } finally {
    await cloud.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('all public stranger-content endpoints fail closed before model invocation or storage', async () => {
  for (const mode of ['unavailable', 'blocked'] as const) {
    const dir = await mkdtemp(join(tmpdir(), `vibecard-cloud-search-${mode}-`));
    let providerCalls = 0;
    const provider: ModelProvider = { name: 'spy', capabilities: { ...TEXT_STRUCTURED_CAPABILITIES }, async complete() { providerCalls += 1; return '{}'; } };
    const cloud = await start(dir, undefined, mode === 'unavailable' ? null : async () => false, provider);
    try {
      const created = (await createAccount(cloud.base)).body;
      const auth = { authorization: `Bearer ${created.token}` };
      for (const [path, payload] of [
        ['knowledge/search', { query: 'stranger supplied text' }],
        ['chat', { visitorId: 'visitor', message: 'stranger supplied text' }],
        ['requests', { visitorId: 'visitor', reason: '这是一个足够具体但必须先审核的连接理由', visitorSummary: 'Visitor', possibleSharedContext: ['untrusted context'], visitorWorkUrl: 'https://example.com' }],
      ] as const) {
        const response = await fetch(`${cloud.base}${created.publicApi}/${path}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
        });
        assert.equal(response.status, mode === 'unavailable' ? 503 : 403);
        assert.equal(((await response.json()) as any).error.code, mode === 'unavailable' ? 'moderation_unavailable' : 'moderation_blocked');
      }
      assert.equal(providerCalls, 0, 'unmoderated stranger text never reaches the model provider');
      const archive = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private&includeConversations=1`, { headers: auth }).then(response => response.json()) as any;
      assert.equal(archive.connectionRequests.length, 0);
      assert.equal(archive.conversations.items.length, 0, 'unmoderated stranger text is never persisted');
    } finally { await cloud.close(); await rm(dir, { recursive: true, force: true }); }
  }
});

test('delete-all erases every managed adjunct even while billing is past due', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-delete-all-'));
  const cloud = await start(dir);
  try {
    const created = (await createAccount(cloud.base, { plan: 'pro' })).body;
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices`, { method: 'POST', headers: auth, body: JSON.stringify({ deviceId: 'phone' }) })).status, 201);
    const chat = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/vibe/messages`, {
      method: 'POST', headers: { ...auth, 'x-vibecard-device-id': 'phone' }, body: JSON.stringify({ message: '我最近持续在研究跨设备私人记忆同步。', clientMessageId: 'delete-all-memory' }),
    }).then(response => response.json()) as any;
    assert.ok(chat.memoryProposalId);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/memories/${chat.memoryProposalId}/confirm`, { method: 'POST', headers: auth, body: JSON.stringify({ visibility: 'private' }) })).status, 200);

    for (const input of [
      { kind: 'note', title: 'Private delete fixture', locator: 'private', content: 'private managed knowledge must disappear', visibility: 'private' },
      { kind: 'note', title: 'Public delete fixture', locator: 'public', content: 'public managed knowledge must disappear', visibility: 'public' },
    ]) {
      assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { method: 'POST', headers: auth, body: JSON.stringify(input) })).status, 201);
    }
    const publicSearch = await fetch(`${cloud.base}${created.publicApi}/knowledge/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'managed knowledge' }) });
    assert.equal(publicSearch.status, 200, 'vector namespaces are populated before deletion');
    const backup = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/backups`, { method: 'POST', headers: auth, body: '{}' }).then(response => response.json()) as any;
    assert.ok(backup.id);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private&includeConversations=1`, { headers: auth })).status, 200);
    const coreOnlyDelete = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/delete-all`, { method: 'POST', headers: auth, body: JSON.stringify({ confirm: 'DELETE' }) });
    assert.equal(coreOnlyDelete.status, 409);
    assert.equal(((await coreOnlyDelete.json()) as any).error.code, 'knowledge_export_required', 'Core export alone cannot authorize deletion of managed knowledge bytes');
    const portableKnowledge = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/export`, { headers: auth }).then(response => response.json()) as any;
    assert.equal(portableKnowledge.format, 'vibecard-knowledge-bundle');
    assert.equal(portableKnowledge.sources.length, 2);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/delete-all`, { method: 'POST', headers: auth, body: JSON.stringify({ confirm: 'NOT_DELETE' }) })).status, 400);
    assert.equal(((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { headers: auth }).then(response => response.json())) as any[]).length, 2, 'a rejected Core deletion never erases managed adjuncts');
    const request = await fetch(`${cloud.base}${created.publicApi}/requests`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitorId: 'delete-visitor', visitorSummary: 'Builder', reason: '我正在实现数据删除，希望具体交流完整删除边界。', possibleSharedContext: ['数据删除'] }),
    });
    assert.equal(request.status, 201);
    assert.equal(((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/notifications`, { headers: auth }).then(response => response.json())) as any[]).length, 1);

    // Core deliberately requires a fresh portable export before destructive deletion.
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private&includeConversations=1`, { headers: auth })).status, 200);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/admin/accounts/${created.id}/billing`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-vibecard-master-secret': MASTER }, body: JSON.stringify({ status: 'past_due' }),
    })).status, 200);
    const erased = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/delete-all`, { method: 'POST', headers: auth, body: JSON.stringify({ confirm: 'DELETE' }) });
    assert.equal(erased.status, 200, 'past-due billing never blocks deletion');

    const accountDir = join(dir, 'regions', 'ap-shanghai', created.id);
    for (const name of ['knowledge.json', 'backups.json', 'sync.json']) assert.equal(existsSync(join(accountDir, name)), false, `${name} was erased`);
    assert.deepEqual(await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { headers: auth }).then(response => response.json()), []);
    assert.deepEqual(await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/backups`, { headers: auth }).then(response => response.json()), []);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/backups/${backup.id}/restore`, { method: 'POST', headers: auth, body: JSON.stringify({ confirm: 'RESTORE' }) })).status, 404);
    const plan = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/plan`, { headers: auth }).then(response => response.json()) as any;
    assert.deepEqual(plan.usage, { modelCalls: 0, retrievalCalls: 0, knowledgeBytes: 0, estimatedCents: 0 });
    assert.equal(plan.billingStatus, 'past_due');
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/admin/accounts/${created.id}/billing`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-vibecard-master-secret': MASTER }, body: JSON.stringify({ status: 'active' }),
    })).status, 200);
    const afterPublicSearch = await fetch(`${cloud.base}${created.publicApi}/knowledge/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'managed knowledge' }) }).then(response => response.json()) as any;
    assert.deepEqual(afterPublicSearch.results, [], 'public vector namespace contains no deleted chunk');
    const settings = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/settings`, { headers: auth }).then(response => response.json()) as any;
    assert.equal(settings.devices, 0);
    assert.deepEqual(await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/notifications`, { headers: auth }).then(response => response.json()), []);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices/phone/sync?since=0`, { headers: auth })).status, 404, 'old device binding cannot read deleted sync history');
    const registered = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices`, { method: 'POST', headers: auth, body: JSON.stringify({ deviceId: 'fresh-device' }) }).then(response => response.json()) as any;
    const freshSync = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/devices/fresh-device/sync?since=${registered.cursor}`, { headers: auth }).then(response => response.json()) as any;
    assert.deepEqual(freshSync.changes, []);
    assert.equal(JSON.stringify(freshSync).includes('跨设备私人记忆同步'), false);
  } finally {
    await cloud.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('knowledge mutation invalidates export freshness even at the same timestamp', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-export-revision-'));
  const fixedNow = 2_100_000_000_000;
  const cloud = await start(dir, () => fixedNow);
  try {
    const created = (await createAccount(cloud.base)).body;
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    const ingested = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, {
      method: 'POST', headers: auth, body: JSON.stringify({ kind: 'note', title: 'Revision', locator: 'revision', content: 'version one', visibility: 'private', sourceVersion: 'v1' }),
    }).then(response => response.json()) as any;
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/export`, { headers: auth })).status, 200);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/${ingested.source.id}`, {
      method: 'PUT', headers: auth, body: JSON.stringify({ kind: 'note', title: 'Revision', locator: 'revision', content: 'version two not exported', visibility: 'private', sourceVersion: 'v2' }),
    })).status, 200);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private`, { headers: auth })).status, 200);
    const refused = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/delete-all`, { method: 'POST', headers: auth, body: JSON.stringify({ confirm: 'DELETE' }) });
    assert.equal(refused.status, 409);
    assert.equal(((await refused.json()) as any).error.code, 'knowledge_export_required', 'same-ms export→write cannot look fresh');
  } finally { await cloud.close(); await rm(dir, { recursive: true, force: true }); }
});

test('knowledge revisions reject stale exports and delete closing drains slow public search without starvation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-knowledge-race-'));
  let exportEntered!: () => void; let releaseExport!: () => void;
  const exportStarted = new Promise<void>(resolve => { exportEntered = resolve; });
  const exportGate = new Promise<void>(resolve => { releaseExport = resolve; });
  let blockExport = true;
  let embedEntered!: () => void; let releaseEmbed!: () => void;
  const embedStarted = new Promise<void>(resolve => { embedEntered = resolve; });
  const embedGate = new Promise<void>(resolve => { releaseEmbed = resolve; });
  const embeddingProvider: EmbeddingProvider = {
    name: 'barrier-embedding', dimensions: 8,
    async embed(texts) {
      if (texts.some(text => text.includes('slow delete search'))) { embedEntered(); await embedGate; }
      return texts.map(() => [1, 0, 0, 0, 0, 0, 0, 0]);
    },
  };
  const cloud = await start(dir, undefined, async () => true, undefined, async () => {
    if (blockExport) { exportEntered(); await exportGate; }
  }, embeddingProvider);
  try {
    const created = (await createAccount(cloud.base)).body;
    const other = (await createAccount(cloud.base, { name: 'Unrelated Tenant', slug: 'unrelated-tenant' })).body;
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    const otherAuth = { authorization: `Bearer ${other.token}` };
    const source = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, {
      method: 'POST', headers: auth, body: JSON.stringify({ kind: 'note', title: 'Race', locator: 'race', content: 'version one', visibility: 'private', sourceVersion: 'v1' }),
    }).then(response => response.json()) as any;

    const exporting = fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/export`, { headers: auth });
    await exportStarted;
    const busyExport = await fetch(`${cloud.base}/api/v1/cloud/accounts/${other.id}/knowledge/export`, { headers: otherAuth });
    assert.equal(busyExport.status, 503, 'reference gateway bounds concurrent in-memory knowledge exports globally');
    assert.equal(((await busyExport.json()) as any).error.code, 'export_busy');
    let mutationSettled = false;
    const mutation = fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/${source.source.id}`, {
      method: 'PUT', headers: auth, body: JSON.stringify({ kind: 'note', title: 'Race', locator: 'race', content: 'version two', visibility: 'private', sourceVersion: 'v2' }),
    }).then(response => { mutationSettled = true; return response; });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal((await mutation).status, 200);
    assert.equal(mutationSettled, true, 'a slow export must not serialize an unrelated knowledge mutation');
    releaseExport();
    assert.equal((await exporting).status, 200);
    blockExport = false;

    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private`, { headers: auth })).status, 200);
    const staleReceiptDelete = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/delete-all`, {
      method: 'POST', headers: auth, body: JSON.stringify({ confirm: 'DELETE' }),
    });
    assert.equal(staleReceiptDelete.status, 409);
    assert.equal(((await staleReceiptDelete.json()) as any).error.code, 'knowledge_export_required');

    // Establish fresh receipts, then hold an admitted public retrieval outside
    // the admission lock. Delete closes the account to new requests, drains
    // this one request, and then erases all managed adjunct data.
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/export`, { headers: auth })).status, 200);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private`, { headers: auth })).status, 200);
    const slowSearch = fetch(`${cloud.base}${created.publicApi}/knowledge/search`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'slow delete search' }),
    });
    await embedStarted;
    let deleteSettled = false;
    const concurrentDelete = fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/delete-all`, {
      method: 'POST', headers: auth, body: JSON.stringify({ confirm: 'DELETE' }),
    }).then(response => { deleteSettled = true; return response; });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(deleteSettled, false, 'delete-all waits for an already-admitted public search');
    const [health, unrelatedSettings] = await Promise.all([
      Promise.race([
        fetch(`${cloud.base}/healthz`),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('health was blocked by another account')), 500)),
      ]),
      Promise.race([
        fetch(`${cloud.base}/api/v1/cloud/accounts/${other.id}/settings`, { headers: otherAuth }),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('unrelated account was blocked by slow search')), 500)),
      ]),
    ]);
    assert.equal(health.status, 200);
    assert.equal(unrelatedSettings.status, 200);
    const rejectedWhileClosing = await Promise.race([
      fetch(`${cloud.base}${created.publicApi}/card`),
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('new public request was blocked behind slow search')), 500)),
    ]);
    assert.equal(rejectedWhileClosing.status, 409);
    assert.equal(((await rejectedWhileClosing.json()) as any).error.code, 'account_deleting');
    releaseEmbed();
    assert.equal((await slowSearch).status, 200);
    assert.equal((await concurrentDelete).status, 200);
    const remaining = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { headers: auth }).then(response => response.json()) as any[];
    assert.equal(remaining.length, 0);
    const afterDelete = await fetch(`${cloud.base}${created.publicApi}/knowledge/search`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'anything' }),
    }).then(response => response.json()) as any;
    assert.deepEqual(afterDelete.results, []);
  } finally { await cloud.close(); await rm(dir, { recursive: true, force: true }); }
});

test('a corrupt account with pending erasure cannot poison health or another tenant', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-pending-isolation-'));
  let cloud = await start(dir);
  let healthy: any;
  try { healthy = (await createAccount(cloud.base, { name: 'Healthy Tenant', slug: 'healthy-tenant' })).body; }
  finally { await cloud.close(); }

  const registryPath = join(dir, 'accounts.json');
  const records = JSON.parse(await readFile(registryPath, 'utf8')) as any[];
  records.push({
    id: 'acct-corrupt-pending', slug: 'corrupt-pending', tokenHash: createHash('sha256').update('bad-token').digest('hex'),
    region: 'ap-shanghai', retentionDays: 30, deviceIds: ['old-device'], notifications: [], createdAt: 1,
    plan: 'free', billingStatus: 'active', aiMode: 'managed', usage: { modelCalls: 0, retrievalCalls: 0, knowledgeBytes: 0, estimatedCents: 0 },
    pendingManagedErase: true, lastKnowledgeWriteAt: null, lastKnowledgeExportAt: null,
  });
  await writeFile(registryPath, JSON.stringify(records));
  const corruptDir = join(dir, 'regions', 'ap-shanghai', 'acct-corrupt-pending');
  await mkdir(corruptDir, { recursive: true });
  await writeFile(join(corruptDir, 'core.db'), 'not a sqlite database');

  cloud = await start(dir);
  try {
    assert.equal((await fetch(`${cloud.base}/healthz`)).status, 200);
    const healthyAuth = { authorization: `Bearer ${healthy.token}` };
    const healthyCard = await fetch(`${cloud.base}/api/v1/cloud/accounts/${healthy.id}/owner/card`, { headers: healthyAuth });
    assert.equal(healthyCard.status, 200);
    assert.equal(((await healthyCard.json()) as any).name, 'Healthy Tenant');
    const badTenant = await fetch(`${cloud.base}/api/v1/cloud/cards/corrupt-pending/card`);
    assert.equal(badTenant.status, 503);
    assert.equal(((await badTenant.json()) as any).error.code, 'account_recovery_unavailable');
    assert.equal((await fetch(`${cloud.base}/healthz`)).status, 200, 'bad pending tenant never poisons global health');
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${healthy.id}/owner/card`, { headers: healthyAuth })).status, 200, 'second tenant remains available');
  } finally { await cloud.close(); await rm(dir, { recursive: true, force: true }); }
});

test('invalid region, oversized bodies, persistent creation limits, and poisoned registry records cannot escape or take down health', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-hardening-'));
  let cloud = await start(dir);
  try {
    const traversal = await createAccount(cloud.base, { region: '../../escape' });
    assert.equal(traversal.response.status, 400);
    assert.equal(traversal.body.error?.code, 'invalid_request');
    assert.equal(existsSync(join(dir, 'escape')), false);
    const oversized = await fetch(`${cloud.base}/api/v1/cloud/accounts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(2 * 1024 * 1024 + 1) }) });
    assert.equal(oversized.status, 413);
  } finally { await cloud.close(); }

  const rateDir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-rate-'));
  cloud = await start(rateDir);
  try {
    for (let index = 0; index < 5; index += 1) assert.equal((await createAccount(cloud.base, { name: `Owner ${index}` })).response.status, 201);
    await cloud.close(); cloud = await start(rateDir);
    assert.equal((await createAccount(cloud.base, { name: 'Sixth' })).response.status, 429, 'creation rate survives restart');
  } finally { await cloud.close().catch(() => {}); await rm(rateDir, { recursive: true, force: true }); }

  const poisonedDir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-poisoned-'));
  await mkdir(join(poisonedDir, 'regions', 'ap-shanghai', 'acct-broken'), { recursive: true });
  await writeFile(join(poisonedDir, 'regions', 'ap-shanghai', 'acct-broken', 'core.db'), 'not a sqlite database');
  await writeFile(join(poisonedDir, 'accounts.json'), JSON.stringify([
    { id: 'acct-escape', slug: 'escape', tokenHash: createHash('sha256').update('x').digest('hex'), region: '../../escape', retentionDays: 30, deviceIds: [], notifications: [], createdAt: 1, plan: 'free', billingStatus: 'active', aiMode: 'managed', usage: { modelCalls: 0, knowledgeBytes: 0, estimatedCents: 0 } },
    { id: 'acct-broken', slug: 'broken', tokenHash: createHash('sha256').update('x').digest('hex'), region: 'ap-shanghai', retentionDays: 30, deviceIds: [], notifications: [], createdAt: 1, plan: 'free', billingStatus: 'active', aiMode: 'managed', usage: { modelCalls: 0, knowledgeBytes: 0, estimatedCents: 0 } },
  ]));
  cloud = await start(poisonedDir);
  try {
    const health = await fetch(`${cloud.base}/healthz`);
    assert.equal(health.status, 200);
    const payload = await health.json() as any;
    assert.equal(payload.ok, true);
    assert.equal(payload.quarantinedAccounts, 1);
    assert.equal(existsSync(join(poisonedDir, 'accounts.quarantine.json')), true);
  } finally {
    await cloud.close(); await rm(poisonedDir, { recursive: true, force: true }); await rm(dir, { recursive: true, force: true });
  }
});

test('managed knowledge export migrates to a fresh open Server with identical structured retrieval and privacy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-knowledge-portable-'));
  const cloud = await start(dir);
  const selfHosted = await startApp();
  try {
    const created = (await createAccount(cloud.base, { name: 'Portable Owner', plan: 'pro' })).body;
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    const add = async (body: Record<string, unknown>) => {
      const response = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, {
        method: 'POST', headers: auth, body: JSON.stringify(body),
      });
      assert.equal(response.status, 201);
      return response.json() as Promise<any>;
    };
    const publicSource = await add({ kind: 'external', title: 'Open migration', locator: 'docs:migrate', content: '可移植协议允许离开托管平台', visibility: 'public', sourceVersion: 'managed-v7' });
    const privateSource = await add({ kind: 'note', title: 'Private migration', locator: 'note:private', content: '私密迁移口令蓝色月亮', visibility: 'private', sourceVersion: 'managed-v9' });
    const exactRawContent = `  leading whitespace\r\n${'multi chunk portable source '.repeat(120_000)}trailing whitespace  `;
    assert.ok(Buffer.byteLength(exactRawContent) > 3 * 1024 * 1024);
    const rawSource = await add({ kind: 'file', title: 'Exact raw source', locator: 'raw.txt', content: exactRawContent, visibility: 'private', sourceVersion: 'raw-v1' });
    const controlHeavyContent = '\u0000'.repeat(6_000_000);
    const controlSource = await add({ kind: 'note', title: 'Control-heavy source', locator: 'note:controls', content: controlHeavyContent, visibility: 'private', sourceVersion: 'controls-v1' });
    const beforeOversize = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { headers: auth }).then(response => response.json()) as any[];
    const usageBeforeInvalidMetadata = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/plan`, { headers: auth }).then(response => response.json()) as any;
    for (const invalid of [
      { kind: 'note', title: 't'.repeat(501), locator: 'note:title', content: 'x' },
      { kind: 'note', title: 'Locator', locator: 'l'.repeat(2_001), content: 'x' },
      { kind: 'note', title: 'Version', locator: 'note:version', content: 'x', sourceVersion: 'v'.repeat(257) },
    ]) {
      const response = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { method: 'POST', headers: auth, body: JSON.stringify(invalid) });
      assert.equal(response.status, 400);
    }
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { headers: auth }).then(response => response.json()) as any[]).length, beforeOversize.length);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/plan`, { headers: auth }).then(response => response.json()) as any).usage.knowledgeBytes, usageBeforeInvalidMetadata.usage.knowledgeBytes, 'invalid metadata changes neither usage nor storage');
    const overPlan = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ kind: 'file', title: 'Too large', locator: 'too-large.txt', content: 'x'.repeat(10_000_001), visibility: 'private' }),
    });
    assert.equal(overPlan.status, 413);
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { headers: auth }).then(response => response.json()) as any[]).length, beforeOversize.length, 'over-plan source leaves no partial write');

    const managedOwner = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/search`, {
      method: 'POST', headers: auth, body: JSON.stringify({ query: '蓝色月亮', semantic: false }),
    }).then(response => response.json()) as any;
    const managedVisitor = await fetch(`${cloud.base}${created.publicApi}/knowledge/search`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '离开托管平台', semantic: false }),
    }).then(response => response.json()) as any;

    const archive = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private`, { headers: auth }).then(response => response.json()) as any;
    const bundle = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/export`, { headers: auth }).then(response => response.json()) as any;
    assert.equal(bundle.format, 'vibecard-knowledge-bundle');
    assert.equal(bundle.ownerId, archive.profile.id);
    assert.equal(Buffer.from(bundle.sources.find((source: any) => source.id === rawSource.source.id).contentBase64, 'base64').toString('utf8'), exactRawContent);
    assert.equal(Buffer.from(bundle.sources.find((source: any) => source.id === controlSource.source.id).contentBase64, 'base64').toString('utf8'), controlHeavyContent);
    assert.notEqual(bundle.ownerId, created.id, 'managed account id never becomes canonical owner identity');
    const forbidden = new Set(['apiKey', 'provider', 'embedding', 'vector', 'accountId', 'plan', 'billingStatus', 'sourceVersion', 'byteSize', 'managedKind']);
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        assert.equal(forbidden.has(key), false, `managed-only field ${key} entered the portable bundle`);
        visit(child);
      }
    };
    visit(bundle);

    assert.equal((await owner(selfHosted.base, 'POST', '/api/v1/owner/import', { archive })).status, 200);
    assert.equal((await owner(selfHosted.base, 'POST', '/api/v1/owner/knowledge/import', { bundle })).status, 200);
    const selfExport = await owner(selfHosted.base, 'GET', '/api/v1/owner/knowledge/export');
    assert.equal(Buffer.from(selfExport.body.sources.find((source: any) => source.id === rawSource.source.id).contentBase64, 'base64').toString('utf8'), exactRawContent, 'managed raw CRLF and boundary whitespace re-export byte-for-byte');
    const localOwner = await owner(selfHosted.base, 'POST', '/api/v1/owner/knowledge/search', { query: '蓝色月亮' });
    const localVisitorResponse = await fetch(`${selfHosted.base}/api/v1/public/knowledge/search`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitorId: 'portable-visitor', query: '离开托管平台' }),
    });
    assert.equal(localVisitorResponse.status, 200);
    const localVisitor = await localVisitorResponse.json() as any;
    assert.deepEqual(localOwner.body.results.map((item: any) => item.sourceId), managedOwner.results.map((item: any) => item.sourceId));
    assert.deepEqual(localVisitor.results.map((item: any) => item.sourceId), managedVisitor.results.map((item: any) => item.sourceId));
    assert.ok(localOwner.body.results.some((item: any) => item.sourceId === privateSource.source.id));
    assert.ok(localVisitor.results.some((item: any) => item.sourceId === publicSource.source.id));
    assert.equal(JSON.stringify(localVisitor).includes('蓝色月亮'), false);
  } finally {
    await selfHosted.close(); await cloud.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('canonical knowledge commits survive registry and embedding failures, then reconcile on retry and restart', async () => {
  const embedding: EmbeddingProvider & { fail: boolean } = {
    name: 'flaky-embedding', dimensions: 2, fail: true,
    async embed(texts) {
      if (this.fail) { this.fail = false; throw new Error('embedding unavailable'); }
      return texts.map(text => [text.length || 1, 1]);
    },
  };
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-knowledge-derived-failure-'));
  let cloud = await start(dir, undefined, async () => true, undefined, undefined, embedding, async () => { throw new Error('registry persistence unavailable'); });
  let created: any;
  try {
    created = (await createAccount(cloud.base, { name: 'Canonical First', plan: 'pro' })).body;
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    const createdSourceResponse = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ kind: 'note', title: 'Durable source', locator: 'note:durable', content: 'canonical version one', visibility: 'public', sourceVersion: 'v1' }),
    });
    assert.equal(createdSourceResponse.status, 201, 'derived failures do not turn a canonical commit into HTTP 500');
    const createdSource = await createdSourceResponse.json() as any;
    assert.equal(createdSource.indexStatus, 'pending');
    const recoveredSearch = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/search`, {
      method: 'POST', headers: auth, body: JSON.stringify({ query: 'version one', semantic: true }),
    }).then(response => response.json()) as any;
    assert.ok(recoveredSearch.results.some((item: any) => item.sourceId === createdSource.source.id), 'semantic index rebuilds from canonical chunks on retry');

    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/export`, { headers: auth })).status, 200);
    const updated = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/${createdSource.source.id}`, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({ kind: 'note', title: 'Durable source', locator: 'note:durable', content: 'canonical version two after registry failure', visibility: 'private', sourceVersion: 'v2' }),
    });
    assert.equal(updated.status, 200);
  } finally { await cloud.close(); }

  cloud = await start(dir);
  try {
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    const structured = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge/search`, {
      method: 'POST', headers: auth, body: JSON.stringify({ query: 'version two', semantic: false }),
    }).then(response => response.json()) as any;
    assert.ok(structured.results.some((item: any) => item.chunk.content.includes('version two')), 'restart reads canonical commit even when registry persist failed');
    assert.equal((await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/export?kind=private`, { headers: auth })).status, 200);
    const refused = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/delete-all`, { method: 'POST', headers: auth, body: JSON.stringify({ confirm: 'DELETE' }) });
    assert.equal(refused.status, 409);
    assert.equal(((await refused.json()) as any).error.code, 'knowledge_export_required', 'stale cross-file receipt cannot authorize deletion after restart');
  } finally { await cloud.close(); await rm(dir, { recursive: true, force: true }); }
});

test('managed accounts cannot bypass plan accounting through proxied Core knowledge routes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibecard-cloud-knowledge-proxy-block-'));
  const cloud = await start(dir);
  try {
    const created = (await createAccount(cloud.base, { name: 'Free Owner' })).body;
    const auth = { authorization: `Bearer ${created.token}`, 'content-type': 'application/json' };
    const bypassImport = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/knowledge/import`, { method: 'POST', headers: auth, body: '{}' });
    assert.equal(bypassImport.status, 404);
    const bypassSearch = await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/owner/knowledge/search`, { method: 'POST', headers: auth, body: JSON.stringify({ query: 'anything' }) });
    assert.equal(bypassSearch.status, 404);
    assert.deepEqual(await fetch(`${cloud.base}/api/v1/cloud/accounts/${created.id}/knowledge`, { headers: auth }).then(response => response.json()), []);
    assert.equal(existsSync(join(dir, 'regions', 'ap-shanghai', created.id, 'core.db.knowledge.json')), false, 'Core sidecar cannot become a split-brain knowledge store');
  } finally { await cloud.close(); await rm(dir, { recursive: true, force: true }); }
});
