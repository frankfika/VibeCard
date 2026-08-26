import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  connectionDecisionSignal,
  evaluateDecisionLearning,
  finalizeDecisionLearningProposal,
  normalizeSafeDecisionTopic,
  thirdPartyFragments,
} from '../index';
import type { ConnectionRequest, DecisionLearningEvidence } from '../index';

function request(overrides: Partial<ConnectionRequest> = {}): ConnectionRequest {
  return {
    id: 'req-current',
    schemaVersion: 1,
    ownerId: 'owner-1',
    visitorId: 'visitor-alice-9382',
    visitorSummary: 'Alice Chen，来自 Example Labs',
    reason: '想具体交流个人 AI 分身的隐私边界。',
    possibleSharedContext: ['个人 AI 分身'],
    ownerAction: 'later',
    sharedContactMethodIds: [],
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function evidence(current: ConnectionRequest, prior: ConnectionRequest[] = []): DecisionLearningEvidence {
  return {
    current: connectionDecisionSignal(current),
    prior: prior.map((item) => connectionDecisionSignal(item)),
    forbiddenFragments: [current, ...prior].flatMap(thirdPartyFragments),
  };
}

test('one ambiguous click is interaction data only and yields no proposal', () => {
  assert.deepEqual(evaluateDecisionLearning(evidence(request())), {
    eligible: false,
    reason: 'ambiguous_single_decision',
  });
});

test('visitor-controlled identities, handles, emails, and URLs are never treated as repeated topics', () => {
  const unsafeContexts = [
    'Alice Chen',
    '张伟',
    '@alice_dev',
    'alice@example.com',
    'https://example.com/alice',
    '张伟 AI',
    'Alice Chen AI',
  ];
  for (const context of unsafeContexts) {
    assert.equal(normalizeSafeDecisionTopic(context), null, context);
    const current = request({ id: `current-${context}`, ownerAction: 'connect', possibleSharedContext: [context] });
    const prior = request({ id: `prior-${context}`, ownerAction: 'connect', possibleSharedContext: [context] });
    assert.deepEqual(evaluateDecisionLearning(evidence(current, [prior])), {
      eligible: false,
      reason: 'ambiguous_single_decision',
    }, context);
  }
});

test('only controlled low-risk topic aliases canonicalize for repeated learning', () => {
  assert.equal(normalizeSafeDecisionTopic('双方都在做个人 AI 分身'), '个人 AI 分身');
  assert.equal(normalizeSafeDecisionTopic('self-hosted AI'), '自托管 AI');
  assert.equal(normalizeSafeDecisionTopic('产品设计'), '产品设计');
  assert.equal(normalizeSafeDecisionTopic('某位投资人'), null);
});

test('a safe topic copied from visitor reason is conservatively cross-disabled', () => {
  const current = request({
    id: 'req-safe-current',
    ownerAction: 'connect',
    reason: '自托管 AI',
    possibleSharedContext: ['自托管 AI'],
  });
  const prior = request({
    id: 'req-safe-prior',
    ownerAction: 'connect',
    visitorId: 'visitor-other',
    reason: '自托管 AI',
    possibleSharedContext: ['自托管 AI'],
  });
  assert.deepEqual(evaluateDecisionLearning(evidence(current, [prior])), {
    eligible: false,
    reason: 'ambiguous_single_decision',
  });
});

test('Chinese and English identity fragments in visitor fields/reason reject explicit owner proposal content', () => {
  const cases = [
    {
      current: request({ visitorSummary: '', reason: '张伟想和你交流这个项目' }),
      content: '我暂时不想认识张伟。',
    },
    {
      current: request({ visitorSummary: '', reason: 'Please meet Alice Chen for this project.' }),
      content: 'I prefer introductions involving Alice Chen.',
    },
    {
      current: request({ visitorSummary: '', reason: '作品在 https://example.com/alice' }),
      content: '我偏好看过 https://example.com/alice 的邀请。',
    },
  ];
  for (const { current, content } of cases) {
    const input: DecisionLearningEvidence = {
      ...evidence(current),
      explicitPreference: { kind: 'boundary', content },
    };
    assert.deepEqual(evaluateDecisionLearning(input), {
      eligible: false,
      reason: 'unsafe_third_party_information',
    }, content);
  }
});

test('repeated matching decisions produce at most one owner-oriented candidate', () => {
  const prior = request({ id: 'req-prior', visitorId: 'visitor-bob', visitorSummary: 'Bob' });
  const result = evaluateDecisionLearning(evidence(request(), [prior]));
  assert.equal(result.eligible, true);
  if (!result.eligible) return;
  assert.equal(result.kind, 'boundary');
  assert.deepEqual(result.sourceRequestIds, ['req-current', 'req-prior']);
  assert.ok(!result.suggestedContent.includes('Alice'));
  assert.ok(!result.suggestedContent.includes('Bob'));
});

test('identifiable third-party information is rejected before persistence', () => {
  const current = request();
  const withExplicit: DecisionLearningEvidence = {
    ...evidence(current),
    explicitPreference: { kind: 'preference', content: '我以后只想认识 Alice Chen。' },
  };
  assert.deepEqual(evaluateDecisionLearning(withExplicit), {
    eligible: false,
    reason: 'unsafe_third_party_information',
  });
  assert.equal(
    finalizeDecisionLearningProposal(
      { kind: 'preference', content: '我以后只想认识 Alice Chen。', suggestedVisibility: 'private' },
      withExplicit,
      'owner-1',
    ),
    null,
  );
});

test('validated output is private and has a stable retry key', () => {
  const current = request();
  const input: DecisionLearningEvidence = {
    ...evidence(current),
    explicitPreference: { kind: 'boundary', content: '我希望合作邀请先说明具体要讨论的问题。' },
  };
  const raw = {
    kind: 'boundary',
    content: '我希望合作邀请先说明具体要讨论的问题。',
    suggestedVisibility: 'agent_only',
  };
  const first = finalizeDecisionLearningProposal(raw, input, 'owner-1');
  const retry = finalizeDecisionLearningProposal(raw, input, 'owner-1');
  assert.ok(first);
  assert.equal(first?.suggestedVisibility, 'agent_only');
  assert.equal(first?.idempotencyKey, retry?.idempotencyKey);
  assert.deepEqual(first?.sourceRequestIds, ['req-current']);
});
