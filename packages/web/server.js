/**
 * vibecard namecard short-url server.
 *
 * - POST /api/cards  body: { profile }  -> { id, url, revokeToken? }
 *   - Creates an independently addressed public snapshot with a revocation
 *     capability returned only to its creator.
 * - GET  /api/cards/:id  -> profile payload
 * - DELETE /api/cards/:id (Bearer revokeToken) -> revoke the snapshot
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
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = path.resolve(process.env.DATA_DIR || '.data');
const DATA_FILE = path.join(DATA_DIR, 'cards.json');
const WEB_DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(process.env.WEB_DIST_DIR || path.join(WEB_DIR, 'dist'));
const SERVE_WEB = process.env.SERVE_WEB === '1';
const API_UPSTREAM = String(process.env.VIBECARD_API_UPSTREAM || '').replace(/\/+$/, '');
const CORS_ORIGIN = process.env.CORS_ORIGIN || (SERVE_WEB ? 'same-origin' : '*');
const MAX_PAYLOAD = 64 * 1024; // 64KB
const MAX_ID_LEN = 64;
const MAX_BODY_BYTES = MAX_PAYLOAD;
const REQUIRE_MODERATION = process.env.REQUIRE_MODERATION === '1';
const MODERATION_API_URL = String(process.env.MODERATION_API_URL || '').trim();
const MODERATION_API_KEY = String(process.env.MODERATION_API_KEY || '').trim();
const parsedModerationTimeout = Number(process.env.MODERATION_TIMEOUT_MS || 5000);
const MODERATION_TIMEOUT_MS = Number.isFinite(parsedModerationTimeout)
  ? Math.max(500, Math.floor(parsedModerationTimeout))
  : 5000;
const ENABLE_PUBLIC_SNAPSHOTS = process.env.ENABLE_PUBLIC_SNAPSHOTS === '1';
const parsedSnapshotTtl = Number(process.env.PUBLIC_SNAPSHOT_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const PUBLIC_SNAPSHOT_TTL_MS = Number.isFinite(parsedSnapshotTtl)
  ? Math.min(30 * 24 * 60 * 60 * 1000, Math.max(60_000, Math.floor(parsedSnapshotTtl)))
  : 7 * 24 * 60 * 60 * 1000;

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
  // atomic write: write to a uniquely-named temp file then rename, so
  // concurrent saves never collide on the tmp path
  const tmp = `${DATA_FILE}.tmp-${process.pid}-${crypto.randomUUID()}`;
  await fs.writeFile(tmp, JSON.stringify(db));
  await fs.rename(tmp, DATA_FILE);
}

// Concurrent upserts race on load-modify-save; serialize mutations through a
// simple promise queue so the latest profile always wins cleanly.
let mutationQueue = Promise.resolve();
function enqueueMutation(fn) {
  const run = mutationQueue.then(fn, fn);
  mutationQueue = run.catch(() => {});
  return run;
}

function hasRevocationCapability(card) {
  return Boolean(card && typeof card === 'object' && typeof card.revokeHash === 'string' && /^[a-f0-9]{64}$/i.test(card.revokeHash));
}

function snapshotExpiresAt(card) {
  if (typeof card?.expiresAt === 'number' && Number.isFinite(card.expiresAt)) return card.expiresAt;
  if (typeof card?.updatedAt === 'number' && Number.isFinite(card.updatedAt)) return card.updatedAt + PUBLIC_SNAPSHOT_TTL_MS;
  return 0;
}

function isReadableSnapshot(card, now = Date.now()) {
  return hasRevocationCapability(card) && snapshotExpiresAt(card) > now;
}

// Records created before revocation capabilities existed cannot be safely
// owned. Remove them on startup and also deny them at read time below.
await enqueueMutation(async () => {
  const db = await load();
  let changed = false;
  for (const [id, card] of Object.entries(db)) {
    if (!isReadableSnapshot(card)) {
      delete db[id];
      changed = true;
    }
  }
  if (changed) await save(db);
});

// --- id derivation ------------------------------------------------------

function randomSnapshotId() {
  // Every publication gets its own unguessable namespace and revocation
  // capability. Identical public profiles must never share a URL or let one
  // publisher revoke the other publisher's Card.
  return `c_${crypto.randomBytes(18).toString('base64url')}`;
}

// Defense in depth: even an old or modified client cannot publish owner-only
// fields to the public card store.
function projectPublicProfile(profile) {
  const text = value => typeof value === 'string' ? value : undefined;
  const scalarKeys = [
    'name', 'handle', 'avatar', 'bio', 'mbti', 'zodiac', 'age', 'location',
    'lookingFor', 'event', 'currentFocus',
  ];
  const projected = {};
  if (Number.isInteger(profile.schemaVersion)) projected.schemaVersion = profile.schemaVersion;
  for (const key of scalarKeys) {
    const value = text(profile[key]);
    if (value !== undefined) projected[key] = value;
  }
  if (typeof profile.agentEnabled === 'boolean') projected.agentEnabled = profile.agentEnabled;
  if (Array.isArray(profile.tags)) {
    projected.tags = profile.tags.flatMap(item => {
      if (!item || typeof item !== 'object' || typeof item.label !== 'string') return [];
      return [{ label: item.label, icon: typeof item.icon === 'string' ? item.icon : '' }];
    });
  }
  if (Array.isArray(profile.canHelpWith)) projected.canHelpWith = profile.canHelpWith.filter(item => typeof item === 'string');
  if (Array.isArray(profile.highlights)) {
    projected.highlights = profile.highlights.flatMap(item => {
      if (!item || typeof item !== 'object' || typeof item.title !== 'string') return [];
      return [{
        id: typeof item.id === 'number' ? item.id : 0,
        title: item.title,
        type: typeof item.type === 'string' ? item.type : '',
        icon: typeof item.icon === 'string' ? item.icon : '',
        link: typeof item.link === 'string' ? item.link : '',
      }];
    });
  }
  if (Array.isArray(profile.nowItems)) {
    projected.nowItems = profile.nowItems.flatMap(item => {
      if (!item || typeof item !== 'object' || typeof item.text !== 'string') return [];
      return [{
        id: typeof item.id === 'string' ? item.id : '',
        schemaVersion: 1,
        text: item.text,
        topic: typeof item.topic === 'string' ? item.topic : 'current_work',
        status: item.status === 'published' ? 'published' : 'deleted',
        publishedAt: typeof item.publishedAt === 'number' ? item.publishedAt : null,
        expiresAt: typeof item.expiresAt === 'number' ? item.expiresAt : null,
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : 0,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
      }];
    });
  }
  return projected;
}

function collectPublicStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach(item => collectPublicStrings(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectPublicStrings(item, output));
  return output;
}

async function moderatePublicProfile(profile) {
  // A configured hook is always honored. REQUIRE_MODERATION additionally
  // makes a missing hook fail closed for publicly exposed deployments.
  if (!MODERATION_API_URL) throw new Error('moderation_unavailable');
  const headers = { 'content-type': 'application/json' };
  if (MODERATION_API_KEY) headers.authorization = `Bearer ${MODERATION_API_KEY}`;
  let response;
  try {
    response = await fetch(MODERATION_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: collectPublicStrings(profile).join('\n') }),
      signal: AbortSignal.timeout(MODERATION_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`moderation HTTP ${response.status}`);
    const verdict = await response.json();
    if (!verdict || typeof verdict !== 'object' || typeof verdict.ok !== 'boolean') throw new Error('invalid moderation verdict');
    if (!verdict.ok) return false;
    return true;
  } catch {
    throw new Error('moderation_unavailable');
  }
}

// --- app ----------------------------------------------------------------

const app = express();
app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

function proxyToVibeServer(req, res, next) {
  if (!API_UPSTREAM) {
    return res.status(503).json({ error: { code: 'runtime_unavailable', message: 'Vibe 服务尚未配置' } });
  }
  let upstream;
  try {
    upstream = new URL(req.originalUrl || req.url, `${API_UPSTREAM}/`);
  } catch {
    return res.status(503).json({ error: { code: 'runtime_unavailable', message: '服务端地址配置无效' } });
  }
  const transport = upstream.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: upstream.host };
  delete headers.connection;
  delete headers['content-length'];
  const request = transport.request(upstream, { method: req.method, headers }, response => {
    const responseHeaders = { ...response.headers };
    delete responseHeaders.connection;
    res.writeHead(response.statusCode || 502, responseHeaders);
    response.pipe(res);
  });
  request.setTimeout(30_000, () => request.destroy(new Error('upstream timeout')));
  request.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: { code: 'runtime_unavailable', message: 'Vibe 服务暂时不可用' } });
    else res.end();
  });
  req.pipe(request);
}

// Keep owner credentials same-origin in production. The upstream is a fixed
// operator-controlled address and can never be supplied by a request.
app.use('/api/v1', proxyToVibeServer);
app.use(express.json({ limit: MAX_BODY_BYTES }));

// CORS for local dev (vite 3000 -> server 3001)
app.use((req, res, next) => {
  if (CORS_ORIGIN !== 'same-origin') res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get('/healthz', async (_req, res) => {
  if (!SERVE_WEB) return res.json({ ok: true, web: false });
  try {
    await fs.access(path.join(DIST_DIR, 'index.html'));
  } catch {
    return res.status(503).json({ ok: false, web: false, api: Boolean(API_UPSTREAM) });
  }
  if (!API_UPSTREAM) return res.json({ ok: true, web: true, api: false, mode: 'local-only' });
  try {
    const response = await fetch(`${API_UPSTREAM}/healthz`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return res.json({ ok: true, web: true, api: true });
  } catch {
    return res.status(503).json({ ok: false, web: true, api: false });
  }
});

app.get('/api/cards/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id || id.length > MAX_ID_LEN || !/^[a-z0-9_-]+$/i.test(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }
  const db = await load();
  const card = db[id];
  // Pre-capability records cannot be safely owned or revoked. Fail closed
  // instead of keeping an irrevocable legacy Card public forever.
  if (!isReadableSnapshot(card)) return res.status(404).json({ error: 'not found' });
  // Revocation must take effect on the next lookup; do not let a browser or
  // intermediary retain a readable copy after DELETE succeeds.
  res.setHeader('Cache-Control', 'no-store');
  const { revokeHash: _revokeHash, ...publicCard } = card;
  res.json(publicCard);
});

app.delete('/api/cards/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id || id.length > MAX_ID_LEN || !/^[a-z0-9_-]+$/i.test(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }
  const authorization = String(req.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : '';
  if (!token) return res.status(401).json({ error: 'revocation token required' });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const outcome = await enqueueMutation(async () => {
    const db = await load();
    const card = db[id];
    if (!card) return 'missing';
    if (!hasRevocationCapability(card)) return 'forbidden';
    const expected = Buffer.from(card.revokeHash, 'hex');
    const actual = Buffer.from(tokenHash, 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return 'forbidden';
    delete db[id];
    await save(db);
    return 'deleted';
  });
  if (outcome === 'missing') return res.status(404).json({ error: 'not found' });
  if (outcome === 'forbidden') return res.status(403).json({ error: 'invalid revocation token' });
  return res.status(204).end();
});

const publishBuckets = new Map();
function allowPublicSnapshot(req) {
  const now = Date.now();
  const key = req.socket.remoteAddress || 'unknown';
  const current = publishBuckets.get(key);
  if (!current || now - current.startedAt >= 60 * 60 * 1000) {
    publishBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= 30) return false;
  current.count += 1;
  return true;
}

app.post('/api/cards', async (req, res) => {
  if (!ENABLE_PUBLIC_SNAPSHOTS) {
    return res.status(404).json({ error: 'public snapshots disabled' });
  }
  if (!allowPublicSnapshot(req)) {
    return res.status(429).json({ error: 'rate limited' });
  }
  const body = req.body || {};
  const profile = body.profile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return res.status(400).json({ error: 'profile object required' });
  }
  const publicProfile = projectPublicProfile(profile);
  let moderationVerdict;
  try {
    moderationVerdict = await moderatePublicProfile(publicProfile);
  } catch {
    return res.status(503).json({ error: 'moderation unavailable' });
  }
  if (moderationVerdict === false) return res.status(403).json({ error: 'content rejected' });

  const result = await enqueueMutation(async () => {
    const db = await load();
    let id;
    do id = randomSnapshotId(); while (db[id]);
    const revokeToken = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    db[id] = {
      id,
      profile: publicProfile,
      updatedAt: now,
      createdAt: now,
      expiresAt: now + PUBLIC_SNAPSHOT_TTL_MS,
      revokeHash: crypto.createHash('sha256').update(revokeToken).digest('hex'),
    };
    await save(db);
    return { id, revokeToken };
  });
  res.status(201).json({ id: result.id, url: `/?id=${result.id}`, revokeToken: result.revokeToken });
});

if (SERVE_WEB) {
  app.use(express.static(DIST_DIR, {
    index: false,
    setHeaders(res, filePath) {
      if (/-[a-z0-9_-]{8,}\.(?:js|css)$/i.test(path.basename(filePath))) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=300');
      }
    },
  }));
  app.get('*', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST_DIR, 'index.html'), error => error ? next(error) : undefined);
  });
}

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
  console.log(`[vibecard-web] listening on http://localhost:${PORT} web=${SERVE_WEB} api=${API_UPSTREAM ? 'proxied' : 'local-only'} data=${DATA_FILE}`);
});

function shutdown(sig) {
  console.log(`[vibecard-web] ${sig} received, closing`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
