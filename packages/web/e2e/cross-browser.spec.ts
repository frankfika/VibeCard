import { test, expect } from '@playwright/test';

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
    await expect(page.getByRole('tab', { name: '动态' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '更多' })).toBeVisible();
  });

  test('renders correctly on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.locator('text=vibecard').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: '名片' })).toBeVisible();
  });

  test('tab switching works', async ({ page }) => {
    await page.getByRole('tab', { name: '动态' }).click();
    await expect(page.locator('text=Alex Chen').first()).toBeVisible();
    await page.getByRole('tab', { name: '更多' }).click();
    await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();
    await expect(page.locator('text=发现搭子').first()).toBeVisible();
  });
});
