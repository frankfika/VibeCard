/**
 * requests 页拉黑流程（任务 3.2）
 *
 * 验收点：
 * - 点击「不再接收 TA 的消息」先弹 wx.showModal 确认（标题/确认按钮文案）
 * - 确认后云模式调 requests.blockVisitor（action + requestId），toast 提示，请求状态变 decline
 * - 云端失败时 toast「操作失败，请稍后再试」，请求状态不变
 * - demo 模式本地模拟：不调云，状态变 decline，toast 提示
 *
 * 运行：cd packages/miniprogram && node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert');

const PAGE_PATH = require.resolve('../miniprogram/pages/requests/requests.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');

// ---- 可控的云函数 stub ----
const cloudCalls = [];
let nextCloudResult = { ok: true, result: { request: { ownerAction: 'decline' } } };
const cloudStub = {
  callFunction: async (name, data) => {
    cloudCalls.push([name, data]);
    return nextCloudResult;
  },
};
require.cache[CLOUD_PATH] = {
  id: CLOUD_PATH,
  filename: CLOUD_PATH,
  loaded: true,
  exports: cloudStub,
};

// ---- 小程序全局 stub ----
const toasts = [];
let modalOpts = null;
global.wx = {
  showToast: (opts) => {
    toasts.push((opts && opts.title) || '');
  },
  showModal: (opts) => {
    modalOpts = opts;
  },
};
let pageDef = null;
global.Page = (def) => {
  pageDef = def;
};

require(PAGE_PATH);
assert.ok(pageDef, 'page definition captured');

const flush = () => new Promise((r) => setImmediate(r));
async function flushAll(n = 6) {
  for (let i = 0; i < n; i++) await flush();
}

function makePage({ demoMode } = {}) {
  const page = Object.create(pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  const request = {
    id: 'req-1',
    visitorName: '苏晴',
    visitorAvatarUrl: '',
    visitorSummary: '苏晴，独立开发者，做过 AI 记账小程序。',
    reason: '我也在开发个人 AI 小程序，想交流一次权限设计。',
    possibleSharedContext: ['都在做微信生态里的个人 AI 产品'],
    timeText: '1 小时前',
    ownerAction: 'pending',
    statusText: '待你决定',
  };
  page.demoMode = !!demoMode;
  page.data.demoMode = !!demoMode;
  page.data.view = 'detail';
  page.data.currentRequest = request;
  page.data.requestsList = [request];
  return page;
}

test('云模式拉黑：showModal 确认 -> blockVisitor -> toast + 状态变 decline', async () => {
  cloudCalls.length = 0;
  toasts.length = 0;
  modalOpts = null;
  nextCloudResult = { ok: true, result: { request: { ownerAction: 'decline' } } };

  const page = makePage({ demoMode: false });
  page.onBlockVisitor();

  assert.ok(modalOpts, 'wx.showModal 被调用');
  assert.strictEqual(modalOpts.title, '不再接收 TA 的消息？');
  assert.strictEqual(modalOpts.confirmText, '不再接收');
  assert.match(modalOpts.content, /无法再与你的 Vibe 对话/);
  assert.strictEqual(cloudCalls.length, 0, '确认前不调云');

  modalOpts.success({ confirm: true });
  await flushAll();

  const blockCall = cloudCalls.find(([name, data]) => name === 'requests' && data.action === 'blockVisitor');
  assert.ok(blockCall, 'blockVisitor 被调用');
  assert.strictEqual(blockCall[1].requestId, 'req-1', '携带正确的 requestId');
  assert.ok(toasts.includes('已不再接收 TA 的消息'), 'toast 提示');
  assert.strictEqual(page.data.currentRequest.ownerAction, 'decline', '请求状态变 decline');
  assert.strictEqual(page.data.currentRequest.statusText, '已礼貌回绝');
  assert.strictEqual(page.data.acting, false);
});

test('云模式拉黑失败：toast 操作失败，请求状态不变', async () => {
  toasts.length = 0;
  nextCloudResult = { ok: false, error: { code: 'forbidden', message: 'not owner' } };

  const page = makePage({ demoMode: false });
  page.onBlockVisitor();
  modalOpts.success({ confirm: true });
  await flushAll();

  assert.ok(toasts.includes('操作失败，请稍后再试'), '失败 toast');
  assert.strictEqual(page.data.currentRequest.ownerAction, 'pending', '请求状态保持 pending');
});

test('取消确认：不调云，状态不变', async () => {
  cloudCalls.length = 0;
  const page = makePage({ demoMode: false });
  page.onBlockVisitor();
  modalOpts.success({ confirm: false });
  await flushAll();
  assert.strictEqual(cloudCalls.length, 0, '取消后不调用 blockVisitor');
  assert.strictEqual(page.data.currentRequest.ownerAction, 'pending');
});

test('demo 模式拉黑：本地模拟，不调云', async () => {
  cloudCalls.length = 0;
  toasts.length = 0;
  const page = makePage({ demoMode: true });
  page.onBlockVisitor();
  assert.ok(modalOpts, 'demo 模式同样先确认');
  modalOpts.success({ confirm: true });
  await flushAll();

  assert.strictEqual(cloudCalls.length, 0, 'demo 模式不调云');
  assert.ok(toasts.includes('已不再接收 TA 的消息'), 'toast 提示');
  assert.strictEqual(page.data.currentRequest.ownerAction, 'decline', 'fixture 请求状态变 decline');
  assert.strictEqual(page.data.requestsList[0].ownerAction, 'decline', '列表角标同步');
});

test('已处理的请求不响应拉黑入口', async () => {
  modalOpts = null;
  const page = makePage({ demoMode: false });
  page.data.currentRequest.ownerAction = 'connect';
  page.onBlockVisitor();
  assert.strictEqual(modalOpts, null, 'connect 状态不弹确认框');
});
