/**
 * Handler-level tests for the card cloud function (task 2.1).
 *
 * wx-server-sdk is stubbed with an in-memory database; the memories `where`
 * conditions are recorded so the tests can prove permission filtering happens
 * at query stage, not after retrieval.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const OWNER = 'owner-openid';
const VISITOR = 'visitor-openid';

let currentOpenid = VISITOR;
const whereCalls = [];

function createFakeCloud() {
  const store = {
    users: new Map([
      ['users-1', {
        openid: OWNER,
        nickname: '方辰',
        avatar: 'https://example.com/a.png',
        bio: '在做 AI 名片',
        namecard: {
          motto: '先理解，再认识',
          interests: ['AI 分身'],
          wechat: 'secret-wechat-id',
          socialLinks: [{ platform: 'wechat', value: 'secret-wechat-id' }],
        },
      }],
      ['users-2', { openid: 'deleted-owner', nickname: '走了', deleted: true }],
    ]),
    memories: new Map([
      ['mem-1', { ownerId: OWNER, kind: 'current', visibility: 'public', status: 'confirmed', content: '在打磨 VibeCard', updatedAt: 2000 }],
      ['mem-2', { ownerId: OWNER, kind: 'preference', visibility: 'public', status: 'confirmed', content: '想认识做过 AI 社交产品的人', updatedAt: 1000 }],
      ['mem-3', { ownerId: OWNER, kind: 'boundary', visibility: 'agent_only', status: 'confirmed', content: '不回应泛泛的资源互换', updatedAt: 1000 }],
      ['mem-4', { ownerId: OWNER, kind: 'fact', visibility: 'private', status: 'confirmed', content: '私事', updatedAt: 1000 }],
      ['mem-5', { ownerId: OWNER, kind: 'fact', visibility: 'public', status: 'proposed', content: '还没确认的事', updatedAt: 1000 }],
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

const call = (event) => cardFunction.main(event);

test('getPublicCard returns a VibeCard-shaped projection without contact details', async () => {
  const res = await call({ action: 'getPublicCard', ownerId: OWNER });
  assert.equal(res.ok, true);
  const { card } = res.result;
  assert.equal(card.ownerId, OWNER);
  assert.equal(card.name, '方辰');
  assert.equal(card.headline, '先理解，再认识');
  assert.equal(card.currentFocus, '在打磨 VibeCard');
  assert.deepEqual(card.wantsToMeet, ['想认识做过 AI 社交产品的人']);
  assert.deepEqual(card.topics, ['AI 分身']);

  const serialized = JSON.stringify(res);
  assert.equal(serialized.includes('secret-wechat-id'), false);
  assert.equal(serialized.includes('socialLinks'), false);
});

test('memories are filtered at query stage: public + confirmed only', async () => {
  whereCalls.length = 0;
  const res = await call({ action: 'getPublicCard', ownerId: OWNER });
  assert.equal(res.ok, true);

  const memoryQuery = whereCalls.find(c => c.collection === 'memories');
  assert.deepEqual(memoryQuery.conds, { ownerId: OWNER, status: 'confirmed', visibility: 'public' });

  const serialized = JSON.stringify(res);
  assert.equal(serialized.includes('不回应泛泛的资源互换'), false, 'agent_only memory absent');
  assert.equal(serialized.includes('私事'), false, 'private memory absent');
  assert.equal(serialized.includes('还没确认的事'), false, 'proposed memory absent');
});

test('unknown owner -> not_found', async () => {
  const res = await call({ action: 'getPublicCard', ownerId: 'nobody' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'not_found');
});

test('deleted profile -> card_deleted', async () => {
  const res = await call({ action: 'getPublicCard', ownerId: 'deleted-owner' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'card_deleted');
});

test('bad input and unknown action -> typed errors', async () => {
  const noOwner = await call({ action: 'getPublicCard' });
  assert.equal(noOwner.error.code, 'invalid_request');

  const badAction = await call({ action: 'nope' });
  assert.equal(badAction.error.code, 'invalid_action');

  currentOpenid = '';
  const unauth = await call({ action: 'getPublicCard', ownerId: OWNER });
  assert.equal(unauth.error.code, 'unauthorized');
  currentOpenid = VISITOR;
});
