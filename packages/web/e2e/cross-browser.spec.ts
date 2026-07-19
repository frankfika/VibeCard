import { test, expect } from '@playwright/test';

// Task 0.2: main navigation is now 名片 / 请求 / Vibe. Legacy 动态 / 更多
// entries (Threads, Games, Discover, Points) no longer appear.
test.describe('Cross-browser compatibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/vibecard/);
    await expect(page.getByRole('tab', { name: '名片' })).toBeVisible();
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
    await page.getByRole('tab', { name: '请求' }).click();
    await expect(page.locator('text=还没有人想认识你').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Vibe' }).click();
    await expect(page.locator('text=你的私有 Vibe').first()).toBeVisible();
  });
});
