import { test, expect } from '@playwright/test';

test.describe('Blockchain sync', () => {
  test('completes full profile sync loop on Hardhat', async ({ page }) => {
    await page.goto('/e2e/chain-sync');

    const runBtn = page.locator('[data-testid="e2e-run"]');
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    const result = page.locator('[data-testid="e2e-result"]');
    await expect(result).toHaveAttribute('data-passed', 'true', { timeout: 60000 });
    await expect(page.locator('text=PASS: full chain sync loop verified')).toBeVisible();
  });
});
