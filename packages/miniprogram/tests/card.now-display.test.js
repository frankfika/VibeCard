/**
 * card 页「最近动态」展示测试（任务 4.5）
 *
 * 验收点：
 * - 主人视图：云端返回的活跃动态 ≤3 条地进入 nowItems（云端已做筛选与截断，
 *   页面再兜底截断一次），并补上展示标签
 * - 云不可用：nowItems 保持空列表，版块不渲染内容，也不编造
 * - 分享视图：访客看到分享负载里的同一份发布快照
 * - 分享负载：onShareAppMessage 携带 nowItems，且不含联系方式
 * - utils/now.js：active 判定与 ≤3 截断（fixture 全状态覆盖）
 *
 * 运行：cd packages/miniprogram && node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert');

const PAGE_PATH = require.resolve('../miniprogram/pages/card/card.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');
const STORE_PATH = require.resolve('../miniprogram/utils/store.js');
const NAV_PATH = require.resolve('../miniprogram/utils/nav.js');
const nowHelper = require('../miniprogram/utils/now.js');
const fixtures = require('../miniprogram/data/vibe-fixtures.js');

// ---- 可控的云函数 stub ----
const cloudCalls = [];
let cloudImpl = async () => ({});
require.cache[CLOUD_PATH] = {
  id: CLOUD_PATH,
  filename: CLOUD_PATH,
  loaded: true,
  exports: {
    callFunction: async (name, data) => {
      cloudCalls.push([name, data]);
      return cloudImpl(name, data);
    },
  },
};

// store stub：已设置好的主人名片
require.cache[STORE_PATH] = {
  id: STORE_PATH,
  filename: STORE_PATH,
  loaded: true,
  exports: {
    getProfile: () => ({ name: '林舟', bio: '在做 AI 名片', tags: [], highlights: [] }),
    isProfileSetup: () => true,
    getThreads: () => [],
    setProfile: () => {},
  },
};
require.cache[NAV_PATH] = {
  id: NAV_PATH,
  filename: NAV_PATH,
  loaded: true,
  exports: { hideTabBar: () => {}, showTabBar: () => {}, reLaunch: () => {}, navigateTo: () => {} },
};

global.wx = { showToast: () => {} };
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

function makePage() {
  const page = Object.create(pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  return page;
}

test('主人视图：云端活跃动态进入 nowItems，最多 3 条并带展示标签', async () => {
  cloudCalls.length = 0;
  cloudImpl = async (name, data) => {
    if (name === 'now' && data.action === 'getActiveNowItems') {
      return {
        nowItems: [
          { id: 'n1', text: '最新的一条', topic: 'current_work', publishedAt: 4 },
          { id: 'n2', text: '第二条', topic: 'completed_work', publishedAt: 3 },
          { id: 'n3', text: '第三条', topic: 'exploring', publishedAt: 2 },
          // 云端契约保证最多 3 条；页面兜底再截断一次
          { id: 'n4', text: '第四条', topic: 'looking_for', publishedAt: 1 },
        ],
      };
    }
    throw new Error('unexpected: ' + name);
  };
  const page = makePage();
  page.onLoad({});
  await flushAll();

  assert.ok(cloudCalls.some(([n, d]) => n === 'now' && d.action === 'getActiveNowItems'));
  assert.strictEqual(page.data.nowItems.length, 3);
  assert.strictEqual(page.data.nowItems[0].text, '最新的一条');
  assert.strictEqual(page.data.nowItems[0].topicLabel, '正在做');
});

test('云不可用 / 没有动态：nowItems 为空，空状态不编造任何内容', async () => {
  cloudImpl = async () => {
    throw new Error('cloud unavailable');
  };
  const page = makePage();
  page.onLoad({});
  await flushAll();
  assert.deepStrictEqual(page.data.nowItems, []);
});

test('分享视图：访客看到分享负载里的同一份发布快照', () => {
  const shared = {
    name: '林舟',
    bio: '在做 AI 名片',
    nowItems: [
      { id: 'n1', text: '最近在验证 AI 分身的边界', topic: 'current_work', publishedAt: 2 },
    ],
  };
  const page = makePage();
  page.onLoad({ shared: encodeURIComponent(JSON.stringify(shared)) });
  assert.strictEqual(page.data.isSharedView, true);
  assert.strictEqual(page.data.nowItems.length, 1);
  assert.strictEqual(page.data.nowItems[0].text, '最近在验证 AI 分身的边界');
  assert.strictEqual(page.data.nowItems[0].topicLabel, '正在做');
});

test('分享负载携带 nowItems 且不包含联系方式', () => {
  const page = makePage();
  page.data.profile = {
    name: '林舟',
    bio: '在做 AI 名片',
    verified: { wechat: 'secret-wechat' },
  };
  page.data.nowItems = [{ id: 'n1', text: '最近的一条', topic: 'current_work', topicLabel: '正在做', publishedAt: 2 }];
  const share = page.onShareAppMessage();
  assert.ok(share.path.includes('shared='));
  const payload = JSON.parse(decodeURIComponent(share.path.split('shared=')[1]));
  assert.deepStrictEqual(payload.nowItems, [{ id: 'n1', text: '最近的一条', topic: 'current_work', publishedAt: 2 }]);
  assert.strictEqual(payload.verified, undefined);
});

test('utils/now.js：active 判定覆盖 fixture 全状态，最多 3 条', () => {
  const active = nowHelper.activeNowItems(fixtures.fixtureNowItems, fixtures.FIXTURE_NOW);
  const ids = active.map((n) => n.id);
  // fixture 世界里有效的只有：当前发布 + 即将过期但仍有效
  assert.deepStrictEqual(ids, ['fixture-now-current', 'fixture-now-expiring']);
  assert.ok(!ids.includes('fixture-now-expired'), 'expired is never active');
  assert.ok(!ids.includes('fixture-now-draft'));
  assert.ok(!ids.includes('fixture-now-archived'));
  assert.ok(!ids.includes('fixture-now-hidden'));
  assert.ok(!ids.includes('fixture-now-deleted'));
  assert.strictEqual(active[0].topicLabel, '正在做');
  assert.deepStrictEqual(nowHelper.activeNowItems([], fixtures.FIXTURE_NOW), []);
});

test('utils/now.js：ownerNowList 保留草稿/归档/隐藏，剔除已删除，附状态标签', () => {
  const list = nowHelper.ownerNowList(fixtures.fixtureNowItems);
  const byId = new Map(list.map((n) => [n.id, n]));
  assert.strictEqual(byId.get('fixture-now-draft').statusLabel, '草稿');
  assert.strictEqual(byId.get('fixture-now-archived').statusLabel, '已归档');
  assert.strictEqual(byId.get('fixture-now-hidden').statusLabel, '已隐藏');
  assert.strictEqual(byId.has('fixture-now-deleted'), false);
});
