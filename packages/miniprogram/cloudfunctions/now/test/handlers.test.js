/**
 * Handler-level tests for the now cloud function (task 4.5).
 *
 * wx-server-sdk is stubbed with an in-memory database so the full action
 * surface runs under plain node: owner-only writes (a stranger cannot create,
 * publish, edit, archive, hide, or delete), the draft -> publish lifecycle,
 * and the public read returning only active items with safe fields.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const OWNER = 'owner-openid';
const STRANGER = 'stranger-openid';

let currentOpenid = OWNER;

function createFakeCloud() {
  const store = { now_items: new Map() };
  let seq = 0;

  const db = {
    collection(name) {
      const coll = store[name];
      return {
        where(conds) {
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
        async add({ data }) {
          seq += 1;
          const _id = `${name}-${seq}`;
          coll.set(_id, data);
          return { _id };
        },
        doc(_id) {
          return {
            async get() {
              if (!coll.has(_id)) throw new Error('Doc not found');
              return { data: coll.get(_id) };
            },
            async update({ data }) {
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
const nowFunction = require('../index.js');
Module._load = originalLoad;

const call = (event) => nowFunction.main(event);

test('owner can create drafts; a draft is never public before publishing', async () => {
  const { nowItem } = await call({ action: 'createNowDraft', text: '最近在验证 AI 分身的边界', topic: 'current_work' });
  assert.equal(nowItem.status, 'draft');
  assert.equal(nowItem.publishedAt, null);
  assert.equal(nowItem.ownerId, OWNER);

  // public read (even as the owner) sees nothing while it is a draft
  const active = await call({ action: 'getActiveNowItems' });
  assert.equal(active.nowItems.length, 0);
});

test('publish makes exactly the published snapshot visible publicly', async () => {
  const { nowItem: draft } = await call({ action: 'createNowDraft', text: '完成了访客对话的六轮设计', topic: 'completed_work' });
  const { nowItem: published } = await call({ action: 'publishNowItem', nowId: draft._id });
  assert.equal(published.status, 'published');
  assert.ok(published.publishedAt > 0);

  currentOpenid = STRANGER;
  const { nowItems } = await call({ action: 'getActiveNowItems', ownerId: OWNER });
  assert.equal(nowItems.length, 1);
  assert.equal(nowItems[0].text, '完成了访客对话的六轮设计');
  assert.deepEqual(Object.keys(nowItems[0]).sort(), ['id', 'publishedAt', 'text', 'topic']);
  currentOpenid = OWNER;
});

test('a stranger cannot write, publish, or mutate owner now items', async () => {
  const { nowItem } = await call({ action: 'createNowDraft', text: '主人的草稿', topic: 'exploring' });

  currentOpenid = STRANGER;
  // stranger drafts land on the stranger's own scope, never the owner's
  const own = await call({ action: 'createNowDraft', text: '陌生人的草稿', topic: 'exploring' });
  assert.equal(own.nowItem.ownerId, STRANGER);
  const { nowItems: strangerList } = await call({ action: 'listNowItems' });
  assert.equal(strangerList.length, 1);
  assert.equal(strangerList[0].ownerId, STRANGER);

  await assert.rejects(call({ action: 'publishNowItem', nowId: nowItem._id }), /not_found/);
  await assert.rejects(call({ action: 'editNowItem', nowId: nowItem._id, text: 'x' }), /not_found/);
  await assert.rejects(call({ action: 'archiveNowItem', nowId: nowItem._id }), /not_found/);
  await assert.rejects(call({ action: 'hideNowItem', nowId: nowItem._id }), /not_found/);
  await assert.rejects(call({ action: 'deleteNowItem', nowId: nowItem._id }), /not_found/);
  currentOpenid = OWNER;
});

test('archive / hide / delete remove the item from the public snapshot', async () => {
  async function publishOne(text) {
    const { nowItem } = await call({ action: 'createNowDraft', text, topic: 'current_work' });
    await call({ action: 'publishNowItem', nowId: nowItem._id });
    return nowItem._id;
  }
  const archivedId = await publishOne('会被归档的动态');
  const hiddenId = await publishOne('会被隐藏的动态');
  const deletedId = await publishOne('会被删除的动态');
  const keptId = await publishOne('会留下的动态');

  await call({ action: 'archiveNowItem', nowId: archivedId });
  await call({ action: 'hideNowItem', nowId: hiddenId });
  await call({ action: 'deleteNowItem', nowId: deletedId });

  const { nowItems } = await call({ action: 'getActiveNowItems', ownerId: OWNER });
  const texts = nowItems.map((i) => i.text);
  assert.ok(texts.includes('会留下的动态'));
  assert.ok(!texts.includes('会被归档的动态'));
  assert.ok(!texts.includes('会被隐藏的动态'));
  assert.ok(!texts.includes('会被删除的动态'));

  // owner list keeps archived/hidden history but never deleted tombstones
  const { nowItems: ownerList } = await call({ action: 'listNowItems' });
  const byId = new Map(ownerList.map((i) => [i._id, i.status]));
  assert.equal(byId.get(archivedId), 'archived');
  assert.equal(byId.get(hiddenId), 'hidden');
  assert.equal(byId.has(deletedId), false);
  assert.equal(byId.get(keptId), 'published');
});

test('expired items never appear in the public snapshot', async () => {
  const { nowItem } = await call({
    action: 'createNowDraft',
    text: '已经过期的动态',
    topic: 'current_work',
    expiresAt: Date.now() - 1000,
  });
  await call({ action: 'publishNowItem', nowId: nowItem._id });

  const { nowItems } = await call({ action: 'getActiveNowItems', ownerId: OWNER });
  assert.equal(nowItems.some((i) => i.text === '已经过期的动态'), false);
});

test('public read returns at most 3 newest active items', async () => {
  for (let i = 1; i <= 5; i += 1) {
    const { nowItem } = await call({ action: 'createNowDraft', text: `动态-${i}`, topic: 'current_work' });
    await call({ action: 'publishNowItem', nowId: nowItem._id });
  }
  const { nowItems } = await call({ action: 'getActiveNowItems', ownerId: OWNER });
  assert.ok(nowItems.length <= 3);
  for (let i = 1; i < nowItems.length; i += 1) {
    assert.ok(nowItems[i - 1].publishedAt >= nowItems[i].publishedAt);
  }
});

test('edit validates payload and keeps status untouched', async () => {
  const { nowItem } = await call({ action: 'createNowDraft', text: '原始文本', topic: 'current_work' });
  await assert.rejects(
    call({ action: 'editNowItem', nowId: nowItem._id, text: 'x'.repeat(201) }),
    /invalid_text/,
  );
  const { nowItem: edited } = await call({ action: 'editNowItem', nowId: nowItem._id, text: '改写后的文本', topic: 'looking_for' });
  assert.equal(edited.text, '改写后的文本');
  assert.equal(edited.topic, 'looking_for');
  assert.equal(edited.status, 'draft');
});

test('invalid input is rejected before any write', async () => {
  await assert.rejects(call({ action: 'createNowDraft', text: '', topic: 'current_work' }), /invalid_text/);
  await assert.rejects(call({ action: 'createNowDraft', text: '内容', topic: 'rant' }), /invalid_topic/);
  await assert.rejects(call({ action: 'listNowItems', status: 'bogus' }), /invalid_status/);
  await assert.rejects(call({ action: 'bogus' }), /invalid_action/);
});
