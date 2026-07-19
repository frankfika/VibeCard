const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/core');

const OWNER = 'owner-openid';
const VISITOR = 'visitor-openid';

const VALID = {
  ownerId: OWNER,
  reason: '我也在开发个人 AI 小程序，希望交流一次权限设计。',
  visitorSummary: '独立开发者',
  possibleSharedContext: ['都在做 AI 分身'],
  visitorWorkUrl: 'https://example.com/work',
};

test('validation accepts a specific reason and rejects weak ones', () => {
  assert.equal(core.validateRequestPayload(VALID), null);
  assert.equal(core.validateRequestPayload({ ...VALID, reason: '' }), 'weak_reason');
  assert.equal(core.validateRequestPayload({ ...VALID, reason: '想认识一下' }), 'weak_reason');
  assert.equal(core.validateRequestPayload({ ...VALID, reason: '  想认识一下，多个朋友多条路  ' }), null);
  assert.equal(core.validateRequestPayload({ ...VALID, ownerId: '' }), 'invalid_owner');
  assert.equal(core.validateRequestPayload({ ...VALID, possibleSharedContext: 'AI' }), 'invalid_shared_context');
  assert.equal(core.validateRequestPayload({ ...VALID, visitorWorkUrl: 42 }), 'invalid_work_url');
});

test('a new request starts pending with no shared contacts', () => {
  const request = core.buildRequest({ ...VALID, visitorId: VISITOR }, 1000);
  assert.equal(request.schemaVersion, 1);
  assert.equal(request.ownerId, OWNER);
  assert.equal(request.visitorId, VISITOR);
  assert.equal(request.ownerAction, 'pending');
  assert.deepEqual(request.sharedContactMethodIds, []);
  assert.equal(request.createdAt, 1000);
  assert.equal(request.visitorWorkUrl, 'https://example.com/work');
});

test('blocked visitors are detected from the owner users document', () => {
  assert.equal(core.isBlocked({ blockedUsers: [VISITOR] }, VISITOR), true);
  assert.equal(core.isBlocked({ blockedUsers: ['someone-else'] }, VISITOR), false);
  assert.equal(core.isBlocked({}, VISITOR), false);
  assert.equal(core.isBlocked(null, VISITOR), false);
});

test('create gate: rate limit within 24h, decline cooldown within 24h', () => {
  const now = 100 * core.DAY_MS;
  const base = { ownerId: OWNER, visitorId: VISITOR };

  const recent = [{ ...base, ownerAction: 'pending', createdAt: now - 1000, updatedAt: now - 1000 }];
  assert.equal(core.checkCreateAllowed({ requests: recent, ownerId: OWNER, visitorId: VISITOR, now }), 'rate_limited');

  const old = [{ ...base, ownerAction: 'later', createdAt: now - 2 * core.DAY_MS, updatedAt: now - 2 * core.DAY_MS }];
  assert.equal(core.checkCreateAllowed({ requests: old, ownerId: OWNER, visitorId: VISITOR, now }), null);

  const declined = [{ ...base, ownerAction: 'decline', createdAt: now - 5 * core.DAY_MS, updatedAt: now - 1000 }];
  assert.equal(core.checkCreateAllowed({ requests: declined, ownerId: OWNER, visitorId: VISITOR, now }), 'declined_cooldown');

  const declinedLongAgo = [{ ...base, ownerAction: 'decline', createdAt: now - 5 * core.DAY_MS, updatedAt: now - 2 * core.DAY_MS }];
  assert.equal(core.checkCreateAllowed({ requests: declinedLongAgo, ownerId: OWNER, visitorId: VISITOR, now }), null);

  const otherPair = [{ ownerId: OWNER, visitorId: 'other', ownerAction: 'pending', createdAt: now - 1000, updatedAt: now - 1000 }];
  assert.equal(core.checkCreateAllowed({ requests: otherPair, ownerId: OWNER, visitorId: VISITOR, now }), null);
});

test('view permission: owner and that visitor only', () => {
  const request = core.buildRequest({ ...VALID, visitorId: VISITOR }, 1000);
  assert.equal(core.canViewRequest(request, OWNER), true);
  assert.equal(core.canViewRequest(request, VISITOR), true);
  assert.equal(core.canViewRequest(request, 'stranger'), false);
  assert.equal(core.canViewRequest(null, OWNER), false);
});

test('owner actions: connect requires a selection; connect/decline are terminal', () => {
  const pending = core.buildRequest({ ...VALID, visitorId: VISITOR }, 1000);

  const connected = core.applyOwnerAction(pending, 'connect', ['cm-1', 'cm-2', 'cm-1'], 2000);
  assert.equal(connected.ownerAction, 'connect');
  assert.deepEqual(connected.sharedContactMethodIds, ['cm-1', 'cm-2']);

  const latered = core.applyOwnerAction(pending, 'later', undefined, 2000);
  assert.equal(latered.ownerAction, 'later');
  // later is not terminal: it can still be acted on
  const connectedAfterLater = core.applyOwnerAction(latered, 'connect', ['cm-1'], 3000);
  assert.equal(connectedAfterLater.ownerAction, 'connect');

  const declined = core.applyOwnerAction(pending, 'decline', undefined, 2000);
  assert.equal(declined.ownerAction, 'decline');
  assert.throws(
    () => core.applyOwnerAction(declined, 'connect', ['cm-1'], 3000),
    (err) => err.code === 'invalid_transition',
  );
  assert.throws(
    () => core.applyOwnerAction(connected, 'decline', undefined, 3000),
    (err) => err.code === 'invalid_transition',
  );

  assert.throws(
    () => core.applyOwnerAction(pending, 'connect', [], 2000),
    (err) => err.code === 'invalid_contact_selection',
  );
  assert.throws(
    () => core.applyOwnerAction(pending, 'wave', undefined, 2000),
    (err) => err.code === 'invalid_action',
  );
});

test('contact values resolve only after connect, and only for selected ids', () => {
  const ownerUser = {
    contactMethods: [
      { id: 'cm-1', kind: 'wechat', value: 'secret-wechat', label: '工作微信' },
      { id: 'cm-2', kind: 'email', value: 'secret@example.com', label: '邮箱' },
    ],
  };
  const pending = core.buildRequest({ ...VALID, visitorId: VISITOR }, 1000);
  assert.equal(core.resolveSharedContacts(pending, ownerUser), undefined);

  const latered = core.applyOwnerAction(pending, 'later', undefined, 1500);
  assert.equal(core.resolveSharedContacts(latered, ownerUser), undefined);

  const declined = core.applyOwnerAction(pending, 'decline', undefined, 1600);
  assert.equal(core.resolveSharedContacts(declined, ownerUser), undefined);

  const connected = core.applyOwnerAction(pending, 'connect', ['cm-2', 'cm-unknown'], 2000);
  const contacts = core.resolveSharedContacts(connected, ownerUser);
  assert.deepEqual(contacts, [{ id: 'cm-2', kind: 'email', label: '邮箱', value: 'secret@example.com' }]);
});
