import { test, expect } from '@playwright/test';

const IM_USER_AGENTS = [
  {
    name: 'WeChat',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.42(0x18002a2c) NetType/WIFI Language/zh_CN',
    expectedTip: '微信内置浏览器限制',
  },
  {
    name: 'Telegram',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 TelegramWebview',
    expectedTip: 'Telegram内置浏览器限制',
  },
  {
    name: 'Discord',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Discord',
    expectedTip: 'Discord内置浏览器限制',
  },
  {
    name: 'LINE',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line',
    expectedTip: 'LINE内置浏览器限制',
  },
  {
    name: 'Twitter',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter',
    expectedTip: 'Twitter/X内置浏览器限制',
  },
];

test.describe('IM Browser Detection', () => {
  for (const im of IM_USER_AGENTS) {
    test(`shows notice in ${im.name} browser`, async ({ browser }) => {
      const context = await browser.newContext({
        userAgent: im.ua,
        viewport: { width: 390, height: 844 },
      });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.locator(`text=${im.expectedTip}`).first()).toBeVisible();
      await context.close();
    });
  }
});
