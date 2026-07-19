/**
 * Handler-level tests for the requests cloud function (task 2.3).
 *
 * wx-server-sdk is stubbed with an in-memory database so the full flow —
 * create, gate, inbox, owner decisions, contact reveal — runs under plain
 * node with a switchable caller identity.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const OWNER = 'owner-openid';
const VISITOR = 'visitor-openid';
const STRANGER = 'stranger-openid';
const BLOCKED = 'blocked-openid';

let currentOpenid = VISITOR;

function createFakeCloud() {
  const store = {
    users: new Map([
      ['users-1', {
        openid: OWNER,
        nickname: '方辰',
        blockedUsers: [BLOCKED],
        contactMethods: [
          { id: 'cm-1', kind: 'wechat', value: 'secret-wechat-id', label: '工作微信' },
          { id: 'cm-2', kind: 'email', value: 'secret@example.com', label: '邮箱' },
        ],
      }],
    ]),
    requests: new Map(),
  };
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
const requestsFunction = require('../index.js');
Module._load = originalLoad;

const call = (event) => requestsFunction.main(event);

const GOOD_REASON = '我也在开发个人 AI 小程序，最近卡在记忆边界，希望交流一次权限设计。';

async function createPending(visitor = VISITOR, reason = GOOD_REASON) {
  const previous = currentOpenid;
  currentOpenid = visitor;
  const res = await call({
    action: 'createRequest',
    ownerId: OWNER,
    visitorSummary: '独立开发者',
    reason,
    possibleSharedContext: ['都在做 AI 分身'],
  });
  currentOpenid = previous;
  return res;
}

test('createRequest validates the reason and the owner', async () => {
  const weak = await call({ action: 'createRequest', ownerId: OWNER, reason: '想认识一下' });
  assert.equal(weak.ok, false);
  assert.equal(weak.error.code, 'weak_reason');

  const noReason = await call({ action: 'createRequest', ownerId: OWNER });
  assert.equal(noReason.error.code, 'weak_reason');

  const missing = await call({ action: 'createRequest', ownerId: 'nobody', reason: GOOD_REASON });
  assert.equal(missing.error.code, 'not_found');

  const self = await call({ action: 'createRequest', ownerId: VISITOR, reason: GOOD_REASON });
  assert.equal(self.error.code, 'invalid_owner');
});

test('createRequest creates a pending request and rate-limits duplicates', async () => {
  const first = await createPending();
  assert.equal(first.ok, true);
  assert.equal(first.result.request.ownerAction, 'pending');
  assert.equal(first.result.request.visitorId, VISITOR);
  assert.deepEqual(first.result.request.sharedContactMethodIds, []);
  assert.equal(JSON.stringify(first).includes('secret-wechat-id'), false);

  const second = await createPending();
  assert.equal(second.ok, false);
  assert.equal(second.error.code, 'rate_limited');
});

test('blocked visitors cannot create requests', async () => {
  const res = await createPending(BLOCKED);
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'blocked');
});

test('listInbox shows the owner their incoming requests only', async () => {
  currentOpenid = OWNER;
  const inbox = await call({ action: 'listInbox' });
  assert.equal(inbox.ok, true);
  assert.ok(inbox.result.requests.length >= 1);
  assert.equal(inbox.result.requests[0].ownerId, OWNER);

  currentOpenid = STRANGER;
  const empty = await call({ action: 'listInbox' });
  assert.equal(empty.result.requests.length, 0);
});

test('getRequest: owner and that visitor can read; contact hidden before connect', async () => {
  const created = await createPending('visitor-two');
  const requestId = created.result.request._id;

  currentOpenid = OWNER;
  const asOwner = await call({ action: 'getRequest', requestId });
  assert.equal(asOwner.ok, true);
  assert.equal(asOwner.result.sharedContacts, undefined, 'no contact values while pending');
  assert.equal(JSON.stringify(asOwner).includes('secret-wechat-id'), false);

  currentOpenid = 'visitor-two';
  const asVisitor = await call({ action: 'getRequest', requestId });
  assert.equal(asVisitor.ok, true);
  assert.equal(asVisitor.result.sharedContacts, undefined);

  currentOpenid = STRANGER;
  const asStranger = await call({ action: 'getRequest', requestId });
  assert.equal(asStranger.ok, false);
  assert.equal(asStranger.error.code, 'forbidden');
});

test('actOnRequest: only the owner, and contact values appear exactly as selected after connect', async () => {
  const created = await createPending('visitor-three');
  const requestId = created.result.request._id;

  currentOpenid = 'visitor-three';
  const asVisitor = await call({ action: 'actOnRequest', requestId, decision: 'connect', sharedContactMethodIds: ['cm-1'] });
  assert.equal(asVisitor.ok, false);
  assert.equal(asVisitor.error.code, 'forbidden');

  currentOpenid = OWNER;
  const noSelection = await call({ action: 'actOnRequest', requestId, decision: 'connect' });
  assert.equal(noSelection.error.code, 'invalid_contact_selection');

  const connected = await call({ action: 'actOnRequest', requestId, decision: 'connect', sharedContactMethodIds: ['cm-1'] });
  assert.equal(connected.ok, true);
  assert.equal(connected.result.request.ownerAction, 'connect');
  assert.deepEqual(connected.result.sharedContacts, [
    { id: 'cm-1', kind: 'wechat', label: '工作微信', value: 'secret-wechat-id' },
  ], 'exactly the selected method, nothing more');

  // the visitor now sees the shared contact through getRequest
  currentOpenid = 'visitor-three';
  const after = await call({ action: 'getRequest', requestId });
  assert.deepEqual(after.result.sharedContacts, [
    { id: 'cm-1', kind: 'wechat', label: '工作微信', value: 'secret-wechat-id' },
  ]);

  // connect is terminal
  currentOpenid = OWNER;
  const again = await call({ action: 'actOnRequest', requestId, decision: 'decline' });
  assert.equal(again.error.code, 'invalid_transition');
});

test('later keeps the request actionable and shares nothing', async () => {
  const created = await createPending('visitor-four');
  const requestId = created.result.request._id;

  currentOpenid = OWNER;
  const latered = await call({ action: 'actOnRequest', requestId, decision: 'later' });
  assert.equal(latered.result.request.ownerAction, 'later');
  assert.equal(latered.result.sharedContacts, undefined);

  const connected = await call({ action: 'actOnRequest', requestId, decision: 'connect', sharedContactMethodIds: ['cm-2'] });
  assert.equal(connected.result.request.ownerAction, 'connect');
  assert.deepEqual(connected.result.sharedContacts, [
    { id: 'cm-2', kind: 'email', label: '邮箱', value: 'secret@example.com' },
  ]);
});

test('decline cools the visitor down for 24h', async () => {
  const created = await createPending('visitor-five');
  const requestId = created.result.request._id;

  currentOpenid = OWNER;
  const declined = await call({ action: 'actOnRequest', requestId, decision: 'decline' });
  assert.equal(declined.result.request.ownerAction, 'decline');
  assert.equal(declined.result.sharedContacts, undefined);

  const resubmitted = await createPending('visitor-five');
  assert.equal(resubmitted.ok, false);
  assert.equal(resubmitted.error.code, 'declined_cooldown');

  // decline state never carries contact values to either side
  currentOpenid = 'visitor-five';
  const viewed = await call({ action: 'getRequest', requestId });
  assert.equal(viewed.result.sharedContacts, undefined);
  assert.equal(JSON.stringify(viewed).includes('secret'), false);
});

test('unauthenticated callers and unknown actions get typed errors', async () => {
  const previous = currentOpenid;
  currentOpenid = '';
  const unauth = await call({ action: 'listInbox' });
  assert.equal(unauth.error.code, 'unauthorized');
  currentOpenid = previous;

  const bad = await call({ action: 'nope' });
  assert.equal(bad.error.code, 'invalid_action');
});
