/**
 * visitor-chat 页「共同点发现」时刻（任务 3.3）
 *
 * 验收点：
 * - visitorMessage 返回 sharedContext 时，agent 消息带该字段，latestSharedContext 更新
 * - buildPreview 云模式用 latestSharedContext 填充 preview.possibleSharedContext
 * - 无 sharedContext 时消息不带字段，preview.possibleSharedContext 保持 []
 * - demo 模式引导消息带 fixture 真实共同点（发现样式数据一致）
 *
 * 运行：cd packages/miniprogram && node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert');

const PAGE_PATH = require.resolve('../miniprogram/pages/visitor-chat/visitor-chat.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');

// ---- 可控的云函数 stub ----
let cloudImpl = async () => ({ ok: true, result: {} });
const cloudStub = {
  callFunction: async (name, data) => cloudImpl(name, data),
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
async function flushAll(n = 8) {
  for (let i = 0; i < n; i++) await flush();
}

function makePage({ demoMode } = {}) {
  const page = Object.create(pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  page.ownerId = 'owner-1';
  page.demoMode = !!demoMode;
  page.sending = false;
  page.roundCount = 0;
  page.data.stage = 'chat';
  page.data.messages = [];
  page.data.inputValue = '他最近在忙什么？';
  return page;
}

function lastMessage(page) {
  return page.data.messages[page.data.messages.length - 1];
}

test('云模式：sharedContext 挂在 agent 消息上，latestSharedContext 更新并进预览', async () => {
  const shared = ['都在做微信生态里的个人 AI 产品', '都在研究私人记忆和公开身份的边界'];
  cloudImpl = async (name, data) => {
    if (name === 'agent' && data.action === 'visitorMessage') {
      return { ok: true, result: { reply: '他最近在打磨 VibeCard 的访客对话。', evidenceRefs: [], nextAction: 'continue', sharedContext: shared } };
    }
    throw new Error('unexpected: ' + name);
  };
  const page = makePage({ demoMode: false });
  page.onSend();
  await flushAll();

  const last = lastMessage(page);
  assert.strictEqual(last.role, 'agent');
  assert.deepStrictEqual(last.sharedContext, shared, '消息带 sharedContext');
  assert.deepStrictEqual(page.data.latestSharedContext, shared, 'latestSharedContext 更新');

  page.setData({ reasonValue: '我也在开发个人 AI 小程序，想交流一次权限设计。' });
  page.buildPreview();
  assert.strictEqual(page.data.stage, 'preview');
  assert.deepStrictEqual(page.data.preview.possibleSharedContext, shared, '预览的共同点来自真实对话');
});

test('云模式：无 sharedContext 时消息不带字段，预览共同点为 []', async () => {
  cloudImpl = async (name, data) => {
    if (name === 'agent' && data.action === 'visitorMessage') {
      return { ok: true, result: { reply: '这个我还不能确定。', evidenceRefs: [], nextAction: 'continue' } };
    }
    throw new Error('unexpected: ' + name);
  };
  const page = makePage({ demoMode: false });
  page.onSend();
  await flushAll();

  const last = lastMessage(page);
  assert.strictEqual(last.sharedContext, undefined, '无交集时消息不带 sharedContext');
  assert.deepStrictEqual(page.data.latestSharedContext, []);

  page.setData({ reasonValue: '我也在开发个人 AI 小程序，想交流一次权限设计。' });
  page.buildPreview();
  assert.deepStrictEqual(page.data.preview.possibleSharedContext, []);
});

test('云模式：sharedContext 超过 3 条会被截断', async () => {
  cloudImpl = async (name, data) => {
    if (name === 'agent' && data.action === 'visitorMessage') {
      return { ok: true, result: { reply: '回复。', evidenceRefs: [], nextAction: 'continue', sharedContext: ['a', 'b', 'c', 'd'] } };
    }
    throw new Error('unexpected: ' + name);
  };
  const page = makePage({ demoMode: false });
  page.onSend();
  await flushAll();
  assert.deepStrictEqual(page.data.latestSharedContext, ['a', 'b', 'c'], '最多保留 3 条');
});

test('demo 模式：引导消息带 fixture 真实共同点', async () => {
  const page = makePage({ demoMode: true });
  page.onSend();
  page.setData({ inputValue: '他能帮上什么忙？' });
  page.onSend();
  // 引导消息在 350ms setTimeout 后追加
  await new Promise((r) => setTimeout(r, 450));

  const guide = page.data.messages[page.data.messages.length - 1];
  assert.strictEqual(page.data.guided, true);
  assert.match(guide.text, /你为什么偏偏想在现在认识他/);
  assert.deepStrictEqual(
    guide.sharedContext,
    ['都在做微信生态里的个人 AI 产品', '都在研究私人记忆和公开身份的边界'],
    '引导消息带 fixture 共同点'
  );
  assert.deepStrictEqual(page.data.latestSharedContext, guide.sharedContext);
});
