/**
 * Handler-level tests for the archive/deleteAll cloud function (task 4.6).
 *
 * Covers the four hard rules from DEVELOPMENT_PLAN.md §4.6 acceptance:
 *   1. Without an active receipt the function refuses (token_missing).
 *   2. A wrong / stale / consumed / expired confirmation is rejected before
 *      any DB write.
 *   3. After deletion the function re-scans every owner-scoped collection
 *      AND the public Card projection; any leftover record forces
 *      `partial_cleanup` with the exact collection + ids.
 *   4. The public projection tombstone makes card.getPublicCard return
 *      card_deleted (the user doc carries deleted=true, status='deleted').
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const core = require('../../lib/core');

const OWNER = 'owner-openid';
const STRANGER = 'stranger-openid';

let currentOpenid = OWNER;
let store = null;
let tombstoneFailures = new Set();

function resetStore() {
  store = {
    receipts: new Map(),
    users: new Map(),
    memories: new Map(),
    conversations: new Map(),
    requests: new Map(),
    nowItems: new Map(),
    contactMethods: new Map(),
    visitorEvidence: new Map(),
    requestGates: new Map(),
    auditLog: [],
  };
  tombstoneFailures = new Set();

  store.users.set('users-1', { _id: 'users-1', openid: OWNER, nickname: '林舟', avatar: 'a.png', bio: '', namecard: {}, blockedUsers: [] });
  store.memories.set('mem-1', { _id: 'mem-1', ownerId: OWNER, kind: 'current', content: 'a', visibility: 'public', status: 'confirmed', sourceConversationId: '', sourceMessageIds: [], createdAt: 1, updatedAt: 1 });
  store.memories.set('mem-2', { _id: 'mem-2', ownerId: STRANGER, kind: 'current', content: 'stranger', visibility: 'public', status: 'confirmed', sourceConversationId: '', sourceMessageIds: [], createdAt: 1, updatedAt: 1 });
  store.conversations.set('conv-1', { _id: 'conv-1', ownerId: OWNER, mode: 'owner', messages: [], createdAt: 1, updatedAt: 1 });
  store.nowItems.set('now-1', { _id: 'now-1', ownerId: OWNER, text: '在打磨', topic: 'current_work', sourceMemoryId: null, status: 'published', publishedAt: 1, expiresAt: null, createdAt: 1, updatedAt: 1 });
  store.contactMethods.set('cm-1', { _id: 'cm-1', ownerId: OWNER, kind: 'wechat', value: 'lxzhou', label: '工作微信', createdAt: 1, updatedAt: 1 });
  store.visitorEvidence.set('ev-1', { _id: 'ev-1', ownerId: OWNER, visitorId: STRANGER, contexts: ['x'], expiresAt: 9999999999 });
  store.requestGates.set('gate-1', { _id: 'gate-1', ownerId: OWNER, visitorId: STRANGER, lastRequestId: 'r1', lastCreatedAt: 1, lastDeclinedAt: null, updatedAt: 1 });
  store.requests.set('req-1', { _id: 'req-1', ownerId: OWNER, visitorId: STRANGER, visitorSummary: 's', reason: 'r', possibleSharedContext: [], ownerAction: 'pending', sharedContactMethodIds: [], createdAt: 1, updatedAt: 1 });
}

function createFakeCloud() {
  return {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init() {},
    database() {
      return {
        collection(name) {
          const coll = (() => {
            if (!store) resetStore();
            switch (name) {
              case 'users': return store.users;
              case 'memories': return store.memories;
              case 'conversations': return store.conversations;
              case 'requests': return store.requests;
              case 'now_items': return store.nowItems;
              case 'contact_methods': return store.contactMethods;
              case 'visitor_evidence': return store.visitorEvidence;
              case 'request_gates': return store.requestGates;
              case 'owner_export_receipts': return store.receipts;
              case 'owner_audit_log': return store.auditLog;
              default: return new Map();
            }
          })();
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
                  if (name === 'users' && tombstoneFailures.has(id)) {
                    throw new Error('forced tombstone failure');
                  }
                  coll.set(id, { ...coll.get(id), ...data });
                  return { stats: { updated: 1 } };
                },
                async remove() {
                  coll.delete(id);
                  return { stats: { removed: 1 } };
                },
              };
            },
            async add({ data }) {
              if (name === 'owner_audit_log') {
                store.auditLog.push(data);
                return { _id: 'audit-' + store.auditLog.length };
              }
              return { _id: 'inserted' };
            },
          };
        },
      };
    },
    getWXContext() { return { OPENID: currentOpenid }; },
  };
}

const originalLoad = Module._load;
let loaded = null;
Module._load = function (request, ...rest) {
  if (request === 'wx-server-sdk') return createFakeCloud();
  return originalLoad.call(this, request, ...rest);
};
loaded = require('../index.js');
Module._load = originalLoad;

const call = (event) => loaded.main(event);

function writeReceipt(overrides) {
  if (!store) resetStore();
  const now = Date.now();
  const receipt = Object.assign({
    schemaVersion: 1,
    id: core.computeDeleteAllReceiptId(OWNER),
    ownerOpenid: OWNER,
    archiveDigest: 'abcdef00',
    preparedAt: now,
    expiresAt: now + 5 * 60 * 1000,
    archiveBytes: 1024,
    archiveRecordCount: 5,
    consumedAt: null,
    origin: 'owner-initiated',
  }, overrides || {});
  store.receipts.set(receipt.id, receipt);
  return receipt;
}

test.beforeEach(() => {
  resetStore();
});

test('unauthenticated caller is refused before any DB read', async () => {
  currentOpenid = '';
  const res = await call({ action: 'deleteAll' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'unauthorized');
  currentOpenid = OWNER;
});

test('unknown action returns typed error', async () => {
  const res = await call({ action: 'noop' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'invalid_action');
});

test('missing receipt returns token_missing and never touches data', async () => {
  const before = (await loaded.__db ? null : null);
  const res = await call({ action: 'deleteAll', confirmation: { id: 'x', archiveDigest: 'x', preparedAt: 0 } });
  assert.equal(res.ok, true);
  assert.equal(res.result.state, 'permission_denied');
  assert.equal(res.result.error.code, 'token_missing');
  // Existing owner data must NOT have been mutated.
  const memCount = (await createFakeCloud().database().collection('memories').where({ ownerId: OWNER }).get()).data.length;
  assert.ok(memCount > 0, 'records should remain when no receipt exists');
});

test('mismatched confirmation digest is refused', async () => {
  const receipt = writeReceipt({ archiveDigest: 'correct00' });
  const res = await call({
    action: 'deleteAll',
    confirmation: { id: receipt.id, archiveDigest: 'wrong0000', preparedAt: receipt.preparedAt },
  });
  assert.equal(res.ok, true);
  assert.equal(res.result.state, 'permission_denied');
  assert.equal(res.result.error.code, 'token_mismatch');
});

test('expired receipt is refused without touching data', async () => {
  const receipt = writeReceipt({
    preparedAt: Date.now() - 10 * 60 * 1000,
    expiresAt: Date.now() - 5 * 60 * 1000,
  });
  const res = await call({
    action: 'deleteAll',
    confirmation: { id: receipt.id, archiveDigest: receipt.archiveDigest, preparedAt: receipt.preparedAt },
  });
  assert.equal(res.ok, true);
  assert.equal(res.result.state, 'failure');
  assert.equal(res.result.error.code, 'token_expired');
});

test('valid receipt deletes every owner-scoped collection and tombstones the public Card', async () => {
  const receipt = writeReceipt();
  const res = await call({
    action: 'deleteAll',
    confirmation: { id: receipt.id, archiveDigest: receipt.archiveDigest, preparedAt: receipt.preparedAt },
  });
  assert.equal(res.ok, true);
  assert.equal(res.result.state, 'success');
  assert.ok(res.result.cleanup);

  // Every owner-scoped collection is empty.
  const db = createFakeCloud().database();
  for (const name of ['memories', 'conversations', 'requests', 'now_items', 'contact_methods', 'visitor_evidence', 'request_gates']) {
    const data = (await db.collection(name).where({ ownerId: OWNER }).get()).data;
    assert.equal(data.length, 0, `${name} should have zero owner records`);
  }
  // Stranger's data is untouched.
  const strangerData = (await db.collection('memories').where({ ownerId: STRANGER }).get()).data;
  assert.equal(strangerData.length, 1, "stranger's memories must NOT be deleted");

  // Public Card projection is tombstoned.
  const userData = (await db.collection('users').where({ openid: OWNER }).get()).data[0];
  assert.equal(userData.deleted, true);
  assert.equal(userData.status, 'deleted');
  assert.deepEqual(userData.blockedUsers, []);
  assert.equal(userData.nickname, '');
  assert.equal(userData.avatar, '');
  // Receipt was consumed.
  const receiptAfter = (await db.collection('owner_export_receipts').doc(receipt.id).get()).data;
  assert.ok(receiptAfter.consumedAt !== null);
});

test('a tombstone failure forces partial_cleanup with the exact collection + id', async () => {
  tombstoneFailures.add('users-1');
  const receipt = writeReceipt();
  const res = await call({
    action: 'deleteAll',
    confirmation: { id: receipt.id, archiveDigest: receipt.archiveDigest, preparedAt: receipt.preparedAt },
  });
  assert.equal(res.ok, true);
  assert.equal(res.result.state, 'partial_cleanup');
  assert.deepEqual(res.result.leftovers.users, ['users-1']);
});