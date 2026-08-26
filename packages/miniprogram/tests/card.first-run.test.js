/**
 * Card 页五问对话式首次 onboarding（任务 1.5）。
 *
 * 覆盖回答/跳过/返回纠正、记忆显式确认与重试去重、边界 private、
 * 中断恢复、空草稿、显式发布和权限错误。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CARD_PATH = require.resolve('../miniprogram/pages/card/card.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');
const FIRST_RUN_PATH = require.resolve('../miniprogram/utils/first-run.js');
const firstRun = require(FIRST_RUN_PATH);

const storage = new Map();
const toasts = [];
let cloudCalls = [];
let cloudImpl = async () => ({});

require.cache[CLOUD_PATH] = {
  id: CLOUD_PATH,
  filename: CLOUD_PATH,
  loaded: true,
  exports: {
    callFunction: async (name, data, options) => {
      cloudCalls.push([name, data, options]);
      return cloudImpl(name, data, options);
    },
  },
};

global.wx = {
  getStorageSync: (key) => storage.has(key) ? storage.get(key) : '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  showToast: (options) => toasts.push(options && options.title),
  getAppBaseInfo: () => ({}),
};

let pageDef;
global.Page = (definition) => { pageDef = definition; };
require(CARD_PATH);
assert.ok(pageDef);

function makePage() {
  const page = Object.create(pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  page.setData = function setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.');
      let target = this.data;
      for (let index = 0; index < parts.length - 1; index += 1) target = target[parts[index]];
      target[parts[parts.length - 1]] = value;
    }
  };
  return page;
}

function reset() {
  storage.clear();
  toasts.length = 0;
  cloudCalls = [];
  cloudImpl = async () => ({});
}

function answer(page, text) {
  page.onFirstRunAnswerInput({ detail: { value: text } });
  page.onAnswerFirstRunQuestion();
}

test('五问是逐轮对话，可跳过并返回纠正；跳过项不进入 review', () => {
  reset();
  const page = makePage();
  page.startFirstRun();
  page.onFirstRunNameInput({ detail: { value: '小林' } });
  page.onStartFirstRun();

  answer(page, '在做一个更有人味的 AI 名片');
  page.onSkipFirstRunQuestion(); // work
  assert.strictEqual(page.data.firstRunQuestion.id, 'help');
  page.onBackFirstRunQuestion();
  assert.strictEqual(page.data.firstRunQuestion.id, 'work');
  answer(page, '独立完成过一个无障碍产品');
  answer(page, '梳理复杂产品的交互');
  answer(page, '认真做过 AI 产品的人');
  page.onSkipFirstRunQuestion(); // boundary

  assert.strictEqual(page.data.firstRunStage, 'memory-review');
  assert.deepStrictEqual(page.firstRunState.reviewIds, ['current', 'work', 'help', 'meet']);
  assert.strictEqual(page.firstRunState.answers.boundary, undefined);
  assert.strictEqual(page.data.firstRunProposal.questionId, 'current');
});

test('隐私边界在创建和确认写入点都强制 private', async () => {
  reset();
  const state = firstRun.emptyState();
  state.name = '小林';
  state.stage = 'memory-review';
  state.answers.boundary = '不要说我的家庭住址';
  state.reviewIds = ['boundary'];
  firstRun.save(wx, state);
  cloudImpl = async (name, data) => {
    if (data.action === 'listMemories') return { memories: [] };
    if (data.action === 'createMemoryProposal') return { memory: { _id: 'mem-boundary' } };
    if (data.action === 'confirmMemory') return { memory: { _id: 'mem-boundary' } };
    if (name === 'agent' && data.action === 'generateCardDraft') {
      return { ok: true, result: { draft: { headline: '不应公开边界' } } };
    }
    throw new Error(name + ':' + data.action);
  };
  const page = makePage();
  page.startFirstRun();
  await page.onConfirmFirstRunMemory();

  const create = cloudCalls.find(([, data]) => data.action === 'createMemoryProposal');
  const confirm = cloudCalls.find(([, data]) => data.action === 'confirmMemory');
  assert.strictEqual(create[1].visibility, 'private');
  assert.strictEqual(confirm[1].visibility, 'private');
  assert.strictEqual(page.data.firstRunStage, 'draft');
  assert.strictEqual(page.data.firstRunDraft.boundary, undefined, '边界绝不进入 Card 草稿');
});

test('显式 demo 本地完成、production 才调用云；边界不进入发布 Profile', async () => {
  reset();
  storage.set('vibecard_demo_mode', '1');
  const state = firstRun.emptyState();
  state.name = '小林';
  state.stage = 'memory-review';
  state.answers.boundary = '不要公开我的住址';
  state.reviewIds = ['boundary'];
  firstRun.save(wx, state);
  cloudImpl = async () => { throw new Error('demo must not call cloud'); };

  const page = makePage();
  page.startFirstRun();
  await page.onConfirmFirstRunMemory();
  assert.strictEqual(cloudCalls.length, 0, '只有显式 demo 走确定性本地分支');
  assert.deepStrictEqual(page.data.firstRunDraft, { name: '小林' });
  page.onPublishFirstRunCard();
  const published = storage.get('vibecard_profile');
  assert.doesNotMatch(JSON.stringify(published), /不要公开我的住址/);
  assert.strictEqual(published.boundary, undefined);
});

test('确认失败后恢复 pending memoryId，重试不会重复 create proposal', async () => {
  reset();
  const state = firstRun.emptyState();
  state.name = '小林';
  state.stage = 'memory-review';
  state.answers.current = '在做 VibeCard';
  state.reviewIds = ['current'];
  firstRun.save(wx, state);
  let confirms = 0;
  cloudImpl = async (name, data) => {
    if (data.action === 'listMemories') return { memories: [] };
    if (data.action === 'createMemoryProposal') return { memory: { _id: 'mem-current' } };
    if (data.action === 'confirmMemory') {
      confirms += 1;
      if (confirms === 1) throw new Error('network down');
      return { memory: { _id: 'mem-current' } };
    }
    if (name === 'agent' && data.action === 'generateCardDraft') {
      return { ok: true, result: { draft: { currentFocus: '在做 VibeCard' } } };
    }
    throw new Error(name + ':' + data.action);
  };
  const page = makePage();
  page.startFirstRun();
  await page.onConfirmFirstRunMemory();
  assert.match(page.data.firstRunError, /重试/);
  assert.strictEqual(page.firstRunState.memoryDecisions.current.memoryId, 'mem-current');

  await page.onConfirmFirstRunMemory();
  assert.strictEqual(cloudCalls.filter(([, data]) => data.action === 'createMemoryProposal').length, 1);
  assert.strictEqual(page.firstRunState.memoryDecisions.current.decision, 'confirmed');
  assert.strictEqual(page.data.firstRunStage, 'draft');
});

test('Card 草稿走 generateCardDraft，并只投影已确认且未跳过的问题字段', async () => {
  reset();
  const state = firstRun.emptyState();
  state.name = '小林';
  state.stage = 'memory-review';
  state.answers.current = '在做 VibeCard';
  state.answers.help = '能帮人梳理产品';
  state.answers.meet = '认真做 AI 的人';
  state.reviewIds = ['current', 'help', 'meet'];
  state.reviewIndex = 2;
  state.memoryDecisions.current = { decision: 'confirmed', memoryId: 'mem-current', content: '在做 VibeCard', visibility: 'public' };
  state.memoryDecisions.help = { decision: 'dismissed' };
  firstRun.save(wx, state);
  cloudImpl = async (name, data) => {
    if (name === 'memory' && data.action === 'listMemories') return { memories: [] };
    if (name === 'memory' && data.action === 'createMemoryProposal') return { memory: { _id: 'mem-meet' } };
    if (name === 'memory' && data.action === 'confirmMemory') return { memory: { _id: 'mem-meet' } };
    if (name === 'agent' && data.action === 'generateCardDraft') {
      return {
        ok: true,
        result: {
          draft: {
            currentFocus: '正在打磨 VibeCard 的首次体验',
            canHelpWith: ['这项虽由模型返回，但主人已拒绝对应记忆'],
            wantsToMeet: ['真正做过 AI 产品的人'],
            highlights: [{ title: '跳过的问题不得被模型补出' }],
          },
        },
      };
    }
    throw new Error(name + ':' + data.action);
  };
  const page = makePage();
  page.startFirstRun();
  await page.onConfirmFirstRunMemory();

  assert.ok(cloudCalls.some(([name, data]) => name === 'agent' && data.action === 'generateCardDraft'));
  const draftCall = cloudCalls.find(([name, data]) => name === 'agent' && data.action === 'generateCardDraft');
  assert.strictEqual(draftCall[1].cardDraftScope, 'public_only');
  assert.deepStrictEqual(draftCall[1].memoryIds.sort(), ['mem-current', 'mem-meet']);
  assert.strictEqual(page.data.firstRunDraft.bio, '正在打磨 VibeCard 的首次体验');
  assert.strictEqual(page.data.firstRunDraft.lookingFor, '真正做过 AI 产品的人');
  assert.strictEqual(page.data.firstRunDraft.canHelpWith, undefined, '拒绝的 help 记忆不进入 Card');
  assert.strictEqual(page.data.firstRunDraft.highlights, undefined, '未回答 work 不被模型补出');
});

test('刷新从本地恢复到同一问题，不重放或跳回开头', () => {
  reset();
  const state = firstRun.emptyState();
  state.name = '小林';
  state.stage = 'questions';
  state.questionIndex = 2;
  state.answers.current = '正在做一个产品';
  state.skipped.work = true;
  firstRun.save(wx, state);

  const page = makePage();
  page.startFirstRun();
  assert.strictEqual(page.data.firstRunQuestion.id, 'help');
  assert.strictEqual(page.data.firstRunHistory.length, 2);
  assert.strictEqual(page.data.firstRunHistory[1].answer, '已跳过');
});

test('全部跳过只生成名字；显式发布后才激活 profile 并清除进度', async () => {
  reset();
  storage.set('vibecard_demo_mode', '1');
  const page = makePage();
  page.startFirstRun();
  page.onFirstRunNameInput({ detail: { value: '小林' } });
  page.onStartFirstRun();
  for (let index = 0; index < 5; index += 1) page.onSkipFirstRunQuestion();

  assert.strictEqual(page.data.firstRunStage, 'draft');
  assert.deepStrictEqual(page.data.firstRunDraft, { name: '小林' });
  assert.strictEqual(storage.has('vibecard_profile'), false, '预览前没有发布 Card');
  await page.onPublishFirstRunCard();
  const profile = storage.get('vibecard_profile');
  assert.strictEqual(profile.name, '小林');
  assert.strictEqual(profile.bio, '');
  assert.deepStrictEqual(profile.highlights, []);
  assert.deepStrictEqual(profile.canHelpWith, []);
  assert.strictEqual(storage.has(firstRun.STORAGE_KEY), false, '发布后清进度，刷新不重复发布');
});

test('production 首次发布先写云端并把稳定 ownerId 带入本地分享资料', async () => {
  reset();
  const state = firstRun.emptyState();
  state.name = '小林';
  state.stage = 'draft';
  state.draft = { name: '小林', bio: '在做 VibeCard', canHelpWith: [], highlights: [] };
  firstRun.save(wx, state);
  cloudImpl = async (name, data) => {
    assert.strictEqual(name, 'user');
    assert.strictEqual(data.action, 'updateNamecard');
    assert.strictEqual(data.profile.name, '小林');
    return { success: true, ownerId: 'openid-owner-1' };
  };
  const page = makePage();
  page.startFirstRun();
  await page.onPublishFirstRunCard();
  const profile = storage.get('vibecard_profile');
  assert.strictEqual(profile.ownerId, 'openid-owner-1');
  assert.strictEqual(profile.openid, 'openid-owner-1');
  assert.strictEqual(cloudCalls.filter(([name, data]) => name === 'user' && data.action === 'updateNamecard').length, 1);
});

test('已发布 Card 的结构化编辑先写权威云端，失败时不覆盖本地公开投影', async () => {
  reset();
  storage.set('vibecard_profile', { name: '旧名字', bio: '旧介绍' });
  const page = makePage();
  page.setData({
    editName: '新名字', editHandle: 'new-name', editBio: '新介绍', editTags: ['AI'],
    editLookingFor: '真诚的合作者', editCanHelpWith: '产品梳理\n隐私设计', editEvent: '',
    editHighlights: [{ id: 'h-1', icon: '✦', title: '发布过小程序', description: '真实项目' }],
    editWallet: '', editTwitter: '', editDiscord: '', editWechat: '', editAvatar: '', editAvatarSeed: 'Alex',
  });
  cloudImpl = async (name, data) => {
    assert.strictEqual(name, 'user');
    assert.strictEqual(data.action, 'updateNamecard');
    assert.deepStrictEqual(data.profile.canHelpWith, ['产品梳理', '隐私设计']);
    assert.strictEqual(data.profile.highlights[0].title, '发布过小程序');
    return { success: true, ownerId: 'openid-owner-1' };
  };
  await page.saveEdit();
  assert.deepStrictEqual(storage.get('vibecard_profile').canHelpWith, ['产品梳理', '隐私设计']);
  assert.strictEqual(storage.get('vibecard_profile').ownerId, 'openid-owner-1');

  storage.set('vibecard_profile', { name: '保留的名字', bio: '保留的介绍' });
  cloudImpl = async () => { throw new Error('network down'); };
  page.setData({ editName: '不应落盘' });
  await page.saveEdit();
  assert.deepStrictEqual(storage.get('vibecard_profile'), { name: '保留的名字', bio: '保留的介绍' });
  assert.strictEqual(toasts.at(-1), 'Card 没有保存，请重试');
});

test('unauthorized 显示 permission-denied 并保留候选供登录后重试', async () => {
  reset();
  const state = firstRun.emptyState();
  state.name = '小林';
  state.stage = 'memory-review';
  state.answers.help = '做产品梳理';
  state.reviewIds = ['help'];
  firstRun.save(wx, state);
  cloudImpl = async () => { throw new Error('unauthorized'); };
  const page = makePage();
  page.startFirstRun();
  await page.onConfirmFirstRunMemory();

  assert.strictEqual(page.data.firstRunPermissionDenied, true);
  assert.match(page.data.firstRunError, /登录/);
  assert.strictEqual(page.data.firstRunProposal.questionId, 'help');
  assert.strictEqual(page.data.firstRunStage, 'memory-review');
});

test('Card 起草失败可恢复、重试或显式使用已确认原话', async () => {
  reset();
  const state = firstRun.emptyState();
  state.name = '小林';
  state.stage = 'draft-loading';
  state.answers.current = '在做 VibeCard';
  state.reviewIds = ['current'];
  state.memoryDecisions.current = { decision: 'confirmed', memoryId: 'mem-current', content: '在做 VibeCard', visibility: 'public' };
  firstRun.save(wx, state);
  cloudImpl = async () => { throw new Error('provider unavailable'); };
  const page = makePage();
  page.startFirstRun();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(page.data.firstRunStage, 'draft-error');
  assert.match(page.data.firstRunError, /回答.*还在/);

  const resumed = makePage();
  resumed.startFirstRun();
  assert.strictEqual(resumed.data.firstRunStage, 'draft-error');
  assert.match(resumed.data.firstRunError, /回答.*还在/);
  resumed.onUseConfirmedAnswersDraft();
  assert.strictEqual(resumed.data.firstRunStage, 'draft');
  assert.strictEqual(resumed.data.firstRunDraft.bio, '在做 VibeCard');
});

test('Card 回退只使用主人编辑后确认的公开记忆，不重新引入原始回答', () => {
  const state = firstRun.emptyState();
  state.name = '小林';
  state.answers.current = '在做 VibeCard，内部代号是绝密飞船';
  state.memoryDecisions.current = {
    decision: 'confirmed',
    memoryId: 'mem-current',
    content: '你最近主要在做：在做 VibeCard',
    visibility: 'public',
  };
  const draft = firstRun.draftFromAnswers(state, true);
  assert.strictEqual(draft.bio, '在做 VibeCard');
  assert.doesNotMatch(JSON.stringify(draft), /绝密飞船/);
});

test('当前 onboarding 模板不再暴露旧五字段/标签选择表单', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/card/card.wxml'), 'utf8');
  const onboarding = wxml.slice(wxml.indexOf('<!-- Onboarding -->'), wxml.indexOf('<!-- Main Card View -->'));
  assert.doesNotMatch(onboarding, /选择标签|vibecard ID|Looking for|当前活动/);
  assert.match(onboarding, /问题 \{\{firstRunQuestionNumber\}\} \/ 5/);
  assert.match(onboarding, /返回纠正/);
  assert.match(onboarding, /确认并发布 Card/);
});
