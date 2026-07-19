/**
 * visitor-chat 提交连接请求的审核结果处理（任务 3.1）
 *
 * 验收点：UI can retry without losing typed content。
 * - moderation_blocked    -> 退回理由编辑页，已输入的理由不丢
 * - moderation_unavailable -> 停在预览页并提示稍后重试，草稿不丢
 * - weak_reason（回归）    -> 分身追问，草稿不丢
 *
 * 运行：node --test packages/miniprogram/tests/
 */
const test = require('node:test');
const assert = require('node:assert');

const PAGE_PATH = require.resolve('../miniprogram/pages/visitor-chat/visitor-chat.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');

// ---- 可控的云函数 stub：nextCloudResult 决定下一次 createRequest 的返回 ----
let nextCloudResult = { ok: true, result: {} };
const cloudStub = {
  callFunction: async () => nextCloudResult,
};
require.cache[CLOUD_PATH] = {
  id: CLOUD_PATH,
  filename: CLOUD_PATH,
  loaded: true,
  exports: cloudStub,
};

// ---- 小程序全局 stub ----
const toasts = [];
global.wx = {
  showToast: (opts) => {
    toasts.push((opts && opts.title) || '');
  },
};
let pageDef = null;
global.Page = (def) => {
  pageDef = def;
};

require(PAGE_PATH);
assert.ok(pageDef, 'page definition captured');

function makePage() {
  const page = Object.create(pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  page.ownerId = 'owner-1';
  page.demoMode = false;
  page.sending = false;
  page.roundCount = 0;
  // 访客已经写好的理由（ typed content ）
  page.data.stage = 'preview';
  page.data.reasonValue = '我也在维护一个开源项目，想交流协作经验';
  page.data.preview = { visitorName: '一位访客', reason: page.data.reasonValue, possibleSharedContext: [] };
  return page;
}

test('moderation_blocked: 退回理由编辑，草稿保留', async () => {
  nextCloudResult = { ok: false, error: { code: 'moderation_blocked', message: 'unsafe' } };
  const page = makePage();
  await page.onSubmitRequest();
  assert.strictEqual(page.data.stage, 'reason');
  assert.match(page.data.reasonHint, /换一种说法/);
  assert.strictEqual(page.data.reasonValue, '我也在维护一个开源项目，想交流协作经验', 'typed draft preserved');
  assert.strictEqual(page.sending, false);
});

test('moderation_unavailable: 停在预览页提示重试，草稿保留', async () => {
  toasts.length = 0;
  nextCloudResult = { ok: false, error: { code: 'moderation_unavailable', message: 'down' } };
  const page = makePage();
  await page.onSubmitRequest();
  assert.strictEqual(page.data.stage, 'preview', 'stays on preview so the visitor can retry');
  assert.ok(page.data.preview && page.data.preview.reason === '我也在维护一个开源项目，想交流协作经验');
  assert.ok(toasts.some((t) => t.includes('稍后重试')), 'retry hint toast shown');
  assert.strictEqual(page.sending, false);
});

test('weak_reason 回归: 分身追问，草稿保留', async () => {
  nextCloudResult = { ok: false, error: { code: 'weak_reason', message: 'too vague' } };
  const page = makePage();
  await page.onSubmitRequest();
  assert.strictEqual(page.data.stage, 'reason');
  assert.match(page.data.reasonHint, /具体的理由/);
  assert.strictEqual(page.data.reasonValue, '我也在维护一个开源项目，想交流协作经验');
  assert.strictEqual(page.sending, false);
});
