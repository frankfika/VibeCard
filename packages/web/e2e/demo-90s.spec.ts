import { test, expect } from '@playwright/test';

/**
 * Task 4.4 — executable rehearsal of the 90-second demo in PRODUCT.md §17.
 *
 * Every beat of the script is driven end-to-end on the deterministic fixture
 * demo, and the whole walkthrough must finish well within the 90-second
 * budget. Beats are numbered to match the product script:
 *
 *   1. owner tells the Vibe who they want to meet
 *   2. the Vibe remembers it (only after owner confirmation)
 *   3. a judge opens the shared Card and asks the public Vibe
 *   4. the Vibe answers from real public state
 *   5. the judge gives a specific reason to connect
 *   6. the owner gets an evidence-based take
 *   7. the owner chooses to connect
 *   8. Vibe matched — with owner-selected contact sharing
 */

const demoProfile = {
  demoFixtureId: 'vibecard-official-fixture-v1',
  name: '林舟',
  handle: '在做一张会越来越懂你的 AI 名片',
  avatar: '',
  bio: '把「先理解，再认识」做成一个真正可用的产品，最近在打磨访客和分身的前六轮对话。',
  tags: [{ label: 'AI', icon: '' }],
  lookingFor: '真正做过 AI 社交产品的人',
  event: '',
  highlights: [],
  threads: [],
  contacts: [{ platform: 'wechat', value: 'secret-wechat-id', url: '' }],
  verified: { wallet: '', twitter: '', discord: '', wechat: '', telegram: '' },
};

function encodeProfile(profile: object): string {
  const json = JSON.stringify(profile);
  const base64 = Buffer.from(encodeURIComponent(json), 'utf-8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '.');
}

test('90-second demo (PRODUCT.md §17) fits the budget and hits every beat', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' }));
    localStorage.setItem('vibecard_demo_mode', '1');
  });
  const startedAt = Date.now();

  // 1-2. Owner conversation: the Vibe already proposed the memory; the owner
  // confirms, and the Vibe says "我记住了…" — memory is learned only through
  // confirmation.
  await page.goto('/');
  await page.getByRole('tab', { name: 'Vibe' }).click();
  await expect(page.getByTestId('memory-proposal')).toContainText('你最近更想认识真正做过 AI 社交产品的人');
  await page.getByTestId('proposal-remember').click();
  await expect(page.getByTestId('remember-moment')).toContainText('我记住了：你最近更想认识真正做过 AI 社交产品的人');

  // The Vibe suggests a Card change, but the public Card stays untouched
  // until the owner sees the draft and explicitly adopts it.
  await page.getByTestId('generate-card-draft').click();
  const cardDraft = page.getByTestId('card-draft-preview');
  await expect(cardDraft).toContainText('正在做个人 AI、也认真对待隐私边界的产品创造者');
  await page.getByTestId('card-draft-accept').click();
  await expect(page.getByTestId('card-draft-applied')).toBeVisible();
  await page.getByRole('tab', { name: '名片' }).click();
  await expect(page.getByText('找: 正在做个人 AI、也认真对待隐私边界的产品创造者')).toBeVisible();

  // 3-4. The judge opens the shared Card and gets a grounded answer from the
  // public Vibe — contact details never appear.
  await page.goto(`/?c=${encodeProfile(demoProfile)}&demo=1`);
  await expect(page.locator('text=secret-wechat-id')).toHaveCount(0);
  await page.getByTestId('chat-with-vibe').click();
  const chat = page.getByTestId('visitor-vibe-chat');
  await expect(chat).toContainText('林舟的 AI 分身');
  await page.getByRole('button', { name: '他为什么做这个？' }).click();
  await expect(chat).toContainText('他最近在做的方向是');

  // 5. The judge states a specific reason; the Vibe surfaces the real shared
  // context and asks for confirmation before anything is "sent".
  await page.getByTestId('visitor-input').fill('我也在开发个人 AI 小程序，最近卡在私人记忆与公开身份的边界，希望交流一次权限设计。');
  await page.getByTestId('visitor-send').click();
  await expect(page.getByTestId('shared-context-discovery')).toContainText('发现共同点');
  await page.getByTestId('request-submit').click();
  await expect(page.getByTestId('request-done')).toContainText('是否认识，由他决定');

  // 6-7. The owner sees the evidence-based take and chooses to connect.
  await page.goto('/');
  await page.getByRole('tab', { name: '请求' }).click();
  await page.getByTestId('request-item').click();
  await expect(page.getByTestId('vibe-take')).toContainText('我觉得你们值得聊一次。');
  await page.getByTestId('request-connect').click();

  // 8. Contact sharing is explicitly owner-controlled before Vibe matched.
  await expect(page.getByTestId('confirm-connect')).toBeDisabled();
  await page.getByTestId('contact-wechat').click();
  await page.getByTestId('confirm-connect').click();
  await expect(page.getByTestId('vibe-matched')).toContainText('Vibe matched.');
  await expect(page.getByTestId('vibe-matched')).toContainText('微信');

  const seconds = (Date.now() - startedAt) / 1000;
  console.log(`DEMO_RUNTIME_SECONDS=${seconds.toFixed(1)}`);
  expect(seconds).toBeLessThan(90);
});
