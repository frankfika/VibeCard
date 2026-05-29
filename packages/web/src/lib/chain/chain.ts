/**
 * DappChain — A lightweight, client-side personal microchain.
 *
 * Each user runs their own deterministic SHA-256 linked chain in the browser:
 *   - Genesis block is created on first launch (seeded by user "address")
 *   - Every meaningful action (profile edit, badge earn, activity join) emits a Transaction
 *   - Transactions are batched into Blocks; each block links to the previous via prevHash
 *   - Tamper-evident: any edit invalidates the chain (verify() returns false)
 *
 * Optional: a block can be anchored to a real EVM chain via the existing wagmi flow.
 * The on-chain anchor stores only the latest blockHash (32 bytes) — gas is minimal.
 */

const STORAGE_KEY = 'vibecard_chain_v1';

export type TxType =
  | 'genesis'
  | 'profile.create'
  | 'profile.update'
  | 'badge.earn'
  | 'activity.create'
  | 'activity.join'
  | 'activity.leave'
  | 'card.draw'
  | 'card.favorite'
  | 'thread.publish'
  | 'sayHi';

export interface Transaction {
  id: string;            // tx hash (short, derived from payload)
  type: TxType;
  from: string;          // user pseudo-address (derived from device + name)
  payload: Record<string, unknown>;
  timestamp: number;
  nonce: number;
}

export interface Block {
  index: number;
  prevHash: string;
  hash: string;
  timestamp: number;
  txs: Transaction[];
  nonce: number;
  difficulty: number;    // for visual mining (number of leading zeros required)
}

export interface ChainState {
  address: string;
  blocks: Block[];
  pending: Transaction[];
  badges: string[];      // badge ids earned
  stats: {
    txCount: number;
    blockCount: number;
    streak: number;      // consecutive day activity
    lastActiveDay: string;
  };
}

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

// ───────────────────────── Hash helpers ─────────────────────────

async function sha256(str: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const arr = Array.from(new Uint8Array(buf));
    return '0x' + arr.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback (very unlikely in modern browsers)
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return '0x' + Math.abs(h).toString(16).padStart(64, '0');
}

export function shortHash(h: string, head = 6, tail = 4): string {
  if (!h || h.length < head + tail + 2) return h;
  return `${h.slice(0, 2 + head)}…${h.slice(-tail)}`;
}

// ───────────────────────── Address derivation ─────────────────────────

/**
 * Derive a pseudo-address from a user identity. We don't have a real key pair —
 * we just need a deterministic 40-hex string that "looks like" an Ethereum address
 * so the UX feels familiar.
 */
export async function deriveAddress(seed: string): Promise<string> {
  const stored = localStorage.getItem('vibecard_pseudo_addr');
  if (stored) return stored;
  const salt = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  const h = await sha256(`${seed}:${salt}:${Date.now()}`);
  const addr = '0x' + h.slice(2, 42);
  localStorage.setItem('vibecard_pseudo_addr', addr);
  return addr;
}

export function getStoredAddress(): string | null {
  return localStorage.getItem('vibecard_pseudo_addr');
}

// ───────────────────────── Block construction ─────────────────────────

async function hashBlock(b: Omit<Block, 'hash'>): Promise<string> {
  const payload = JSON.stringify({
    index: b.index,
    prevHash: b.prevHash,
    timestamp: b.timestamp,
    txs: b.txs,
    nonce: b.nonce,
    difficulty: b.difficulty,
  });
  return sha256(payload);
}

async function hashTx(tx: Omit<Transaction, 'id'>): Promise<string> {
  return sha256(JSON.stringify(tx));
}

async function mineBlock(
  candidate: Omit<Block, 'hash'>,
  difficulty: number,
  maxIter = 5000,
): Promise<Block> {
  // Tiny "proof-of-work" — purely cosmetic, capped to avoid blocking the UI.
  // We're satisfied with whatever hash we land on after maxIter attempts.
  const target = '0'.repeat(difficulty);
  let nonce = candidate.nonce;
  let hash = await hashBlock(candidate);
  for (let i = 0; i < maxIter; i++) {
    if (hash.slice(2, 2 + difficulty) === target) break;
    nonce++;
    hash = await hashBlock({ ...candidate, nonce });
  }
  return { ...candidate, nonce, hash };
}

// ───────────────────────── Persistence ─────────────────────────

function loadChain(): ChainState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ChainState;
  } catch {
    return null;
  }
}

function saveChain(state: ChainState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded — drop oldest blocks beyond 200
    if (state.blocks.length > 200) {
      const trimmed = { ...state, blocks: state.blocks.slice(-200) };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); } catch {}
    }
  }
}

// ───────────────────────── Public API ─────────────────────────

export async function initChain(seed = 'vibecard'): Promise<ChainState> {
  const existing = loadChain();
  if (existing) return existing;

  const address = await deriveAddress(seed);
  const genesisTx: Transaction = {
    id: await hashTx({
      type: 'genesis',
      from: address,
      payload: { msg: 'vibecard genesis — your personal chain begins.' },
      timestamp: Date.now(),
      nonce: 0,
    }),
    type: 'genesis',
    from: address,
    payload: { msg: 'vibecard genesis — your personal chain begins.' },
    timestamp: Date.now(),
    nonce: 0,
  };

  const candidate: Omit<Block, 'hash'> = {
    index: 0,
    prevHash: ZERO_HASH,
    timestamp: Date.now(),
    txs: [genesisTx],
    nonce: 0,
    difficulty: 2,
  };
  const genesis = await mineBlock(candidate, 2);

  const state: ChainState = {
    address,
    blocks: [genesis],
    pending: [],
    badges: ['genesis'],
    stats: {
      txCount: 1,
      blockCount: 1,
      streak: 1,
      lastActiveDay: new Date().toISOString().slice(0, 10),
    },
  };
  saveChain(state);
  return state;
}

export function getChain(): ChainState | null {
  return loadChain();
}

export async function emit(
  type: TxType,
  payload: Record<string, unknown> = {},
): Promise<{ tx: Transaction; block: Block; state: ChainState }> {
  let state = loadChain();
  if (!state) state = await initChain();

  const nonce = state.stats.txCount;
  const baseTx = {
    type,
    from: state.address,
    payload,
    timestamp: Date.now(),
    nonce,
  };
  const tx: Transaction = { id: await hashTx(baseTx), ...baseTx };

  // Each emit becomes its own block — keeps the explorer lively.
  const prev = state.blocks[state.blocks.length - 1];
  const candidate: Omit<Block, 'hash'> = {
    index: state.blocks.length,
    prevHash: prev.hash,
    timestamp: Date.now(),
    txs: [tx],
    nonce: 0,
    difficulty: 2,
  };
  const block = await mineBlock(candidate, 2);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  let streak = state.stats.streak;
  if (state.stats.lastActiveDay === yesterday) streak += 1;
  else if (state.stats.lastActiveDay !== today) streak = 1;

  const newState: ChainState = {
    ...state,
    blocks: [...state.blocks, block],
    stats: {
      txCount: state.stats.txCount + 1,
      blockCount: state.blocks.length + 1,
      streak,
      lastActiveDay: today,
    },
  };
  saveChain(newState);
  return { tx, block, state: newState };
}

export function recentBlocks(limit = 10): Block[] {
  const state = loadChain();
  if (!state) return [];
  return state.blocks.slice(-limit).reverse();
}

export function recentTxs(limit = 20): Transaction[] {
  const state = loadChain();
  if (!state) return [];
  const all: Transaction[] = [];
  for (let i = state.blocks.length - 1; i >= 0 && all.length < limit; i--) {
    for (const tx of state.blocks[i].txs) {
      all.push(tx);
      if (all.length >= limit) break;
    }
  }
  return all;
}

export async function verify(): Promise<{ ok: boolean; brokenAt?: number }> {
  const state = loadChain();
  if (!state) return { ok: false };
  for (let i = 0; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    const recomputed = await hashBlock({
      index: b.index,
      prevHash: b.prevHash,
      timestamp: b.timestamp,
      txs: b.txs,
      nonce: b.nonce,
      difficulty: b.difficulty,
    });
    if (recomputed !== b.hash) return { ok: false, brokenAt: i };
    if (i > 0 && b.prevHash !== state.blocks[i - 1].hash) {
      return { ok: false, brokenAt: i };
    }
  }
  return { ok: true };
}

export function resetChain(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('vibecard_pseudo_addr');
}

export async function ensureBadge(state: ChainState, badge: string): Promise<ChainState> {
  if (state.badges.includes(badge)) return state;
  const updated: ChainState = { ...state, badges: [...state.badges, badge] };
  saveChain(updated);
  await emit('badge.earn', { badge });
  return loadChain() ?? updated;
}
