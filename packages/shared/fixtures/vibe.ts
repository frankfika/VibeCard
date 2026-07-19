/**
 * Deterministic fixtures for the VibeCard 2.0 mock story (task 0.1).
 *
 * One owner, two visitors, two connection requests (one strong, one weak) —
 * used to click through the demo before any real model or cloud data exists.
 *
 * Privacy rule: every person, handle, URL, and contact value here is
 * fictional. Never commit real personal contact details in fixtures.
 */

import type {
  ConnectionRequest,
  ContactMethod,
  Memory,
  VibeCard,
} from '../vibe';

/** Minimal fixture identity. Not a domain contract — users ship in task 1.1. */
export interface FixturePerson {
  id: string;
  name: string;
  avatarUrl: string;
}

export const fixtureOwner: FixturePerson = {
  id: 'fixture-owner-linzhou',
  name: '林舟',
  avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=fixture-owner-linzhou',
};

export const fixtureVisitor: FixturePerson = {
  id: 'fixture-visitor-suqing',
  name: '苏晴',
  avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=fixture-visitor-suqing',
};

const T0 = 1_752_000_000_000; // fixed timestamp for deterministic fixtures
const hour = 3_600_000;

export const fixtureOwnerCard: VibeCard = {
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

export const fixtureOwnerMemories: Memory[] = [
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
 * Owner-side contact data. Fixture values are fake by design; these ids are
 * what `ConnectionRequest.sharedContactMethodIds` references after a
 * `connect` decision.
 */
export const fixtureOwnerContactMethods: ContactMethod[] = [
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

export const fixtureConnectionRequest: ConnectionRequest = {
  id: 'fixture-request-suqing-to-linzhou',
  schemaVersion: 1,
  ownerId: fixtureOwner.id,
  visitorId: fixtureVisitor.id,
  visitorSummary: '苏晴，独立开发者，做过一个微信上的 AI 记账小程序。',
  reason:
    '我也在开发个人 AI 小程序，最近卡在私人记忆与公开身份的边界，想和你交流一次权限设计。',
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

/**
 * Task 4.3 demo data: a second visitor whose request is deliberately weak
 * (the exact "想认识一下" anti-pattern from AI_BEHAVIOR.md §7). The owner
 * inbox shows it next to 苏晴's strong request so the demo can contrast the
 * Vibe's evidence-based takes — and show the boundary, not a gate.
 */
export const fixtureWeakVisitor: FixturePerson = {
  id: 'fixture-visitor-wangtuo',
  name: '王拓',
  avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=fixture-visitor-wangtuo',
};

export const fixtureWeakConnectionRequest: ConnectionRequest = {
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
