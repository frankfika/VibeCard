import { test, expect } from '@playwright/test';

/**
 * Full profile sync loop against a local Hardhat node (advanced Web3 surface).
 *
 * Playwright's webServer starts `scripts/e2e-hardhat.js`, but its readiness
 * probe for `http://127.0.0.1:8545` does not reliably wait for the node and
 * the contract deployment inside that script (observed 2026-07-19: tests
 * started while nothing listened on 8545). So this spec waits for real chain
 * state itself before driving the page: first for the RPC to answer, then
 * for the registry bytecode to exist at the deterministic first-deploy
 * address (CONTRACT_ADDRESS[hardhat] in src/lib/web3/config.ts).
 */

const RPC_URL = 'http://127.0.0.1:8545';
const REGISTRY = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc ${method} http ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

async function waitFor(label: string, fn: () => Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await fn()) return;
    } catch {
      /* node not up yet */
    }
    if (Date.now() > deadline) throw new Error(`${label}: timed out after ${timeoutMs}ms`);
    await new Promise(r => setTimeout(r, 500));
  }
}

test.describe('Blockchain sync', () => {
  test.setTimeout(180000);

  test.beforeAll(async () => {
    await waitFor('hardhat rpc', async () => typeof (await rpc('eth_blockNumber')) === 'string', 120000);
    await waitFor(
      'registry deployed',
      async () => {
        const code = (await rpc('eth_getCode', [REGISTRY, 'latest'])) as string;
        return typeof code === 'string' && code !== '0x' && code.length > 2;
      },
      120000,
    );
  });

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
