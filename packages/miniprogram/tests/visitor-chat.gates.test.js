/**
 * visitor-chat 页 visitorMessage 闸门错误码处理（任务 3.2）
 *
 * 验收点：
 * - blocked      -> 分身温和收尾（固定文案），ended=true
 * - rate_limited -> 分身消息直接使用云端 message，ended=true
 * - 其他失败（回归）-> CLOUD_FALLBACK_REPLY，ended=false，guided=true
 * - demo 模式不受影响（回归）
 *
 * 运行：cd packages/miniprogram && node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert');

const PAGE_PATH = require.resolve('../miniprogram/pages/visitor-chat/visitor-chat.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');

// ---- 可控的云函数 stub ----
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
global.wx = {
  showToast: () => {},
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
  page.data.stage = 'chat';
  page.data.messages = [{ id: 'm0', role: 'agent', text: '我是林舟的 AI 分身。' }];
  page.data.inputValue = '他最近在忙什么？';
  return page;
}

function lastMessage(page) {
  return page.data.messages[page.data.messages.length - 1];
}

test('blocked：分身温和收尾，ended=true', async () => {
  nextCloudResult = { ok: false, error: { code: 'blocked', message: '对方暂时无法接收消息' } };
  const page = makePage();
  page.onSend();
  await flushAll();

  assert.strictEqual(page.data.ended, true, '对话结束');
  const last = lastMessage(page);
  assert.strictEqual(last.role, 'agent');
  assert.strictEqual(last.text, '他暂时不方便接收新消息，这次就先聊到这里。谢谢你的认真。');
  assert.strictEqual(page.data.guided, false, '不再引导填写理由');
  assert.strictEqual(page.sending, false);
});

test('rate_limited：分身消息使用云端 message，ended=true', async () => {
  nextCloudResult = { ok: false, error: { code: 'rate_limited', message: '今天聊得够多了，明天再来吧' } };
  const page = makePage();
  page.onSend();
  await flushAll();

  assert.strictEqual(page.data.ended, true, '对话结束，明天才能继续');
  const last = lastMessage(page);
  assert.strictEqual(last.role, 'agent');
  assert.strictEqual(last.text, '今天聊得够多了，明天再来吧', '直接转达云端温和提示');
  assert.strictEqual(page.sending, false);
});

test('round_limit：服务端六轮上限结束对话并引导具体理由', async () => {
  nextCloudResult = { ok: false, error: { code: 'round_limit', message: '这次先聊到这里，你可以把具体理由告诉我' } };
  const page = makePage();
  page.onSend();
  await flushAll();
  assert.strictEqual(page.data.ended, true);
  assert.strictEqual(page.data.guided, true);
  assert.match(lastMessage(page).text, /具体理由/);
});

test('visitor moderation 失败：不伪造模型回复，保留重试语义', async () => {
  for (const code of ['moderation_blocked', 'moderation_unavailable']) {
    nextCloudResult = { ok: false, error: { code } };
    const page = makePage();
    page.onSend();
    await flushAll();
    assert.strictEqual(page.data.ended, false);
    assert.match(lastMessage(page).text, code === 'moderation_blocked' ? /换一种说法/ : /稍后重试/);
  }
});

test('其他失败（回归）：CLOUD_FALLBACK_REPLY，ended=false，guided=true', async () => {
  nextCloudResult = { ok: false, error: { code: 'provider_unavailable', message: 'down' } };
  const page = makePage();
  page.onSend();
  await flushAll();

  assert.strictEqual(page.data.ended, false);
  assert.strictEqual(page.data.guided, true);
  const last = lastMessage(page);
  assert.match(last.text, /连不上/);
});

test('demo 模式不受影响（回归）：本地兜底回复，不 ended', async () => {
  const page = makePage();
  page.demoMode = true;
  page.onSend();
  await flushAll();

  assert.strictEqual(page.data.ended, false);
  const last = lastMessage(page);
  assert.strictEqual(last.role, 'agent');
  assert.match(last.text, /不会编/);
});
