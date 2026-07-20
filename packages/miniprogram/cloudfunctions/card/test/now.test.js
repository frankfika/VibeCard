/**
 * Now projection tests for the card cloud function (task 4.5).
 *
 * The public Card carries at most 3 newest active Now items; drafts,
 * archived, hidden, deleted, and expired items are never read into the
 * projection, and the empty state is an empty list — never invented content.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const core = require('../lib/core');

const OWNER = 'owner-openid';
const T0 = 1752000000000;
const hour = 3600000;

function nowItem(id, overrides) {
  return {
    _id: id,
    schemaVersion: 1,
    ownerId: OWNER,
    text: `动态-${id}`,
    topic: 'current_work',
    sourceMemoryId: null,
    status: 'published',
    publishedAt: T0,
    expiresAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

test('core projection keeps at most 3 newest active items, safe fields only', () => {
  const items = [
    nowItem('a', { publishedAt: T0 - 4 * hour }),
    nowItem('b', { publishedAt: T0 - 3 * hour }),
    nowItem('c', { publishedAt: T0 - 2 * hour }),
    nowItem('d', { publishedAt: T0 - hour }),
    nowItem('expired', { publishedAt: T0, expiresAt: T0 - hour }),
    nowItem('draft', { status: 'draft', publishedAt: null }),
    nowItem('archived', { status: 'archived' }),
    nowItem('hidden', { status: 'hidden' }),
    nowItem('deleted', { status: 'deleted' }),
  ];
  const projected = core.projectActiveNowItems(items, T0 + hour);
  assert.deepEqual(projected.map((i) => i.id), ['d', 'c', 'b']);
  assert.deepEqual(Object.keys(projected[0]).sort(), ['id', 'publishedAt', 'text', 'topic']);
});

test('buildPublicCard exposes now as an empty list when there is nothing active', () => {
  const card = core.buildPublicCard(
    { ownerId: OWNER, user: { nickname: '方辰' }, memories: [], nowItems: [nowItem('x', { status: 'hidden' })] },
    T0,
  );
  assert.deepEqual(card.now, []);
});

// ---- handler level: the db query itself filters to status='published' ----

let currentOpenid = 'visitor-openid';
const whereCalls = [];

function createFakeCloud() {
  const store = {
    users: new Map([
      ['users-1', { openid: OWNER, nickname: '方辰', namecard: { motto: '先理解，再认识' } }],
    ]),
    memories: new Map(),
    now_items: new Map([
      ['now-1', nowItem('now-1', { text: '最新的一条', publishedAt: T0 })],
      ['now-2', nowItem('now-2', { text: '过期的一条', publishedAt: T0 - hour, expiresAt: T0 - 1000 })],
      ['now-3', nowItem('now-3', { text: '草稿一条', status: 'draft', publishedAt: null })],
      ['now-4', nowItem('now-4', { text: '隐藏一条', status: 'hidden' })],
    ]),
  };

  const db = {
    collection(name) {
      const coll = store[name];
      return {
        where(conds) {
          whereCalls.push({ collection: name, conds });
          return {
            orderBy() { return this; },
            async get() {
              const data = [...coll.entries()]
                .filter(([, v]) => Object.entries(conds).every(([k, val]) => v[k] === val))
                .map(([_id, v]) => ({ _id, ...v }));
              return { data };
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
const cardFunction = require('../index.js');
Module._load = originalLoad;

test('getPublicCard reads only published now_items and projects active ones', async () => {
  const res = await cardFunction.main({ action: 'getPublicCard', ownerId: OWNER });
  assert.equal(res.ok, true);

  // permission filtering at query stage: drafts/archived/hidden/deleted are
  // never even read from the database for the public Card
  const nowQuery = whereCalls.find((c) => c.collection === 'now_items');
  assert.deepEqual(nowQuery.conds, { ownerId: OWNER, status: 'published' });

  const { card } = res.result;
  assert.deepEqual(card.now.map((i) => i.text), ['最新的一条']);
});
