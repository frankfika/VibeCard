import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import {
  exportKnowledgeBundle,
  noteKnowledgeAdapter,
} from '../../shared/index.ts';
import { fixturePrivateArchive, owner, startApp } from './helpers.ts';

function fixtureBundle() {
  const archive = fixturePrivateArchive();
  const ownerId = archive.profile.id;
  const publicResult = noteKnowledgeAdapter.ingest(
    { ownerId, title: 'Public portability', locator: 'note:public', content: '开放协议支持离开托管服务', visibility: 'public' },
    1_000,
    { sourceId: 'knowledge-public', chunkId: index => `knowledge-public:chunk:${index}` },
  );
  const privateResult = noteKnowledgeAdapter.ingest(
    { ownerId, title: 'Private boundary', locator: 'note:private', content: '绝密迁移计划只有主人可见', visibility: 'private' },
    1_000,
    { sourceId: 'knowledge-private', chunkId: index => `knowledge-private:chunk:${index}` },
  );
  return exportKnowledgeBundle({
    ownerId,
    sources: [
      { ...publicResult.source, content: '开放协议支持离开托管服务', visibility: 'public', adapterKind: 'note' },
      { ...privateResult.source, content: '绝密迁移计划只有主人可见', visibility: 'private', adapterKind: 'note' },
    ],
    app: { name: 'portability-test', version: '1' },
    createdAt: 2_000,
  });
}

function bundleForContent(content: string, suffix: string) {
  const ownerId = fixturePrivateArchive().profile.id;
  const result = noteKnowledgeAdapter.ingest(
    { ownerId, title: `Source ${suffix}`, locator: `note:${suffix}`, content, visibility: 'private' },
    3_000,
    { sourceId: `source-${suffix}`, chunkId: index => `source-${suffix}:chunk:${index}` },
  );
  return exportKnowledgeBundle({ ownerId, sources: [{ ...result.source, content, visibility: 'private', adapterKind: 'note' }], app: { name: 'test', version: '1' }, createdAt: 3_000 });
}

test('self-host authoritatively imports, persists, retrieves and deletes a portable knowledge bundle', async () => {
  const app = await startApp();
  try {
    assert.equal((await owner(app.base, 'POST', '/api/v1/owner/import', { archive: fixturePrivateArchive() })).status, 200);
    const bundle = fixtureBundle();
    assert.equal((await owner(app.base, 'POST', '/api/v1/owner/knowledge/import', { bundle })).status, 200);

    const sidecar = `${app.dbDir}/vibecard.db.knowledge.json`;
    assert.equal(existsSync(sidecar), true);
    assert.equal(statSync(sidecar).mode & 0o777, 0o600);

    const ownerSearch = await owner(app.base, 'POST', '/api/v1/owner/knowledge/search', { query: '绝密迁移计划' });
    assert.equal(ownerSearch.status, 200);
    assert.ok(ownerSearch.body.results.some((item: any) => item.sourceId === 'knowledge-private'));

    const visitorSearch = await fetch(`${app.base}/api/v1/public/knowledge/search`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitorId: 'visitor-portable', query: '离开托管服务' }),
    }).then(async response => ({ status: response.status, body: await response.json() as any }));
    assert.equal(visitorSearch.status, 200);
    assert.ok(visitorSearch.body.results.some((item: any) => item.sourceId === 'knowledge-public'));
    assert.equal(JSON.stringify(visitorSearch.body).includes('绝密迁移计划'), false);
    assert.ok(visitorSearch.body.results.every((item: any) => item.visibility.visibility === 'public'));

    const privateExport = await owner(app.base, 'GET', '/api/v1/owner/export?kind=private');
    assert.equal(privateExport.status, 200);
    for (const source of privateExport.body.knowledgeSources) {
      assert.equal('content' in source, false);
      assert.equal('visibility' in source, false);
      assert.equal('provider' in source, false);
    }
    const refused = await owner(app.base, 'POST', '/api/v1/owner/delete-all', { confirm: 'DELETE' });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, 'knowledge_export_required');
    const knowledgeExport = await owner(app.base, 'GET', '/api/v1/owner/knowledge/export');
    assert.equal(knowledgeExport.status, 200);
    const deleted = await owner(app.base, 'POST', '/api/v1/owner/delete-all', { confirm: 'DELETE' });
    assert.equal(deleted.status, 200);
    assert.equal(existsSync(sidecar), false);
  } finally { await app.close(); }
});

test('self-host import rejects malformed, future, tampered and cross-owner bundles without changing retrieval', async () => {
  const app = await startApp();
  try {
    assert.equal((await owner(app.base, 'POST', '/api/v1/owner/import', { archive: fixturePrivateArchive() })).status, 200);
    const original = fixtureBundle();
    const cases: Array<[string, unknown]> = [
      ['malformed', { format: 'vibecard-knowledge-bundle', schemaVersion: 1 }],
      ['future', { ...original, schemaVersion: 2 }],
      ['tampered', (() => { const value = structuredClone(original); value.sources[0]!.contentBase64 = 'dGFtcGVyZWQ='; return value; })()],
      ['cross-owner', (() => { const value = structuredClone(original); value.ownerId = 'owner-attacker'; return value; })()],
      ['provider metadata', (() => { const value = structuredClone(original) as any; value.sources[0].apiKey = 'secret'; return value; })()],
    ];
    for (const [label, bundle] of cases) {
      const response = await owner(app.base, 'POST', '/api/v1/owner/knowledge/import', { bundle });
      assert.equal(response.status, 400, label);
    }
    const search = await owner(app.base, 'POST', '/api/v1/owner/knowledge/search', { query: 'tampered' });
    assert.deepEqual(search.body.results, []);
  } finally { await app.close(); }
});

test('authenticated knowledge import accepts bundles above the ordinary 2 MiB limit and rejects plan-oversized sources', async () => {
  const app = await startApp();
  try {
    assert.equal((await owner(app.base, 'POST', '/api/v1/owner/import', { archive: fixturePrivateArchive() })).status, 200);
    const largeContent = `  start\r\n${'portable-content '.repeat(140_000)}end  `;
    assert.ok(Buffer.byteLength(JSON.stringify(bundleForContent(largeContent, 'large'))) > 2 * 1024 * 1024);
    const accepted = await owner(app.base, 'POST', '/api/v1/owner/knowledge/import', { bundle: bundleForContent(largeContent, 'large') });
    assert.equal(accepted.status, 200);
    const exported = await owner(app.base, 'GET', '/api/v1/owner/knowledge/export');
    const decoded = Buffer.from(exported.body.sources[0].contentBase64, 'base64').toString('utf8');
    assert.equal(decoded, largeContent, 'raw whitespace and CRLF round-trip byte-for-byte');

    const oversized = bundleForContent('x'.repeat(10_000_001), 'oversized');
    const refused = await owner(app.base, 'POST', '/api/v1/owner/knowledge/import', { bundle: oversized });
    assert.equal(refused.status, 400);
    const stillLarge = await owner(app.base, 'GET', '/api/v1/owner/knowledge/export');
    assert.equal(Buffer.from(stillLarge.body.sources[0].contentBase64, 'base64').toString('utf8'), largeContent, 'oversized rejection leaves canonical data unchanged');
  } finally { await app.close(); }
});

for (const stage of ['after_stage', 'after_metadata', 'after_commit'] as const) {
  test(`knowledge import recovers a complete canonical state after ${stage} failure`, async () => {
    let armed = false;
    const app = await startApp({ knowledgeImportBarrier: async current => { if (armed && current === stage) throw new Error(`fault:${stage}`); } });
    try {
      assert.equal((await owner(app.base, 'POST', '/api/v1/owner/import', { archive: fixturePrivateArchive() })).status, 200);
      const oldBundle = bundleForContent('old canonical knowledge', 'old');
      assert.equal((await owner(app.base, 'POST', '/api/v1/owner/knowledge/import', { bundle: oldBundle })).status, 200);
      assert.equal((await owner(app.base, 'GET', '/api/v1/owner/knowledge/export')).status, 200);
      armed = true;
      const failed = await owner(app.base, 'POST', '/api/v1/owner/knowledge/import', { bundle: bundleForContent('new canonical knowledge', 'new') });
      assert.equal(failed.status, 500);
      armed = false;
      if (stage === 'after_commit') {
        assert.equal((await owner(app.base, 'GET', '/api/v1/owner/export?kind=private')).status, 200);
        const staleReceipt = await owner(app.base, 'POST', '/api/v1/owner/delete-all', { confirm: 'DELETE' });
        assert.equal(staleReceipt.status, 409);
        assert.equal(staleReceipt.body.error.code, 'knowledge_export_required');
      }
      const exported = await owner(app.base, 'GET', '/api/v1/owner/knowledge/export');
      const expected = stage === 'after_commit' ? 'new canonical knowledge' : 'old canonical knowledge';
      assert.equal(Buffer.from(exported.body.sources[0].contentBase64, 'base64').toString('utf8'), expected);
      const archive = await owner(app.base, 'GET', '/api/v1/owner/export?kind=private');
      assert.deepEqual(archive.body.knowledgeSources.map((source: any) => source.id), exported.body.sources.map((source: any) => source.id));
      // Export above creates a receipt for the actual recovered canonical
      // state; no stale pre-fault receipt is reused.
      assert.equal((await owner(app.base, 'POST', '/api/v1/owner/delete-all', { confirm: 'DELETE' })).status, 200);
    } finally { await app.close(); }
  });
}

test('whitespace-only canonical source still requires a fresh knowledge export before deletion', async () => {
  const app = await startApp();
  try {
    assert.equal((await owner(app.base, 'POST', '/api/v1/owner/import', { archive: fixturePrivateArchive() })).status, 200);
    assert.equal((await owner(app.base, 'POST', '/api/v1/owner/knowledge/import', { bundle: bundleForContent(' \r\n\t ', 'whitespace') })).status, 200);
    assert.equal((await owner(app.base, 'GET', '/api/v1/owner/export?kind=private')).status, 200);
    const refused = await owner(app.base, 'POST', '/api/v1/owner/delete-all', { confirm: 'DELETE' });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, 'knowledge_export_required');
    assert.equal((await owner(app.base, 'GET', '/api/v1/owner/knowledge/export')).status, 200);
    assert.equal((await owner(app.base, 'POST', '/api/v1/owner/delete-all', { confirm: 'DELETE' })).status, 200);
  } finally { await app.close(); }
});
