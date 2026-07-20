import { useCallback, useEffect, useState } from 'react';
import type { NowItem, NowItemStatus, NowItemTopic } from '@shared';
import { vibeFixtures } from '@shared';

/**
 * Task 4.5 — Personal Now updates (web side).
 *
 * The canonical `NowItem` contract lives in `@shared/now`; this module only
 * adds UI-level helpers over that imported type. Semantics are identical to
 * the shared rules (AI_BEHAVIOR.md §13):
 *
 * - active  = status 'published' && (expiresAt === null || expiresAt > now)
 * - public  = at most the 3 newest active items by publishedAt
 * - drafts (incl. Vibe-proposed), archived, hidden, deleted, and expired
 *   items are never shown publicly or described as current
 * - publishing a Now item never touches any Memory's visibility
 *
 * State follows the repo's fixture-demo pattern: deterministic seeds plus
 * localStorage persistence, no backend call.
 */

export const NOW_STORAGE_KEY = 'vibecard_now';

export const NOW_TOPIC_LABELS: Record<NowItemTopic, string> = {
  current_work: '在做',
  completed_work: '完成',
  exploring: '关注',
  looking_for: '寻找',
  offer_help: '能帮',
};

export const NOW_STATUS_LABELS: Record<NowItemStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
  hidden: '已隐藏',
  deleted: '已删除',
};

export function isNowActive(item: NowItem, now: number): boolean {
  return item.status === 'published' && (item.expiresAt === null || item.expiresAt > now);
}

/** The public projection: newest `limit` active items by publishedAt. */
export function latestActiveNow(items: NowItem[], now: number, limit = 3): NowItem[] {
  return items
    .filter(item => isNowActive(item, now))
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, limit);
}

// --- Deterministic demo seeds (fictional, like vibeFixtures) ---------------

const T0 = 1_752_000_000_000; // fixed timestamp, same anchor as vibeFixtures
const hour = 3_600_000;

export const seedNowItems: NowItem[] = [
  {
    id: 'fixture-now-polish-dialog',
    schemaVersion: 1,
    ownerId: vibeFixtures.fixtureOwner.id,
    text: '最近在打磨访客和分身的前六轮对话，想让它既温暖又不越界。',
    topic: 'current_work',
    sourceMemoryId: 'fixture-memory-public-focus',
    status: 'published',
    publishedAt: T0 - 6 * hour,
    expiresAt: null,
    createdAt: T0 - 8 * hour,
    updatedAt: T0 - 6 * hour,
  },
  {
    id: 'fixture-now-essay',
    schemaVersion: 1,
    ownerId: vibeFixtures.fixtureOwner.id,
    text: '刚写完一篇复盘：为什么 AI 不应该替你交朋友。',
    topic: 'completed_work',
    sourceMemoryId: null,
    status: 'published',
    publishedAt: T0 - 30 * hour,
    expiresAt: null,
    createdAt: T0 - 30 * hour,
    updatedAt: T0 - 30 * hour,
  },
  {
    // A Vibe-proposed draft: never publicly visible until the owner publishes.
    id: 'fixture-now-draft-meet',
    schemaVersion: 1,
    ownerId: vibeFixtures.fixtureOwner.id,
    text: '最近想认识真正做过 AI 社交产品的人。',
    topic: 'looking_for',
    sourceMemoryId: null,
    status: 'draft',
    publishedAt: null,
    expiresAt: null,
    createdAt: T0 - 2 * hour,
    updatedAt: T0 - 2 * hour,
  },
];

export function loadNowItems(): NowItem[] {
  try {
    const stored = localStorage.getItem(NOW_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed as NowItem[];
    }
  } catch {}
  return seedNowItems;
}

export function saveNowItems(items: NowItem[]): void {
  try {
    localStorage.setItem(NOW_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export function createNowItem(
  fields: { text: string; topic: NowItemTopic; sourceMemoryId?: string | null },
  publish: boolean,
): NowItem {
  const now = Date.now();
  return {
    id: `now-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    schemaVersion: 1,
    ownerId: vibeFixtures.fixtureOwner.id,
    text: fields.text,
    topic: fields.topic,
    sourceMemoryId: fields.sourceMemoryId ?? null,
    status: publish ? 'published' : 'draft',
    publishedAt: publish ? now : null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Owner-side Now store: local state + localStorage, mirroring useProfile. */
export function useNowItems() {
  const [items, setItems] = useState<NowItem[]>(loadNowItems);

  useEffect(() => {
    saveNowItems(items);
  }, [items]);

  const patch = useCallback((id: string, updates: Partial<NowItem>) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item)),
    );
  }, []);

  const addNow = useCallback(
    (fields: { text: string; topic: NowItemTopic; sourceMemoryId?: string | null }, publish: boolean) => {
      const item = createNowItem(fields, publish);
      setItems(prev => [item, ...prev]);
      return item;
    },
    [],
  );

  const updateNow = useCallback(
    (id: string, updates: { text?: string; topic?: NowItemTopic }) => patch(id, updates),
    [patch],
  );

  /** Publishing only changes the Now item; source Memory visibility is untouched. */
  const publishNow = useCallback(
    (id: string) => patch(id, { status: 'published', publishedAt: Date.now() }),
    [patch],
  );
  const archiveNow = useCallback((id: string) => patch(id, { status: 'archived' }), [patch]);
  const hideNow = useCallback((id: string) => patch(id, { status: 'hidden' }), [patch]);
  /** Tombstone: excluded from all retrieval and rendering. */
  const deleteNow = useCallback((id: string) => patch(id, { status: 'deleted' }), [patch]);

  return { items, addNow, updateNow, publishNow, archiveNow, hideNow, deleteNow };
}
