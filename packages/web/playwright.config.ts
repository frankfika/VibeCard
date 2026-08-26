import { defineConfig, devices } from '@playwright/test';

const E2E_APP_PORT = 4179;
const E2E_CARD_API_PORT = 4180;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${E2E_APP_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  expect: {
    timeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: [
    {
      command: `NAMECARD_SERVER_PORT=${E2E_CARD_API_PORT} npm run dev -- --port ${E2E_APP_PORT}`,
      url: `http://localhost:${E2E_APP_PORT}`,
      reuseExistingServer: false,
      timeout: 120 * 1000,
    },
  ],
});
