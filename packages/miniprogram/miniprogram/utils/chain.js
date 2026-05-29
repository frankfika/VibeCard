// utils/chain.js — DappChain for WeChat miniprogram
// Mirrors packages/web/src/lib/chain/chain.ts. Same algorithm, same data shape.
// Uses a self-contained JS SHA-256 because miniprogram has no crypto.subtle.

const STORAGE_KEY = 'vibecard_chain_v1';
const ADDR_KEY = 'vibecard_pseudo_addr';
const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

// ───────────────────────── SHA-256 (FIPS 180-4) ─────────────────────────
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rrot(x, n) { return (x >>> n) | (x << (32 - n)); }

function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) { out.push(0xc0 | (c >> 6)); out.push(0x80 | (c & 0x3f)); }
    else if (c < 0xd800 || c >= 0xe000) {
      out.push(0xe0 | (c >> 12)); out.push(0x80 | ((c >> 6) & 0x3f)); out.push(0x80 | (c & 0x3f));
    } else {
      i++;
      c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      out.push(0xf0 | (c >> 18));
      out.push(0x80 | ((c >> 12) & 0x3f));
      out.push(0x80 | ((c >> 6) & 0x3f));
      out.push(0x80 | (c & 0x3f));
    }
  }
  return out;
}

function sha256(str) {
  const bytes = utf8Bytes(str);
  const l = bytes.length;
  const bitLen = l * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  // 64-bit length, big-endian (high 32 bits = 0 for any practical input)
  for (let i = 0; i < 4; i++) bytes.push(0);
  for (let i = 3; i >= 0; i--) bytes.push((bitLen >>> (i * 8)) & 0xff);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Array(64);
  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const j = chunk + i * 4;
      w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rrot(w[i - 15], 7) ^ rrot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rrot(w[i - 2], 17) ^ rrot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const toHex = (n) => n.toString(16).padStart(8, '0');
  return '0x' + toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7);
}

// ───────────────────────── Persistence ─────────────────────────

function loadChain() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return raw || null;
  } catch { return null; }
}

function saveChain(state) {
  try {
    if (state.blocks.length > 200) state = Object.assign({}, state, { blocks: state.blocks.slice(-200) });
    wx.setStorageSync(STORAGE_KEY, state);
  } catch (e) { /* ignore */ }
}

function getOrCreateAddress(seed) {
  let addr = '';
  try { addr = wx.getStorageSync(ADDR_KEY) || ''; } catch {}
  if (addr) return addr;
  const salt = Math.random().toString(36).slice(2) + '_' + Date.now();
  const h = sha256(seed + ':' + salt);
  addr = '0x' + h.slice(2, 42);
  try { wx.setStorageSync(ADDR_KEY, addr); } catch {}
  return addr;
}

// ───────────────────────── Block construction ─────────────────────────

function hashBlock(b) {
  return sha256(JSON.stringify({
    index: b.index, prevHash: b.prevHash, timestamp: b.timestamp,
    txs: b.txs, nonce: b.nonce, difficulty: b.difficulty,
  }));
}
function hashTx(tx) { return sha256(JSON.stringify(tx)); }

function mineBlock(candidate, difficulty, maxIter) {
  const target = '0'.repeat(difficulty);
  let nonce = candidate.nonce;
  let hash = hashBlock(candidate);
  for (let i = 0; i < (maxIter || 5000); i++) {
    if (hash.slice(2, 2 + difficulty) === target) break;
    nonce++;
    hash = hashBlock(Object.assign({}, candidate, { nonce }));
  }
  return Object.assign({}, candidate, { nonce, hash });
}

// ───────────────────────── Public API ─────────────────────────

function initChain(seed) {
  let state = loadChain();
  if (state) return state;
  const address = getOrCreateAddress(seed || 'vibecard');
  const baseTx = {
    type: 'genesis', from: address,
    payload: { msg: 'vibecard genesis — your personal chain begins.' },
    timestamp: Date.now(), nonce: 0,
  };
  const genesisTx = Object.assign({ id: hashTx(baseTx) }, baseTx);
  const candidate = {
    index: 0, prevHash: ZERO_HASH, timestamp: Date.now(),
    txs: [genesisTx], nonce: 0, difficulty: 2,
  };
  const genesis = mineBlock(candidate, 2);
  state = {
    address,
    blocks: [genesis],
    pending: [],
    badges: ['genesis'],
    stats: {
      txCount: 1, blockCount: 1, streak: 1,
      lastActiveDay: new Date().toISOString().slice(0, 10),
    },
  };
  saveChain(state);
  return state;
}

function getChain() { return loadChain(); }

function emit(type, payload) {
  let state = loadChain() || initChain();
  const nonce = state.stats.txCount;
  const baseTx = {
    type, from: state.address,
    payload: payload || {}, timestamp: Date.now(), nonce,
  };
  const tx = Object.assign({ id: hashTx(baseTx) }, baseTx);
  const prev = state.blocks[state.blocks.length - 1];
  const candidate = {
    index: state.blocks.length, prevHash: prev.hash, timestamp: Date.now(),
    txs: [tx], nonce: 0, difficulty: 2,
  };
  const block = mineBlock(candidate, 2);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let streak = state.stats.streak;
  if (state.stats.lastActiveDay === yesterday) streak += 1;
  else if (state.stats.lastActiveDay !== today) streak = 1;

  const next = {
    address: state.address,
    blocks: state.blocks.concat([block]),
    pending: state.pending,
    badges: state.badges.slice(),
    stats: {
      txCount: state.stats.txCount + 1,
      blockCount: state.blocks.length + 1,
      streak,
      lastActiveDay: today,
    },
  };
  saveChain(next);
  return { tx, block, state: next };
}

function recentBlocks(limit) {
  const s = loadChain();
  if (!s) return [];
  return s.blocks.slice(-(limit || 10)).reverse();
}

function recentTxs(limit) {
  const s = loadChain();
  if (!s) return [];
  const all = [];
  const n = limit || 20;
  for (let i = s.blocks.length - 1; i >= 0 && all.length < n; i--) {
    for (let j = 0; j < s.blocks[i].txs.length && all.length < n; j++) {
      all.push(s.blocks[i].txs[j]);
    }
  }
  return all;
}

function verify() {
  const s = loadChain();
  if (!s) return { ok: false };
  for (let i = 0; i < s.blocks.length; i++) {
    const b = s.blocks[i];
    const recomputed = hashBlock(b);
    if (recomputed !== b.hash) return { ok: false, brokenAt: i };
    if (i > 0 && b.prevHash !== s.blocks[i - 1].hash) return { ok: false, brokenAt: i };
  }
  return { ok: true };
}

function shortHash(h, head, tail) {
  if (!h) return '';
  head = head || 6; tail = tail || 4;
  if (h.length < head + tail + 2) return h;
  return h.slice(0, 2 + head) + '…' + h.slice(-tail);
}

// ───────────────────────── Badges + Reputation ─────────────────────────

const BADGES = [
  { id: 'genesis',        name: 'Genesis',          emoji: '✨', desc: '链上身份诞生',     rarity: 'common' },
  { id: 'first_card',     name: 'First Card',       emoji: '💳', desc: '创建第一张名片',   rarity: 'common' },
  { id: 'edit_5',         name: 'Card Curator',     emoji: '🪄', desc: '5 次以上完善名片', rarity: 'rare' },
  { id: 'first_activity', name: 'Trailblazer',      emoji: '🚀', desc: '发起第一个活动',   rarity: 'rare' },
  { id: 'social_5',       name: 'Connector',        emoji: '🤝', desc: '加入 5 个活动',    rarity: 'rare' },
  { id: 'icebreaker',     name: 'Icebreaker',       emoji: '❄️', desc: '抽过 10 张破冰卡', rarity: 'common' },
  { id: 'streak_3',       name: '3-Day Streak',     emoji: '🔥', desc: '连续 3 天活跃',    rarity: 'rare' },
  { id: 'streak_7',       name: 'Week Warrior',     emoji: '⚡', desc: '连续 7 天活跃',    rarity: 'epic' },
  { id: 'block_50',       name: 'Block Builder',    emoji: '🧱', desc: '链上 50 个区块',   rarity: 'epic' },
  { id: 'thread_lover',   name: 'Storyteller',      emoji: '📖', desc: '发布 3 条动态',    rarity: 'common' },
  { id: 'verified',       name: 'Verified Builder', emoji: '✅', desc: '完成所有名片字段', rarity: 'legendary' },
];

function evaluateBadges(state, profileComplete) {
  if (!state) return [];
  const earned = state.badges.slice();
  const flat = [];
  for (let i = 0; i < state.blocks.length; i++) {
    for (let j = 0; j < state.blocks[i].txs.length; j++) flat.push(state.blocks[i].txs[j]);
  }
  const has = (id) => earned.indexOf(id) >= 0;
  const countType = (t) => flat.filter((x) => x.type === t).length;

  const checks = {
    first_card: () => countType('profile.create') >= 1,
    edit_5: () => countType('profile.update') >= 5,
    first_activity: () => countType('activity.create') >= 1,
    social_5: () => countType('activity.join') >= 5,
    icebreaker: () => countType('card.draw') >= 10,
    streak_3: () => state.stats.streak >= 3,
    streak_7: () => state.stats.streak >= 7,
    block_50: () => state.stats.blockCount >= 50,
    thread_lover: () => countType('thread.publish') >= 3,
    verified: () => !!profileComplete,
  };
  const newly = [];
  for (let i = 0; i < BADGES.length; i++) {
    const id = BADGES[i].id;
    if (id === 'genesis') continue;
    if (has(id)) continue;
    const c = checks[id];
    if (c && c()) newly.push(id);
  }
  if (newly.length) {
    const state2 = loadChain();
    if (state2) {
      state2.badges = state2.badges.concat(newly);
      saveChain(state2);
      for (let i = 0; i < newly.length; i++) emit('badge.earn', { badge: newly[i] });
    }
  }
  return newly;
}

function computeReputation(state) {
  if (!state) return { total: 0, level: 1, tier: 'Newcomer', progress: 0, nextLevelAt: 100 };
  const flat = [];
  for (let i = 0; i < state.blocks.length; i++) {
    for (let j = 0; j < state.blocks[i].txs.length; j++) flat.push(state.blocks[i].txs[j]);
  }
  const distinctTypes = {};
  for (let i = 0; i < flat.length; i++) distinctTypes[flat[i].type] = 1;
  const types = Object.keys(distinctTypes).length;
  const activity = Math.min(400, state.stats.txCount * 2);
  const streak = Math.min(200, state.stats.streak * 8);
  const badges = Math.min(500, state.badges.length * 25);
  const diversity = Math.min(150, types * 12);
  const total = activity + streak + badges + diversity;
  const level = Math.max(1, Math.floor(Math.sqrt(total / 25)) + 1);
  const tiers = [
    { tier: 'Newcomer',    min: 0    },
    { tier: 'Builder',     min: 100  },
    { tier: 'Contributor', min: 300  },
    { tier: 'Pioneer',     min: 700  },
    { tier: 'Legend',      min: 1500 },
  ];
  let tier = 'Newcomer';
  for (let i = 0; i < tiers.length; i++) if (total >= tiers[i].min) tier = tiers[i].tier;
  const next = level * level * 25;
  const prev = (level - 1) * (level - 1) * 25;
  const progress = next === prev ? 1 : Math.max(0, Math.min(1, (total - prev) / (next - prev)));
  return { total, level, tier, progress, nextLevelAt: next, components: { activity, streak, badges, diversity } };
}

function resetChain() {
  try { wx.removeStorageSync(STORAGE_KEY); wx.removeStorageSync(ADDR_KEY); } catch {}
}

module.exports = {
  initChain, getChain, emit, recentBlocks, recentTxs, verify,
  shortHash, evaluateBadges, computeReputation, resetChain,
  BADGES, sha256,
};
