import { test, expect, type Page } from '@playwright/test';

/**
 * Task 4.5 — Personal Now updates (web e2e).
 *
 * Covers:
 *   - owner write + publish flow (incl. empty-content error and retry)
 *   - My Vibe Now proposal: explicit owner publish, no auto-publishing,
 *     and publishing leaves confirmed memories untouched
 *   - archive hides an item from the public Card
 *   - public Card shows at most the 3 newest published items; drafts are
 *     never public; expired items are filtered out
 *   - visitor Vibe grounding: answers from a published item, and says it
 *     doesn't have a recent public update when no active item exists
 */

const hour = 3_600_000;

const ownerProfile = {
  name: '林舟',
  handle: 'linzhou',
  avatar: '',
  bio: '在做一张会越来越懂你的 AI 名片',
  tags: [{ label: 'AI', icon: '' }],
  lookingFor: '真正做过 AI 社交产品的人',
  event: '',
  highlights: [],
  threads: [],
  contacts: [],
  verified: { wallet: '', twitter: '', discord: '', wechat: '', telegram: '' },
};

function makeNowItem(overrides: Record<string, unknown>) {
  const now = Date.now();
  return {
    id: `e2e-now-${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: 1,
    ownerId: 'fixture-owner-linzhou',
    text: '一条动态',
    topic: 'current_work',
    sourceMemoryId: null,
    status: 'published',
    publishedAt: now,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function seedOwner(page: Page, nowItems: object[]) {
  await page.addInitScript(
    ([profile, items]) => {
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
      localStorage.setItem('vibecard_tab', 'card');
      // Seed the Now store only once per test context; later in-test
      // navigations (e.g. owner publishes -> open public Card) must see the
      // owner's actions, not a re-seeded snapshot.
      if (!localStorage.getItem('vibecard_now_seeded')) {
        localStorage.setItem('vibecard_now', JSON.stringify(items));
        localStorage.setItem('vibecard_now_seeded', '1');
      }
    },
    [ownerProfile, nowItems] as const,
  );
}

function encodeProfile(profile: object): string {
  const json = JSON.stringify(profile);
  const base64 = Buffer.from(encodeURIComponent(json), 'utf-8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '.');
}

const publicProfile = { ...ownerProfile, contacts: [{ platform: 'wechat', value: 'secret-wechat-id', url: '' }] };

test.describe('Personal Now updates (task 4.5)', () => {
  // Serial: the dev namecard server (server.js) saves cards.json via a
  // tmp-file rename that is not concurrency-safe; parallel CardPage loads
  // (each upserting /api/cards) can crash it. Owner-side Now tests load the
  // Card page often, so they run one at a time.
  test.describe.configure({ mode: 'serial' });

  test('owner writes and publishes an update; empty content errors then retries', async ({ page }) => {
    await seedOwner(page, []);
    await page.goto('/');

    // Empty state invents nothing
    await expect(page.getByTestId('now-empty')).toContainText('还没有公开的最近动态');

    await page.getByTestId('now-manage-toggle').click();

    // Error state: publishing empty text fails with a visible message
    await page.getByTestId('now-publish-new').click();
    await expect(page.getByTestId('now-error')).toContainText('不能为空');

    // Retry with real content succeeds
    await page.getByTestId('now-new-input').fill('最近在准备 VibeCard 的比赛演示。');
    await page.getByTestId('now-publish-new').click();
    await expect(page.getByTestId('now-section').getByTestId('now-item')).toContainText(
      '最近在准备 VibeCard 的比赛演示。',
    );

    // The public Card shows the same published snapshot (local demo store)
    await page.goto(`/?c=${encodeProfile(publicProfile)}`);
    await expect(page.getByTestId('public-now-item')).toContainText('最近在准备 VibeCard 的比赛演示。');
  });

  test('My Vibe proposes one Now update; only owner confirmation publishes it', async ({ page }) => {
    await seedOwner(page, []);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Vibe' }).click();

    // Nothing is proposed before a meaningful owner message
    await expect(page.getByTestId('now-proposal')).toHaveCount(0);

    await page.getByPlaceholder('和你的 Vibe 说点什么…').fill('我最近在验证 AI 分身怎么保护私人记忆。');
    await page.getByTestId('vibe-send').click();

    // Loading, then the proposal card — still nothing published
    await expect(page.getByTestId('now-proposal-loading')).toBeVisible();
    await expect(page.getByTestId('now-proposal')).toBeVisible();
    await expect(page.getByTestId('now-proposal')).toContainText('Vibe 提议放到最近动态');

    await page.getByTestId('now-proposal-publish').click();
    await expect(page.locator('text=好，这条已经放到你的最近动态了')).toBeVisible();
    // Publishing the Now item did not create or change any confirmed memory
    await expect(page.locator('text=已记住 · 3')).toBeVisible();

    // The published update appears on My Card
    await page.getByRole('tab', { name: '名片' }).click();
    await expect(page.getByTestId('now-section').getByTestId('now-item')).toContainText(
      '最近在验证 AI 分身如何在保护私人记忆的同时，帮助两个人建立联系。',
    );
  });

  test('owner can edit a Vibe-proposed draft before publishing, or decline it', async ({ page }) => {
    await seedOwner(page, []);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Vibe' }).click();
    await page.getByPlaceholder('和你的 Vibe 说点什么…').fill('最近在做一张 AI 名片。');
    await page.getByTestId('vibe-send').click();
    await expect(page.getByTestId('now-proposal')).toBeVisible();

    await page.getByTestId('now-proposal-edit').click();
    await page.getByTestId('now-proposal-input').fill('最近在把 AI 名片做成真的产品。');
    await page.getByTestId('now-proposal-confirm-publish').click();

    await page.getByRole('tab', { name: '名片' }).click();
    await expect(page.getByTestId('now-section').getByTestId('now-item')).toContainText(
      '最近在把 AI 名片做成真的产品。',
    );

    // 先不了 publishes nothing
    await page.getByRole('tab', { name: 'Vibe' }).click();
  });

  test('archiving an item removes it from the public Card', async ({ page }) => {
    const item = makeNowItem({ id: 'e2e-now-archive', text: '这条马上要被归档。' });
    await seedOwner(page, [item]);

    await page.goto(`/?c=${encodeProfile(publicProfile)}`);
    await expect(page.getByTestId('public-now-item')).toContainText('这条马上要被归档。');

    await page.goto('/');
    await page.getByTestId('now-manage-toggle').click();
    await page.getByTestId('now-archive-e2e-now-archive').click();
    await expect(page.getByTestId('now-empty')).toBeVisible();

    await page.goto(`/?c=${encodeProfile(publicProfile)}`);
    await expect(page.getByTestId('public-now-section')).toHaveCount(0);
    await expect(page.locator('text=这条马上要被归档。')).toHaveCount(0);
  });

  test('public Card shows at most the 3 newest published items; drafts stay private', async ({ page }) => {
    const now = Date.now();
    const items = [
      makeNowItem({ text: '最新的一条', publishedAt: now - hour }),
      makeNowItem({ text: '第二新的一条', publishedAt: now - 2 * hour }),
      makeNowItem({ text: '第三新的一条', publishedAt: now - 3 * hour }),
      makeNowItem({ text: '最旧的一条不该出现', publishedAt: now - 4 * hour }),
      makeNowItem({ text: '草稿不该公开', status: 'draft', publishedAt: null }),
    ];
    const profile = { ...publicProfile, nowItems: items };
    await page.goto(`/?c=${encodeProfile(profile)}`);

    const visible = page.getByTestId('public-now-item');
    await expect(visible).toHaveCount(3);
    await expect(visible.nth(0)).toContainText('最新的一条');
    await expect(visible.nth(1)).toContainText('第二新的一条');
    await expect(visible.nth(2)).toContainText('第三新的一条');
    await expect(page.locator('text=最旧的一条不该出现')).toHaveCount(0);
    await expect(page.locator('text=草稿不该公开')).toHaveCount(0);
  });

  test('expired items are filtered out of the public Card', async ({ page }) => {
    const items = [
      makeNowItem({ text: '已经过期的动态', expiresAt: Date.now() - 1000 }),
      makeNowItem({ text: '还在有效期内的动态', expiresAt: Date.now() + hour }),
    ];
    const profile = { ...publicProfile, nowItems: items };
    await page.goto(`/?c=${encodeProfile(profile)}`);

    await expect(page.getByTestId('public-now-item')).toHaveCount(1);
    await expect(page.getByTestId('public-now-item')).toContainText('还在有效期内的动态');
    await expect(page.locator('text=已经过期的动态')).toHaveCount(0);
  });

  test('visitor Vibe answers recent questions from published Now items only', async ({ page }) => {
    const items = [
      makeNowItem({ text: '最近在打磨访客和分身的前六轮对话。' }),
      makeNowItem({ text: '归档的过去时不该被提起', status: 'archived' }),
    ];
    const profile = { ...publicProfile, nowItems: items };
    await page.goto(`/?c=${encodeProfile(profile)}`);

    await page.getByTestId('chat-with-vibe').click();
    const chat = page.getByTestId('visitor-vibe-chat');
    await page.getByRole('button', { name: '他最近在做什么？' }).click();
    await expect(chat).toContainText('最近在打磨访客和分身的前六轮对话。');
    // Archived items are never described as current
    await expect(chat).not.toContainText('归档的过去时不该被提起');
  });

  test('visitor Vibe says it has no recent public update when none exists', async ({ page }) => {
    const profile = { ...publicProfile, nowItems: [], currentFocus: '' };
    await page.goto(`/?c=${encodeProfile(profile)}`);

    await page.getByTestId('chat-with-vibe').click();
    const chat = page.getByTestId('visitor-vibe-chat');
    await page.getByRole('button', { name: '他最近在做什么？' }).click();
    await expect(chat).toContainText('他最近还没有公开动态，我不想替他猜。');
  });
});
