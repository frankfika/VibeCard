import { test, expect } from '@playwright/test';

test.describe('PWA', () => {
  test('manifest.json is served with required fields', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('application/json');

    const manifest = await page.evaluate(() => fetch('/manifest.json').then(r => r.json()));
    expect(manifest.name).toBe('vibecard');
    expect(manifest.short_name).toBe('vibecard');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toMatch(/standalone|minimal-ui/);
    expect(manifest.icons).toBeInstanceOf(Array);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  test('PWA icons are served', async ({ page }) => {
    for (const size of ['192', '512']) {
      const response = await page.goto(`/icon-${size}.png`);
      expect(response?.status()).toBe(200);
      expect(response?.headers()['content-type']).toBe('image/png');
    }
  });

  test('service worker registers', async ({ page }) => {
    await page.goto('/');
    const registration = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const reg = await navigator.serviceWorker.ready;
      return { scope: reg.scope, active: !!reg.active };
    });
    expect(registration).not.toBeNull();
    expect(registration?.active).toBe(true);
  });
});

test.describe('Theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('vibecard_theme');
      document.documentElement.classList.remove('light', 'dark');
    });
    await page.reload();
    await expect(page.getByRole('tab', { name: '更多' })).toBeVisible();
  });

  test('theme toggle cycles system -> light -> dark', async ({ page }) => {
    await page.getByRole('tab', { name: '更多' }).click();

    const getTheme = () => page.evaluate(() => localStorage.getItem('vibecard_theme'));
    const getHtmlClass = () => page.evaluate(() => {
      const cls = document.documentElement.classList;
      return { light: cls.contains('light'), dark: cls.contains('dark') };
    });

    // Initial state: system (default, not persisted yet)
    await expect(page.locator('text=跟随系统').first()).toBeVisible();
    const initialTheme = await getTheme();
    expect(['system', null]).toContain(initialTheme);

    const toggle = page.locator('button:has-text("点击切换主题")').first();
    await expect(toggle).toBeVisible();

    // First click -> light
    await toggle.click();
    await expect(page.locator('text=浅色模式').first()).toBeVisible();
    expect(await getTheme()).toBe('light');
    const lightClasses = await getHtmlClass();
    expect(lightClasses.light).toBe(true);
    expect(lightClasses.dark).toBe(false);

    // Second click -> dark
    await toggle.click();
    await expect(page.locator('text=深色模式').first()).toBeVisible();
    expect(await getTheme()).toBe('dark');
    const darkClasses = await getHtmlClass();
    expect(darkClasses.light).toBe(false);
    expect(darkClasses.dark).toBe(true);

    // Third click -> system
    await toggle.click();
    await expect(page.locator('text=跟随系统').first()).toBeVisible();
    expect(await getTheme()).toBe('system');
  });

  test('theme persists across reloads', async ({ page }) => {
    await page.getByRole('tab', { name: '更多' }).click();
    await page.locator('button:has-text("点击切换主题")').first().click();
    await expect(page.locator('text=浅色模式').first()).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: '更多' }).click();
    await expect(page.locator('text=浅色模式').first()).toBeVisible();

    const theme = await page.evaluate(() => localStorage.getItem('vibecard_theme'));
    expect(theme).toBe('light');
  });
});
