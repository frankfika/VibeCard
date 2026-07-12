import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('500')) console.log('[console.error]', m.text()); });

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
// clear localStorage in case previous test left state
await page.evaluate(() => {
  localStorage.removeItem('vibecard_isSetup');
  localStorage.removeItem('vibecard_profile');
});
await page.reload({ waitUntil: 'networkidle' });

await page.screenshot({ path: '/tmp/stage-a-1-welcome.png' });
console.log('1. welcome OK');

const headerTitle = await page.locator('header h1').first().textContent().catch(() => 'N/A');
console.log('   mobile header title (welcome):', headerTitle);

await page.click('text=开始');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/stage-a-2-name-handle.png' });

// step 0: name + signature
await page.locator('input[placeholder*="你的名字"]').first().fill('Test User');
await page.locator('input[placeholder*="一句话介绍"]').first().fill('co-founder looking for design partner');
await page.click('text=继续');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/stage-a-3-bio-tags.png' });

// step 1: bio + special tags
await page.locator('textarea').first().fill('测试一段 bio,看看名片样式');
await page.click('text=继续');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/stage-a-3b-bio-mbti.png' });

// step 2: 身份标签 (tags) — add a custom tag
await page.locator('input[placeholder*="标签"]').first().fill('Builder');
await page.click('text=添加');
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/stage-a-4-tags.png' });
await page.click('text=继续');
await page.waitForTimeout(400);

// step 3: highlights
await page.locator('input[placeholder*="一句话"]').first().fill('2024 hackathon 第一');
await page.click('text=继续');
await page.waitForTimeout(400);

// step 4: event + lookingFor (NEW)
await page.screenshot({ path: '/tmp/stage-a-5-event-lookingfor.png' });
const eventInput = page.locator('input[placeholder*="ETHGlobal"]');
await eventInput.fill('ETHGlobal Singapore 2024');
const lookingForInput = page.locator('input[placeholder*="co-founder"]');
await lookingForInput.fill('co-founder');
await page.screenshot({ path: '/tmp/stage-a-6-event-filled.png' });

// complete
await page.click('text=完成');
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/stage-a-7-card-after-onboarding.png' });
console.log('7. card after onboarding OK');

// === Test share drawer (Bug 1+2) ===
await page.click('text=分享我的名片');
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/stage-a-8-share-drawer.png' });

// tap "面对面扫码" to test QR (Bug 2)
await page.click('text=面对面扫码');
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/stage-a-9-qr-modal.png' });
console.log('9. QR modal OK');

// close
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// === Test 404 page (Bug 5) ===
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page2 = await ctx2.newPage();
await page2.goto('http://localhost:3000/?id=notexist', { waitUntil: 'networkidle' });
await page2.screenshot({ path: '/tmp/stage-a-10-404.png' });
console.log('10. 404 OK');

await browser.close();
console.log('\nDONE');
