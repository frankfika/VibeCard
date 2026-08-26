import { test, expect } from '@playwright/test';

// Task 0.2: main navigation is now 名片 / 请求 / Vibe. Legacy 动态 / 更多
// entries (Threads, Games, Discover, Points) no longer appear.
test.describe('Cross-browser compatibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' }));
    });
    await page.goto('/');
    await expect(page).toHaveTitle(/vibecard/i);
    await expect(page.getByRole('tab', { name: '名片' })).toBeVisible();
  });

  test('new owner chooses a local runtime without creating an account', async ({ page }) => {
    await page.goto('/?runtime-setup=1');
    await expect(page.getByRole('heading', { name: '你的 Vibe，放在哪里？' })).toBeVisible();
    await page.getByRole('button', { name: /继续创建/ }).click();
    await expect(page.getByRole('button', { name: '一键生成我的 VibeCard' })).toBeVisible();
    const config = await page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_runtime_v1') || 'null'));
    expect(config).toEqual({ mode: 'local', endpoint: '', ownerToken: '' });
  });

  test('self-hosted connection is configurable at runtime and keeps its token out of the page', async ({ page }) => {
    const secret = 'e2e-owner-token-never-render';
    const logged: string[] = [];
    page.on('console', message => logged.push(message.text()));
    await page.goto('/?runtime-setup=1');
    await page.getByRole('button', { name: /连接自托管服务/ }).click();
    await page.getByLabel('服务地址').fill('https://vibe.example.test/');
    await page.getByLabel('主人令牌').fill(secret);
    await page.getByRole('button', { name: /继续创建/ }).click();
    await expect(page.getByRole('button', { name: '一键生成我的 VibeCard' })).toBeVisible();
    const config = await page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_runtime_v1') || 'null'));
    expect(config).toEqual({ mode: 'self_hosted', endpoint: 'https://vibe.example.test', ownerToken: secret });
    await expect(page.locator('body')).not.toContainText(secret);
    expect(logged.join('\n')).not.toContain(secret);
  });

  test('owner tokens can use HTTP only on loopback and managed runtimes require HTTPS namespaces', async ({ page }) => {
    await page.goto('/?runtime-setup=1');
    await page.getByRole('button', { name: /连接自托管服务/ }).click();
    await page.getByLabel('服务地址').fill('http://api.example.test');
    await page.getByLabel('主人令牌').fill('plain-text-token');
    await page.getByRole('button', { name: /继续创建/ }).click();
    await expect(page.getByText(/仅本机自托管可用 HTTP/)).toBeVisible();

    await page.getByRole('button', { name: /VibeCard Cloud/ }).click();
    await page.getByLabel('服务地址').fill('http://127.0.0.1:9999');
    await page.getByLabel('主人令牌').fill('managed-token');
    await page.getByLabel('账户 ID').fill('acct-test');
    await page.getByLabel('公开 Card Slug').fill('card-test');
    await page.getByRole('button', { name: /继续创建/ }).click();
    await expect(page.getByText(/含托管模式.*必须使用 HTTPS/)).toBeVisible();
    const config = await page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_runtime_v1') || 'null'));
    expect(config).toEqual({ mode: 'local', endpoint: '', ownerToken: '' });
  });

  test('a deployed H5 defaults its service address to the same HTTPS origin', async ({ page }) => {
    const endpoint = await page.evaluate(async () => {
      const modulePath = '/src/lib/' + 'runtime.ts';
      const runtime = await import(modulePath);
      return runtime.runtimeEndpointForLocation('card.example.test', 'https://card.example.test');
    });
    expect(endpoint).toBe('https://card.example.test');
  });

  test('a new visitor starts creating immediately without choosing infrastructure', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('vibecard_runtime_v1');
      localStorage.removeItem('vibecard_profile');
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: '你的 Vibe，放在哪里？' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '一键生成我的 VibeCard' })).toBeVisible();
    const config = await page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_runtime_v1') || 'null'));
    expect(config).toEqual({ mode: 'local', endpoint: '', ownerToken: '' });
  });

  test('renders correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('tab', { name: '名片' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '请求' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Vibe' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '动态' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: '更多' })).toHaveCount(0);
  });

  test('renders correctly on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.locator('text=vibecard').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: '名片' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '请求' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Vibe' })).toBeVisible();
  });

  test('tab switching works', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('vibecard_profile', JSON.stringify({
      name: 'Tab Owner', handle: '', avatar: '', bio: '', tags: [], lookingFor: '',
      highlights: [], contacts: [], verified: { wallet: '', twitter: '', discord: '', wechat: '', telegram: '' }, threads: [],
    })));
    await page.reload();
    await page.getByRole('tab', { name: '请求' }).click();
    await expect(page.getByTestId('requests-empty')).toBeVisible();
    await page.getByRole('tab', { name: 'Vibe' }).click();
    await expect(page.getByText('还没有记住任何事。聊点什么吧。')).toBeVisible();
  });

  test('new owner completes the five-question conversation before other tabs unlock', async ({ page }) => {
    const requestsTab = page.getByRole('tab', { name: '请求' });
    const vibeTab = page.getByRole('tab', { name: 'Vibe' });
    await expect(requestsTab).toBeDisabled();
    await expect(vibeTab).toBeDisabled();
    await requestsTab.click({ force: true });
    await expect(page.getByRole('button', { name: '一键生成我的 VibeCard' })).toBeVisible();

    await page.getByRole('button', { name: '一键生成我的 VibeCard' }).click();
    await page.getByLabel('你的名字或昵称').fill('林舟');
    await page.getByLabel(/个人链接/).fill('https://github.com/linzhou\nhttps://linzhou.example.com');
    await page.getByRole('button', { name: '开始生成' }).click();

    const answers = [
      '最近在做一张会越来越懂人的 AI 名片。',
      '独立完成并发布了第一个微信 AI 小程序。',
      '帮助早期团队梳理 AI 产品体验和隐私边界。',
      '真正做过个人 AI、也在意真实关系的人。',
      '不要对陌生人透露我的私人联系方式和未公开项目。',
    ];
    for (const answer of answers) {
      await page.locator('#onboarding-answer').fill(answer);
      await page.getByRole('button', { name: '告诉 Vibe' }).click();
      await expect(page.getByTestId('onboarding-memory-proposal')).toBeVisible();
      // The public Card may use only memories the owner explicitly confirms.
      // The boundary is confirmed as private and is still excluded below.
      await page.getByTestId('onboarding-memory-confirm').click();
    }

    const preview = page.getByTestId('onboarding-card-preview');
    await expect(preview).toContainText('此刻的我');
    await expect(preview).toContainText('我能帮什么');
    await expect(preview).toContainText('我想遇见谁');
    await expect(preview).not.toContainText('不要对陌生人透露');
    await page.getByTestId('confirm-onboarding-card').click();
    await expect(page.getByRole('heading', { name: '林舟' })).toBeVisible();
    await expect(page.getByRole('link', { name: /github.com/ })).toHaveAttribute('href', 'https://github.com/linzhou');
    await expect(requestsTab).toBeEnabled();

    await expect.poll(async () => page.evaluate(() => localStorage.getItem('vibecard_profile') || '')).toContain('帮助早期团队梳理 AI 产品体验和隐私边界');
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('vibecard_profile') || '')).not.toContain('不要对陌生人透露');
    const boundary = await page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_owner_memories') || '[]').find((item: { kind: string }) => item.kind === 'boundary'));
    expect(boundary).toMatchObject({ visibility: 'private', status: 'confirmed' });
  });

  test('loads a legacy wallet-bearing profile without restoring Web3 UI', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('vibecard_profile', JSON.stringify({
        name: 'Legacy User',
        handle: 'legacy-user',
        avatar: '',
        bio: 'An existing v1 profile',
        tags: [],
        highlights: [],
        contacts: [],
        verified: {
          wallet: '0x1234567890abcdef1234567890abcdef12345678',
          walletProof: {
            address: '0x1234567890abcdef1234567890abcdef12345678',
            message: 'legacy proof',
            signature: '0xlegacy',
            signedAt: 1,
          },
          twitter: '',
          discord: '',
          wechat: '',
          telegram: '',
        },
        threads: [],
      }));
    });
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Legacy User' })).toBeVisible();
    await expect(page.getByText('钱包')).toHaveCount(0);
    await expect(page.getByTestId('verify-wallet-button')).toHaveCount(0);
  });
});
