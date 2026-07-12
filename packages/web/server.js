/**
 * vibecard namecard short-url server.
 *
 * - POST /api/cards  body: { profile }  -> { id, url }
 *   - Derives a stable id from profile.handle (preferred) or wallet address,
 *     so the same person can reuse the same share URL across edits.
 *   - Upserts; latest profile wins.
 * - GET  /api/cards/:id  -> profile payload
 * - GET  /api/health
 *
 * Storage: a single JSON file under .data/cards.json. Good enough for
 * low-volume, single-instance deployments. Swap for SQLite/Postgres when
 * the card count outgrows a few thousand.
 */
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = path.resolve(process.env.DATA_DIR || '.data');
const DATA_FILE = path.join(DATA_DIR, 'cards.json');
const MAX_PAYLOAD = 64 * 1024; // 64KB
const MAX_ID_LEN = 64;
const MAX_BODY_BYTES = MAX_PAYLOAD;

// --- storage ------------------------------------------------------------

async function load() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
}

async function save(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  // atomic write: write to temp then rename
  const tmp = DATA_FILE + '.tmp-' + process.pid;
  await fs.writeFile(tmp, JSON.stringify(db));
  await fs.rename(tmp, DATA_FILE);
}

// --- id derivation ------------------------------------------------------

function deriveId(profile) {
  if (profile && typeof profile.handle === 'string') {
    const h = profile.handle.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (h.length >= 2) return h.slice(0, MAX_ID_LEN);
  }
  if (profile && profile.verified && typeof profile.verified.wallet === 'string') {
    const w = profile.verified.wallet.replace(/^0x/i, '').toLowerCase();
    if (w.length >= 8) return 'w_' + w.slice(0, 8);
  }
  return 'n_' + crypto.randomBytes(4).toString('hex');
}

// --- app ----------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: MAX_BODY_BYTES }));

// CORS for local dev (vite 3000 -> server 3001)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get('/api/cards/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id || id.length > MAX_ID_LEN || !/^[a-z0-9_-]+$/i.test(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }
  const db = await load();
  const card = db[id];
  if (!card) return res.status(404).json({ error: 'not found' });
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json(card);
});

app.post('/api/cards', async (req, res) => {
  const body = req.body || {};
  const profile = body.profile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return res.status(400).json({ error: 'profile object required' });
  }
  const id = deriveId(profile);
  if (!id) return res.status(400).json({ error: 'cannot derive id' });

  const db = await load();
  const isNew = !db[id];
  db[id] = {
    id,
    profile,
    updatedAt: Date.now(),
    createdAt: db[id]?.createdAt || Date.now(),
  };
  await save(db);
  res.status(isNew ? 201 : 200).json({ id, url: `/?id=${id}` });
});

app.use((err, _req, res, _next) => {
  // express 4 doesn't always surface JSON parse errors as 4xx; map them.
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload too large' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid json' });
  }
  console.error('[namecard-server] unhandled', err);
  res.status(500).json({ error: 'internal' });
});

const server = app.listen(PORT, () => {
  console.log(`[namecard-server] listening on http://localhost:${PORT}  data=${DATA_FILE}`);
});

function shutdown(sig) {
  console.log(`[namecard-server] ${sig} received, closing`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
