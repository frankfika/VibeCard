/**
 * Deterministic fixtures for Personal Now updates (task 4.5).
 *
 * Same fictional owner 林舟 as fixtures/vibe.ts. Covers every NowItemStatus
 * plus expired / expiring / memory-projected cases so owner and visitor
 * surfaces can be built and tested before any cloud data exists.
 *
 * Privacy rule: every person, text, and URL here is fictional. Never commit
 * real personal data in fixtures.
 */

import type { NowItem } from '../now';
import { fixtureOwner } from './vibe';

const T0 = 1_752_000_000_000; // same fixed timestamp as fixtures/vibe.ts
const hour = 3_600_000;
const day = 24 * hour;

/**
 * All fixture Now items for 林舟. `fixtureNowReferenceNow` acts as "now" so
 * activity/expiry outcomes stay deterministic across test runs.
 */
export const fixtureNowItems: NowItem[] = [
  {
    // Newest active item; projected from fixture-memory-public-focus.
    id: 'fixture-now-published-focus',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '最近在打磨 VibeCard 的访客对话，重点是怎么在六轮内判断一次认识值不值得发生。',
    topic: 'current_work',
    sourceMemoryId: 'fixture-memory-public-focus',
    status: 'published',
    publishedAt: T0 - 6 * hour,
    expiresAt: null,
    createdAt: T0 - 8 * hour,
    updatedAt: T0 - 6 * hour,
  },
  {
    // Published with a future expiry — active until T0 + 7 days.
    id: 'fixture-now-published-expiring',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '下周三下午在模速空间做一次关于个人 AI 分身边界的内部分享，欢迎来听。',
    topic: 'offer_help',
    sourceMemoryId: null,
    status: 'published',
    publishedAt: T0 - 2 * day,
    expiresAt: T0 + 7 * day,
    createdAt: T0 - 2 * day,
    updatedAt: T0 - 2 * day,
  },
  {
    // Published but already expired — must never be presented as current.
    id: 'fixture-now-published-expired',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '这周六去参加一场独立开发者线下聚会，想找同样在做出海小程序的人。',
    topic: 'looking_for',
    sourceMemoryId: null,
    status: 'published',
    publishedAt: T0 - 10 * day,
    expiresAt: T0 - 3 * day,
    createdAt: T0 - 10 * day,
    updatedAt: T0 - 10 * day,
  },
  {
    // Vibe-proposed draft; unpublished until the owner confirms.
    id: 'fixture-now-draft-vibe-proposal',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '刚刚跑通了第一版「确认再发布」的完整流程，想写一篇复盘。',
    topic: 'completed_work',
    sourceMemoryId: null,
    status: 'draft',
    publishedAt: null,
    expiresAt: null,
    createdAt: T0 - 3 * hour,
    updatedAt: T0 - 3 * hour,
  },
  {
    // Archived: kept in history, not shown publicly.
    id: 'fixture-now-archived',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '上个月完成了一次小范围内测，收集了二十份反馈。',
    topic: 'completed_work',
    sourceMemoryId: null,
    status: 'archived',
    publishedAt: T0 - 30 * day,
    expiresAt: null,
    createdAt: T0 - 30 * day,
    updatedAt: T0 - 20 * day,
  },
  {
    // Hidden by the owner; not shown publicly.
    id: 'fixture-now-hidden',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '最近在研究几篇关于个人数据主权的论文。',
    topic: 'exploring',
    sourceMemoryId: null,
    status: 'hidden',
    publishedAt: T0 - 5 * day,
    expiresAt: null,
    createdAt: T0 - 5 * day,
    updatedAt: T0 - 4 * day,
  },
  {
    // Tombstone; never shown, excluded from all retrieval.
    id: 'fixture-now-deleted',
    schemaVersion: 1,
    ownerId: fixtureOwner.id,
    text: '（已删除的动态占位文本，仅用于测试删除状态过滤。）',
    topic: 'current_work',
    sourceMemoryId: null,
    status: 'deleted',
    publishedAt: T0 - 40 * day,
    expiresAt: null,
    createdAt: T0 - 40 * day,
    updatedAt: T0 - 35 * day,
  },
];

/** Deterministic "now" for these fixtures: T0, as in fixtures/vibe.ts. */
export const fixtureNowReferenceNow = T0;
