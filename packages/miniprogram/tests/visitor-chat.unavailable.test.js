/**
 * visitor-chat 初始化失败类型区分（任务 3.4）
 *
 * 验收点：
 * - getPublicCard 返回 card_deleted / not_found -> 终态 unavailable，不回退演示
 * - card.agentEnabled === false -> 分身休息终态
 * - 普通网络错误 -> 保持回退 fixture 演示（回归）
 * - getPublicCard 正常 -> 云模式对话（回归，投影字段来自 result.card）
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

const flush = () => new Promise((r) => setImmediate(r));
async function flushAll(n = 8) {
  for (let i = 0; i < n; i++) await flush();
}

function makePage() {
  const page = Object.create(pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  return page;
}

test('card_deleted：终态「这张名片已被主人收回」，不回退演示', async () => {
  toasts.length = 0;
  cloudImpl = async () => ({ ok: false, error: { code: 'card_deleted', message: 'gone' } });
  const page = makePage();
  page.onLoad({ ownerId: 'owner-1' });
  await flushAll();

  assert.strictEqual(page.demoMode, false, '未回退 demo');
  assert.strictEqual(page.data.stage, 'unavailable');
  assert.strictEqual(page.data.unavailableTitle, '这张名片已被主人收回');
  assert.strictEqual(page.data.unavailableDesc, '可以请对方重新分享一次');
  assert.strictEqual(page.data.messages.length, 0, '不追加任何对话');
});

test('not_found：终态「这张名片找不到了」', async () => {
  cloudImpl = async () => ({ ok: false, error: { code: 'not_found', message: 'no owner' } });
  const page = makePage();
  page.onLoad({ ownerId: 'owner-1' });
  await flushAll();

  assert.strictEqual(page.data.stage, 'unavailable');
  assert.strictEqual(page.data.unavailableTitle, '这张名片找不到了');
  assert.strictEqual(page.demoMode, false);
  assert.strictEqual(page.data.messages.length, 0);
});

test('agentEnabled === false：分身休息终态，无输入阶段', async () => {
  cloudImpl = async () => ({ ok: true, result: { card: { name: '林舟', agentEnabled: false } } });
  const page = makePage();
  page.onLoad({ ownerId: 'owner-1' });
  await flushAll();

  assert.strictEqual(page.data.stage, 'unavailable');
  assert.match(page.data.unavailableTitle, /休息/);
  assert.strictEqual(page.demoMode, false);
  assert.strictEqual(page.data.messages.length, 0, '分身休息时不产生对话');
});

test('普通网络错误：仍回退 fixture 演示（回归）', async () => {
  cloudImpl = async () => {
    throw new Error('network down');
  };
  const page = makePage();
  page.onLoad({ ownerId: 'owner-1' });
  await flushAll();

  assert.strictEqual(page.demoMode, true, '网络失败回退 demo');
  assert.strictEqual(page.data.stage, 'chat');
  assert.strictEqual(page.data.messages.length, 1, 'fixture 开场白');
  assert.match(page.data.messages[0].text, /AI 分身/);
});

test('getPublicCard 正常：云模式对话（回归，读取 result.card 投影）', async () => {
  cloudImpl = async () => ({
    ok: true,
    result: {
      card: {
        name: '林舟',
        agentEnabled: true,
        currentFocus: '在打磨 VibeCard 的访客对话',
        wantsToMeet: ['真正做过 AI 社交产品的人'],
        canHelpWith: ['微信小程序从 0 到 1'],
      },
    },
  });
  const page = makePage();
  page.onLoad({ ownerId: 'owner-1' });
  await flushAll();

  assert.strictEqual(page.demoMode, false);
  assert.strictEqual(page.data.stage, 'chat');
  assert.strictEqual(page.data.ownerName, '林舟');
  assert.strictEqual(page.data.messages.length, 1);
  assert.match(page.data.messages[0].text, /林舟的 AI 分身/);
  assert.strictEqual(page.data.chips.length, 3, '按公开字段生成预设问题');
});

test('getPublicCard unauthorized：toast 请先登录后再试，随后仍回退演示', async () => {
  toasts.length = 0;
  cloudImpl = async () => ({ ok: false, error: { code: 'unauthorized', message: 'login required' } });
  const page = makePage();
  page.onLoad({ ownerId: 'owner-1' });
  await flushAll();

  assert.ok(toasts.includes('请先登录后再试'));
  assert.strictEqual(page.demoMode, true, '初始化阶段未登录仍按现有逻辑回退演示');
});
