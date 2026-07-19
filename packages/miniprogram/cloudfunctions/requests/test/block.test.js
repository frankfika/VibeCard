/**
 * blockVisitor tests (task 3.2).
 *
 * Pure tests cover core.applyBlock; the entry-level suite runs against a
 * stubbed wx-server-sdk whose db.command.addToSet mirrors the legacy report
 * function's blockedUsers maintenance, plus where().update on users.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const core = require('../lib/core');

const OWNER = 'owner-openid';
const VISITOR = 'visitor-openid';
const STRANGER = 'stranger-openid';

/* ---- pure logic -------------------------------------------------------- */

function pendingRequest(ownerAction = 'pending') {
  return {
    schemaVersion: 1,
    ownerId: OWNER,
    visitorId: VISITOR,
    visitorSummary: '独立开发者',
    reason: '我也在开发个人 AI 小程序，希望交流一次权限设计。',
    possibleSharedContext: [],
    ownerAction,
    sharedContactMethodIds: [],
    createdAt: 1000,
    updatedAt: 1000,
  };
}

test('applyBlock declines pending and later requests', () => {
  const pending = core.applyBlock(pendingRequest('pending'), 2000);
  assert.equal(pending.ownerAction, 'decline');
  assert.equal(pending.updatedAt, 2000);
  assert.deepEqual(pending.sharedContactMethodIds, []);

  const later = core.applyBlock(pendingRequest('later'), 2000);
  assert.equal(later.ownerAction, 'decline');
});

test('applyBlock leaves terminal states untouched', () => {
  const declined = core.applyBlock(pendingRequest('decline'), 2000);
  assert.equal(declined.ownerAction, 'decline');
  assert.equal(declined.updatedAt, 1000, 'no write needed');

  const connected = { ...pendingRequest('connect'), sharedContactMethodIds: ['cm-1'] };
  const after = core.applyBlock(connected, 2000);
  assert.equal(after.ownerAction, 'connect');
  assert.deepEqual(after.sharedContactMethodIds, ['cm-1'], 'shared contacts are not revoked by a block');

  assert.equal(core.applyBlock(null, 2000), null);
});

/* ---- entry-level: stubbed wx-server-sdk -------------------------------- */

let currentOpenid = OWNER;
const userUpdates = [];

function createFakeCloud() {
  const store = {
    users: new Map([
      ['users-1', { openid: OWNER, nickname: '方辰', blockedUsers: [] }],
    ]),
    requests: new Map([
      ['req-pending', { ownerId: OWNER, visitorId: VISITOR, reason: '具体理由具体理由具体理由', ownerAction: 'pending', sharedContactMethodIds: [], createdAt: 1, updatedAt: 1 }],
      ['req-declined', { ownerId: OWNER, visitorId: 'visitor-two', reason: '具体理由具体理由具体理由', ownerAction: 'decline', sharedContactMethodIds: [], createdAt: 1, updatedAt: 1 }],
    ]),
  };

  const applyUpdate = (target, data) => {
    const next = { ...target };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && value.$addToSet !== undefined) {
        const list = Array.isArray(next[key]) ? next[key] : [];
        next[key] = list.includes(value.$addToSet) ? list : [...list, value.$addToSet];
      } else {
        next[key] = value;
      }
    }
    return next;
  };

  const db = {
    command: {
      addToSet: (value) => ({ $addToSet: value }),
    },
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
            async update({ data }) {
              let updated = 0;
              for (const [_id, v] of coll.entries()) {
                if (Object.entries(conds).every(([k, val]) => v[k] === val)) {
                  userUpdates.push({ collection: name, _id, data });
                  coll.set(_id, applyUpdate(v, data));
                  updated += 1;
                }
              }
              return { stats: { updated } };
            },
          };
        },
        doc(_id) {
          return {
            async get() {
              if (!coll.has(_id)) throw new Error('Doc not found');
              return { data: coll.get(_id) };
            },
            async update({ data }) {
              if (!coll.has(_id)) throw new Error('Doc not found');
              coll.set(_id, applyUpdate(coll.get(_id), data));
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
    async callFunction() {
      return { result: { gate: { allowed: true } } };
    },
  };
}

let fakeCloud;
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'wx-server-sdk') {
    fakeCloud = fakeCloud || createFakeCloud();
    return fakeCloud;
  }
  return originalLoad.call(this, request, ...rest);
};
const requestsFunction = require('../index.js');
Module._load = originalLoad;

const call = (event) => requestsFunction.main(event);

test('owner blocks a visitor: addToSet on users.blockedUsers, pending request declines', async () => {
  userUpdates.length = 0;
  const res = await call({ action: 'blockVisitor', requestId: 'req-pending' });
  assert.equal(res.ok, true);
  assert.equal(res.result.request.ownerAction, 'decline');

  assert.equal(userUpdates.length, 1);
  assert.equal(userUpdates[0].collection, 'users');
  assert.deepEqual(userUpdates[0].data.blockedUsers, { $addToSet: VISITOR });

  // the blockedUsers array in the store actually gained the visitor
  const ownerDoc = fakeCloud.database().collection('users');
  const { data } = await ownerDoc.where({ openid: OWNER }).get();
  assert.ok(data[0].blockedUsers.includes(VISITOR));
});

test('non-owner cannot block', async () => {
  currentOpenid = STRANGER;
  const res = await call({ action: 'blockVisitor', requestId: 'req-pending' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'forbidden');
  currentOpenid = OWNER;
});

test('blocking an already-declined request keeps decline and does not error', async () => {
  const res = await call({ action: 'blockVisitor', requestId: 'req-declined' });
  assert.equal(res.ok, true);
  assert.equal(res.result.request.ownerAction, 'decline');

  const { data } = await fakeCloud.database().collection('users').where({ openid: OWNER }).get();
  assert.ok(data[0].blockedUsers.includes('visitor-two'), 'visitor still lands in blockedUsers');
});

test('missing request -> not_found', async () => {
  const res = await call({ action: 'blockVisitor', requestId: 'nope' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'not_found');
});
