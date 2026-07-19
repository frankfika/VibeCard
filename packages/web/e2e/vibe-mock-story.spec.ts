import { test, expect } from '@playwright/test';

/**
 * Task 0.4 — the four-screen mock story, driven entirely by shared fixtures.
 *
 *   Owner Card -> Owner Vibe conversation -> Visitor Vibe conversation
 *   -> Connection request detail -> Vibe matched
 *
 * The visitor flow runs against a base64 shared-profile URL (the same format
 * CardPage's share drawer produces).
 */

const demoProfile = {
  name: '林舟',
  handle: 'linzhou',
  avatar: '',
  bio: '在做一张会越来越懂你的 AI 名片',
  tags: [{ label: 'AI', icon: '' }],
  lookingFor: '真正做过 AI 社交产品的人',
  event: '',
  highlights: [],
  threads: [],
  // A contact value the public page must never render.
  contacts: [{ platform: 'wechat', value: 'secret-wechat-id', url: '' }],
  verified: { wallet: '', twitter: '', discord: '', wechat: '', telegram: '' },
};

function encodeProfile(profile: object): string {
  const json = JSON.stringify(profile);
  const base64 = Buffer.from(encodeURIComponent(json), 'utf-8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '.');
}

test.describe('VibeCard mock story (task 0.4)', () => {
  test('owner vibe conversation proposes a memory and remembers it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Vibe' }).click();

    // Task 3.3: the Vibe's callback to an earlier memory is anchored to real state
    await expect(page.getByTestId('memory-callback')).toContainText('最近在打磨 VibeCard 的访客对话');

    // Chat remains usable alongside the proposal
    await page.getByPlaceholder('和你的 Vibe 说点什么…').fill('最近在想隐私边界怎么做。');
    await page.getByTestId('vibe-send').click();
    await expect(page.locator('text=最近在想隐私边界怎么做。')).toBeVisible();

    await expect(page.getByTestId('memory-proposal')).toBeVisible();
    await page.getByTestId('proposal-remember').click();
    // Task 3.3: "I remembered…" appears as a Vibe message after owner confirmation
    await expect(page.getByTestId('remember-moment')).toContainText('我记住了：你最近更想认识真正做过 AI 社交产品的人。');
    await expect(page.locator('text=已记住 · 4')).toBeVisible();
    await expect(page.locator('li', { hasText: '你最近更想认识真正做过 AI 社交产品的人。' })).toBeVisible();
  });

  test('owner can edit or reject a proposed memory', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Vibe' }).click();
    await page.getByTestId('proposal-edit').click();
    await page.getByTestId('memory-proposal').locator('input').fill('想认识做过 AI 社交产品、也在意隐私的人。');
    await page.getByRole('button', { name: '确认' }).click();
    await expect(page.locator('text=想认识做过 AI 社交产品、也在意隐私的人。').first()).toBeVisible();
  });

  test('owner handles a connection request through to Vibe matched', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: '请求' }).click();
    await page.getByTestId('request-item').click();

    const detail = page.getByTestId('request-detail');
    await expect(detail).toContainText('为什么想认识你');
    await expect(detail).toContainText('我觉得你们值得聊一次。');
    await expect(detail).toContainText('仍不确定');

    await page.getByTestId('request-connect').click();
    await expect(page.getByTestId('confirm-connect')).toBeDisabled();
    await page.getByTestId('contact-wechat').click();
    await page.getByTestId('confirm-connect').click();
    await expect(page.getByTestId('vibe-matched')).toContainText('Vibe matched.');
  });

  test('visitor talks to the public vibe and submits a specific reason', async ({ page }) => {
    await page.goto(`/?c=${encodeProfile(demoProfile)}`);

    // Contact details are never visible on the public card
    await expect(page.locator('text=secret-wechat-id')).toHaveCount(0);

    await page.getByTestId('chat-with-vibe').click();
    const chat = page.getByTestId('visitor-vibe-chat');
    await expect(chat).toContainText('的 AI 分身');

    // A grounded question gets a grounded answer
    await page.getByRole('button', { name: '他为什么做这个？' }).click();
    await expect(chat).toContainText('他最近在做的方向是');

    // Submit a specific reason and confirm it
    await page.getByTestId('visitor-input').fill('我也在开发个人 AI 小程序，想交流私人记忆与公开身份的边界。');
    await page.getByTestId('visitor-send').click();
    // Task 3.3: the Vibe surfaces the concrete shared context it found
    await expect(page.getByTestId('shared-context-discovery')).toContainText('发现共同点');
    await expect(page.getByTestId('shared-context-discovery')).toContainText('都在研究私人记忆和公开身份的边界');
    await expect(page.getByTestId('request-preview')).toContainText('你想认识他的理由');
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('request-done')).toContainText('是否认识，由他决定');

    // Still no contact details anywhere after submission
    await expect(page.locator('text=secret-wechat-id')).toHaveCount(0);
  });

  test('a weak request gets an honest not-enough-information take (task 4.3)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: '请求' }).click();

    // The demo inbox carries one strong and one deliberately weak request
    await expect(page.getByTestId('request-item')).toBeVisible();
    await expect(page.getByTestId('request-item-weak')).toBeVisible();

    await page.getByTestId('request-item-weak').click();
    const detail = page.getByTestId('request-detail');
    await expect(detail).toContainText('想认识一下，多个朋友多条路。');
    await expect(page.getByTestId('vibe-take')).toContainText('我还判断不好，信息不太够。');
    // No shared context is shown when none exists — no invented common ground
    await expect(detail).not.toContainText('可能的共同点');

    // Declining the weak one leaves the strong one actionable
    await page.getByTestId('request-decline').click();
    await page.getByText('返回').click();
    await expect(page.getByTestId('request-item-weak')).toHaveCount(0);
    await expect(page.getByTestId('request-item')).toBeVisible();
  });

  test('visitor free-form questions get honest uncertainty, not invention', async ({ page }) => {
    await page.goto(`/?c=${encodeProfile(demoProfile)}`);
    await page.getByTestId('chat-with-vibe').click();
    await page.getByTestId('visitor-input').fill('他年收入多少？');
    await page.getByTestId('visitor-send').click();
    await expect(page.getByTestId('visitor-vibe-chat')).toContainText('我不想替他猜');
  });

  test('public card with agent disabled offers no chat entry (task 3.4)', async ({ page }) => {
    await page.goto(`/?c=${encodeProfile({ ...demoProfile, agentEnabled: false })}`);
    await expect(page.getByTestId('vibe-disabled')).toContainText('他的分身暂时在休息');
    await expect(page.getByTestId('chat-with-vibe')).toHaveCount(0);
  });

  test('recognition moments still work with reduced motion enabled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('tab', { name: '请求' }).click();
    await page.getByTestId('request-item').click();
    await page.getByTestId('request-connect').click();
    await page.getByTestId('contact-wechat').click();
    await page.getByTestId('confirm-connect').click();
    // MotionConfig reducedMotion="user" makes the matched transition instant;
    // the moment itself must still arrive.
    await expect(page.getByTestId('vibe-matched')).toContainText('Vibe matched.');
  });
});
