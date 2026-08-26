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
// Controls the fake content-check gate: 'allow' | 'blocked' | 'unavailable' | 'down'
let moderationBehavior = 'allow';
let learningBehavior = 'ok';
const learningMemories = new Map();
let activeStore = null;

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
    request_gates: new Map(),
    visitor_evidence: new Map(),
    conversations: new Map(),
  };
  activeStore = store;
  let seq = 0;
  let transactionQueue = Promise.resolve();

  function collection(name, allowQuery) {
    const coll = store[name];
    const api = {
      doc(_id) {
        return {
          async get() {
            if (!coll.has(_id)) throw new Error('Doc not found');
            return { data: coll.get(_id) };
          },
          async set({ data }) {
            coll.set(_id, data);
            return { _id };
          },
          async update({ data }) {
            if (!coll.has(_id)) throw new Error('Doc not found');
            coll.set(_id, { ...coll.get(_id), ...data });
            return { stats: { updated: 1 } };
          },
          async remove() {
            coll.delete(_id);
            return { stats: { removed: 1 } };
          },
        };
      },
    };
    if (allowQuery) {
      api.where = conds => ({
        orderBy() { return this; },
        async get() {
          const data = [...coll.entries()]
            .filter(([, v]) => Object.entries(conds).every(([k, val]) => v[k] === val))
            .map(([_id, v]) => ({ _id, ...v }));
          return { data };
        },
      });
      api.add = async ({ data }) => {
        seq += 1;
        const _id = `${name}-${seq}`;
        coll.set(_id, data);
        return { _id };
      };
    }
    return api;
  }

  const transactionDb = { collection(name) { return collection(name, false); } };
  const db = {
    runTransaction(handler) {
      const run = transactionQueue.then(() => handler(transactionDb));
      transactionQueue = run.catch(() => {});
      return run;
    },
    collection(name) { return collection(name, true); },
  };

  return {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init() {},
    database() { return db; },
    getWXContext() { return { OPENID: currentOpenid }; },
    async callFunction({ name, data }) {
      if (name === 'agent') {
        if (learningBehavior === 'down') throw new Error('agent unavailable');
        return { result: { ok: true, result: { proposal: {
          kind: data.kind,
          content: data.suggestedContent,
          suggestedVisibility: data.kind === 'boundary' ? 'agent_only' : 'private',
        } } } };
      }
      if (name === 'memory') {
        if (learningBehavior === 'down') throw new Error('memory unavailable');
        const existing = learningMemories.get(data.idempotencyKey);
        if (existing) return { result: { memory: existing, deduplicated: true } };
        const memory = { _id: `learning-${learningMemories.size + 1}`, status: 'proposed', ...data };
        learningMemories.set(data.idempotencyKey, memory);
        return { result: { memory, deduplicated: false } };
      }
      if (name !== 'content-check') throw new Error('unexpected function: ' + name);
      if (moderationBehavior === 'down') throw new Error('function not found');
      const gates = {
        allow: { allowed: true },
        blocked: { allowed: false, code: 'moderation_blocked', message: '内容未通过安全审核，请修改后再试' },
        unavailable: { allowed: false, code: 'moderation_unavailable', message: '内容安全检查暂时不可用，请稍后重试，内容已保留' },
      };
      return { result: { status: moderationBehavior, gate: gates[moderationBehavior], action: data.action } };
    },
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
  assert.deepEqual(first.result.request.possibleSharedContext, [], '客户端自报共同点不作为主人证据落库');
  assert.equal(JSON.stringify(first).includes('secret-wechat-id'), false);

  const second = await createPending();
  assert.equal(second.ok, false);
  assert.equal(second.error.code, 'rate_limited');
});

test('concurrent duplicate requests create exactly one record', async () => {
  const previous = currentOpenid;
  currentOpenid = 'visitor-concurrent';
  const event = {
    action: 'createRequest', ownerId: OWNER, visitorSummary: '并发访客',
    reason: GOOD_REASON, possibleSharedContext: ['客户端伪造共同点'],
  };
  const results = await Promise.all([call(event), call(event)]);
  currentOpenid = previous;
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.filter(result => !result.ok && result.error.code === 'rate_limited').length, 1);
});

test('conversation evidence requires exact token + owner + visitor + authoritative conversation binding', async () => {
  const validVisitor = 'visitor-evidence-valid';
  const validConversationId = 'visitor-conv-valid';
  activeStore.conversations.set(validConversationId, {
    mode: 'visitor', ownerId: OWNER, visitorId: validVisitor,
    roundCount: 1, messages: [{ role: 'user', content: '我也在做微信小程序' }],
  });
  activeStore.visitor_evidence.set('evidence-valid', {
    ownerId: OWNER, visitorId: validVisitor, conversationId: validConversationId,
    contexts: ['微信小程序'], expiresAt: Date.now() + 60_000,
  });
  currentOpenid = validVisitor;
  const valid = await call({
    action: 'createRequest', ownerId: OWNER, reason: GOOD_REASON,
    conversationId: validConversationId, evidenceId: 'evidence-valid',
    possibleSharedContext: ['客户端伪造共同点'],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.result.request.conversationId, validConversationId);
  assert.deepEqual(valid.result.request.possibleSharedContext, ['微信小程序']);
  assert.equal(activeStore.visitor_evidence.has('evidence-valid'), false, '成功请求后令牌单次消费');

  const invalidCases = [
    { visitor: 'visitor-no-token', conversationId: validConversationId },
    { visitor: 'visitor-cross-owner', conversationId: 'cross-conv', evidenceId: 'cross-evidence' },
    { visitor: 'visitor-mismatch', conversationId: 'mismatch-conv', evidenceId: 'mismatch-evidence' },
  ];
  activeStore.conversations.set('cross-conv', {
    mode: 'visitor', ownerId: 'other-owner', visitorId: 'visitor-cross-owner', messages: [], roundCount: 1,
  });
  activeStore.visitor_evidence.set('cross-evidence', {
    ownerId: OWNER, visitorId: 'visitor-cross-owner', conversationId: 'cross-conv',
    contexts: ['微信小程序'], expiresAt: Date.now() + 60_000,
  });
  activeStore.conversations.set('mismatch-conv', {
    mode: 'visitor', ownerId: OWNER, visitorId: 'visitor-mismatch', messages: [], roundCount: 1,
  });
  activeStore.visitor_evidence.set('mismatch-evidence', {
    ownerId: OWNER, visitorId: 'visitor-mismatch', conversationId: 'different-conv',
    contexts: ['微信小程序'], expiresAt: Date.now() + 60_000,
  });
  for (const item of invalidCases) {
    currentOpenid = item.visitor;
    const result = await call({
      action: 'createRequest', ownerId: OWNER, reason: GOOD_REASON,
      conversationId: item.conversationId, evidenceId: item.evidenceId,
      possibleSharedContext: ['客户端伪造共同点'],
    });
    assert.equal(result.ok, true);
    assert.equal(result.result.request.conversationId, undefined);
    assert.deepEqual(result.result.request.possibleSharedContext, []);
  }
  currentOpenid = VISITOR;
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

test('clear owner preference proposes once; retry with rewording reuses the same proposal', async () => {
  const created = await createPending('visitor-learning');
  const requestId = created.result.request._id;
  currentOpenid = OWNER;
  const first = await call({
    action: 'actOnRequest',
    requestId,
    decision: 'later',
    learningPreference: { kind: 'preference', content: '我喜欢带着具体产品问题来交流的人。' },
  });
  assert.equal(first.ok, true);
  assert.equal(first.result.learningStatus, 'proposed');
  const retry = await call({
    action: 'actOnRequest',
    requestId,
    decision: 'later',
    learningPreference: { kind: 'boundary', content: '我希望邀请先说明一个具体问题。' },
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.result.learningStatus, 'already_handled');
  assert.equal(retry.result.learningProposalId, first.result.learningProposalId);
});

test('learning outage never changes a stored owner decision', async () => {
  const created = await createPending('visitor-learning-down');
  currentOpenid = OWNER;
  learningBehavior = 'down';
  const acted = await call({
    action: 'actOnRequest',
    requestId: created.result.request._id,
    decision: 'decline',
    learningPreference: { kind: 'boundary', content: '我希望邀请先说明一个具体问题。' },
  });
  learningBehavior = 'ok';
  assert.equal(acted.ok, true);
  assert.equal(acted.result.request.ownerAction, 'decline');
  assert.equal(acted.result.learningStatus, 'unavailable');
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

test('moderation: unsafe stranger content is blocked, nothing is created', async () => {
  moderationBehavior = 'blocked';
  const res = await createPending('visitor-mod-blocked');
  moderationBehavior = 'allow';
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'moderation_blocked');

  // and the blocked attempt does not consume the rate-limit slot
  const retry = await createPending('visitor-mod-blocked');
  assert.equal(retry.ok, true);
});

test('moderation unavailable: submission is rejected retryably, never defaults to safe', async () => {
  moderationBehavior = 'unavailable';
  const res = await createPending('visitor-mod-unavailable');
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'moderation_unavailable');

  moderationBehavior = 'down'; // content-check itself unreachable
  const down = await createPending('visitor-mod-down');
  moderationBehavior = 'allow';
  assert.equal(down.ok, false);
  assert.equal(down.error.code, 'moderation_unavailable');

  // after the service recovers, the same visitor can submit successfully
  const recovered = await createPending('visitor-mod-unavailable');
  assert.equal(recovered.ok, true);
});
