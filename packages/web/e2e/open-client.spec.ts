import { test, expect } from '@playwright/test';

const privateProfile = {
  name: 'Privacy Owner',
  handle: 'privacy-owner',
  avatar: '',
  bio: 'A public bio',
  tags: [{ label: 'AI', icon: '✨' }],
  canHelpWith: ['梳理隐私优先的 AI 产品体验'],
  lookingFor: 'privacy-minded builders',
  event: '',
  highlights: [],
  threads: [{ id: 'private-thread', content: 'private old feed', tags: [], timestamp: 1 }],
  contacts: [{ id: 'secret-contact', platform: 'wechat', value: 'wechat-secret', url: '' }],
  verified: {
    wallet: '0xsecret',
    walletProof: { address: '0xsecret', message: 'secret proof', signature: '0xsig', signedAt: 1 },
    twitter: 'private-handle', discord: '', wechat: '', telegram: '',
  },
};

function encode(value: object) {
  return Buffer.from(encodeURIComponent(JSON.stringify(value)), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '.');
}

test.describe('H5 open client public boundary', () => {
  test('local sharing embeds only the public projection and never POSTs a server snapshot', async ({ page }) => {
    let posts = 0;
    await page.route('**/api/cards', async route => {
      if (route.request().method() === 'POST') posts += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    await page.addInitScript(profile => {
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' }));
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
      Object.defineProperty(navigator, 'clipboard', { value: {
        writeText: async (value: string) => localStorage.setItem('test_copied_share_url', value),
      } });
    }, privateProfile);
    await page.goto('/');
    await page.getByRole('button', { name: /分享我的名片/ }).click();
    await page.getByRole('button', { name: '复制名片链接' }).last().click();
    const embedded = await page.evaluate(() => {
      const url = new URL(localStorage.getItem('test_copied_share_url') || '');
      const encoded = url.searchParams.get('c') || '';
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/').replace(/\./g, '=');
      return { profile: JSON.parse(decodeURIComponent(atob(normalized))), id: url.searchParams.get('id') };
    });
    expect(posts).toBe(0);
    expect(embedded.id).toBeNull();
    expect(embedded.profile).not.toHaveProperty('contacts');
    expect(embedded.profile).not.toHaveProperty('verified');
    expect(embedded.profile).not.toHaveProperty('memories');
    expect(embedded.profile.canHelpWith).toEqual(['梳理隐私优先的 AI 产品体验']);
    expect(embedded.profile.threads).toEqual([]);
  });

  test('a local owner revokes an older cached snapshot and never publishes a replacement', async ({ page }) => {
    const events: string[] = [];
    let posts = 0;
    await page.route('**/api/cards', async route => {
      if (route.request().method() === 'POST') posts += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    await page.route('**/api/cards/*', async route => {
      events.push(`delete:${route.request().headers().authorization || ''}`);
      await route.fulfill({ status: 204, body: '' });
    });
    await page.addInitScript(profile => {
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' }));
      if (!localStorage.getItem('vibecard_profile')) localStorage.setItem('vibecard_profile', JSON.stringify(profile));
      localStorage.setItem('vibecard_namecard_id', JSON.stringify({ id: 'snapshot-old', key: 'old', revokeToken: 'revoke-token-old' }));
    }, privateProfile);
    await page.goto('/');
    await expect.poll(() => events).toEqual(['delete:Bearer revoke-token-old']);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('vibecard_namecard_id'))).toBeNull();
    expect(posts).toBe(0);
  });

  test('a remote runtime revokes a cached local snapshot but never POSTs another static copy', async ({ page }) => {
    let posts = 0;
    let deletes = 0;
    await page.route('**/api/cards', async route => {
      if (route.request().method() === 'POST') posts += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    await page.route('**/api/cards/*', async route => {
      deletes += 1;
      expect(route.request().headers().authorization).toBe('Bearer old-local-revoke');
      await route.fulfill({ status: 204, body: '' });
    });
    await page.addInitScript(profile => {
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'self_hosted', endpoint: 'https://vibe.example.test', ownerToken: 'owner-token' }));
      localStorage.setItem('vibecard_namecard_id', JSON.stringify({ id: 'old-local', key: 'old-key', revokeToken: 'old-local-revoke' }));
    }, privateProfile);
    await page.goto('/');
    await expect.poll(() => deletes).toBeGreaterThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('vibecard_namecard_id'))).toBeNull();
    expect(posts).toBe(0);
  });

  test('switching from local to remote handles snapshot revocation failure without an unhandled rejection', async ({ page }) => {
    let posts = 0;
    let deletes = 0;
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/api/cards', async route => {
      posts += 1;
      await route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ id: 'switch-local', revokeToken: 'switch-local-token' }),
      });
    });
    await page.route('**/api/cards/*', async route => {
      deletes += 1;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    });
    await page.addInitScript(profile => {
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' }));
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
      localStorage.setItem('vibecard_namecard_id', JSON.stringify({ id: 'switch-local', key: 'old', revokeToken: 'switch-local-token' }));
    }, privateProfile);
    await page.goto('/');
    await expect.poll(() => deletes).toBeGreaterThanOrEqual(1);
    const deletesBeforeSwitch = deletes;

    await page.getByTestId('card-advanced').locator('summary').click();
    await page.getByRole('button', { name: /更改运行模式/ }).click();
    await page.getByTestId('card-advanced').locator('select').selectOption('self_hosted');
    await page.getByLabel('服务地址').fill('https://vibe.example.test');
    await page.getByLabel('主人令牌').fill('owner-token');
    await page.getByRole('button', { name: '保存连接设置' }).click();

    await expect.poll(() => deletes).toBeGreaterThan(deletesBeforeSwitch);
    expect(posts).toBe(0);
    expect(pageErrors).toEqual([]);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_namecard_id') || 'null')?.id)).toBe('switch-local');
  });

  test('delete-all revokes the published Card snapshot before clearing local owner data', async ({ page }) => {
    const events: string[] = [];
    await page.route('**/api/cards', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/cards/*', async route => {
      events.push(`delete:${route.request().headers().authorization || ''}`);
      await route.fulfill({ status: 204, body: '' });
    });
    await page.addInitScript(profile => {
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' }));
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
    }, privateProfile);
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('vibecard_namecard_id', JSON.stringify({
      id: 'delete-fixture', key: 'old', revokeToken: 'delete-fixture-token',
    })));
    await page.getByTestId('card-advanced').locator('summary').click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /导出 \.vibe/ }).click();
    await download;
    await page.getByRole('button', { name: /导出后删除全部数据/ }).click();
    await expect.poll(() => events).toEqual(['delete:Bearer delete-fixture-token']);
  });

  test('managed export requires both the private archive and portable knowledge before enabling deletion', async ({ page }) => {
    await page.addInitScript(profile => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = new URL(String(input), location.origin);
        if (url.pathname === '/api/v1/cloud/accounts/acct-managed/owner/export') {
          localStorage.setItem('test_archive_calls', String(Number(localStorage.getItem('test_archive_calls') || '0') + 1));
          localStorage.setItem('test_export_authorization', new Headers(init?.headers).get('authorization') || '');
          return new Response(JSON.stringify({ kind: 'private', schemaVersion: 1 }), {
            status: 200, headers: { 'content-type': 'application/json' },
          });
        }
        if (url.pathname === '/api/v1/cloud/accounts/acct-managed/knowledge/export') {
          localStorage.setItem('test_knowledge_calls', String(Number(localStorage.getItem('test_knowledge_calls') || '0') + 1));
          const available = localStorage.getItem('test_knowledge_available') === '1';
          return new Response(available
            ? JSON.stringify({ schemaVersion: 1, sources: [{ id: 'source-1', title: 'Portable source' }] })
            : JSON.stringify({ error: { message: 'knowledge export unavailable' } }), {
            status: available ? 200 : 503, headers: { 'content-type': 'application/json' },
          });
        }
        return nativeFetch(input, init);
      };
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({
        mode: 'managed', endpoint: 'https://managed.example.test', ownerToken: 'managed-owner-token',
        accountId: 'acct-managed', cardSlug: 'managed-card',
      }));
      localStorage.removeItem('vibecard_last_private_export_at');
    }, privateProfile);
    await page.goto('/');
    await page.getByTestId('card-advanced').locator('summary').click();
    await page.getByRole('button', { name: '导出 .vibe' }).click();
    await expect(page.getByRole('status')).toContainText('knowledge export unavailable');
    expect(await page.evaluate(() => localStorage.getItem('vibecard_last_private_export_at'))).toBeNull();

    await page.evaluate(() => localStorage.setItem('test_knowledge_available', '1'));
    await page.getByRole('button', { name: '导出 .vibe' }).click();
    await expect(page.getByRole('status')).toContainText('.vibe 与 knowledge JSON 两份文件');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('vibecard_last_private_export_at'))).not.toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('test_archive_calls'))).toBe('2');
    expect(await page.evaluate(() => localStorage.getItem('test_knowledge_calls'))).toBe('2');
    expect(await page.evaluate(() => localStorage.getItem('test_export_authorization'))).toBe('Bearer managed-owner-token');
  });

  test('embedded snapshot stays readable when the self-hosted agent is offline', async ({ page }) => {
    const snapshot = { ...privateProfile, contacts: undefined, verified: undefined, threads: [], agentEnabled: false };
    await page.route('https://offline.example.test/**', route => route.abort());
    await page.goto(`/?c=${encode(snapshot)}&source=${encodeURIComponent('https://offline.example.test')}`);
    await expect(page.getByRole('heading', { name: 'Privacy Owner' })).toBeVisible();
    await expect(page.getByTestId('vibe-disabled')).toContainText('分身暂时离线');
    await expect(page.locator('body')).not.toContainText('wechat-secret');
  });

  test('legacy threads never render on the current public Card', async ({ page }) => {
    await page.goto(`/?c=${encode(privateProfile)}&view=full`);
    await expect(page.getByRole('heading', { name: 'Privacy Owner' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('private old feed');
    await expect(page.getByText('个人动态')).toHaveCount(0);
  });

  test('another owner snapshot never inherits the viewer local Now', async ({ page }) => {
    const snapshot = { ...privateProfile, contacts: undefined, verified: undefined, threads: [], nowItems: undefined };
    await page.addInitScript(() => {
      localStorage.setItem('vibecard_demo_mode', '1');
      localStorage.setItem('vibecard_now', JSON.stringify([{
        id: 'viewer-now', schemaVersion: 1, ownerId: 'viewer-owner', text: '查看者自己的敏感动态',
        topic: 'current_work', sourceMemoryId: null, status: 'published', publishedAt: Date.now(),
        expiresAt: null, createdAt: Date.now(), updatedAt: Date.now(),
      }]));
    });
    await page.goto(`/?c=${encode(snapshot)}&view=full&demo=1`);
    await expect(page.getByRole('heading', { name: 'Privacy Owner' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('查看者自己的敏感动态');
    await page.getByTestId('chat-with-vibe-full').click();
    await page.getByTestId('visitor-input').fill('这个任意真实快照不能借用林舟的演示证据');
    await page.getByTestId('visitor-send').click();
    await expect(page.getByTestId('visitor-vibe-chat')).not.toContainText('最近在打磨访客和分身的前六轮对话');
    await expect(page.getByTestId('request-done')).toHaveCount(0);
  });

  test('a real shared endpoint ignores a stale demo flag and submits remotely', async ({ page }) => {
    const snapshot = { ...privateProfile, contacts: undefined, verified: undefined, threads: [], agentEnabled: false };
    let requestCalls = 0;
    await page.addInitScript(() => localStorage.setItem('vibecard_demo_mode', '1'));
    await page.route('https://vibe.example.test/api/v1/public/card', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'card-real', name: 'Remote Owner', agentEnabled: false, topics: [], wantsToMeet: [], highlights: [], now: [] }),
    }));
    await page.route('https://vibe.example.test/api/v1/public/requests', async route => {
      requestCalls += 1;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'request-real', ownerAction: 'pending' }) });
    });
    await page.goto(`/?c=${encode(snapshot)}&source=${encodeURIComponent('https://vibe.example.test')}`);
    await page.getByTestId('vibe-disabled').click();
    await page.getByTestId('visitor-input').fill('我想交流一个具体的隐私产品实现问题。');
    await page.getByTestId('visitor-send').click();
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('request-done')).toBeVisible();
    expect(requestCalls).toBe(1);
  });

  test('managed public Card and chat use the gateway card-slug namespace', async ({ page }) => {
    const snapshot = { ...privateProfile, contacts: undefined, verified: undefined, threads: [], agentEnabled: true };
    let cardCalls = 0;
    let chatCalls = 0;
    await page.route('https://managed.example.test/api/v1/cloud/cards/managed-card/card', async route => {
      cardCalls += 1;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'card-managed', name: 'Managed Owner', agentEnabled: true, topics: ['AI'], wantsToMeet: [], highlights: [], now: [] }),
      });
    });
    await page.route('https://managed.example.test/api/v1/cloud/cards/managed-card/chat', async route => {
      chatCalls += 1;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ conversationId: 'managed-conversation', reply: '来自托管网关的有依据回答', evidenceRefs: ['card:card-managed'], nextAction: 'continue' }),
      });
    });
    const source = 'https://managed.example.test/api/v1/cloud/cards/managed-card';
    await page.goto(`/?c=${encode(snapshot)}&source=${encodeURIComponent(source)}`);
    await expect(page.getByRole('heading', { name: 'Managed Owner' })).toBeVisible();
    await page.getByTestId('chat-with-vibe').click();
    await page.getByTestId('visitor-input').fill('托管路径是否真实可用？');
    await page.getByTestId('visitor-send').click();
    await expect(page.getByTestId('visitor-vibe-chat')).toContainText('来自托管网关的有依据回答');
    expect(cardCalls).toBeGreaterThanOrEqual(1);
    expect(chatCalls).toBe(1);
  });

  test('remote card shows loading and offers retry after a transient failure', async ({ page }) => {
    let attempts = 0;
    await page.route(/\/api\/cards\/retry-card$/, async route => {
      attempts += 1;
      await new Promise(resolve => setTimeout(resolve, 1200));
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/?id=retry-card');
    await expect(page.getByRole('status', { name: '正在加载名片' })).toBeVisible();
    await expect(page.getByText('这张名片找不到了')).toBeVisible();
    await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible();
    expect(attempts).toBeGreaterThanOrEqual(1);
  });

  test('agent-disabled remote card still accepts a specific owner-approved request', async ({ page }) => {
    const snapshot = { ...privateProfile, contacts: undefined, verified: undefined, threads: [], agentEnabled: false };
    let requestBody: Record<string, unknown> | undefined;
    await page.route('https://vibe.example.test/api/v1/public/card', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'card-1', name: 'Privacy Owner', agentEnabled: false, topics: [], wantsToMeet: [], highlights: [], now: [] }),
    }));
    await page.route('https://vibe.example.test/api/v1/public/requests', async route => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'request-1', ownerAction: 'pending' }) });
    });
    await page.goto(`/?c=${encode(snapshot)}&source=${encodeURIComponent('https://vibe.example.test')}`);
    await page.getByTestId('vibe-disabled').click();
    await page.getByTestId('visitor-input').fill('我也在做隐私优先的个人 AI，希望交流数据可迁移的实现经验。');
    await page.getByTestId('visitor-send').click();
    const identity = page.getByLabel('你的称呼');
    await expect(identity).not.toHaveValue('苏晴');
    await identity.fill('隐私产品开发者');
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('request-done')).toBeVisible();
    expect(requestBody?.reason).toContain('隐私优先');
    expect(requestBody?.visitorSummary).toBe('隐私产品开发者');
    expect(requestBody).not.toHaveProperty('contact');
  });

  test('real self-hosted owner inbox loads and acts through the owner API, never fixtures', async ({ page }) => {
    const now = Date.now();
    const realRequest = {
      id: 'request-real-1', schemaVersion: 1, ownerId: 'owner-real', visitorId: 'visitor-real',
      visitorSummary: '真实访客', reason: '我正在做本地优先的个人 AI，希望交流数据导出与隐私边界。',
      possibleSharedContext: ['都在做本地优先的个人 AI'], ownerAction: 'pending', sharedContactMethodIds: [], createdAt: now, updatedAt: now,
    };
    await page.addInitScript(({ profile, request, timestamp }) => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.origin).pathname;
        if (path === '/api/v1/owner/requests' && (init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify([request]), { status: 200, headers: { 'content-type': 'application/json' } });
        if (path === '/api/v1/owner/contacts') return new Response(JSON.stringify([{ id: 'contact-real', schemaVersion: 1, ownerId: 'owner-real', kind: 'email', value: 'private@example.test', label: '工作邮箱', createdAt: timestamp, updatedAt: timestamp }]), { status: 200, headers: { 'content-type': 'application/json' } });
        if (path.endsWith('/summary')) return new Response(JSON.stringify({ requestId: request.id, summary: { recommendation: 'worth_a_conversation', why: ['理由具体'], uncertainty: '尚不清楚合作时间', suggestedTopic: '本地数据迁移', evidenceRefs: [`request:${request.id}`] } }), { status: 200, headers: { 'content-type': 'application/json' } });
        if (path.endsWith('/action')) {
          const body = JSON.parse(String(init?.body ?? '{}'));
          localStorage.setItem('test_owner_action_calls', String(Number(localStorage.getItem('test_owner_action_calls') || '0') + 1));
          return new Response(JSON.stringify({ ...request, ownerAction: body.action, updatedAt: timestamp + 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return nativeFetch(input, init);
      };
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'self_hosted', endpoint: 'http://localhost:4179', ownerToken: 'owner-secret' }));
      localStorage.removeItem('vibecard_demo_mode');
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
    }, { profile: privateProfile, request: realRequest, timestamp: now });
    await page.goto('/');
    await page.getByRole('tab', { name: '请求' }).click();
    await expect(page.getByTestId('request-item')).toContainText('真实访客');
    await expect(page.locator('body')).not.toContainText('苏晴');
    await page.getByTestId('request-item').click();
    await expect(page.getByTestId('vibe-take')).toContainText('我觉得你们值得聊一次。');
    await page.getByTestId('request-later').click();
    await expect(page.getByTestId('request-item')).toContainText('稍后决定');
    await page.getByTestId('request-item').click();
    await expect(page.getByTestId('request-detail')).toContainText('真实访客');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('test_owner_action_calls'))).toBe('1');
  });

  test('visitor chat enforces six rounds and prevents duplicate request submission', async ({ page }) => {
    const snapshot = { ...privateProfile, contacts: undefined, verified: undefined, threads: [], agentEnabled: true };
    let chatCalls = 0;
    let requestCalls = 0;
    await page.route('https://vibe.example.test/api/v1/public/card', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'card-1', name: 'Privacy Owner', agentEnabled: true, topics: [], wantsToMeet: [], highlights: [], now: [] }) }));
    await page.route('https://vibe.example.test/api/v1/public/chat', async route => {
      chatCalls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversationId: 'conversation-1', reply: `有依据的回答 ${chatCalls}`, evidenceRefs: ['card:card-1'], nextAction: 'continue' }) });
    });
    await page.route('https://vibe.example.test/api/v1/public/requests', async route => {
      requestCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 150));
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'request-once', ownerAction: 'pending' }) });
    });
    await page.goto(`/?c=${encode(snapshot)}&source=${encodeURIComponent('https://vibe.example.test')}`);
    await page.getByTestId('chat-with-vibe').click();
    for (let index = 1; index <= 6; index += 1) {
      await page.getByTestId('visitor-input').fill(`第 ${index} 个关于主人的具体问题`);
      await page.getByTestId('visitor-send').click();
      await expect(page.getByTestId('visitor-vibe-chat')).toContainText(`有依据的回答 ${index}`);
    }
    await expect(page.getByTestId('visitor-vibe-chat')).toContainText('最多 6 轮 · 已进行 6 轮');
    await page.getByTestId('visitor-input').fill('我希望交流本地优先的实现细节，这是一个具体的认识理由。');
    await page.getByTestId('visitor-send').click();
    await expect(page.getByTestId('request-preview')).toBeVisible();
    await page.getByTestId('request-submit').dblclick();
    await expect(page.getByTestId('request-done')).toBeVisible();
    expect(chatCalls).toBe(6);
    expect(requestCalls).toBe(1);
  });
});
