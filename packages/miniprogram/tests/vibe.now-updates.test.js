/**
 * vibe 页「最近动态」测试（任务 4.5）
 *
 * 验收点：
 * - 主人手写动态：先存草稿（createNowDraft），发布是独立的显式操作
 * - Vibe 提议 Now 草稿：ownerMessage 带 nowProposal -> createNowDraft ->
 *   提议卡片；「发布」「改一下再发布」「先不发」三条路径
 * - 归档 / 隐藏 / 删除走 now 云函数并刷新列表
 * - demo 模式（fixture）下提议-确认流程行为一致，以 FIXTURE_NOW 为时间锚点
 *
 * 运行：cd packages/miniprogram && node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert');

const PAGE_PATH = require.resolve('../miniprogram/pages/vibe/vibe.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');
const FIXTURES_PATH = require.resolve('../miniprogram/data/vibe-fixtures.js');

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
async function flushAll(n = 12) {
  for (let i = 0; i < n; i++) await flush();
}

function makePage({ demoMode } = {}) {
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
  page.demoMode = !!demoMode;
  page.conversationId = '';
  page.sending = false;
  page.data.messages = [];
  if (demoMode) page.loadFixtureNowItems();
  return page;
}

test('主人手写动态：先存草稿，云函数收到 createNowDraft，不自动发布', async () => {
  cloudCalls.length = 0;
  toasts.length = 0;
  cloudImpl = async (name, data) => {
    if (name === 'now' && data.action === 'createNowDraft') {
      return {
        nowItem: {
          _id: 'now-new-1',
          ownerId: 'owner',
          text: data.text,
          topic: data.topic,
          status: 'draft',
          publishedAt: null,
          expiresAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
      };
    }
    if (name === 'now' && data.action === 'listNowItems') {
      return { nowItems: [{ _id: 'now-new-1', text: '最近在打磨访客对话', topic: 'current_work', status: 'draft', updatedAt: 2 }] };
    }
    throw new Error('unexpected: ' + name + ' ' + data.action);
  };
  const page = makePage({ demoMode: false });
  page.onNowComposerInput({ detail: { value: '最近在打磨访客对话' } });
  await page.onCreateNowDraft();

  const creates = cloudCalls.filter(([n, d]) => n === 'now' && d.action === 'createNowDraft');
  assert.strictEqual(creates.length, 1);
  assert.strictEqual(creates[0][1].text, '最近在打磨访客对话');
  assert.strictEqual(creates[0][1].topic, 'current_work');
  // 没有任何发布动作随创建一起发生
  assert.ok(!cloudCalls.some(([n, d]) => n === 'now' && d.action === 'publishNowItem'));
  assert.strictEqual(page.data.nowItems[0].status, 'draft');
  assert.ok(toasts.includes('已存为草稿'));
});

test('主人显式发布 / 归档 / 隐藏 / 删除：都走 now 云函数对应动作', async () => {
  cloudCalls.length = 0;
  cloudImpl = async (name, data) => {
    if (name === 'now' && data.action === 'listNowItems') {
      return { nowItems: [{ _id: 'now-1', text: '一条动态', topic: 'current_work', status: 'published', publishedAt: 1, updatedAt: 1 }] };
    }
    if (name === 'now') return {};
    throw new Error('unexpected: ' + name);
  };
  const page = makePage({ demoMode: false });
  await page.onPublishNow({ currentTarget: { dataset: { id: 'now-1' } } });
  await page.onArchiveNow({ currentTarget: { dataset: { id: 'now-1' } } });
  await page.onHideNow({ currentTarget: { dataset: { id: 'now-1' } } });
  await page.onDeleteNow({ currentTarget: { dataset: { id: 'now-1' } } });

  const actions = cloudCalls.filter(([n]) => n === 'now').map(([, d]) => d.action);
  for (const expected of ['publishNowItem', 'archiveNowItem', 'hideNowItem', 'deleteNowItem']) {
    assert.ok(actions.includes(expected), expected + ' should be called');
  }
  for (const [, d] of cloudCalls.filter(([n]) => n === 'now')) {
    if (d.action !== 'listNowItems') assert.strictEqual(d.nowId, 'now-1');
  }
});

test('Vibe 提议 Now 草稿：ownerMessage -> createNowDraft -> 提议卡片 pending', async () => {
  cloudCalls.length = 0;
  cloudImpl = async (name, data) => {
    if (name === 'memory' && data.action === 'appendMessage') return { conversationId: 'conv-1' };
    if (name === 'agent' && data.action === 'ownerMessage') {
      return {
        ok: true,
        result: {
          reply: '这件事值得放到你的最近动态。',
          memoryProposal: null,
          cardUpdateSuggested: false,
          nowProposal: { text: '最近在验证 AI 分身的边界设计', topic: 'current_work', expiresAt: null },
        },
      };
    }
    if (name === 'now' && data.action === 'createNowDraft') {
      return { nowItem: { _id: 'now-prop-1', text: data.text, topic: data.topic, status: 'draft', updatedAt: 1 } };
    }
    if (name === 'now' && data.action === 'listNowItems') {
      return { nowItems: [{ _id: 'now-prop-1', text: '最近在验证 AI 分身的边界设计', topic: 'current_work', status: 'draft', updatedAt: 1 }] };
    }
    throw new Error('unexpected: ' + name + ' ' + data.action);
  };
  const page = makePage({ demoMode: false });
  page.onInput({ detail: { value: '最近在验证 AI 分身的边界设计' } });
  await page.onSend();

  const creates = cloudCalls.filter(([n, d]) => n === 'now' && d.action === 'createNowDraft');
  assert.strictEqual(creates.length, 1);
  assert.strictEqual(creates[0][1].text, '最近在验证 AI 分身的边界设计');
  assert.ok(page.data.nowProposal, 'proposal card appears');
  assert.strictEqual(page.data.nowProposal.state, 'pending');
  assert.strictEqual(page.data.nowProposal.nowId, 'now-prop-1');
  // Vibe 只创建了草稿，没有任何发布动作
  assert.ok(!cloudCalls.some(([n, d]) => n === 'now' && d.action === 'publishNowItem'));
});

test('主人确认发布提议：publishNowItem 被调用，卡片进入已发布态', async () => {
  cloudCalls.length = 0;
  cloudImpl = async (name, data) => {
    if (name === 'now' && data.action === 'listNowItems') {
      return { nowItems: [{ _id: 'now-prop-1', text: '最近在验证 AI 分身的边界设计', topic: 'current_work', status: 'published', publishedAt: 2, updatedAt: 2 }] };
    }
    if (name === 'now') return {};
    throw new Error('unexpected: ' + name + ' ' + data.action);
  };
  const page = makePage({ demoMode: false });
  page.data.nowProposal = { id: 'np-1', nowId: 'now-prop-1', text: '最近在验证 AI 分身的边界设计', topic: 'current_work', state: 'pending', editText: '' };
  await page.onPublishNowProposal();

  assert.ok(cloudCalls.some(([n, d]) => n === 'now' && d.action === 'publishNowItem' && d.nowId === 'now-prop-1'));
  assert.strictEqual(page.data.nowProposal.state, 'published');
  const last = page.data.messages[page.data.messages.length - 1];
  assert.ok(last.text.includes('已发布到你的最近动态'));
});

test('「改一下」后确认发布：先 editNowItem 再 publishNowItem，内容用修改后的', async () => {
  cloudCalls.length = 0;
  const order = [];
  cloudImpl = async (name, data) => {
    if (name === 'now') {
      order.push(data.action);
      if (data.action === 'listNowItems') return { nowItems: [] };
      return {};
    }
    throw new Error('unexpected: ' + name);
  };
  const page = makePage({ demoMode: false });
  page.data.nowProposal = { id: 'np-1', nowId: 'now-prop-1', text: '原文', topic: 'current_work', state: 'pending', editText: '' };
  page.onEditNowProposal();
  page.onNowProposalEditInput({ detail: { value: '改过后的动态文字' } });
  await page.onSaveEditedNowProposal();

  const editIdx = order.indexOf('editNowItem');
  const publishIdx = order.indexOf('publishNowItem');
  assert.ok(editIdx !== -1 && publishIdx !== -1 && editIdx < publishIdx, 'edit happens before publish');
  const editCall = cloudCalls.find(([n, d]) => n === 'now' && d.action === 'editNowItem');
  assert.strictEqual(editCall[1].text, '改过后的动态文字');
  assert.strictEqual(page.data.nowProposal.state, 'published');
  assert.strictEqual(page.data.nowProposal.text, '改过后的动态文字');
});

test('「先不发」：草稿保留在列表里，不发生发布', async () => {
  cloudCalls.length = 0;
  const page = makePage({ demoMode: false });
  page.data.nowProposal = { id: 'np-1', nowId: 'now-prop-1', text: '原文', topic: 'current_work', state: 'pending', editText: '' };
  page.onDismissNowProposal();

  assert.strictEqual(page.data.nowProposal, null);
  assert.ok(!cloudCalls.some(([n, d]) => n === 'now' && d.action === 'publishNowItem'));
  assert.ok(toasts.includes('已存为草稿，想发的时候再发'));
});

test('demo 模式：fixture 列表按 fixture 世界渲染，已删除项不出现', async () => {
  const page = makePage({ demoMode: true });
  const ids = page.data.nowItems.map((n) => n.id);
  assert.ok(ids.includes('fixture-now-draft'));
  assert.ok(ids.includes('fixture-now-archived'));
  assert.ok(ids.includes('fixture-now-hidden'));
  assert.ok(!ids.includes('fixture-now-deleted'), 'deleted tombstone never renders');
});

test('demo 模式：主人说出最近动态 -> Vibe 提议 -> 主人发布，全程本地确定性', async () => {
  const page = makePage({ demoMode: true });
  page.onInput({ detail: { value: '最近在打磨 VibeCard 的访客对话' } });
  await page.onSend();
  // demo 回复经过 setTimeout(400ms)，用真实等待驱动
  await new Promise((r) => setTimeout(r, 500));
  await flushAll();

  assert.ok(page.data.nowProposal, 'demo proposal appears');
  assert.strictEqual(page.data.nowProposal.state, 'pending');
  const draftId = page.data.nowProposal.nowId;
  assert.ok(page.data.nowItems.some((n) => n.id === draftId && n.status === 'draft'));

  await page.onPublishNowProposal();
  assert.strictEqual(page.data.nowProposal.state, 'published');
  const published = page.data.nowItems.find((n) => n.id === draftId);
  assert.strictEqual(published.status, 'published');
  assert.strictEqual(published.statusLabel, '已发布');
});
