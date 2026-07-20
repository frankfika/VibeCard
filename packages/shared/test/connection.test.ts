/**
 * Core tests: connection-request state transitions (task 5.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fixtureConnectionRequest,
  fixtureOwner,
  fixtureOwnerContactMethods,
  fixtureVisitor,
} from '../fixtures/vibe';
import {
  applyBlockToRequest,
  applyOwnerAction,
  buildConnectionRequest,
  canViewConnectionRequest,
  checkConnectionCreateAllowed,
  ConnectionTransitionError,
  isVisitorBlocked,
  resolveSharedContacts,
  validateConnectionRequestPayload,
  CONNECTION_DAY_MS,
} from '../connection';

const T0 = 1_752_000_000_000;

function pendingRequest() {
  return buildConnectionRequest(
    {
      ownerId: fixtureOwner.id,
      visitorId: fixtureVisitor.id,
      visitorSummary: '苏晴，独立开发者。',
      reason: '我也在开发个人 AI 小程序，想交流一次权限设计。',
      possibleSharedContext: ['都在做个人 AI 产品'],
      visitorWorkUrl: 'https://suqing.example.com/ai-ledger',
    },
    T0,
    'req-1',
  );
}

test('a weak reason is rejected before a request is created', () => {
  assert.equal(
    validateConnectionRequestPayload({ ownerId: 'o', reason: '想认识一下' }),
    'weak_reason',
  );
  assert.equal(
    validateConnectionRequestPayload({ ownerId: 'o', reason: '  ' }),
    'weak_reason',
  );
  assert.equal(validateConnectionRequestPayload({ ownerId: '', reason: 'x'.repeat(20) }), 'invalid_owner');
  assert.equal(
    validateConnectionRequestPayload({ ownerId: 'o', reason: '想交流一次权限设计的具体实现。' }),
    null,
  );
});

test('a new request starts pending with no shared contacts', () => {
  const request = pendingRequest();
  assert.equal(request.ownerAction, 'pending');
  assert.deepEqual(request.sharedContactMethodIds, []);
  assert.equal(request.schemaVersion, 1);
});

test('pending -> connect requires at least one contact method', () => {
  assert.throws(
    () => applyOwnerAction(pendingRequest(), 'connect', [], T0 + 1),
    (err) => err instanceof ConnectionTransitionError && err.code === 'invalid_contact_selection',
  );
  assert.throws(
    () => applyOwnerAction(pendingRequest(), 'connect', undefined, T0 + 1),
    (err) => err instanceof ConnectionTransitionError && err.code === 'invalid_contact_selection',
  );
});

test('sharedContactMethodIds is set only on connect', () => {
  const request = pendingRequest();
  const connected = applyOwnerAction(request, 'connect', ['fixture-contact-wechat'], T0 + 1);
  assert.equal(connected.ownerAction, 'connect');
  assert.deepEqual(connected.sharedContactMethodIds, ['fixture-contact-wechat']);

  const later = applyOwnerAction(pendingRequest(), 'later', ['fixture-contact-wechat'], T0 + 1);
  assert.deepEqual(later.sharedContactMethodIds, []);
  const declined = applyOwnerAction(pendingRequest(), 'decline', ['fixture-contact-wechat'], T0 + 1);
  assert.deepEqual(declined.sharedContactMethodIds, []);
});

test('later remains actionable; connect and decline are terminal', () => {
  const later = applyOwnerAction(pendingRequest(), 'later', undefined, T0 + 1);
  const connected = applyOwnerAction(later, 'connect', ['fixture-contact-email'], T0 + 2);
  assert.equal(connected.ownerAction, 'connect');

  for (const terminal of [connected, applyOwnerAction(pendingRequest(), 'decline', undefined, T0 + 1)]) {
    for (const action of ['connect', 'later', 'decline'] as const) {
      assert.throws(
        () => applyOwnerAction(terminal, action, ['fixture-contact-wechat'], T0 + 3),
        (err) => err instanceof ConnectionTransitionError && err.code === 'invalid_transition',
      );
    }
  }
});

test('blocking declines an actionable request and is idempotent on terminal states', () => {
  const blocked = applyBlockToRequest(pendingRequest(), T0 + 1);
  assert.equal(blocked.ownerAction, 'decline');
  assert.deepEqual(blocked.sharedContactMethodIds, []);
  const connected = applyOwnerAction(pendingRequest(), 'connect', ['fixture-contact-wechat'], T0 + 1);
  assert.equal(applyBlockToRequest(connected, T0 + 2), connected);
});

test('contact values resolve only after connect, only for selected methods', () => {
  const request = pendingRequest();
  assert.equal(resolveSharedContacts(request, { contactMethods: fixtureOwnerContactMethods }), undefined);
  const connected = applyOwnerAction(request, 'connect', ['fixture-contact-email', 'unknown-id'], T0 + 1);
  const shared = resolveSharedContacts(connected, { contactMethods: fixtureOwnerContactMethods })!;
  assert.deepEqual(
    shared.map((c) => c.id),
    ['fixture-contact-email'],
  );
  assert.equal(shared[0].value, 'linzhou@mail.example.com');
});

test('rate limit: one request per visitor-owner pair per 24h; decline cools down 24h', () => {
  const existing = { ...fixtureConnectionRequest, createdAt: T0 - 1000, updatedAt: T0 - 1000 };
  assert.equal(
    checkConnectionCreateAllowed({
      requests: [existing],
      ownerId: fixtureOwner.id,
      visitorId: fixtureVisitor.id,
      now: T0,
    }),
    'rate_limited',
  );
  const declined = { ...existing, ownerAction: 'decline' as const, createdAt: T0 - CONNECTION_DAY_MS - 1 };
  assert.equal(
    checkConnectionCreateAllowed({
      requests: [declined],
      ownerId: fixtureOwner.id,
      visitorId: fixtureVisitor.id,
      now: T0,
    }),
    'declined_cooldown',
  );
  assert.equal(
    checkConnectionCreateAllowed({
      requests: [],
      ownerId: fixtureOwner.id,
      visitorId: fixtureVisitor.id,
      now: T0,
    }),
    null,
  );
});

test('only owner and requesting visitor may view a request; blocked list matches', () => {
  const request = pendingRequest();
  assert.equal(canViewConnectionRequest(request, fixtureOwner.id), true);
  assert.equal(canViewConnectionRequest(request, fixtureVisitor.id), true);
  assert.equal(canViewConnectionRequest(request, 'someone-else'), false);
  assert.equal(isVisitorBlocked({ blockedUsers: ['v-1'] }, 'v-1'), true);
  assert.equal(isVisitorBlocked({ blockedUsers: ['v-1'] }, 'v-2'), false);
  assert.equal(isVisitorBlocked(null, 'v-1'), false);
});
