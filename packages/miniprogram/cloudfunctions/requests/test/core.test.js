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

test('deterministic pair gate mirrors 24h create and decline semantics', () => {
  const now = Date.UTC(2026, 6, 19, 12);
  assert.equal(core.checkCreateGate(null, now), null);
  assert.equal(core.checkCreateGate({ lastCreatedAt: now - 1 }, now), 'rate_limited');
  assert.equal(core.checkCreateGate({ lastCreatedAt: now - core.DAY_MS }, now), null);
  assert.equal(core.checkCreateGate({ lastCreatedAt: now - core.DAY_MS, lastDeclinedAt: now - 1 }, now), 'declined_cooldown');
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

test('decision learning ignores one click, rejects visitor identity, and deduplicates retries', () => {
  const currentRequest = {
    ...core.buildRequest({ ...VALID, visitorId: 'visitor-alice', visitorSummary: 'Alice Chen', possibleSharedContext: ['隐私边界'] }, 1000),
    _id: 'req-2',
    ownerAction: 'later',
  };
  const current = core.decisionSignal(currentRequest);
  const forbiddenFragments = core.thirdPartyFragments(currentRequest);
  assert.equal(core.evaluateDecisionLearning({ current, prior: [], forbiddenFragments }), null);
  assert.equal(core.evaluateDecisionLearning({
    current,
    prior: [],
    forbiddenFragments,
    explicitPreference: { kind: 'preference', content: '我只想认识 Alice Chen' },
  }), null);

  const prior = { ...currentRequest, _id: 'req-1', visitorId: 'visitor-bob' };
  const evidence = {
    current,
    prior: [core.decisionSignal(prior)],
    forbiddenFragments: [...forbiddenFragments, ...core.thirdPartyFragments(prior)],
  };
  const eligible = core.evaluateDecisionLearning(evidence);
  assert.equal(eligible.kind, 'boundary');
  const raw = { kind: 'boundary', content: eligible.suggestedContent, suggestedVisibility: 'agent_only' };
  const first = core.finalizeLearningProposal(raw, evidence, OWNER);
  const retry = core.finalizeLearningProposal(raw, evidence, OWNER);
  assert.equal(first.idempotencyKey, retry.idempotencyKey);
  assert.equal(core.sameDecision(currentRequest, 'later'), true);
});

test('visitor-controlled repeated context accepts controlled topics only, never identities or URLs', () => {
  const unsafe = ['Alice Chen', '张伟', '@alice_dev', 'alice@example.com', 'https://example.com/alice', 'Alice Chen AI', '张伟 AI'];
  for (const context of unsafe) {
    assert.equal(core.normalizeSafeDecisionTopic(context), null, context);
    const make = id => ({
      ...core.buildRequest({ ...VALID, visitorId: `visitor-${id}`, possibleSharedContext: [context] }, 1000),
      _id: id,
      ownerAction: 'connect',
    });
    const currentRequest = make('current');
    const priorRequest = make('prior');
    const evidence = {
      current: core.decisionSignal(currentRequest),
      prior: [core.decisionSignal(priorRequest)],
      forbiddenFragments: [currentRequest, priorRequest].flatMap(core.thirdPartyFragments),
    };
    assert.equal(core.evaluateDecisionLearning(evidence), null, context);
  }
  assert.equal(core.normalizeSafeDecisionTopic('双方都在做个人 AI 分身'), '个人 AI 分身');
  assert.equal(core.normalizeSafeDecisionTopic('self-hosted AI'), '自托管 AI');
});

test('reason-derived Chinese/English identities and URLs are hard-denied', () => {
  const cases = [
    ['张伟想和你交流这个项目', '我暂时不想认识张伟。'],
    ['Please meet Alice Chen for this project.', 'I prefer introductions involving Alice Chen.'],
    ['作品在 https://example.com/alice', '我偏好看过 https://example.com/alice 的邀请。'],
  ];
  for (const [reason, content] of cases) {
    const request = {
      ...core.buildRequest({ ...VALID, visitorId: 'visitor-identity', visitorSummary: '', reason }, 1000),
      _id: 'req-identity',
      ownerAction: 'later',
    };
    const evidence = {
      current: core.decisionSignal(request),
      prior: [],
      explicitPreference: { kind: 'boundary', content },
      forbiddenFragments: core.thirdPartyFragments(request),
    };
    assert.equal(core.evaluateDecisionLearning(evidence), null, content);
  }
});
