import { test, expect } from '@playwright/test';

test.describe('Blockchain integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // Task 0.2 removed the More page from main navigation, so the wallet and
  // chain-identity surfaces it hosted are no longer reachable. These two
  // cases stay skipped until Milestone 4.1 re-points them at the advanced
  // area; do not restore the legacy More tab to satisfy them.
  test.skip('wallet connect surface is visible on More page', async ({ page }) => {
    await page.locator('details:has-text("链上锚定") summary').click();
    const walletBtn = page.locator('[data-testid="wallet-connect"], [data-testid="wallet-unconfigured"]');
    await expect(walletBtn).toBeVisible();
  });

  test.skip('chain identity card is visible', async ({ page }) => {
    await expect(page.locator('text=On-Chain Identity').first()).toBeVisible();
    await expect(page.getByText('DappRep', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Badges/)).toBeVisible();
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

  test('verified accounts section is visible on owner card', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const profile = {
        name: 'Test User',
        handle: 'testuser',
        avatar: '',
        bio: 'Test bio',
        tags: [{ label: 'Builder', icon: '' }],
        lookingFor: '',
        highlights: [],
        verified: { wallet: '', twitter: '', discord: '', wechat: '' },
        event: '',
      };
      localStorage.setItem('vibecard_profile', JSON.stringify(profile));
      localStorage.setItem('vibecard_tab', 'card');
    });
    await page.reload();
    await expect(page.locator('text=Verified').first()).toBeVisible();
    await expect(page.locator('text=Wallet').first()).toBeVisible();
  });
});
