/**
 * vibe 页识别时刻（任务 3.3）
 *
 * 验收点：
 * - 确认记忆成功后追加「我记住了：…」agent 消息（含「改一下」后的内容），不再有 toast
 * - demo 模式与云模式行为一致；确认失败仍 toast「没存上，再试一次」
 * - 「别记这个」路径保持「好的，这条我不会记住。」不变（回归）
 * - ownerMessage 带 referencedMemoryIds 时，agent 消息带 memoryRefs，
 *   content 来自已加载的已确认记忆；全查不到则不带该字段
 *
 * 运行：cd packages/miniprogram && node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert');

const PAGE_PATH = require.resolve('../miniprogram/pages/vibe/vibe.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');

// ---- 可控的云函数 stub ----
const cloudCalls = [];
let cloudImpl = async () => ({});
const cloudStub = {
  callFunction: async (name, data) => {
    cloudCalls.push([name, data]);
    return cloudImpl(name, data);
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

function makePage({ demoMode } = {}) {
  const page = Object.create(pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  // vibe 页使用 'proposal.state' 这类点路径 setData
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
  page.demoMode = !!demoMode;
  page.conversationId = '';
  page.sending = false;
  page.data.messages = [];
  page.data.memories = [];
  page.data.proposal = {
    id: 'proposal-1',
    memoryId: demoMode ? '' : 'mem-1',
    text: '你最近更想认识真正做过 AI 社交产品的人。',
    state: 'pending',
    editText: '',
  };
  return page;
}

function lastMessage(page) {
  return page.data.messages[page.data.messages.length - 1];
}

test('demo 模式确认记忆：追加「我记住了：…」且无 toast', async () => {
  toasts.length = 0;
  const page = makePage({ demoMode: true });
  await page.onRememberProposal();

  const last = lastMessage(page);
  assert.strictEqual(last.role, 'vibe');
  assert.strictEqual(last.text, '我记住了：你最近更想认识真正做过 AI 社交产品的人。');
  assert.strictEqual(toasts.length, 0, '确认成功不再弹 toast');
  assert.strictEqual(page.data.proposal.state, 'confirmed');
  assert.strictEqual(page.data.memories.length, 1, '记忆进入「已记住」列表');
});

test('demo 模式「改一下」后确认：消息用修改后的内容', async () => {
  toasts.length = 0;
  const page = makePage({ demoMode: true });
  page.onEditProposal();
  page.onProposalEditInput({ detail: { value: '想认识真正做过 AI 社交产品、也踩过坑的人。' } });
  await page.onSaveEditedProposal();

  assert.strictEqual(lastMessage(page).text, '我记住了：想认识真正做过 AI 社交产品、也踩过坑的人。');
  assert.strictEqual(toasts.length, 0);
});

test('云模式确认记忆：追加「我记住了：…」且无 toast', async () => {
  toasts.length = 0;
  cloudCalls.length = 0;
  cloudImpl = async (name, data) => {
    if (name === 'memory' && data.action === 'confirmMemory') return {};
    if (name === 'memory' && data.action === 'listMemories') {
      return { memories: [{ _id: 'mem-1', content: '你最近更想认识真正做过 AI 社交产品的人。', visibility: 'private' }] };
    }
    throw new Error('unexpected: ' + name);
  };
  const page = makePage({ demoMode: false });
  await page.onRememberProposal();

  assert.ok(cloudCalls.some(([n, d]) => n === 'memory' && d.action === 'confirmMemory' && d.memoryId === 'mem-1'));
  assert.strictEqual(lastMessage(page).text, '我记住了：你最近更想认识真正做过 AI 社交产品的人。');
  assert.strictEqual(toasts.length, 0);
});

test('云模式确认失败：toast「没存上，再试一次」，不追加确认消息', async () => {
  toasts.length = 0;
  cloudImpl = async () => {
    throw new Error('network down');
  };
  const page = makePage({ demoMode: false });
  await page.onRememberProposal();

  assert.ok(toasts.includes('没存上，再试一次'));
  assert.strictEqual(page.data.messages.length, 0, '失败时不追加「我记住了」消息');
  assert.strictEqual(page.data.proposal.state, 'pending', '提议保持 pending 可重试');
});

test('「别记这个」回归：仍是「好的，这条我不会记住。」', async () => {
  const page = makePage({ demoMode: true });
  await page.onDismissProposal();
  assert.strictEqual(lastMessage(page).text, '好的，这条我不会记住。');
  assert.strictEqual(page.data.proposal, null);
});

test('ownerMessage 带 referencedMemoryIds：消息带 memoryRefs，内容来自已确认记忆', async () => {
  cloudImpl = async (name, data) => {
    if (name === 'memory' && data.action === 'appendMessage') return { conversationId: 'conv-1' };
    if (name === 'agent' && data.action === 'ownerMessage') {
      return {
        ok: true,
        result: {
          reply: '这和你之前在打磨的访客对话是同一件事。',
          referencedMemoryIds: ['mem-a', 'mem-unknown'],
        },
      };
    }
    throw new Error('unexpected: ' + name);
  };
  const page = makePage({ demoMode: false });
  page.data.proposal = null;
  page.data.memories = [
    { id: 'mem-a', content: '最近在打磨 VibeCard 的访客对话，重点是怎么在六轮内判断一次认识值不值得发生。', visibilityLabel: '已公开' },
    { id: 'mem-b', content: '另一条记忆', visibilityLabel: '仅自己可见' },
  ];
  page.data.inputValue = '我最近在想怎么判断一次认识值不值得';
  await page.onSend();

  const last = lastMessage(page);
  assert.strictEqual(last.role, 'vibe');
  assert.ok(Array.isArray(last.memoryRefs), '消息带 memoryRefs');
  assert.strictEqual(last.memoryRefs.length, 1, '查不到的 id 被跳过');
  assert.strictEqual(last.memoryRefs[0].id, 'mem-a');
  assert.strictEqual(last.memoryRefs[0].content, '最近在打磨 VibeCard 的访客对话，重点是怎么在六轮内判断一次认识值不值得发生。');
  assert.ok(last.memoryRefs[0].short.length <= 41, 'short 截断到 40 字+省略号');
});

test('referencedMemoryIds 全查不到：消息不带 memoryRefs 字段', async () => {
  cloudImpl = async (name, data) => {
    if (name === 'memory' && data.action === 'appendMessage') return { conversationId: 'conv-1' };
    if (name === 'agent' && data.action === 'ownerMessage') {
      return { ok: true, result: { reply: '普通回复。', referencedMemoryIds: ['mem-x'] } };
    }
    throw new Error('unexpected: ' + name);
  };
  const page = makePage({ demoMode: false });
  page.data.proposal = null;
  page.data.inputValue = '随便聊聊';
  await page.onSend();

  const last = lastMessage(page);
  assert.strictEqual(last.text, '普通回复。');
  assert.strictEqual(last.memoryRefs, undefined, '全查不到时不带 memoryRefs');
});
