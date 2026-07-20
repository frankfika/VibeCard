/**
 * VibeCard 2.0 mock story fixtures（任务 0.4，小程序端）。
 *
 * 本文件是 packages/shared/fixtures/vibe.ts 的 CommonJS 镜像，
 * 用于在接入真实模型与云函数之前，先跑通四屏可点击演示：
 *   主人与私有 Vibe 对话 -> 确认记忆 -> 访客与 AI 分身对话 -> 联系请求决策。
 *
 * 隐私规则：这里的所有人名、头像、链接、联系方式值均为虚构。
 * 永远不要在 fixture 中提交真实的个人联系方式。
 */

var fixtureOwner = {
  id: 'fixture-owner-linzhou',
  name: '林舟',
  avatarUrl: '',
};

var fixtureVisitor = {
  id: 'fixture-visitor-suqing',
  name: '苏晴',
  avatarUrl: '',
};

// 任务 4.3：第二位访客，刻意弱理由，用来演示「边界」而非「门槛」
var fixtureWeakVisitor = {
  id: 'fixture-visitor-wangtuo',
  name: '王拓',
  avatarUrl: '',
};

var T0 = 1752000000000; // 固定时间戳，保证 fixture 确定性
var hour = 3600000;

var fixtureOwnerCard = {
  id: 'fixture-card-linzhou',
  schemaVersion: 1,
  ownerId: fixtureOwner.id,
  name: fixtureOwner.name,
  avatarUrl: fixtureOwner.avatarUrl,
  headline: '在做一张会越来越懂你的 AI 名片',
  currentFocus: '把「先理解，再认识」做成一个真正可用的产品，最近在打磨访客和分身的前六轮对话。',
  canHelpWith: ['AI 社交产品的取舍', '微信小程序从 0 到 1', '把模糊想法聊成产品'],
  wantsToMeet: ['真正做过 AI 社交产品的人', '在意隐私边界的独立开发者'],
  topics: ['个人 AI 分身', '隐私边界', '微信生态'],
  highlights: [
    {
      id: 'fixture-highlight-vibecard',
      title: 'VibeCard：一张会越来越懂你的 AI 名片',
      url: 'https://vibecard.example.com',
    },
    {
      id: 'fixture-highlight-essay',
      title: '为什么 AI 不应该替你交朋友',
      url: 'https://blog.example.com/ai-friends',
    },
    {
      id: 'fixture-highlight-talk',
      title: '一次关于个人分身边界的内部分享',
    },
  ],
  agentEnabled: true,
  updatedAt: T0,
};

var fixtureOwnerMemories = [
  {
    id: 'fixture-memory-public-focus',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    kind: 'current',
    content: '最近在打磨 VibeCard 的访客对话，重点是怎么在六轮内判断一次认识值不值得发生。',
    visibility: 'public',
    status: 'confirmed',
    sourceConversationId: 'fixture-conversation-owner-1',
    sourceMessageIds: ['fixture-message-1'],
    createdAt: T0 - 72 * hour,
    updatedAt: T0 - 72 * hour,
  },
  {
    id: 'fixture-memory-public-meet',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    kind: 'preference',
    content: '最近更想认识真正做过 AI 社交产品、并且在意隐私边界的人。',
    visibility: 'public',
    status: 'confirmed',
    sourceConversationId: 'fixture-conversation-owner-1',
    sourceMessageIds: ['fixture-message-2'],
    createdAt: T0 - 48 * hour,
    updatedAt: T0 - 48 * hour,
  },
  {
    id: 'fixture-memory-agent-boundary',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    kind: 'boundary',
    content: '不想回应没有具体理由的合作邀请，尤其是泛泛的「资源互换」。',
    visibility: 'agent_only',
    status: 'confirmed',
    sourceConversationId: 'fixture-conversation-owner-2',
    sourceMessageIds: ['fixture-message-3'],
    createdAt: T0 - 24 * hour,
    updatedAt: T0 - 24 * hour,
  },
  {
    id: 'fixture-memory-proposed',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    kind: 'preference',
    content: '比起线上长聊，更喜欢先约一次二十分钟的语音。',
    visibility: 'private',
    status: 'proposed',
    sourceConversationId: 'fixture-conversation-owner-3',
    sourceMessageIds: ['fixture-message-4'],
    createdAt: T0 - 2 * hour,
    updatedAt: T0 - 2 * hour,
  },
];

/**
 * 主人侧联系方式。fixture 值故意是假的；
 * ConnectionRequest.sharedContactMethodIds 在 connect 决策后引用这些 id。
 */
var fixtureOwnerContactMethods = [
  {
    id: 'fixture-contact-wechat',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    kind: 'wechat',
    value: 'fixture-wechat-linzhou',
    label: '微信',
    createdAt: T0 - 96 * hour,
    updatedAt: T0 - 96 * hour,
  },
  {
    id: 'fixture-contact-email',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    kind: 'email',
    value: 'linzhou@mail.example.com',
    label: '邮箱',
    createdAt: T0 - 96 * hour,
    updatedAt: T0 - 96 * hour,
  },
];

var fixtureConnectionRequest = {
  id: 'fixture-request-suqing-to-linzhou',
  schemaVersion: 1,
  ownerId: fixtureOwner.id,
  visitorId: fixtureVisitor.id,
  visitorSummary: '苏晴，独立开发者，做过一个微信上的 AI 记账小程序。',
  reason: '我也在开发个人 AI 小程序，最近卡在私人记忆与公开身份的边界，想和你交流一次权限设计。',
  possibleSharedContext: [
    '都在做微信生态里的个人 AI 产品',
    '都在研究私人记忆和公开身份的边界',
  ],
  visitorWorkUrl: 'https://suqing.example.com/ai-ledger',
  ownerAction: 'pending',
  sharedContactMethodIds: [],
  createdAt: T0 - hour,
  updatedAt: T0 - hour,
};

// 弱理由请求：与 AI_BEHAVIOR §7 的反例一致，演示 Vibe 如何温和地表达「信息不够」
var fixtureWeakConnectionRequest = {
  id: 'fixture-request-wangtuo-to-linzhou',
  schemaVersion: 1,
  ownerId: fixtureOwner.id,
  visitorId: fixtureWeakVisitor.id,
  visitorSummary: '王拓，资料不详，没有留下作品或背景。',
  reason: '想认识一下，多个朋友多条路。',
  possibleSharedContext: [],
  ownerAction: 'pending',
  sharedContactMethodIds: [],
  createdAt: T0 - 3 * hour,
  updatedAt: T0 - 3 * hour,
};

/**
 * 任务 4.5：最近动态（Now）fixture，镜像 packages/shared/now.ts 契约。
 *
 * fixture 世界的时间锚点是 FIXTURE_NOW（= T0）：演示模式判断「是否过期」
 * 一律以它为准，保证任何时刻打开演示都得到同样的结果。
 *
 * 覆盖全部状态：有效发布、即将过期、已过期、草稿、已归档、已隐藏、已删除，
 * 以及一条带 sourceMemoryId 的动态（发布不改变来源记忆可见性）。
 */
var FIXTURE_NOW = T0;

var fixtureNowItems = [
  {
    id: 'fixture-now-current',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '最近在验证 AI 分身如何在保护私人记忆的同时，帮助两个人建立联系。',
    topic: 'current_work',
    sourceMemoryId: 'fixture-memory-public-focus',
    status: 'published',
    publishedAt: T0 - 2 * hour,
    expiresAt: null,
    createdAt: T0 - 3 * hour,
    updatedAt: T0 - 2 * hour,
  },
  {
    id: 'fixture-now-expiring',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '这周在模速空间办公，做 AI 社交产品的朋友可以来喝杯咖啡。',
    topic: 'offer_help',
    sourceMemoryId: null,
    status: 'published',
    publishedAt: T0 - 26 * hour,
    expiresAt: T0 + 2 * hour, // 即将过期，但此刻仍有效
    createdAt: T0 - 26 * hour,
    updatedAt: T0 - 26 * hour,
  },
  {
    id: 'fixture-now-expired',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '上周的黑客松评审已经结束了。',
    topic: 'completed_work',
    sourceMemoryId: null,
    status: 'published',
    publishedAt: T0 - 96 * hour,
    expiresAt: T0 - 24 * hour, // 已过期：绝不能被当成当前事实
    createdAt: T0 - 96 * hour,
    updatedAt: T0 - 96 * hour,
  },
  {
    id: 'fixture-now-draft',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '想把「先理解，再认识」写成一篇长文。',
    topic: 'exploring',
    sourceMemoryId: null,
    status: 'draft',
    publishedAt: null,
    expiresAt: null,
    createdAt: T0 - 5 * hour,
    updatedAt: T0 - 5 * hour,
  },
  {
    id: 'fixture-now-archived',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '之前在找一位做过微信生态增长的产品合伙人。',
    topic: 'looking_for',
    sourceMemoryId: null,
    status: 'archived',
    publishedAt: T0 - 200 * hour,
    expiresAt: null,
    createdAt: T0 - 200 * hour,
    updatedAt: T0 - 100 * hour,
  },
  {
    id: 'fixture-now-hidden',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '一条主人选择暂时藏起来的动态。',
    topic: 'current_work',
    sourceMemoryId: null,
    status: 'hidden',
    publishedAt: T0 - 150 * hour,
    expiresAt: null,
    createdAt: T0 - 150 * hour,
    updatedAt: T0 - 120 * hour,
  },
  {
    id: 'fixture-now-deleted',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '一条已被主人删除的动态，任何界面都不该再出现。',
    topic: 'current_work',
    sourceMemoryId: null,
    status: 'deleted',
    publishedAt: T0 - 300 * hour,
    expiresAt: null,
    createdAt: T0 - 300 * hour,
    updatedAt: T0 - 250 * hour,
  },
];

module.exports = {
  fixtureOwner: fixtureOwner,
  fixtureVisitor: fixtureVisitor,
  fixtureWeakVisitor: fixtureWeakVisitor,
  fixtureOwnerCard: fixtureOwnerCard,
  fixtureOwnerMemories: fixtureOwnerMemories,
  fixtureOwnerContactMethods: fixtureOwnerContactMethods,
  fixtureConnectionRequest: fixtureConnectionRequest,
  fixtureWeakConnectionRequest: fixtureWeakConnectionRequest,
  FIXTURE_NOW: FIXTURE_NOW,
  fixtureNowItems: fixtureNowItems,
};
