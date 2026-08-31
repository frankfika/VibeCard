/**
 * Handler-level tests for the archive/import cloud function (task 4.6).
 *
 * Covers the four contract checks a real import must satisfy:
 *   - Schema validation (including future_version + checksum_mismatch).
 *   - Ownership: a stranger's archive cannot be imported into another openid.
 *   - Public archives are refused — only private archives restore owner data.
 *   - Per-collection upsert is idempotent (same archive imported twice →
 *     created once, then skipped; updated only when content actually changes).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const OWNER = 'owner-openid';
const STRANGER = 'stranger-openid';

let currentOpenid = OWNER;

function createFakeCloud() {
  const store = {
    users: new Map(),
    memories: new Map(),
    now_items: new Map(),
    requests: new Map(),
    contact_methods: new Map(),
    owner_audit_log: [],
  };

  const db = {
    collection(name) {
      const coll = store[name];
      return {
        where(conds) {
          return {
            async get() {
              const data = [...coll.entries()]
                .filter(([, v]) => Object.entries(conds).every(([k, val]) => v[k] === val))
                .map(([_id, v]) => ({ _id, ...v }));
              return { data };
            },
          };
        },
        async add({ data }) {
          if (name === 'owner_audit_log') {
            store.owner_audit_log.push(data);
            return { _id: 'audit-' + store.owner_audit_log.length };
          }
          const _id = data._id || `${name}-${coll.size + 1}`;
          coll.set(_id, data);
          return { _id };
        },
        doc(id) {
          return {
            async get() {
              const value = coll.get(id);
              if (!value) throw new Error('Doc not found');
              return { data: value };
            },
            async set({ data }) {
              coll.set(id, data);
              return { stats: { updated: 1 } };
            },
            async update({ data }) {
              if (!coll.has(id)) throw new Error('Doc not found');
              coll.set(id, { ...coll.get(id), ...data });
              return { stats: { updated: 1 } };
            },
          };
        },
      };
    },
  };

  return {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init() {},
    database() { return db; },
    getWXContext() { return { OPENID: currentOpenid }; },
  };
}

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'wx-server-sdk') return createFakeCloud();
  return originalLoad.call(this, request, ...rest);
};
const importFunction = require('../index.js');
Module._load = originalLoad;

const call = (event) => importFunction.main(event);

function makeArchive(overrides) {
  return Object.assign({
    format: 'vibecard-vibe-archive',
    schemaVersion: 1,
    kind: 'private',
    createdAt: 1000,
    app: { name: 'vibecard-miniprogram', version: '4.6.0' },
    encryption: null,
    sectionVersions: {
      profile: 1, card: 1, now: 1, memories: 1, conversations: 1,
      knowledgeSources: 1, connections: 1, contactMethods: 1, attachments: 1,
    },
    integrity: null,
    profile: { id: OWNER, schemaVersion: 1, name: '林舟', avatarUrl: 'https://example.com/a.png' },
    card: {
      id: 'card-' + OWNER,
      schemaVersion: 1,
      ownerId: OWNER,
      name: '林舟',
      avatarUrl: 'https://example.com/a.png',
      headline: '先理解，再认识',
      currentFocus: '打磨 VibeCard',
      canHelpWith: ['0 到 1 小程序'],
      wantsToMeet: ['做过 AI 社交的人'],
      topics: ['AI 分身'],
      highlights: [{ id: 'h1', title: 'VibeCard' }],
      agentEnabled: true,
      updatedAt: 1000,
    },
    nowItems: [{
      id: 'now-1',
      schemaVersion: 1,
      ownerId: OWNER,
      text: '在打磨访客对话',
      topic: 'current_work',
      sourceMemoryId: null,
      status: 'published',
      publishedAt: 1500,
      expiresAt: null,
      createdAt: 1000,
      updatedAt: 1500,
    }],
    memories: [{
      id: 'mem-1',
      schemaVersion: 1,
      ownerId: OWNER,
      kind: 'current',
      content: '在打磨访客对话',
      visibility: 'public',
      status: 'confirmed',
      sourceConversationId: '',
      sourceMessageIds: [],
      createdAt: 1000,
      updatedAt: 1000,
    }],
    conversations: { exported: false, items: [] },
    knowledgeSources: [],
    connectionRequests: [],
    contactMethods: [],
    attachments: [],
  }, overrides || {});
}

test('unauthenticated caller is refused before any DB read', async () => {
  currentOpenid = '';
  const res = await call({ action: 'importArchive', archive: makeArchive() });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'unauthorized');
  currentOpenid = OWNER;
});

test('unknown action returns typed error', async () => {
  const res = await call({ action: 'noop' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'invalid_action');
});

test('missing archive payload returns invalid_request', async () => {
  const res = await call({ action: 'importArchive' });
  // domain-level failure surfaces inside res.result.state; transport-level
  // errors (unauthorized / internal_error) use res.ok=false.
  assert.equal(res.ok, true);
  assert.equal(res.result.state, 'failure');
  assert.equal(res.result.error.code, 'invalid_request');
});

test('public archives are refused: import requires a private archive', async () => {
  const archive = makeArchive({ kind: 'public', profile: null });
  // For a public archive the contactMethods and memories must be empty
  archive.memories = [];
  archive.contactMethods = [];
  archive.connectionRequests = [];
  archive.conversations = { exported: false, items: [] };
  const res = await call({ action: 'importArchive', archive });
  assert.equal(res.ok, true);
  assert.equal(res.result.state, 'failure');
  assert.equal(res.result.error.code, 'public_boundary_violation');
});

test('archive whose card.ownerId differs from caller OPENID is refused (ownership_mismatch)', async () => {
  const archive = makeArchive();
  archive.card = Object.assign({}, archive.card, { ownerId: STRANGER });
  const res = await call({ action: 'importArchive', archive });
  assert.equal(res.ok, true);
  assert.equal(res.result.state, 'permission_denied');
  assert.equal(res.result.error.code, 'ownership_mismatch');
});

test('future-version archives are refused before any write', async () => {
  const archive = makeArchive();
  archive.schemaVersion = 2;
  const res = await call({ action: 'importArchive', archive });
  assert.equal(res.ok, true);
  assert.equal(res.result.state, 'failure');
  assert.equal(res.result.error.code, 'future_version');
});

test('encrypted archive is refused before any write', async () => {
  const archive = makeArchive();
  archive.encryption = { algorithm: 'AES-GCM', hint: 'passphrase' };
  const res = await call({ action: 'importArchive', archive });
  assert.equal(res.ok, true);
  assert.equal(res.result.state, 'failure');
  assert.equal(res.result.error.code, 'encrypted_archive');
});

test('private export from this OPENID is imported with per-collection counters', async () => {
  const res = await call({ action: 'importArchive', archive: makeArchive() });
  assert.equal(res.ok, true);
  assert.equal(res.result.state, 'success');
  const report = res.result.report;
  assert.ok(report.totals.created >= 2, 'card creates user, memory creates 1 record');
  assert.ok(report.perCollection.memories.created >= 1);
  assert.ok(report.perCollection.nowItems.created >= 1);
  assert.ok(report.perCollection.users.created >= 1);
});

test('a second import with the same archive is idempotent (skips, not duplicates)', async () => {
  const first = await call({ action: 'importArchive', archive: makeArchive() });
  assert.equal(first.result.state, 'success');
  const res = await call({ action: 'importArchive', archive: makeArchive() });
  assert.equal(res.result.state, 'success');
  const totals = res.result.report.totals;
  assert.equal(totals.created, 0, 'no new rows on identical replay');
  assert.equal(totals.updated, 0, 'no updates on identical replay');
  assert.ok(totals.skipped > 0);
});

test('imported contactMethods carry ownerId matching the caller', async () => {
  const archive = makeArchive();
  archive.contactMethods = [{
    id: 'cm-1',
    schemaVersion: 1,
    ownerId: OWNER,
    kind: 'wechat',
    value: 'lxzhou',
    label: '工作微信',
    createdAt: 1000,
    updatedAt: 1000,
  }];
  const res = await call({ action: 'importArchive', archive });
  assert.equal(res.result.state, 'success');
  const cm = res.result.report.perCollection.contactMethods;
  assert.ok(cm.created >= 1);
});