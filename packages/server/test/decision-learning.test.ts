import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMockModelProvider } from '../../shared/index';
import type { ModelProvider } from '../../shared/index';
import { api, owner, startApp } from './helpers';

async function bootstrap(app: Awaited<ReturnType<typeof startApp>>) {
  const identity = await owner(app.base, 'POST', '/api/v1/owner/identity', { name: '学习测试主人' });
  assert.equal(identity.status, 201);
}

async function submit(
  app: Awaited<ReturnType<typeof startApp>>,
  visitorId: string,
  context: string[] = [],
  visitorSummary = '',
) {
  let conversationId: string | undefined;
  if (context.includes('自托管 AI')) {
    const chat = await api(app.base, 'POST', '/api/v1/public/chat', {
      body: { visitorId, message: '我也在做个人 AI 分身，想交流一个具体实现问题。' },
    });
    assert.equal(chat.status, 200, JSON.stringify(chat.body));
    conversationId = chat.body.conversationId;
  }
  const response = await api(app.base, 'POST', '/api/v1/public/requests', {
    body: {
      visitorId,
      visitorSummary,
      reason: '想围绕一个具体产品问题交流实现取舍和使用反馈。',
      possibleSharedContext: context,
      ...(conversationId ? { conversationId } : {}),
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.id as string;
}

test('ambiguous, third-party, reject, confirm, and retry paths preserve owner control', async () => {
  const app = await startApp();
  try {
    await bootstrap(app);

    const ambiguousId = await submit(app, 'visitor-ambiguous');
    const ambiguous = await owner(app.base, 'POST', `/api/v1/owner/requests/${ambiguousId}/action`, {
      action: 'later',
    });
    assert.equal(ambiguous.status, 200);
    assert.equal(ambiguous.body.ownerAction, 'later');
    assert.equal(ambiguous.body.learningStatus, 'not_suggested');

    const thirdPartyId = await submit(app, 'visitor-third-party', [], 'Alice Chen，来自 Example Labs');
    const unsafe = await owner(app.base, 'POST', `/api/v1/owner/requests/${thirdPartyId}/action`, {
      action: 'decline',
      learningPreference: { kind: 'boundary', content: '我不想再认识 Alice Chen。' },
    });
    assert.equal(unsafe.status, 200);
    assert.equal(unsafe.body.ownerAction, 'decline');
    assert.equal(unsafe.body.learningStatus, 'not_suggested');

    const rejectId = await submit(app, 'visitor-reject');
    const proposed = await owner(app.base, 'POST', `/api/v1/owner/requests/${rejectId}/action`, {
      action: 'later',
      learningPreference: { kind: 'preference', content: '我更喜欢带着具体产品问题来交流的人。' },
    });
    assert.equal(proposed.status, 200);
    assert.equal(proposed.body.learningStatus, 'proposed');
    const proposalId = proposed.body.learningProposalId as string;
    assert.ok(proposalId);

    const rejected = await owner(app.base, 'POST', `/api/v1/owner/memories/${proposalId}/reject`);
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.status, 'deleted');
    const retry = await owner(app.base, 'POST', `/api/v1/owner/requests/${rejectId}/action`, {
      action: 'later',
      learningPreference: { kind: 'boundary', content: '我希望对方先给出一个具体问题。' },
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.learningStatus, 'already_handled');
    assert.equal(retry.body.learningProposalId, proposalId);
    const allAfterRetry = await owner(app.base, 'GET', '/api/v1/owner/memories');
    assert.equal(allAfterRetry.body.filter((memory: any) => memory.sourceConversationId.startsWith('connection-decision:')).length, 1);

    const confirmId = await submit(app, 'visitor-confirm');
    const confirmProposal = await owner(app.base, 'POST', `/api/v1/owner/requests/${confirmId}/action`, {
      action: 'decline',
      learningPreference: { kind: 'boundary', content: '我希望合作邀请先说明具体要讨论的问题。' },
    });
    assert.equal(confirmProposal.status, 200);
    assert.equal(confirmProposal.body.learningStatus, 'proposed');
    const confirmed = await owner(
      app.base,
      'POST',
      `/api/v1/owner/memories/${confirmProposal.body.learningProposalId}/confirm`,
    );
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.status, 'confirmed');
    assert.equal(confirmed.body.visibility, 'agent_only');

    const publicCard = await api(app.base, 'GET', '/api/v1/public/card');
    assert.ok(!JSON.stringify(publicCard.body).includes('合作邀请先说明具体'));
    const ownerConfirmed = await owner(app.base, 'GET', '/api/v1/owner/memories?status=confirmed');
    assert.ok(ownerConfirmed.body.some((memory: any) => memory.id === confirmed.body.id));
  } finally {
    await app.close();
  }
});

test('connect/later/decline decisions succeed when learning provider is unavailable', async () => {
  const mock = createMockModelProvider();
  const failingLearning: ModelProvider = {
    ...mock,
    async complete(input) {
      if (input.system.includes('连接决定学习')) throw new Error('learning provider offline');
      return mock.complete(input);
    },
  };
  const app = await startApp({ provider: failingLearning });
  try {
    await bootstrap(app);
    const contact = await owner(app.base, 'POST', '/api/v1/owner/contacts', {
      kind: 'email', label: '工作邮箱', value: 'owner@example.test',
    });
    assert.equal(contact.status, 201);
    const cases = [
      { action: 'connect', contacts: [contact.body.id] },
      { action: 'later', contacts: undefined },
      { action: 'decline', contacts: undefined },
    ] as const;
    for (const [index, item] of cases.entries()) {
      const id = await submit(app, `visitor-unavailable-${index}`);
      const acted = await owner(app.base, 'POST', `/api/v1/owner/requests/${id}/action`, {
        action: item.action,
        ...(item.contacts ? { sharedContactMethodIds: item.contacts } : {}),
        learningPreference: { kind: 'preference', content: '我更喜欢具体且坦诚的交流邀请。' },
      });
      assert.equal(acted.status, 200, JSON.stringify(acted.body));
      assert.equal(acted.body.ownerAction, item.action);
      assert.equal(acted.body.learningStatus, 'unavailable');
    }
  } finally {
    await app.close();
  }
});

test('repeated clear decisions can produce one proposal and retry never duplicates it', async () => {
  const app = await startApp();
  try {
    await bootstrap(app);
    const firstId = await submit(app, 'visitor-repeat-one', ['自托管 AI']);
    const first = await owner(app.base, 'POST', `/api/v1/owner/requests/${firstId}/action`, { action: 'later' });
    assert.equal(first.body.learningStatus, 'not_suggested');
    const secondId = await submit(app, 'visitor-repeat-two', ['自托管 AI']);
    const second = await owner(app.base, 'POST', `/api/v1/owner/requests/${secondId}/action`, { action: 'later' });
    assert.equal(second.body.learningStatus, 'proposed');
    const retry = await owner(app.base, 'POST', `/api/v1/owner/requests/${secondId}/action`, { action: 'later' });
    assert.equal(retry.body.learningStatus, 'already_handled');
    assert.equal(retry.body.learningProposalId, second.body.learningProposalId);
  } finally {
    await app.close();
  }
});

test('repeated visitor-controlled identities and URLs never become durable owner memory', async () => {
  const app = await startApp();
  try {
    await bootstrap(app);
    const unsafeContexts = [
      'Alice Chen',
      '张伟',
      '@alice_dev',
      'alice@example.com',
      'https://example.com/alice',
    ];
    for (const [contextIndex, context] of unsafeContexts.entries()) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const id = await submit(app, `visitor-unsafe-${contextIndex}-${attempt}`, [context]);
        const acted = await owner(app.base, 'POST', `/api/v1/owner/requests/${id}/action`, {
          action: 'later',
        });
        assert.equal(acted.status, 200, context);
        assert.equal(acted.body.ownerAction, 'later', context);
        assert.equal(acted.body.learningStatus, 'not_suggested', context);
        assert.equal(acted.body.learningProposalId, undefined, context);
      }
    }

    const memories = await owner(app.base, 'GET', '/api/v1/owner/memories');
    assert.equal(memories.status, 200);
    assert.equal(
      memories.body.filter((memory: any) => memory.sourceConversationId.startsWith('connection-decision:')).length,
      0,
    );
    const serialized = JSON.stringify(memories.body);
    for (const context of unsafeContexts) assert.ok(!serialized.includes(context), context);
  } finally {
    await app.close();
  }
});
