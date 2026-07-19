/**
 * requests 页 demo 收件箱的弱理由请求（任务 4.3）
 *
 * - demo 收件箱应同时给出强理由（苏晴）与弱理由（王拓）两条请求
 * - 弱理由请求的 Vibe 看法是「信息不够」而不是替主人挡人
 * - 强理由请求的 Vibe 看法保持不变
 *
 * 运行：node --test packages/miniprogram/tests/
 */
const test = require('node:test');
const assert = require('node:assert');

const PAGE_PATH = require.resolve('../miniprogram/pages/requests/requests.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');

require.cache[CLOUD_PATH] = {
  id: CLOUD_PATH,
  filename: CLOUD_PATH,
  loaded: true,
  exports: { callFunction: async () => ({ ok: false, error: { code: 'offline', message: 'offline' } }) },
};

const toasts = [];
global.wx = { showToast: (opts) => toasts.push((opts && opts.title) || '') };
let pageDef = null;
global.Page = (def) => { pageDef = def; };

require(PAGE_PATH);
assert.ok(pageDef, 'page definition captured');

const fixtures = require('../miniprogram/data/vibe-fixtures.js');

function makePage() {
  const page = Object.create(pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  page.demoMode = true;
  return page;
}

test('demo 收件箱包含一强一弱两条请求', () => {
  const page = makePage();
  page.loadFixtureDemo();
  assert.strictEqual(page.data.requestsList.length, 2);
  const weak = page.data.requestsList.find(r => r.id === fixtures.fixtureWeakConnectionRequest.id);
  assert.ok(weak, 'weak request present');
  assert.strictEqual(weak.reason, '想认识一下，多个朋友多条路。');
  assert.deepStrictEqual(weak.possibleSharedContext, []);
});

test('弱理由请求详情展示「信息不够」的 Vibe 看法', () => {
  const page = makePage();
  page.loadFixtureDemo();
  page.openDetail({ currentTarget: { dataset: { id: fixtures.fixtureWeakConnectionRequest.id } } });
  assert.strictEqual(page.data.currentRequest.id, fixtures.fixtureWeakConnectionRequest.id);
  assert.match(page.data.vibeTake.summary, /判断不好|信息不太够/);
});

test('强理由请求详情仍展示「值得聊一次」', () => {
  const page = makePage();
  page.loadFixtureDemo();
  page.openDetail({ currentTarget: { dataset: { id: fixtures.fixtureConnectionRequest.id } } });
  assert.strictEqual(page.data.currentRequest.id, fixtures.fixtureConnectionRequest.id);
  assert.match(page.data.vibeTake.summary, /值得聊一次/);
});
