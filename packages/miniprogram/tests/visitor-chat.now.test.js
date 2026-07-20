/**
 * visitor-chat fixture 演示的最近动态 grounding（任务 4.5）
 *
 * 「他最近在忙什么？」的回答规则与云端一致：优先已发布未过期的最近动态，
 * 其次公开当下重心记忆；fixture 世界以 FIXTURE_NOW 为时间锚点。
 * 已过期 / 未发布的内容绝不能被当作当前事实。
 *
 * 运行：cd packages/miniprogram && node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert');

const PAGE_PATH = require.resolve('../miniprogram/pages/visitor-chat/visitor-chat.js');
const CLOUD_PATH = require.resolve('../miniprogram/utils/cloud.js');
const fixtures = require('../miniprogram/data/vibe-fixtures.js');
const nowHelper = require('../miniprogram/utils/now.js');

require.cache[CLOUD_PATH] = {
  id: CLOUD_PATH,
  filename: CLOUD_PATH,
  loaded: true,
  exports: {
    callFunction: async () => {
      throw new Error('cloud unavailable in fixture demo test');
    },
  },
};

global.wx = { showToast: () => {} };
let pageDef = null;
global.Page = (def) => {
  pageDef = def;
};

require(PAGE_PATH);
assert.ok(pageDef, 'page definition captured');

function makeDemoPage() {
  const page = Object.create(pageDef);
  page.data = JSON.parse(JSON.stringify(pageDef.data));
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  page.onLoad({});
  return page;
}

test('fixture 演示：「他最近在忙什么？」引用最新的有效最近动态', () => {
  const page = makeDemoPage();
  assert.strictEqual(page.demoMode, true);
  page.onAskPreset({ currentTarget: { dataset: { id: 'q-focus' } } });

  const answer = page.data.messages[page.data.messages.length - 1];
  assert.strictEqual(answer.role, 'agent');
  const expected = nowHelper.activeNowItems(fixtures.fixtureNowItems, fixtures.FIXTURE_NOW, 1)[0];
  assert.strictEqual(answer.text, expected.text);
  // 不是过期动态，也不是 draft/archived/hidden/deleted 的内容
  assert.ok(!answer.text.includes('黑客松评审已经结束'));
  assert.ok(!answer.text.includes('主人选择暂时藏起来'));
  assert.ok(!answer.text.includes('已被主人删除'));
});

test('fixture 演示：自由提问仍然只承认不确定，不编造最近动态', () => {
  const page = makeDemoPage();
  page.onInput({ detail: { value: '他下周去哪里出差？' } });
  page.onSend();
  const answer = page.data.messages[page.data.messages.length - 1];
  assert.ok(answer.text.includes('不能确定'));
});
