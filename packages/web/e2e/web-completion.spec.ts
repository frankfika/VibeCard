import { expect, test } from '@playwright/test';

const baseProfile = {
  name: '真实主人', handle: '旧介绍', avatar: '', bio: '旧焦点', tags: [], canHelpWith: [], lookingFor: '旧目标',
  event: '', highlights: [], threads: [], contacts: [{ id: 'contact-1', platform: 'wechat', value: 'private-id', url: '' }],
  verified: { wallet: '', twitter: '', discord: '', wechat: '', telegram: '' },
};

test.describe('Web completion: onboarding, Card draft, and decision learning', () => {
  test('local Card fallback uses the edited confirmed memory, never the raw answer', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' })));
    await page.goto('/');
    await page.getByRole('button', { name: '一键生成我的 VibeCard' }).click();
    await page.getByLabel('你的名字或昵称').fill('编辑记忆主人');
    await page.getByTestId('onboarding-identity-continue').click();
    await page.locator('#onboarding-answer').fill('正在做公开产品，内部代号是绝密飞船');
    await page.getByRole('button', { name: '告诉 Vibe' }).click();
    await page.locator('#onboarding-memory-edit').fill('正在做公开产品');
    await page.getByTestId('onboarding-memory-confirm').click();
    for (let index = 0; index < 4; index += 1) await page.getByRole('button', { name: '先跳过' }).click();
    await expect(page.getByTestId('onboarding-card-preview')).toContainText('正在做公开产品');
    await expect(page.getByTestId('onboarding-card-preview')).not.toContainText('绝密飞船');
  });

  test('going back and skipping a confirmed answer removes its old Card evidence', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' })));
    await page.goto('/');
    await page.getByRole('button', { name: '一键生成我的 VibeCard' }).click();
    await page.getByLabel('你的名字或昵称').fill('纠正答案主人');
    await page.getByTestId('onboarding-identity-continue').click();
    await page.locator('#onboarding-answer').fill('这条后来决定完全不公开');
    await page.getByRole('button', { name: '告诉 Vibe' }).click();
    await page.getByTestId('onboarding-memory-confirm').click();
    for (let index = 0; index < 4; index += 1) await page.getByRole('button', { name: '先跳过' }).click();
    await expect(page.getByTestId('onboarding-card-preview')).toContainText('这条后来决定完全不公开');
    await page.getByRole('button', { name: '回去修改' }).click();
    for (let index = 0; index < 4; index += 1) await page.getByRole('button', { name: '返回上一步' }).click();
    await page.getByRole('button', { name: '先跳过' }).click();
    for (let index = 0; index < 4; index += 1) await page.getByRole('button', { name: '先跳过' }).click();
    await expect(page.getByTestId('onboarding-card-preview')).not.toContainText('这条后来决定完全不公开');
    const memories = await page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_owner_memories') || '[]'));
    expect(memories.find((item: { content: string }) => item.content === '这条后来决定完全不公开')?.status).toBe('paused');
  });

  test('local onboarding resumes, keeps boundary private, and publishes only after confirmation', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' })));
    await page.goto('/');
    await page.getByRole('button', { name: '一键生成我的 VibeCard' }).click();
    await page.getByLabel('你的名字或昵称').fill('可恢复主人');
    await page.getByTestId('onboarding-identity-continue').click();
    await page.locator('#onboarding-answer').fill('正在做一个本地优先的个人 AI。');
    await page.getByRole('button', { name: '告诉 Vibe' }).click();
    await page.getByTestId('onboarding-memory-confirm').click();
    await expect(page.getByRole('heading', { name: '聊聊你 · 2/5' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: '聊聊你 · 2/5' })).toBeVisible();
    for (let index = 0; index < 3; index += 1) await page.getByRole('button', { name: '先跳过' }).click();
    await page.locator('#onboarding-answer').fill('不要透露我的私人联系方式和未公开项目。');
    await page.getByRole('button', { name: '告诉 Vibe' }).click();
    await expect(page.getByTestId('onboarding-memory-proposal')).toContainText('仅自己可见');
    await page.getByTestId('onboarding-memory-confirm').click();
    await expect(page.getByTestId('onboarding-card-preview')).not.toContainText('不要透露我的私人联系方式');
    await page.getByTestId('onboarding-draft-looking-for').fill('重视隐私的个人 AI 创造者');
    const beforePublish = await page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_profile') || '{}'));
    expect(beforePublish.name || '').toBe('');
    expect(beforePublish.lookingFor || '').toBe('');
    await page.getByTestId('confirm-onboarding-card').click();
    await expect(page.getByRole('heading', { name: '可恢复主人' })).toBeVisible();
    const state = await page.evaluate(() => ({
      profile: JSON.parse(localStorage.getItem('vibecard_profile') || '{}'),
      memories: JSON.parse(localStorage.getItem('vibecard_owner_memories') || '[]'),
    }));
    expect(state.profile.lookingFor).toBe('重视隐私的个人 AI 创造者');
    expect(JSON.stringify(state.profile)).not.toContain('不要透露我的私人联系方式');
    expect(state.memories.filter((item: { status: string; kind: string }) => item.status === 'confirmed' && item.kind === 'current')).toHaveLength(1);
    expect(state.memories.find((item: { kind: string }) => item.kind === 'boundary')).toMatchObject({ status: 'confirmed', visibility: 'private' });
  });

  test('self-hosted onboarding uses runtime persistence and forces boundary memory private', async ({ page }) => {
    await page.addInitScript(() => {
      const calls: { path: string; body: Record<string, unknown> }[] = [];
      let identityAttempts = 0;
      (window as typeof window & { testCalls: typeof calls }).testCalls = calls;
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.origin).pathname;
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        calls.push({ path, body });
        const ok = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
        if (path.endsWith('/identity')) {
          identityAttempts += 1;
          return identityAttempts === 1 ? ok({ error: { message: 'owner token required' } }, 401) : ok({ id: 'card-owner', ownerId: 'owner-1', name: body.name }, 201);
        }
        if (path.endsWith('/vibe/messages')) {
          const message = String(body.message);
          return ok({ reply: '收到', memoryProposalId: message.includes('不要透露') ? 'mem-boundary' : 'mem-focus' });
        }
        if (path.endsWith('/memories')) return ok([
          { id: 'mem-focus', schemaVersion: 1, ownerId: 'owner-1', kind: 'current', content: '正在做本地优先的个人 AI', visibility: 'agent_only', status: 'proposed', sourceConversationId: 'conv', sourceMessageIds: [], createdAt: Date.now(), updatedAt: Date.now() },
          { id: 'mem-boundary', schemaVersion: 1, ownerId: 'owner-1', kind: 'boundary', content: '不要透露未公开项目', visibility: 'public', status: 'proposed', sourceConversationId: 'conv', sourceMessageIds: [], createdAt: Date.now(), updatedAt: Date.now() },
        ]);
        if (path.includes('/memories/') && path.endsWith('/confirm')) return ok({ ok: true });
        if (path.endsWith('/card/draft')) return ok({ draft: { currentFocus: '正在做本地优先的个人 AI', wantsToMeet: ['重视隐私的开发者'] } });
        if (path.endsWith('/card')) return ok({ ...body, id: 'card-owner' });
        return ok({});
      };
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'self_hosted', endpoint: 'http://localhost:4179', ownerToken: 'owner-token' }));
    });
    await page.goto('/');
    await page.getByRole('button', { name: '一键生成我的 VibeCard' }).click();
    await page.getByLabel('你的名字或昵称').fill('远程主人');
    await page.getByTestId('onboarding-identity-continue').click();
    await expect(page.getByRole('alert')).toContainText('没有权限');
    await page.getByRole('button', { name: '重试' }).click();
    await page.locator('#onboarding-answer').fill('正在做本地优先的个人 AI');
    await page.getByRole('button', { name: '告诉 Vibe' }).click();
    await page.getByTestId('onboarding-memory-confirm').click();
    for (let index = 0; index < 3; index += 1) await page.getByRole('button', { name: '先跳过' }).click();
    await page.locator('#onboarding-answer').fill('不要透露未公开项目');
    await page.getByRole('button', { name: '告诉 Vibe' }).click();
    await page.getByTestId('onboarding-memory-confirm').click();
    await expect(page.getByTestId('onboarding-card-preview')).toContainText('重视隐私的开发者');
    await page.getByTestId('confirm-onboarding-card').click();
    const calls = await page.evaluate(() => (window as typeof window & { testCalls: { path: string; body: Record<string, unknown> }[] }).testCalls);
    expect(calls.filter(call => call.path.endsWith('/identity'))).toHaveLength(2);
    expect(calls.find(call => call.path.includes('mem-focus/confirm'))?.body.visibility).toBe('public');
    expect(calls.find(call => call.path.includes('mem-boundary/confirm'))?.body.visibility).toBe('private');
    expect(calls.filter(call => call.path.endsWith('/card/draft'))).toHaveLength(1);
    expect(calls.find(call => call.path.endsWith('/card/draft'))?.body.memoryIds).toEqual(['mem-focus']);
    expect(calls.filter(call => call.path.endsWith('/card'))).toHaveLength(1);
    expect(JSON.stringify(calls.find(call => call.path.endsWith('/card'))?.body)).not.toContain('不要透露未公开项目');
  });

  test('remote message response loss recovers the persisted proposal without duplicating memory or chat', async ({ page }) => {
    await page.addInitScript(() => {
      let messageCalls = 0; let modelCalls = 0;
      const proposals: Record<string, unknown>[] = [];
      const processed = new Set<string>();
      Object.assign(window, { responseLossState: () => ({ messageCalls, modelCalls, proposalCount: proposals.length }) });
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.origin).pathname;
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        const ok = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
        if (path.endsWith('/identity')) return ok({ id: 'card-owner', ownerId: 'owner-1', name: body.name }, 201);
        if (path.endsWith('/vibe/messages')) {
          messageCalls += 1;
          const clientMessageId = String(body.clientMessageId);
          if (!processed.has(clientMessageId)) {
            processed.add(clientMessageId); modelCalls += 1;
            proposals.push({ id: 'mem-once', schemaVersion: 1, ownerId: 'owner-1', kind: 'current', content: body.message, visibility: 'agent_only', status: 'proposed', sourceConversationId: 'conv-once', sourceMessageIds: [`msg-client-${clientMessageId}`], createdAt: Date.now(), updatedAt: Date.now() });
            throw new TypeError('Failed to fetch after persistence');
          }
          return ok({ reply: '收到', memoryProposalId: 'mem-once' });
        }
        if (path.endsWith('/memories')) return ok(proposals);
        if (path.includes('/memories/mem-once/confirm')) return ok({ id: 'mem-once', status: 'confirmed' });
        return ok({});
      };
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'self_hosted', endpoint: 'http://localhost:4179', ownerToken: 'owner-token' }));
    });
    await page.goto('/');
    await page.getByRole('button', { name: '一键生成我的 VibeCard' }).click();
    await page.getByLabel('你的名字或昵称').fill('响应丢失主人');
    await page.getByTestId('onboarding-identity-continue').click();
    await page.locator('#onboarding-answer').fill('只应被处理一次的回答');
    await page.getByRole('button', { name: '告诉 Vibe' }).click();
    await expect(page.getByRole('alert')).toContainText('安全重试');
    await page.getByRole('button', { name: '重试' }).click();
    await expect(page.getByTestId('onboarding-memory-proposal')).toContainText('只应被处理一次的回答');
    await page.getByTestId('onboarding-memory-confirm').click();
    const state = await page.evaluate(() => (window as typeof window & { responseLossState: () => { messageCalls: number; modelCalls: number; proposalCount: number } }).responseLossState());
    expect(state).toEqual({ messageCalls: 2, modelCalls: 1, proposalCount: 1 });
  });

  test('response-loss recovery never guesses a concurrent private proposal by timestamp', async ({ page }) => {
    await page.addInitScript(() => {
      let messageCalls = 0; let memoryFetches = 0; let confirmCalls = 0;
      let publishedBody: Record<string, unknown> = {};
      const handled = new Set<string>();
      const unrelatedSecret = '并发产生的私密健康安排，绝不能公开';
      Object.assign(window, { unrelatedRecoveryState: () => ({ messageCalls, memoryFetches, confirmCalls, publishedBody, unrelatedSecret }) });
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.origin).pathname;
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        const ok = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
        if (path.endsWith('/identity')) return ok({ id: 'card-owner', ownerId: 'owner-1', name: body.name }, 201);
        if (path.endsWith('/vibe/messages')) {
          messageCalls += 1;
          const clientMessageId = String(body.clientMessageId);
          if (!handled.has(clientMessageId)) { handled.add(clientMessageId); throw new TypeError('target response lost after a reply with no proposal'); }
          return ok({ reply: '收到，但这次没有记忆建议。' });
        }
        if (path.endsWith('/memories')) {
          memoryFetches += 1;
          return ok([{ id: 'unrelated-private', schemaVersion: 1, ownerId: 'owner-1', kind: 'fact', content: unrelatedSecret, visibility: 'private', status: 'proposed', sourceConversationId: 'another-conversation', sourceMessageIds: ['another-message'], createdAt: Date.now() + 10_000, updatedAt: Date.now() + 10_000 }]);
        }
        if (path.includes('/memories/') && path.endsWith('/confirm')) { confirmCalls += 1; return ok({}); }
        if (path.endsWith('/card/draft')) return ok({ draft: { currentFocus: unrelatedSecret } });
        if (path.endsWith('/card')) { publishedBody = body; return ok({ id: 'card-owner', ...body }); }
        return ok({});
      };
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'self_hosted', endpoint: 'http://localhost:4179', ownerToken: 'owner-token' }));
    });
    await page.goto('/');
    await page.getByRole('button', { name: '一键生成我的 VibeCard' }).click();
    await page.getByLabel('你的名字或昵称').fill('不猜测记忆');
    await page.getByTestId('onboarding-identity-continue').click();
    await page.locator('#onboarding-answer').fill('这是目标消息，不会产生记忆建议');
    await page.getByRole('button', { name: '告诉 Vibe' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: '重试' }).click();
    await expect(page.getByRole('heading', { name: '聊聊你 · 2/5' })).toBeVisible();
    await expect(page.getByTestId('onboarding-memory-proposal')).toHaveCount(0);
    for (let index = 0; index < 4; index += 1) await page.getByRole('button', { name: '先跳过' }).click();
    await expect(page.getByTestId('onboarding-card-preview')).not.toContainText('并发产生的私密健康安排');
    await page.getByTestId('confirm-onboarding-card').click();
    const state = await page.evaluate(() => (window as typeof window & { unrelatedRecoveryState: () => { messageCalls: number; memoryFetches: number; confirmCalls: number; publishedBody: Record<string, unknown>; unrelatedSecret: string } }).unrelatedRecoveryState());
    expect(state.messageCalls).toBe(2);
    expect(state.memoryFetches).toBe(0);
    expect(state.confirmCalls).toBe(0);
    expect(JSON.stringify(state.publishedBody)).not.toContain(state.unrelatedSecret);
  });

  test('publish response loss reconciles the authoritative Card and does not publish twice', async ({ page }) => {
    await page.addInitScript(() => {
      let putCalls = 0; let getCalls = 0;
      let publishedCard: Record<string, unknown> | null = null;
      Object.assign(window, { publishLossState: () => ({ putCalls, getCalls }) });
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.origin).pathname;
        const method = String(init?.method ?? 'GET').toUpperCase();
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
        if (path.endsWith('/card') && method === 'PUT') {
          putCalls += 1;
          publishedCard = { id: 'card-owner', schemaVersion: 1, ownerId: 'owner-1', ...body, highlights: (body.highlights as { title: string; url?: string }[]).map((item, index) => ({ id: `highlight-${index + 1}`, ...item })), updatedAt: Date.now() };
          throw new TypeError('Failed to fetch after Card persistence');
        }
        if (path.endsWith('/card') && method === 'GET') { getCalls += 1; return ok(publishedCard); }
        return ok({});
      };
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'self_hosted', endpoint: 'http://localhost:4179', ownerToken: 'owner-token' }));
      localStorage.setItem('vibecard_onboarding_v1', JSON.stringify({
        version: 1, phase: 'preview', questionIndex: 4, name: '只发布一次', answers: { focus: '可靠发布', highlight: '', help: '', meet: '重视可靠性的人', boundary: '' }, draft: '',
        avatarSeed: 'Milo', customAvatar: null, avatarMode: 'generated', identityReady: true, pendingMemory: null,
        cardDraft: { headline: '可靠的创造者', currentFocus: '可靠发布', canHelpWith: '', wantsToMeet: '重视可靠性的人', topics: '', highlight: '' },
        runtimeKey: 'self_hosted|http://localhost:4179', draftMemoryIds: [], pendingMessageId: '', lastAnswerStartedAt: 0, publishNeedsReconcile: false,
      }));
    });
    await page.goto('/');
    await expect(page.getByTestId('onboarding-card-preview')).toContainText('只发布一次');
    await page.getByTestId('confirm-onboarding-card').click();
    await expect(page.getByRole('alert')).toContainText('安全重试');
    await page.getByRole('button', { name: '重试' }).click();
    await expect(page.getByRole('heading', { name: '只发布一次' })).toBeVisible();
    const state = await page.evaluate(() => (window as typeof window & { publishLossState: () => { putCalls: number; getCalls: number } }).publishLossState());
    expect(state).toEqual({ putCalls: 1, getCalls: 1 });
  });

  test('My Vibe Card draft can be rejected unchanged, then explicitly adopted', async ({ page }) => {
    await page.addInitScript(profile => {
      const calls: { path: string; body: Record<string, unknown> }[] = [];
      (window as typeof window & { testCalls: typeof calls }).testCalls = calls;
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.origin).pathname;
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        calls.push({ path, body });
        const value = path.endsWith('/memories') ? [] : path.endsWith('/card/draft') ? { draft: { wantsToMeet: ['新的明确目标'], currentFocus: '新的当前焦点' } } : body;
        return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
      };
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'self_hosted', endpoint: 'http://localhost:4179', ownerToken: 'owner-token' }));
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
    }, baseProfile);
    await page.goto('/'); await page.getByRole('tab', { name: 'Vibe' }).click();
    await page.getByTestId('generate-card-draft').click();
    await expect(page.getByTestId('card-draft-preview')).toContainText('新的明确目标');
    await page.getByTestId('card-draft-reject').click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_profile') || '{}').lookingFor)).toBe('旧目标');
    await page.getByTestId('generate-card-draft').click();
    await page.getByTestId('card-draft-edit').click();
    await page.getByTestId('card-draft-field-wantsToMeet').fill('编辑后的明确目标');
    await page.getByTestId('card-draft-accept').click();
    await expect(page.getByTestId('card-draft-applied')).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_profile') || '{}').lookingFor)).toBe('编辑后的明确目标');
  });

  test('local My Vibe Card draft ignores a newer confirmed private boundary', async ({ page }) => {
    await page.addInitScript(({ profile, timestamp }) => {
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' }));
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
      localStorage.setItem('vibecard_owner_memories', JSON.stringify([
        { id: 'public-focus', schemaVersion: 1, ownerId: 'owner-local', kind: 'current', content: '公开：正在做隐私优先的个人 AI', visibility: 'public', status: 'confirmed', sourceConversationId: 'conv', sourceMessageIds: [], createdAt: timestamp - 10, updatedAt: timestamp - 10 },
        { id: 'private-boundary', schemaVersion: 1, ownerId: 'owner-local', kind: 'boundary', content: '私密：绝不能告诉访客的家庭安排', visibility: 'private', status: 'confirmed', sourceConversationId: 'conv', sourceMessageIds: [], createdAt: timestamp, updatedAt: timestamp },
      ]));
    }, { profile: baseProfile, timestamp: Date.now() });
    await page.goto('/'); await page.getByRole('tab', { name: 'Vibe' }).click();
    await page.getByTestId('generate-card-draft').click();
    const preview = page.getByTestId('card-draft-preview');
    await expect(preview).toContainText('公开：正在做隐私优先的个人 AI');
    await expect(preview).not.toContainText('私密：绝不能告诉访客的家庭安排');
  });

  test('decision learning is optional, owner-confirmed, and failure never rolls back the connection', async ({ page }) => {
    const now = Date.now();
    await page.addInitScript(({ profile, timestamp }) => {
      let actionCalls = 0; let confirmCalls = 0;
      Object.assign(window, { testCounts: () => ({ actionCalls, confirmCalls }) });
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.origin).pathname;
        const ok = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
        const request = { id: 'request-1', schemaVersion: 1, ownerId: 'owner-1', visitorId: 'visitor-1', visitorSummary: '匿名产品开发者', reason: '想交流隐私边界的具体实现。', possibleSharedContext: ['都重视隐私边界'], ownerAction: 'pending', sharedContactMethodIds: [], createdAt: timestamp, updatedAt: timestamp };
        if (path.endsWith('/requests')) return ok([request]);
        if (path.endsWith('/contacts')) return ok([{ id: 'contact-1', schemaVersion: 1, ownerId: 'owner-1', kind: 'wechat', value: 'private-id', label: '微信', createdAt: timestamp, updatedAt: timestamp }]);
        if (path.endsWith('/summary')) return ok({ summary: { recommendation: 'worth_a_conversation', why: ['理由具体'], uncertainty: '时间未知', suggestedTopic: '隐私边界', evidenceRefs: ['request-1'] } });
        if (path.endsWith('/action')) { actionCalls += 1; return ok({ ...request, ownerAction: 'connect', sharedContactMethodIds: ['contact-1'], learningStatus: 'proposed', learningProposalId: 'learn-1' }); }
        if (path.endsWith('/memories')) return ok([{ id: 'learn-1', schemaVersion: 1, ownerId: 'owner-1', kind: 'preference', content: '我更愿意认识能说清具体问题的人。', visibility: 'agent_only', status: 'proposed', sourceConversationId: 'decision-learning', sourceMessageIds: [], createdAt: timestamp, updatedAt: timestamp }]);
        if (path.includes('/memories/learn-1/confirm')) { confirmCalls += 1; return ok({ error: { message: 'learning unavailable' } }, 503); }
        return ok({});
      };
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'self_hosted', endpoint: 'http://localhost:4179', ownerToken: 'owner-token' }));
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
    }, { profile: baseProfile, timestamp: now });
    await page.goto('/'); await page.getByRole('tab', { name: '请求' }).click(); await page.getByTestId('request-item').click();
    await page.getByTestId('request-connect').click(); await page.getByTestId('contact-wechat').click(); await page.getByTestId('confirm-connect').click();
    await expect(page.getByTestId('vibe-matched')).toContainText('Vibe matched.');
    await expect(page.getByTestId('decision-memory-proposal')).toContainText('不包含访客身份');
    await page.getByTestId('decision-memory-confirm').click();
    await expect(page.getByTestId('decision-memory-proposal')).toContainText('连接决定已经保存');
    const counts = await page.evaluate(() => (window as typeof window & { testCounts: () => { actionCalls: number; confirmCalls: number } }).testCounts());
    expect(counts).toEqual({ actionCalls: 1, confirmCalls: 1 });
    await expect(page.getByTestId('vibe-matched')).toBeVisible();
  });

  test('decision proposal lookup failure is retryable and reload recovers the terminal request proposal', async ({ page }) => {
    const now = Date.now();
    await page.addInitScript(({ profile, timestamp }) => {
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.origin).pathname;
        const ok = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
        const decided = localStorage.getItem('test_decision_done') === '1';
        const request = { id: 'request-recover', schemaVersion: 1, ownerId: 'owner-1', visitorId: 'visitor-1', visitorSummary: '匿名产品开发者', reason: '想交流隐私边界的具体实现。', possibleSharedContext: ['都重视隐私边界'], ownerAction: decided ? 'connect' : 'pending', sharedContactMethodIds: decided ? ['contact-1'] : [], createdAt: timestamp, updatedAt: timestamp };
        if (path.endsWith('/requests')) return ok([request]);
        if (path.endsWith('/contacts')) return ok([{ id: 'contact-1', schemaVersion: 1, ownerId: 'owner-1', kind: 'wechat', value: 'private-id', label: '微信', createdAt: timestamp, updatedAt: timestamp }]);
        if (path.endsWith('/summary')) return ok({ summary: { recommendation: 'worth_a_conversation', why: ['理由具体'], uncertainty: '时间未知', suggestedTopic: '隐私边界', evidenceRefs: ['request-recover'] } });
        if (path.endsWith('/action')) { localStorage.setItem('test_decision_done', '1'); return ok({ ...request, ownerAction: 'connect', sharedContactMethodIds: ['contact-1'], learningStatus: 'proposed', learningProposalId: 'learn-recover' }); }
        if (path.endsWith('/memories')) {
          const count = Number(localStorage.getItem('test_learning_fetches') || '0') + 1;
          localStorage.setItem('test_learning_fetches', String(count));
          if (count === 1) return ok({ error: { message: 'temporary lookup failure' } }, 503);
          return ok([{ id: 'learn-recover', schemaVersion: 1, ownerId: 'owner-1', kind: 'preference', content: '我更愿意认识理由具体的人。', visibility: 'agent_only', status: 'proposed', sourceConversationId: 'connection-decision:fingerprint', sourceMessageIds: ['request-recover'], createdAt: timestamp, updatedAt: timestamp }]);
        }
        if (path.includes('/memories/learn-recover/confirm')) { localStorage.setItem('test_confirm_body', String(init?.body)); return ok({ id: 'learn-recover', status: 'confirmed' }); }
        return ok({});
      };
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'self_hosted', endpoint: 'http://localhost:4179', ownerToken: 'owner-token' }));
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
    }, { profile: baseProfile, timestamp: now });
    await page.goto('/'); await page.getByRole('tab', { name: '请求' }).click(); await page.getByTestId('request-item').click();
    await page.getByTestId('request-connect').click(); await page.getByTestId('contact-wechat').click(); await page.getByTestId('confirm-connect').click();
    await expect(page.getByTestId('vibe-matched')).toBeVisible();
    await expect(page.getByTestId('decision-memory-lookup-error')).toContainText('连接决定已经保存');
    await page.reload();
    await page.getByRole('tab', { name: '请求' }).click();
    await expect(page.getByTestId('decision-memory-proposal')).toContainText('我更愿意认识理由具体的人');
    await page.getByTestId('decision-memory-edit').click();
    await page.getByTestId('decision-memory-input').fill('我更愿意认识能说清具体问题的人。');
    await page.getByTestId('decision-memory-confirm').click();
    await expect(page.getByTestId('decision-memory-proposal')).toContainText('已记住');
    const body = await page.evaluate(() => JSON.parse(localStorage.getItem('test_confirm_body') || '{}'));
    expect(body).toMatchObject({ content: '我更愿意认识能说清具体问题的人。', visibility: 'agent_only' });
    expect(await page.evaluate(() => localStorage.getItem('vibecard_pending_decision_learning_v1'))).toBeNull();
  });

  test('owner can reject a decision-learning proposal without changing the connected result', async ({ page }) => {
    await page.addInitScript(profile => {
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' }));
      localStorage.setItem('vibecard_demo_mode', '1');
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
    }, baseProfile);
    await page.goto('/'); await page.getByRole('tab', { name: '请求' }).click(); await page.getByTestId('request-item').click();
    await page.getByTestId('request-connect').click(); await page.getByTestId('contact-wechat').click(); await page.getByTestId('confirm-connect').click();
    await page.getByTestId('decision-memory-reject').click();
    await expect(page.getByTestId('decision-memory-rejected')).toContainText('连接结果保持不变');
    await expect(page.getByTestId('vibe-matched')).toBeVisible();
  });
});
