/**
 * VibePoints — local-first points ledger.
 *
 * Mirrors the on-chain VibePoints/VibeSocial reward rules so the app awards
 * points instantly with zero signing friction. The ledger lives in
 * localStorage and stays in sync across tabs. When a wallet is connected and
 * the ecosystem contracts are deployed on the active chain, the on-chain
 * balance can be read to reconcile (see usePoints).
 *
 * Design goals (per product): keep it simple for the user — points accrue
 * automatically from normal actions, with cooldowns / daily limits matching
 * the contract to prevent farming.
 */

import { POINTS_REWARDS, POINTS_COSTS } from './ecosystem';

const STORAGE_KEY = 'vibecard_points_v1';

// ───────────────────────── Reason catalog ─────────────────────────
// Keys match the contract `reason` codes; values carry reward + anti-abuse.

export type PointsReason =
  | 'create_profile'
  | 'daily_signin'
  | 'interaction'
  | 'activity_host'
  | 'activity_join'
  | 'activity_reward'
  | 'ugc_card'
  | 'card_used'
  | 'invite'
  | 'follow'
  | 'thread_publish';

export type SpendReason =
  | 'unlock_template'
  | 'pin_activity'
  | 'buy_card_pack'
  | 'private_activity';

interface RewardRule {
  amount: number;
  cooldownMs: number;   // 0 = none
  dailyLimit: number;   // 0 = unlimited
  label: string;        // human-facing description
}

const N = (s: string) => Number(s);

export const REWARD_RULES: Record<PointsReason, RewardRule> = {
  create_profile: { amount: N(POINTS_REWARDS.CREATE_PROFILE), cooldownMs: 0, dailyLimit: 1, label: '创建名片' },
  daily_signin:   { amount: N(POINTS_REWARDS.DAILY_SIGNIN), cooldownMs: 24 * 3600_000, dailyLimit: 1, label: '每日签到' },
  interaction:    { amount: N(POINTS_REWARDS.INTERACTION), cooldownMs: 10 * 60_000, dailyLimit: 5, label: '破冰互动' },
  activity_host:  { amount: N(POINTS_REWARDS.ACTIVITY_HOST), cooldownMs: 0, dailyLimit: 10, label: '发起活动' },
  activity_join:  { amount: N(POINTS_REWARDS.ACTIVITY_JOIN), cooldownMs: 0, dailyLimit: 20, label: '参与活动' },
  activity_reward:{ amount: N(POINTS_REWARDS.ACTIVITY_REWARD), cooldownMs: 0, dailyLimit: 0, label: '活动好评奖励' },
  ugc_card:       { amount: N(POINTS_REWARDS.UGC_CARD), cooldownMs: 0, dailyLimit: 0, label: '创作卡牌' },
  card_used:      { amount: N(POINTS_REWARDS.CARD_USED), cooldownMs: 0, dailyLimit: 0, label: '卡牌互动' },
  invite:         { amount: N(POINTS_REWARDS.INVITE), cooldownMs: 0, dailyLimit: 0, label: '邀请好友' },
  follow:         { amount: N(POINTS_REWARDS.FOLLOW), cooldownMs: 0, dailyLimit: 20, label: '关注用户' },
  thread_publish: { amount: 5, cooldownMs: 0, dailyLimit: 10, label: '发布动态' },
};

export const SPEND_RULES: Record<SpendReason, { amount: number; label: string }> = {
  unlock_template:  { amount: N(POINTS_COSTS.PREMIUM_TEMPLATE), label: '解锁高级模板' },
  pin_activity:     { amount: N(POINTS_COSTS.PIN_ACTIVITY), label: '置顶活动' },
  buy_card_pack:    { amount: N(POINTS_COSTS.RARE_CARD_PACK), label: '购买稀有卡包' },
  private_activity: { amount: N(POINTS_COSTS.PRIVATE_ACTIVITY), label: '创建私密活动' },
};

// ───────────────────────── Reputation tiers ─────────────────────────
// Matches VibeSocial.getReputationTier thresholds.

export type PointsTier = 'Bronze' | 'Silver' | 'Gold' | 'Diamond';

export interface TierInfo {
  tier: PointsTier;
  label: string;
  min: number;
  next: number | null;   // null when max tier
  progress: number;      // 0..1 toward next tier
}

const TIER_THRESHOLDS: { tier: PointsTier; label: string; min: number }[] = [
  { tier: 'Bronze', label: '青铜', min: 0 },
  { tier: 'Silver', label: '白银', min: 200 },
  { tier: 'Gold', label: '黄金', min: 500 },
  { tier: 'Diamond', label: '钻石', min: 1000 },
];

export function tierForScore(score: number): TierInfo {
  let current = TIER_THRESHOLDS[0];
  for (const t of TIER_THRESHOLDS) if (score >= t.min) current = t;
  const idx = TIER_THRESHOLDS.findIndex(t => t.tier === current.tier);
  const next = idx < TIER_THRESHOLDS.length - 1 ? TIER_THRESHOLDS[idx + 1] : null;
  const progress = next
    ? Math.min(1, Math.max(0, (score - current.min) / (next.min - current.min)))
    : 1;
  return { tier: current.tier, label: current.label, min: current.min, next: next?.min ?? null, progress };
}

export function tierGradient(tier: PointsTier): string {
  switch (tier) {
    case 'Bronze':  return 'from-amber-700 to-amber-500';
    case 'Silver':  return 'from-slate-400 to-slate-300';
    case 'Gold':    return 'from-yellow-500 to-amber-400';
    case 'Diamond': return 'from-cyan-400 via-sky-400 to-violet-500';
  }
}

// ───────────────────────── Ledger types ─────────────────────────

export interface PointsEntry {
  id: string;
  amount: number;        // positive = earned, negative = spent
  reason: string;
  label: string;
  timestamp: number;
}

export interface PointsLedger {
  balance: number;
  entries: PointsEntry[];
  // anti-abuse bookkeeping
  lastActionAt: Record<string, number>;     // reason -> last timestamp (cooldown)
  dailyCount: Record<string, number>;        // reason -> count today
  dailyResetDay: string;                     // YYYY-MM-DD of dailyCount
}

const EMPTY_LEDGER: PointsLedger = {
  balance: 0,
  entries: [],
  lastActionAt: {},
  dailyCount: {},
  dailyResetDay: today(),
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ───────────────────────── Persistence ─────────────────────────

export function loadLedger(): PointsLedger {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PointsLedger;
      return normalizeDaily(parsed);
    }
  } catch {}
  return { ...EMPTY_LEDGER };
}

function saveLedger(ledger: PointsLedger): void {
  try {
    // cap history to keep storage bounded
    const trimmed = ledger.entries.length > 300
      ? { ...ledger, entries: ledger.entries.slice(-300) }
      : ledger;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

function normalizeDaily(ledger: PointsLedger): PointsLedger {
  if (ledger.dailyResetDay !== today()) {
    return { ...ledger, dailyCount: {}, dailyResetDay: today() };
  }
  return ledger;
}

// ───────────────────────── Eligibility ─────────────────────────

export interface Eligibility {
  ok: boolean;
  reason?: 'cooldown' | 'daily_limit';
  remainingMs?: number;      // for cooldown
  remainingToday?: number;   // for daily limit
}

export function checkEligibility(reason: PointsReason, ledger = loadLedger()): Eligibility {
  const rule = REWARD_RULES[reason];
  if (!rule) return { ok: false };

  const now = Date.now();

  if (rule.cooldownMs > 0) {
    const last = ledger.lastActionAt[reason] ?? 0;
    const elapsed = now - last;
    if (elapsed < rule.cooldownMs) {
      return { ok: false, reason: 'cooldown', remainingMs: rule.cooldownMs - elapsed };
    }
  }

  if (rule.dailyLimit > 0) {
    const fresh = normalizeDaily(ledger);
    const count = fresh.dailyCount[reason] ?? 0;
    if (count >= rule.dailyLimit) {
      return { ok: false, reason: 'daily_limit', remainingToday: 0 };
    }
    return { ok: true, remainingToday: rule.dailyLimit - count };
  }

  return { ok: true };
}

// ───────────────────────── Mutations ─────────────────────────

let listeners: (() => void)[] = [];

export function subscribe(fn: () => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

function notify(): void {
  for (const l of listeners) l();
  // notify other tabs via a storage ping
  try {
    localStorage.setItem('vibecard_points_ping', String(Date.now()));
  } catch {}
}

export interface AwardResult {
  ok: boolean;
  awarded: number;
  balance: number;
  blocked?: Eligibility;
}

/**
 * Award points for an action. Returns ok:false (without throwing) when the
 * action is on cooldown or over its daily limit, so callers can stay silent.
 */
export function award(reason: PointsReason, customAmount?: number): AwardResult {
  let ledger = normalizeDaily(loadLedger());
  const rule = REWARD_RULES[reason];
  if (!rule) return { ok: false, awarded: 0, balance: ledger.balance };

  const eligibility = checkEligibility(reason, ledger);
  if (!eligibility.ok) {
    return { ok: false, awarded: 0, balance: ledger.balance, blocked: eligibility };
  }

  const amount = customAmount ?? rule.amount;
  const now = Date.now();

  ledger = {
    ...ledger,
    balance: ledger.balance + amount,
    entries: [
      ...ledger.entries,
      { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, amount, reason, label: rule.label, timestamp: now },
    ],
    lastActionAt: { ...ledger.lastActionAt, [reason]: now },
    dailyCount: { ...ledger.dailyCount, [reason]: (ledger.dailyCount[reason] ?? 0) + 1 },
  };

  saveLedger(ledger);
  notify();
  return { ok: true, awarded: amount, balance: ledger.balance };
}

export interface SpendResult {
  ok: boolean;
  spent: number;
  balance: number;
  error?: string;
}

/**
 * Spend points. Returns ok:false with an error when balance is insufficient.
 */
export function spend(reason: SpendReason): SpendResult {
  let ledger = normalizeDaily(loadLedger());
  const rule = SPEND_RULES[reason];
  if (!rule) return { ok: false, spent: 0, balance: ledger.balance, error: '未知消费类型' };

  if (ledger.balance < rule.amount) {
    return { ok: false, spent: 0, balance: ledger.balance, error: '积分不足' };
  }

  const now = Date.now();
  ledger = {
    ...ledger,
    balance: ledger.balance - rule.amount,
    entries: [
      ...ledger.entries,
      { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, amount: -rule.amount, reason, label: rule.label, timestamp: now },
    ],
  };

  saveLedger(ledger);
  notify();
  return { ok: true, spent: rule.amount, balance: ledger.balance };
}

export function resetLedger(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  notify();
}

// ───────────────────────── Formatting helpers ─────────────────────────

export function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}
