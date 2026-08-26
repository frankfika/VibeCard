/**
 * unauthorized 映射（任务 3.4）
 *
 * 验收点：云返回 res.error.code === 'unauthorized' 时，
 * toast「请先登录后再试」并保持当前草稿/页面状态。
 * - requests.loadInbox：不回退演示，列表保持空，页面停留
 * - vibe ownerMessage：不追加「连不上」兜底消息，主人的消息与输入状态保留
 *
 * 运行：cd packages/miniprogram && node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert');

const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');
const REQUESTS_PATH = require.resolve('../miniprogram/pages/requests/requests.js');
const VIBE_PATH = require.resolve('../miniprogram/pages/vibe/vibe.js');

// ---- 可控的云函数 stub（两页共用） ----
let cloudImpl = async () => ({});
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

const flush = () => new Promise((r) => setImmediate(r));
async function flushAll(n = 8) {
  for (let i = 0; i < n; i++) await flush();
}

function makePage() {
  const page = Object.create(pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  page.setData = function (patch) {
    for (const k of Object.keys(patch)) {
      const parts = k.split('.');
      if (parts.length === 1) {
        this.data[k] = patch[k];
        continue;
      }
      let o = this.data;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = patch[k];
    }
  };
  return page;
}

test('requests.loadInbox unauthorized：toast 登录提示，不回退演示', async () => {
  toasts.length = 0;
  cloudImpl = async () => ({ ok: false, error: { code: 'unauthorized', message: 'login required' } });
  require(REQUESTS_PATH);
  const page = makePage();
  page.onLoad();
  await flushAll();

  assert.ok(toasts.includes('请先登录后再试'));
  assert.strictEqual(page.demoMode, false, '未回退 fixture 演示');
  assert.strictEqual(page.data.demoMode, false);
  assert.deepStrictEqual(page.data.requestsList, [], '列表保持空（空收件箱视图）');
  delete require.cache[REQUESTS_PATH];
});

test('requests 网络失败：显示重试错误且不注入 fixture 请求', async () => {
  cloudImpl = async () => { throw new Error('network down'); };
  require(REQUESTS_PATH);
  const page = makePage();
  page.onLoad();
  await flushAll();

  assert.strictEqual(page.demoMode, false);
  assert.deepStrictEqual(page.data.requestsList, []);
  assert.match(page.data.loadError, /重试/);
  delete require.cache[REQUESTS_PATH];
});

test('requests 真实摘要失败：明确不确定且不借用 fixture 理由', async () => {
  cloudImpl = async () => { throw new Error('model down'); };
  require(REQUESTS_PATH);
  const page = makePage();
  page.demoMode = false;
  await page.loadSummary('real-request-1');

  assert.strictEqual(page.data.vibeTake.summary, '我现在还判断不了。');
  assert.deepStrictEqual(page.data.vibeTake.reasons, []);
  assert.match(page.data.vibeTake.uncertainty, /重试/);
  delete require.cache[REQUESTS_PATH];
});

test('vibe 记忆加载失败：显示重试错误且不注入 fixture 私人记忆', async () => {
  cloudImpl = async () => { throw new Error('network down'); };
  require(VIBE_PATH);
  const page = makePage();
  page.demoMode = false;
  await page.loadMemories();

  assert.strictEqual(page.demoMode, false);
  assert.deepStrictEqual(page.data.memories, []);
  assert.deepStrictEqual(page.data.messages, []);
  assert.match(page.data.loadError, /重试/);
  delete require.cache[VIBE_PATH];
});

test('vibe ownerMessage unauthorized：toast 登录提示，不追加兜底消息', async () => {
  toasts.length = 0;
  cloudImpl = async (name, data) => {
    if (name === 'memory' && data.action === 'appendMessage') return { conversationId: 'conv-1' };
    if (name === 'agent' && data.action === 'ownerMessage') {
      return { ok: false, error: { code: 'unauthorized', message: 'login required' } };
    }
    throw new Error('unexpected: ' + name);
  };
  require(VIBE_PATH);
  const page = makePage();
  page.demoMode = false;
  page.conversationId = '';
  page.sending = false;
  page.data.proposal = null;
  page.data.messages = [];
  page.data.inputValue = '我最近想聊聊参赛的事';
  await page.onSend();

  assert.ok(toasts.includes('请先登录后再试'));
  assert.strictEqual(page.data.messages.length, 1, '只有主人自己的消息，没有「连不上」兜底');
  assert.strictEqual(page.data.messages[0].role, 'owner');
  assert.strictEqual(page.sending, false, '发送锁已释放，可重试');
  delete require.cache[VIBE_PATH];
});
