const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/core');

const OWNER = 'owner-openid';

const V1_USER = {
  openid: OWNER,
  nickname: '方辰',
  avatar: 'https://example.com/avatar.png',
  bio: '在做 AI 名片',
  namecard: {
    intro: 'VibeCard 作者',
    motto: '先理解，再认识',
    theme: 'romantic',
    coverImage: 'https://example.com/cover.png',
    interests: ['AI 分身', '隐私边界'],
    wechat: 'secret-wechat-id',
    socialLinks: [{ platform: 'wechat', value: 'secret-wechat-id' }],
    contacts: [{ kind: 'phone', value: '13800000000' }],
  },
  contactMethods: [{ id: 'cm-1', kind: 'wechat', value: 'secret-wechat-id', label: '工作微信' }],
};

function confirmedMemory(kind, visibility, content, updatedAt = 1000) {
  return {
    _id: `mem-${kind}-${visibility}-${content.length}`,
    schemaVersion: 1,
    ownerId: OWNER,
    kind,
    content,
    visibility,
    status: 'confirmed',
    updatedAt,
  };
}

test('projection matches the VibeCard shape', () => {
  const memories = [
    confirmedMemory('current', 'public', '打磨访客和分身的前六轮对话', 3000),
    confirmedMemory('fact', 'public', '做过 AI 社交产品', 2000),
    confirmedMemory('preference', 'public', '想认识真正做过 AI 社交产品的人', 1000),
  ];
  const card = core.buildPublicCard({ ownerId: OWNER, user: V1_USER, memories }, 5000);

  assert.equal(card.id, `card-${OWNER}`);
  assert.equal(card.schemaVersion, 1);
  assert.equal(card.ownerId, OWNER);
  assert.equal(card.name, '方辰');
  assert.equal(card.avatarUrl, 'https://example.com/avatar.png');
  assert.equal(card.headline, '先理解，再认识');
  assert.equal(card.currentFocus, '打磨访客和分身的前六轮对话');
  assert.deepEqual(card.canHelpWith, ['做过 AI 社交产品']);
  assert.deepEqual(card.wantsToMeet, ['想认识真正做过 AI 社交产品的人']);
  assert.deepEqual(card.topics, ['AI 分身', '隐私边界']);
  assert.deepEqual(card.highlights, []);
  assert.equal(card.agentEnabled, true);
  assert.equal(card.updatedAt, 5000);
});

test('contact details are stripped from the projection', () => {
  const card = core.buildPublicCard({ ownerId: OWNER, user: V1_USER, memories: [] }, 5000);
  const serialized = JSON.stringify(card);
  assert.equal(serialized.includes('secret-wechat-id'), false);
  assert.equal(serialized.includes('13800000000'), false);
  assert.equal(serialized.includes('socialLinks'), false);
  assert.equal(serialized.includes('contactMethods'), false);
  assert.equal(serialized.includes('wechat'), false);
});

test('non-public memory content never appears even if it reaches the builder', () => {
  const memories = [
    confirmedMemory('boundary', 'agent_only', '不回应泛泛的资源互换'),
    confirmedMemory('fact', 'connected', '只有连接后才能说的事'),
    confirmedMemory('fact', 'private', '私事一件'),
    confirmedMemory('fact', 'public', '做过 AI 社交产品'),
    { ...confirmedMemory('fact', 'public', '被暂停的事'), status: 'paused' },
    { ...confirmedMemory('fact', 'public', '被删除的事'), status: 'deleted' },
  ];
  const card = core.buildPublicCard({ ownerId: OWNER, user: V1_USER, memories }, 5000);
  const serialized = JSON.stringify(card);
  assert.equal(serialized.includes('不回应泛泛的资源互换'), false);
  assert.equal(serialized.includes('只有连接后才能说的事'), false);
  assert.equal(serialized.includes('私事一件'), false);
  assert.equal(serialized.includes('被暂停的事'), false);
  assert.equal(serialized.includes('被删除的事'), false);
  assert.deepEqual(card.canHelpWith, ['做过 AI 社交产品']);
});

test('empty memories and missing namecard produce a valid sparse card', () => {
  const card = core.buildPublicCard({ ownerId: OWNER, user: { openid: OWNER, nickname: 'A', avatar: '' }, memories: [] }, 5000);
  assert.equal(card.currentFocus, '');
  assert.deepEqual(card.canHelpWith, []);
  assert.deepEqual(card.wantsToMeet, []);
  assert.deepEqual(card.topics, []);
});

test('deleted profile flags are detected', () => {
  assert.equal(core.isCardDeleted({ deleted: true }), true);
  assert.equal(core.isCardDeleted({ status: 'deleted' }), true);
  assert.equal(core.isCardDeleted({}), false);
});
