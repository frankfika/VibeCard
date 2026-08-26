import { test, expect } from '@playwright/test';

const profile = {
  name: 'Offline Owner', handle: 'offline-owner', avatar: '', bio: '', tags: [], lookingFor: '',
  highlights: [], contacts: [], threads: [],
  verified: { wallet: '', twitter: '', discord: '', wechat: '', telegram: '' },
};

test.describe('PWA resilience and accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(value => {
      localStorage.setItem('vibecard_runtime_v1', JSON.stringify({ mode: 'local', endpoint: '', ownerToken: '' }));
      localStorage.setItem('vibecard_profile', JSON.stringify(value));
      if (!localStorage.getItem('vibecard_resilience_seeded')) {
        localStorage.setItem('vibecard_now', '[]');
        localStorage.setItem('vibecard_resilience_seeded', '1');
      }
    }, profile);
  });

  test('owner can publish and reread local state while offline without duplication', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    await page.getByTestId('now-manage-toggle').click();
    await page.getByTestId('now-new-input').fill('这条动态是在离线状态保存的。');
    await page.getByTestId('now-publish-new').click();
    await expect(page.getByTestId('now-item')).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId('now-item')).toHaveCount(1);
    await expect(page.getByTestId('now-item')).toContainText('离线状态保存');
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByTestId('now-item')).toHaveCount(1);
  });

  test('keyboard users can skip directly to the main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: '跳到主要内容' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('a failed future-version migration preserves a recoverable snapshot', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vibecard_storage_version', '999');
      localStorage.setItem('vibecard_profile', '{"name":"recover-me"}');
    });
    await page.goto('/');
    const recovery = await page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_recovery_v1') || 'null'));
    expect(recovery.data.vibecard_profile).toContain('recover-me');
    expect(recovery.reason).toContain('newer VibeCard');
  });

  test('reconnect coalesces repeated offline Card edits instead of duplicating them', async ({ page }) => {
    let online = false;
    let received: Record<string, unknown> | undefined;
    await page.route('https://sync.example.test/api/v1/owner/card', async route => {
      if (!online) {
        await route.abort();
        return;
      }
      received = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');
    const pending = await page.evaluate(async () => {
      const modulePath = '/src/lib/runtime.ts';
      const runtime = await import(modulePath);
      const config = { mode: 'self_hosted' as const, endpoint: 'https://sync.example.test', ownerToken: 'test-token' };
      await runtime.queueOwnerMutation(config, '/card', { method: 'PUT', body: JSON.stringify({ headline: 'first' }) });
      await runtime.queueOwnerMutation(config, '/card', { method: 'PUT', body: JSON.stringify({ headline: 'latest' }) });
      return JSON.parse(localStorage.getItem('vibecard_owner_mutation_queue_v1') || '[]');
    });
    expect(pending).toHaveLength(1);
    expect(JSON.parse(pending[0].body).headline).toBe('latest');
    online = true;
    await page.evaluate(async () => {
      const modulePath = '/src/lib/runtime.ts';
      const runtime = await import(modulePath);
      await runtime.flushOwnerMutations({ mode: 'self_hosted', endpoint: 'https://sync.example.test', ownerToken: 'test-token' });
    });
    expect(received?.headline).toBe('latest');
    const remaining = await page.evaluate(() => JSON.parse(localStorage.getItem('vibecard_owner_mutation_queue_v1') || '[]'));
    expect(remaining).toHaveLength(0);
  });
});
