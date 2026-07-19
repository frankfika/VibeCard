import { test, expect } from '@playwright/test';

/**
 * Task 4.1: legacy Web3 assertions re-pointed at the surfaces that still
 * exist. The More page, its wallet-connect entry, and the On-Chain
 * Identity / DappRep / Badges cards were removed in task 0.2 — those cases
 * are deleted, not restored. What remains supported lives in the Card
 * page's collapsed advanced area (theme switching + wallet signature
 * verification) plus the embed/widget surfaces and the chain sync loop.
 */

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';

function seedOwnerProfile(page: import('@playwright/test').Page) {
  return page.evaluate((wallet) => {
    const profile = {
      name: 'Test User',
      handle: 'testuser',
      avatar: '',
      bio: 'Test bio',
      tags: [{ label: 'Builder', icon: '' }],
      lookingFor: '',
      highlights: [],
      verified: { wallet, twitter: '', discord: '', wechat: '' },
      event: '',
    };
    localStorage.setItem('vibecard_profile', JSON.stringify(profile));
    localStorage.setItem('vibecard_tab', 'card');
  }, WALLET);
}

test.describe('Blockchain integration', () => {
  test('advanced area hosts theme switching and wallet verification', async ({ page }) => {
    await page.goto('/');
    await seedOwnerProfile(page);
    await page.reload();

    // The advanced area stays collapsed outside the MVP path; open it explicitly.
    const advanced = page.getByTestId('card-advanced');
    await expect(advanced).toBeVisible();
    await advanced.locator('summary').click();

    // Theme switching is always available in the advanced area.
    await expect(advanced.locator('text=点击切换主题')).toBeVisible();

    // A profile with a wallet address but no signature proof gets the
    // signature-verification entry (the still-supported wallet control).
    await expect(page.getByTestId('verify-wallet-button')).toBeVisible();
  });

  test('verified wallet shows as a badge on the owner card', async ({ page }) => {
    await page.goto('/');
    await seedOwnerProfile(page);
    await page.reload();

    // Shortened wallet badge inside the contact section; no contact values.
    await expect(page.locator('text=0x1234…5678')).toBeVisible();
  });

  test('embed view renders without crashing', async ({ page }) => {
    await page.goto('/?address=0x0000000000000000000000000000000000000000');
    await expect(page.locator('text=加载失败').first()).toBeVisible();
    await expect(page.locator('text=未找到该地址的链上名片').first()).toBeVisible();
    await expect(page.locator('text=去创建名片').first()).toBeVisible();
  });

  test('widget.js renders a card and opens modal', async ({ page }) => {
    await page.goto('/widget-demo.html');
    const card = page.locator('button:has-text("查看名片")').first();
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.locator('iframe').first()).toBeVisible();
    await expect(page.locator('button:has-text("×")').first()).toBeVisible();
  });
});
