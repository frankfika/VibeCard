/** Connection decision learning UI (task 2.6). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PAGE_PATH = require.resolve('../miniprogram/pages/requests/requests.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');

const calls = [];
let cloudImpl = async () => ({});
require.cache[CLOUD_PATH] = {
  id: CLOUD_PATH,
  filename: CLOUD_PATH,
  loaded: true,
  exports: {
    callFunction: async (name, data, options) => {
      calls.push([name, data, options]);
      return cloudImpl(name, data, options);
    },
  },
};

const toasts = [];
global.wx = {
  showToast: options => toasts.push(options && options.title),
  getStorageSync: () => '',
};
let pageDef;
global.Page = definition => { pageDef = definition; };
require(PAGE_PATH);

const flush = () => new Promise(resolve => setImmediate(resolve));
async function flushAll(count = 5) {
  for (let index = 0; index < count; index += 1) await flush();
}

function makePage() {
  const page = Object.create(pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  page.setData = function setData(patch) { Object.assign(this.data, patch); };
  page.demoMode = false;
  page.data.currentRequest = {
    id: 'req-1',
    ownerAction: 'pending',
    visitorName: '访客',
  };
  page.data.view = 'detail';
  return page;
}

function proposalMemory() {
  return {
    _id: 'learning-1',
    status: 'proposed',
    kind: 'preference',
    visibility: 'private',
    content: '你更愿意回应带着具体作品来交流的人。',
  };
}

test('决定先成功保存，再按 learningProposalId 读取 proposed memory 展示候选', async () => {
  calls.length = 0;
  cloudImpl = async (name, data) => {
    if (name === 'requests' && data.action === 'actOnRequest') {
      return { ok: true, result: { ownerAction: 'later', learningStatus: 'proposed', learningProposalId: 'learning-1' } };
    }
    if (name === 'memory' && data.action === 'listMemories') return { memories: [proposalMemory()] };
    throw new Error(name + ':' + data.action);
  };
  const page = makePage();
  await page.onLater();
  await flushAll();

  assert.strictEqual(page.data.view, 'later', '连接决定先进入完成态');
  assert.strictEqual(page.data.learningStatus, 'proposed');
  assert.strictEqual(page.data.learningProposal.id, 'learning-1');
  assert.strictEqual(page.data.learningProposal.state, 'pending');
  assert.ok(calls.some(([name, data]) => name === 'memory' && data.action === 'listMemories' && data.status === 'proposed'));
});

test('记住与改一下：confirmMemory 使用候选 id 和主人修改后的内容', async () => {
  calls.length = 0;
  cloudImpl = async (name, data) => {
    if (name === 'memory' && data.action === 'confirmMemory') return { memory: { _id: data.memoryId } };
    throw new Error(name + ':' + data.action);
  };
  const page = makePage();
  page.data.view = 'later';
  page.data.learningProposal = {
    id: 'learning-1', content: proposalMemory().content, visibilityLabel: '仅自己可见', state: 'pending', editText: '',
  };
  page.onEditLearningProposal();
  page.onLearningProposalInput({ detail: { value: '我更愿意回应带着具体作品和问题来交流的人。' } });
  await page.onConfirmLearningProposal();

  const confirm = calls.find(([name, data]) => name === 'memory' && data.action === 'confirmMemory');
  assert.strictEqual(confirm[1].memoryId, 'learning-1');
  assert.strictEqual(confirm[1].content, '我更愿意回应带着具体作品和问题来交流的人。');
  assert.strictEqual(page.data.learningProposal.state, 'confirmed');
  assert.strictEqual(page.data.view, 'later', '学习确认不改变已保存的连接决定');
});

test('别记这个调用 deleteMemory；删除失败仍保留已保存决定和可重试候选', async () => {
  calls.length = 0;
  cloudImpl = async () => { throw new Error('network down'); };
  const page = makePage();
  page.data.view = 'declined';
  page.data.learningProposal = {
    id: 'learning-1', content: proposalMemory().content, visibilityLabel: '仅自己可见', state: 'pending', editText: '',
  };
  await page.onDismissLearningProposal();

  assert.strictEqual(page.data.view, 'declined');
  assert.strictEqual(page.data.learningProposal.state, 'pending');
  assert.match(page.data.learningError, /决定已经保存/);
  assert.ok(calls.some(([name, data]) => name === 'memory' && data.action === 'deleteMemory'));

  cloudImpl = async () => ({ memory: { _id: 'learning-1', status: 'deleted' } });
  await page.onDismissLearningProposal();
  assert.strictEqual(page.data.learningProposal.state, 'dismissed');
  assert.strictEqual(page.data.view, 'declined');
});

test('confirm 失败不回滚连接决定，候选保持 pending/editing 可重试', async () => {
  cloudImpl = async () => { throw new Error('provider unavailable'); };
  const page = makePage();
  page.data.view = 'connected';
  page.data.learningProposal = {
    id: 'learning-1', content: proposalMemory().content, visibilityLabel: '仅自己可见', state: 'pending', editText: '',
  };
  await page.onConfirmLearningProposal();
  assert.strictEqual(page.data.view, 'connected');
  assert.strictEqual(page.data.learningProposal.state, 'pending');
  assert.match(page.data.learningError, /决定已经保存/);
});

test('learning unavailable/not_suggested 不读取 memory，也不阻塞完成态', async () => {
  calls.length = 0;
  const page = makePage();
  page.data.view = 'later';
  await page.loadDecisionLearning({ learningStatus: 'unavailable' });
  assert.strictEqual(page.data.view, 'later');
  assert.strictEqual(page.data.learningProposal, null);
  assert.strictEqual(calls.length, 0);
});

test('模板提供记住 / 改一下 / 别记这个，并明确决定已保存', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/requests/requests.wxml'), 'utf8');
  assert.match(wxml, />记住</);
  assert.match(wxml, />改一下</);
  assert.match(wxml, />别记这个</);
  assert.match(wxml, /连接决定已经保存/);
});
