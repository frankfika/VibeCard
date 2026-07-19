/**
 * Visitor abuse-gate tests (task 3.2).
 *
 * Pure tests cover checkVisitorActivity / todayStr / activityDocId; the
 * entry-level suite proves the gates run before the model: a blocked or
 * rate-limited visitor produces a typed error with zero provider calls,
 * while a normal visitor passes and gets their activity doc upserted.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const limits = require('../lib/limits');

const OWNER = 'owner-1';
const VISITOR = 'visitor-1';

/* ---- pure logic -------------------------------------------------------- */

test('todayStr uses the UTC+8 calendar day', () => {
  // 2026-07-19T16:00:00Z is already 2026-07-20 00:00 in UTC+8.
  assert.equal(limits.todayStr(Date.UTC(2026, 6, 19, 16, 0, 0)), '2026-07-20');
  assert.equal(limits.todayStr(Date.UTC(2026, 6, 19, 15, 59, 59)), '2026-07-19');
});

test('activityDocId is the visitor:owner:date triple', () => {
  assert.equal(limits.activityDocId('v', 'o', '2026-07-19'), 'v:o:2026-07-19');
});

test('checkVisitorActivity gates per-owner message volume', () => {
  assert.equal(limits.checkVisitorActivity({ myDoc: { count: 59 }, todayOwnerCount: 0 }), null);
  assert.equal(
    limits.checkVisitorActivity({ myDoc: { count: 60 }, todayOwnerCount: 0 }),
    'rate_limited_messages',
  );
  assert.equal(
    limits.checkVisitorActivity({ myDoc: { count: 61 }, todayOwnerCount: 0 }),
    'rate_limited_messages',
  );
});

test('checkVisitorActivity gates new conversations only when the doc is absent', () => {
  // new conversation, budget left
  assert.equal(limits.checkVisitorActivity({ myDoc: null, todayOwnerCount: 9 }), null);
  // new conversation, budget spent
  assert.equal(limits.checkVisitorActivity({ myDoc: null, todayOwnerCount: 10 }), 'rate_limited_new');
  // existing conversation: the new-conversation budget is irrelevant
  assert.equal(limits.checkVisitorActivity({ myDoc: { count: 3 }, todayOwnerCount: 10 }), null);
});

test('isBlocked reads the owner blockedUsers array', () => {
  assert.equal(limits.isBlocked({ blockedUsers: ['v'] }, 'v'), true);
  assert.equal(limits.isBlocked({ blockedUsers: ['x'] }, 'v'), false);
  assert.equal(limits.isBlocked({}, 'v'), false);
  assert.equal(limits.isBlocked(null, 'v'), false);
});

/* ---- entry-level: gates run before the provider ------------------------- */

let currentOpenid = VISITOR;
let providerCalls = 0;
let upsertCalls = [];

function createFakeCloud(store) {
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
        doc(_id) {
          return {
            async get() {
              if (!coll.has(_id)) throw new Error('Doc not found');
              return { data: coll.get(_id) };
            },
            async set({ data }) {
              upsertCalls.push({ op: 'set', _id, data });
              coll.set(_id, data);
              return { _id };
            },
            async update({ data }) {
              upsertCalls.push({ op: 'update', _id, data });
              if (!coll.has(_id)) throw new Error('Doc not found');
              coll.set(_id, { ...coll.get(_id), ...data });
              return { stats: { updated: 1 } };
            },
          };
        },
      };
    },
  };
  return {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database() { return db; },
    getWXContext() { return { OPENID: currentOpenid }; },
  };
}

function loadFunction(store) {
  const countingProviders = {
    getProvider() {
      return {
        name: 'counting-mock',
        async complete() {
          providerCalls += 1;
          return JSON.stringify({ reply: '你好，我是他的 AI 分身。', evidenceRefs: [], nextAction: 'continue' });
        },
      };
    },
  };
  const fakeCloud = createFakeCloud(store);
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'wx-server-sdk') return fakeCloud;
    if (request === './lib/providers') return countingProviders;
    return originalLoad.call(this, request, ...rest);
  };
  delete require.cache[require.resolve('../index.js')];
  const fn = require('../index.js');
  Module._load = originalLoad;
  return fn;
}

function baseStore(activityDocs) {
  return {
    users: new Map([
      ['users-1', { openid: OWNER, nickname: '方辰', blockedUsers: ['blocked-visitor'] }],
    ]),
    memories: new Map([
      ['m1', { ownerId: OWNER, kind: 'current', visibility: 'public', status: 'confirmed', content: '在做 VibeCard', updatedAt: 1 }],
    ]),
    visitor_activity: new Map(Object.entries(activityDocs || {})),
    requests: new Map(),
    conversations: new Map(),
  };
}

const CHAT = [{ role: 'user', content: '他最近在做什么？' }];

test('blocked visitor: typed error, provider never called', async () => {
  providerCalls = 0;
  upsertCalls = [];
  const fn = loadFunction(baseStore());
  currentOpenid = 'blocked-visitor';
  const res = await fn.main({ action: 'visitorMessage', ownerId: OWNER, messages: CHAT });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'blocked');
  assert.equal(providerCalls, 0, 'provider is never invoked for a blocked visitor');
  assert.equal(upsertCalls.length, 0, 'no activity is recorded for a blocked visitor');
  currentOpenid = VISITOR;
});

test('message budget spent: rate_limited, provider never called', async () => {
  providerCalls = 0;
  upsertCalls = [];
  const dateStr = limits.todayStr(Date.now());
  const docId = limits.activityDocId(VISITOR, OWNER, dateStr);
  const fn = loadFunction(baseStore({
    [docId]: { visitorId: VISITOR, ownerId: OWNER, date: dateStr, count: 60, updatedAt: 1 },
  }));
  const res = await fn.main({ action: 'visitorMessage', ownerId: OWNER, messages: CHAT });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'rate_limited');
  assert.equal(res.error.message, '今天聊得够多了，明天再来吧');
  assert.equal(providerCalls, 0);
  assert.equal(upsertCalls.length, 0);
});

test('new-conversation budget spent: rate_limited, provider never called', async () => {
  providerCalls = 0;
  upsertCalls = [];
  const dateStr = limits.todayStr(Date.now());
  const docs = {};
  for (let i = 0; i < 10; i += 1) {
    docs[`${VISITOR}:other-owner-${i}:${dateStr}`] = {
      visitorId: VISITOR, ownerId: `other-owner-${i}`, date: dateStr, count: 1, updatedAt: 1,
    };
  }
  const fn = loadFunction(baseStore(docs));
  const res = await fn.main({ action: 'visitorMessage', ownerId: OWNER, messages: CHAT });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'rate_limited');
  assert.equal(res.error.message, '今天认识的新朋友够多了，明天再来吧');
  assert.equal(providerCalls, 0);
  assert.equal(upsertCalls.length, 0);
});

test('normal visitor passes, activity doc is created, provider answers', async () => {
  providerCalls = 0;
  upsertCalls = [];
  const store = baseStore();
  const fn = loadFunction(store);
  const res = await fn.main({ action: 'visitorMessage', ownerId: OWNER, messages: CHAT });
  assert.equal(res.ok, true);
  assert.equal(providerCalls, 1);

  const dateStr = limits.todayStr(Date.now());
  const docId = limits.activityDocId(VISITOR, OWNER, dateStr);
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].op, 'set');
  assert.equal(upsertCalls[0]._id, docId);
  assert.deepEqual(upsertCalls[0].data, { visitorId: VISITOR, ownerId: OWNER, date: dateStr, count: 1, updatedAt: upsertCalls[0].data.updatedAt });

  // second message the same day increments the same doc instead
  upsertCalls = [];
  store.visitor_activity.set(docId, { visitorId: VISITOR, ownerId: OWNER, date: dateStr, count: 1, updatedAt: 1 });
  const again = await fn.main({ action: 'visitorMessage', ownerId: OWNER, messages: CHAT });
  assert.equal(again.ok, true);
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].op, 'update');
  assert.equal(upsertCalls[0]._id, docId);
  assert.equal(upsertCalls[0].data.count, 2);
});
