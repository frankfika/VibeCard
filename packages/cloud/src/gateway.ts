import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  createHashEmbeddingProvider,
  createInMemoryVectorStore,
  createMockModelProvider,
  exportKnowledgeBundle,
  externalKnowledgeAdapter,
  fileKnowledgeAdapter,
  importArchive,
  linkKnowledgeAdapter,
  ModelProviderError,
  noteKnowledgeAdapter,
  ownerNamespace,
  retrieveKnowledgeChunks,
  type EmbeddingProvider,
  type CanonicalKnowledgeSource,
  type KnowledgeChunk,
  type KnowledgeSourceAdapter,
  type ModelProvider,
  type VectorStore,
} from '../../shared/index.ts';
import { createApp, listen, type App } from '../../server/src/app.ts';
import type { ServerConfig } from '../../server/src/config.ts';
import { addUsage, checkManagedUsage, PLAN_LIMITS, type BillingStatus, type ManagedPlan, type Usage } from './plan.ts';
import { createPinnedByokProvider, resolvePublicByokBase, type ByokLookup } from './byok.ts';
import {
  accountDataDir,
  archiveHash,
  enforceRetention,
  flattenArchive,
  loadBackups,
  loadKnowledge,
  loadSyncState,
  reconcileSnapshot,
  safeRegion,
  saveBackups,
  saveKnowledge,
  saveSyncState,
  type ManagedKnowledgeFile,
  type SyncState,
} from './managed-storage.ts';

interface AccountRecord {
  id: string;
  slug: string;
  tokenHash: string;
  region: string;
  retentionDays: number;
  deviceIds: string[];
  notifications: { id: string; type: 'connection_request'; createdAt: number; read: boolean }[];
  createdAt: number;
  plan: ManagedPlan;
  billingStatus: BillingStatus;
  aiMode: 'managed' | 'byok';
  byok?: { base: string; model: string; apiKey: string };
  usage: Usage;
  /** Optional owner-selected destination retained by the managed link after migration. */
  publicRedirectUrl?: string;
  /** Crash-safe marker: Core delete succeeded and managed adjuncts still need erasure. */
  pendingManagedErase?: boolean;
  lastKnowledgeWriteAt?: number | null;
  lastKnowledgeExportAt?: number | null;
  knowledgeRevision?: number;
  lastKnowledgeExportRevision?: number | null;
  lastKnowledgeExportDigest?: string | null;
}

interface Runtime { app: App; server: ReturnType<typeof createServer>; port: number }

export interface ManagedGatewayOptions {
  dataDir: string;
  masterSecret: string;
  provider?: ModelProvider;
  embeddingProvider?: EmbeddingProvider;
  vectorStore?: VectorStore;
  /** Required for public stranger knowledge search; absence fails closed. */
  moderatePublicText?: (text: string) => Promise<boolean>;
  corsOrigin?: string;
  allowedRegions?: readonly string[];
  now?: () => number;
  dnsLookup?: ByokLookup;
  /** Test/adapter seam for durable export delivery; invoked after snapshot read. */
  knowledgeExportBarrier?: (accountId: string) => Promise<void>;
  /** Fault seam after canonical knowledge commit, before registry persistence. */
  knowledgeCommitBarrier?: (accountId: string) => Promise<void>;
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(value));
}

class RequestBodyError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function body(req: IncomingMessage, maxBytes = 2 * 1024 * 1024) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const value = chunk as Buffer; bytes += value.length;
    if (bytes > maxBytes) throw new RequestBodyError(413, 'payload_too_large', 'request body exceeds the managed gateway limit');
    chunks.push(value);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; }
  catch { throw new RequestBodyError(400, 'invalid_json', 'request body must be valid JSON'); }
}

function hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
function equal(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function bearer(req: IncomingMessage) { return (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); }

function canonicalRedirectPath(pathname: string): string {
  let decoded = pathname;
  // Decode repeatedly so encoded unreserved characters and encoded slashes
  // cannot hide a route that an edge proxy may normalize before forwarding.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  return decoded.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
}

function pointsAtManagedCardNamespace(destination: URL, slug: string): boolean {
  const path = canonicalRedirectPath(destination.pathname);
  const namespace = `/api/v1/cloud/cards/${slug}`;
  return path === namespace || path.startsWith(`${namespace}/`);
}

function secretKey(master: string) { return createHash('sha256').update(master).digest(); }
function seal(master: string, value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', secretKey(master), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
function unseal(master: string, value: string) {
  const [iv, tag, encrypted] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', secretKey(master), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export function createManagedGateway(options: ManagedGatewayOptions) {
  mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
  chmodSync(options.dataDir, 0o700);
  const clock = options.now ?? Date.now;
  const allowedRegions = new Set(options.allowedRegions ?? ['ap-shanghai', 'ap-singapore', 'eu-frankfurt', 'us-west']);
  const registryPath = join(options.dataDir, 'accounts.json');
  const loadedRecords: AccountRecord[] = existsSync(registryPath)
    ? JSON.parse(readFileSync(registryPath, 'utf8'))
    : [];
  const records: AccountRecord[] = [];
  const quarantined: AccountRecord[] = [];
  for (const record of loadedRecords) {
    try {
      safeRegion(record.region);
      if (!allowedRegions.has(record.region)) throw new Error('unsupported region');
      records.push(record);
    } catch { quarantined.push(record); }
  }
  if (quarantined.length) writeFileSync(join(options.dataDir, 'accounts.quarantine.json'), JSON.stringify(quarantined, null, 2), { mode: 0o600 });
  if (existsSync(registryPath)) chmodSync(registryPath, 0o600);
  for (const record of records) {
    record.plan ??= 'free'; record.billingStatus ??= 'active'; record.aiMode ??= 'managed';
    record.usage ??= { modelCalls: 0, retrievalCalls: 0, knowledgeBytes: 0, estimatedCents: 0 };
    record.usage.retrievalCalls ??= 0;
    record.lastKnowledgeWriteAt ??= null;
    record.lastKnowledgeExportAt ??= null;
    record.knowledgeRevision ??= 0;
    record.lastKnowledgeExportRevision ??= null;
    record.lastKnowledgeExportDigest ??= null;
  }
  const runtimes = new Map<string, Runtime>();
  const managedProvider = options.provider ?? createMockModelProvider();
  const embeddingProvider = options.embeddingProvider ?? createHashEmbeddingProvider();
  const vectorStore = options.vectorStore ?? createInMemoryVectorStore();
  const syncQueues = new Map<string, Promise<unknown>>();
  interface AccountActivity {
    closing: boolean;
    inflight: number;
    drained: Set<() => void>;
  }
  const accountActivities = new Map<string, AccountActivity>();
  const indexedKnowledge = new Set<string>();
  let knowledgeExportActive = false;
  const creationRatePath = join(options.dataDir, 'account-creation-rate.json');
  const creationRate: Record<string, number[]> = existsSync(creationRatePath) ? JSON.parse(readFileSync(creationRatePath, 'utf8')) : {};
  const publicSearchRate = new Map<string, number[]>();

  const persist = () => {
    const tmp = `${registryPath}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(records, null, 2), { mode: 0o600 });
    renameSync(tmp, registryPath);
    chmodSync(registryPath, 0o600);
  };
  const persistCreationRate = () => {
    const tmp = `${creationRatePath}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(creationRate), { mode: 0o600 });
    renameSync(tmp, creationRatePath);
  };
  const consumeAccountCreation = (req: IncomingMessage): boolean => {
    const source = req.socket.remoteAddress || 'unknown';
    const key = createHmac('sha256', options.masterSecret).update(source).digest('hex');
    const cutoff = clock() - 3_600_000;
    const recent = (creationRate[key] ?? []).filter(timestamp => timestamp > cutoff);
    if (recent.length >= 5) { creationRate[key] = recent; persistCreationRate(); return false; }
    recent.push(clock()); creationRate[key] = recent;
    for (const [candidate, timestamps] of Object.entries(creationRate)) {
      const retained = timestamps.filter(timestamp => timestamp > cutoff);
      if (retained.length) creationRate[candidate] = retained; else delete creationRate[candidate];
    }
    persistCreationRate(); return true;
  };
  const consumePublicSearch = (req: IncomingMessage, record: AccountRecord): boolean => {
    const ipHash = createHmac('sha256', options.masterSecret).update(req.socket.remoteAddress || 'unknown').digest('hex');
    const key = `${record.id}:${ipHash}`; const cutoff = clock() - 3_600_000;
    const recent = (publicSearchRate.get(key) ?? []).filter(timestamp => timestamp > cutoff);
    if (recent.length >= 60) { publicSearchRate.set(key, recent); return false; }
    recent.push(clock()); publicSearchRate.set(key, recent);
    if (publicSearchRate.size > 10_000) {
      for (const [candidate, timestamps] of publicSearchRate) {
        const retained = timestamps.filter(timestamp => timestamp > cutoff);
        if (retained.length) publicSearchRate.set(candidate, retained); else publicSearchRate.delete(candidate);
      }
    }
    return true;
  };
  const internalToken = (id: string) => createHmac('sha256', options.masterSecret).update(id).digest('base64url');
  const recordDir = (record: AccountRecord) => accountDataDir(options.dataDir, record.region, record.id);
  const dbPathFor = (record: AccountRecord) => join(recordDir(record), 'core.db');
  const secureAccountFiles = (record: AccountRecord) => {
    const db = dbPathFor(record);
    for (const path of [db, `${db}-wal`, `${db}-shm`, `${db}.owner.json`, join(recordDir(record), 'knowledge.json'), join(recordDir(record), 'backups.json'), join(recordDir(record), 'sync.json')]) {
      if (existsSync(path)) chmodSync(path, 0o600);
    }
  };
  const migrateLegacyStore = (record: AccountRecord) => {
    const legacy = join(options.dataDir, `${record.id}.db`);
    const destination = dbPathFor(record);
    for (const suffix of ['', '-wal', '-shm', '.owner.json']) {
      const from = `${legacy}${suffix}`; const to = `${destination}${suffix}`;
      if (existsSync(from) && !existsSync(to)) renameSync(from, to);
    }
  };
  const configFor = (record: AccountRecord): ServerConfig => ({
    host: '127.0.0.1', port: 0,
    dbPath: dbPathFor(record),
    ownerToken: internalToken(record.id), ownerTokenGenerated: false,
    corsOrigin: options.corsOrigin ?? '*', aiProvider: 'mock', aiApiBase: null,
    aiModel: null, aiApiKey: null, aiApiHeaders: null, aiTimeoutMs: 15_000,
    moderationApiUrl: null, moderationApiKey: null, moderationTimeoutMs: 5_000,
    requireModeration: true,
    chatRatePerHour: 30, requestRatePerHour: 10, maxBodyBytes: 2 * 1024 * 1024,
  });

  const providerFor = (record: AccountRecord): ModelProvider => ({
    name: record.aiMode === 'byok' ? 'byok-openai-compatible' : managedProvider.name,
    capabilities: managedProvider.capabilities,
    async complete(input) {
      if (record.aiMode === 'byok' && record.byok) {
        let apiKey = '';
        try { apiKey = unseal(options.masterSecret, record.byok.apiKey); } catch { throw new ModelProviderError('permission_denied', 'BYOK credentials are unavailable'); }
        return createPinnedByokProvider({ base: record.byok.base, model: record.byok.model, apiKey, timeoutMs: 15_000, ...(options.dnsLookup ? { resolver: options.dnsLookup } : {}) }).complete(input);
      }
      const allowed = checkManagedUsage({ plan: record.plan, billingStatus: record.billingStatus, usage: record.usage, modelCalls: 1 });
      if (!allowed.ok) throw new ModelProviderError(allowed.code === 'billing_required' ? 'permission_denied' : 'rate_limited', allowed.message);
      record.usage = addUsage(record.usage, { modelCalls: 1, estimatedCents: record.plan === 'pro' ? 1 : 0 });
      persist();
      return managedProvider.complete(input);
    },
  });

  const startRuntime = async (record: AccountRecord) => {
    const current = runtimes.get(record.id);
    if (current) return current;
    migrateLegacyStore(record);
    const app = createApp({
      config: configFor(record), provider: providerFor(record), logger: () => {},
      moderate: async text => {
        if (!options.moderatePublicText) throw new Error('managed moderation is not configured');
        const allowed = await options.moderatePublicText(text);
        return allowed ? { ok: true } : { ok: false, reason: 'rejected' };
      },
    });
    secureAccountFiles(record);
    const server = await listen(app, '127.0.0.1', 0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('managed account failed to bind');
    const runtime = { app, server, port: address.port };
    runtimes.set(record.id, runtime);
    return runtime;
  };

  // A damaged account store is isolated: it must not poison health or every
  // other account after a process restart.
  const ready = Promise.allSettled(records.map(startRuntime));

  const internalFetch = async (record: AccountRecord, path: string, init: RequestInit = {}) => {
    const runtime = await startRuntime(record);
    const response = await fetch(`http://127.0.0.1:${runtime.port}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${internalToken(record.id)}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
    secureAccountFiles(record);
    return response;
  };

  const privateArchive = async (record: AccountRecord, includeConversations = false): Promise<Record<string, any>> => {
    const response = await internalFetch(record, `/api/v1/owner/export?kind=private&includeConversations=${includeConversations ? '1' : '0'}`);
    if (!response.ok) throw new Error('private export failed');
    return response.json() as Promise<Record<string, any>>;
  };

  const withSyncQueue = async <T>(record: AccountRecord, operation: () => Promise<T>): Promise<T> => {
    const previous = syncQueues.get(record.id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const queued = previous.then(() => gate);
    syncQueues.set(record.id, queued);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (syncQueues.get(record.id) === queued) syncQueues.delete(record.id);
    }
  };

  const activityFor = (accountId: string): AccountActivity => {
    const existing = accountActivities.get(accountId);
    if (existing) return existing;
    const created = { closing: false, inflight: 0, drained: new Set<() => void>() };
    accountActivities.set(accountId, created);
    return created;
  };

  // Reserving is deliberately synchronous and short. Slow model, embedding,
  // export and storage calls run outside a mutex, while delete-all can close
  // the admission gate and wait for the already-admitted requests to drain.
  const reserveAccount = (accountId: string): (() => void) | null => {
    const activity = activityFor(accountId);
    if (activity.closing) return null;
    activity.inflight += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activity.inflight -= 1;
      if (activity.inflight === 0) {
        for (const resolve of activity.drained) resolve();
        activity.drained.clear();
        if (!activity.closing) accountActivities.delete(accountId);
      }
    };
  };

  const beginAccountClose = async (accountId: string): Promise<boolean> => {
    const activity = activityFor(accountId);
    if (activity.closing) return false;
    activity.closing = true;
    if (activity.inflight > 0) await new Promise<void>(resolve => activity.drained.add(resolve));
    return true;
  };

  const endAccountClose = (accountId: string) => {
    const activity = accountActivities.get(accountId);
    if (!activity) return;
    activity.closing = false;
    if (activity.inflight === 0) accountActivities.delete(accountId);
  };

  const retentionCutoff = (record: AccountRecord) => clock() - record.retentionDays * 86_400_000;
  const reconcile = async (record: AccountRecord, sourceDeviceId: string | null) => withSyncQueue(record, async () => {
    const dir = recordDir(record);
    const state = loadSyncState(dir, value => unseal(options.masterSecret, value));
    const response = await internalFetch(record, '/api/v1/owner/export?kind=private&includeConversations=0');
    const archive = response.ok ? await response.json() as Record<string, any> : null;
    if (!archive && response.status !== 404) throw new Error('sync export failed');
    const emitted = reconcileSnapshot(state, archive ? flattenArchive(archive) : {}, sourceDeviceId, clock());
    state.changes = enforceRetention(state.changes, retentionCutoff(record));
    saveSyncState(dir, state, plaintext => seal(options.masterSecret, plaintext));
    return { state, emitted };
  });

  const loadRetainedBackups = (record: AccountRecord) => {
    const dir = recordDir(record);
    const retained = loadBackups(dir).filter(item => item.expiresAt > clock());
    saveBackups(dir, retained);
    return retained;
  };

  const closeRuntime = async (record: AccountRecord) => {
    const runtime = runtimes.get(record.id);
    if (!runtime) return;
    await new Promise<void>(resolve => runtime.server.close(() => resolve()));
    runtime.app.close(); runtimes.delete(record.id);
  };

  const adapterFor = (kind: unknown): KnowledgeSourceAdapter | null => {
    if (kind === 'file') return fileKnowledgeAdapter;
    if (kind === 'note') return noteKnowledgeAdapter;
    if (kind === 'url' || kind === 'link') return linkKnowledgeAdapter;
    if (kind === 'external') return externalKnowledgeAdapter;
    return null;
  };

  const knowledgeNamespace = (record: AccountRecord, audience: 'owner' | 'visitor') =>
    `${ownerNamespace(record.id)}:knowledge:${audience}`;
  const knowledgeFile = (record: AccountRecord): ManagedKnowledgeFile =>
    loadKnowledge(recordDir(record), value => unseal(options.masterSecret, value));
  const persistKnowledge = (record: AccountRecord, value: ManagedKnowledgeFile) =>
    saveKnowledge(recordDir(record), value, plaintext => seal(options.masterSecret, plaintext));
  const knowledgeDigest = (value: ManagedKnowledgeFile) => archiveHash(JSON.stringify({ sources: value.sources, chunks: value.chunks }));

  const ensureKnowledgeIndex = async (record: AccountRecord, state: ManagedKnowledgeFile) => {
    if (indexedKnowledge.has(record.id)) return;
    // The vector index is derived. Rebuild its namespaces from canonical
    // chunks so stale public ids can never survive a visibility change.
    await vectorStore.dropNamespace(knowledgeNamespace(record, 'owner'));
    await vectorStore.dropNamespace(knowledgeNamespace(record, 'visitor'));
    const chunks = state.chunks as unknown as KnowledgeChunk[];
    if (chunks.length) {
      const vectors = await embeddingProvider.embed(chunks.map(chunk => chunk.content));
      await vectorStore.upsert(knowledgeNamespace(record, 'owner'), chunks.map((chunk, index) => ({ id: chunk.id, vector: vectors[index]! })));
      const publicEntries = chunks.flatMap((chunk, index) => chunk.visibility === 'public' ? [{ id: chunk.id, vector: vectors[index]! }] : []);
      if (publicEntries.length) await vectorStore.upsert(knowledgeNamespace(record, 'visitor'), publicEntries);
    }
    indexedKnowledge.add(record.id);
  };

  const moderateStrangerTexts = async (texts: string[]): Promise<'allowed' | 'blocked' | 'unavailable'> => {
    if (!options.moderatePublicText) return 'unavailable';
    try {
      for (const value of texts) if (!(await options.moderatePublicText(value))) return 'blocked';
      return 'allowed';
    } catch { return 'unavailable'; }
  };

  const eraseManagedData = async (record: AccountRecord): Promise<void> => {
    // Persist intent first: if the process exits between Core deletion and
    // adjunct cleanup, the next authenticated request resumes erasure.
    record.pendingManagedErase = true; persist();
    const queued = syncQueues.get(record.id);
    if (queued) await queued;
    await vectorStore.dropNamespace(knowledgeNamespace(record, 'owner'));
    await vectorStore.dropNamespace(knowledgeNamespace(record, 'visitor'));
    indexedKnowledge.delete(record.id);
    const dir = recordDir(record);
    for (const name of ['knowledge.json', 'backups.json', 'sync.json']) rmSync(join(dir, name), { force: true });
    record.deviceIds = [];
    record.notifications = [];
    record.usage = { modelCalls: 0, retrievalCalls: 0, knowledgeBytes: 0, estimatedCents: 0 };
    record.lastKnowledgeWriteAt = null;
    record.lastKnowledgeExportAt = null;
    record.knowledgeRevision = 0;
    record.lastKnowledgeExportRevision = null;
    record.lastKnowledgeExportDigest = null;
    record.aiMode = 'managed';
    delete record.byok;
    delete record.pendingManagedErase;
    persist();
  };

  const resumePendingErase = async (record: AccountRecord): Promise<void> => {
    const response = await internalFetch(record, '/api/v1/owner/export?kind=private&includeConversations=0');
    if (response.status === 404) { await eraseManagedData(record); return; }
    if (response.ok) {
      // Core never committed the attempted deletion; adjuncts remain valid.
      delete record.pendingManagedErase; persist(); return;
    }
    throw new Error('cannot determine pending managed erasure state');
  };

  const proxy = async (
    req: IncomingMessage,
    res: ServerResponse,
    record: AccountRecord,
    targetPath: string,
    owner: boolean,
    requestData?: Record<string, unknown>,
    afterSuccess?: () => Promise<void>,
  ) => {
    const runtime = await startRuntime(record);
    const raw = ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : JSON.stringify(requestData ?? await body(req));
    const response = await fetch(`http://127.0.0.1:${runtime.port}${targetPath}`, {
      method: req.method,
      headers: {
        ...(raw ? { 'content-type': 'application/json' } : {}),
        ...(owner ? { authorization: `Bearer ${internalToken(record.id)}` } : {}),
        'x-forwarded-for': req.socket.remoteAddress || '',
      },
      ...(raw ? { body: raw } : {}),
    });
    const payload = await response.text();
    if (response.status < 300 && afterSuccess) await afterSuccess();
    secureAccountFiles(record);
    res.writeHead(response.status, {
      'content-type': response.headers.get('content-type') || 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': response.headers.get('cache-control') || 'no-store',
      ...(response.headers.get('etag') ? { etag: response.headers.get('etag')! } : {}),
      ...(response.headers.get('vary') ? { vary: response.headers.get('vary')! } : {}),
    });
    res.end(payload);
    return response.status;
  };

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    let releaseAccount: (() => void) | null = null;
    let closingAccountId: string | null = null;
    try {
      await ready;
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' }); res.end(); return; }
      const url = new URL(req.url || '/', 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean);
      if (req.method === 'GET' && url.pathname === '/healthz') { json(res, 200, { ok: true, accounts: records.length, quarantinedAccounts: quarantined.length }); return; }

      if (req.method === 'POST' && url.pathname === '/api/v1/cloud/accounts') {
        if (!consumeAccountCreation(req)) { json(res, 429, { error: { code: 'rate_limited', message: 'too many account creation attempts' } }); return; }
        const data = await body(req);
        if (typeof data.name !== 'string' || !data.name.trim()) { json(res, 400, { error: { code: 'invalid_request', message: 'name is required' } }); return; }
        const region = typeof data.region === 'string' ? data.region : 'ap-shanghai';
        try { safeRegion(region); } catch { json(res, 400, { error: { code: 'invalid_request', message: 'invalid storage region' } }); return; }
        if (!allowedRegions.has(region)) { json(res, 400, { error: { code: 'unsupported_region', message: 'storage region is not available' } }); return; }
        const id = `acct-${randomUUID()}`;
        const baseSlug = (typeof data.slug === 'string' ? data.slug : data.name).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || id.slice(-8);
        const slug = records.some(item => item.slug === baseSlug) ? `${baseSlug}-${id.slice(-6)}` : baseSlug;
        const token = randomBytes(32).toString('base64url');
        const record: AccountRecord = {
          id, slug, tokenHash: hash(token),
          region,
          retentionDays: typeof data.retentionDays === 'number' ? Math.max(1, Math.min(3650, data.retentionDays)) : 365,
          deviceIds: [], notifications: [], createdAt: clock(), plan: data.plan === 'pro' ? 'pro' : 'free', billingStatus: 'active', aiMode: 'managed', usage: { modelCalls: 0, retrievalCalls: 0, knowledgeBytes: 0, estimatedCents: 0 }, lastKnowledgeWriteAt: null, lastKnowledgeExportAt: null, knowledgeRevision: 0, lastKnowledgeExportRevision: null, lastKnowledgeExportDigest: null,
        };
        const runtime = await startRuntime(record);
        const identity = await fetch(`http://127.0.0.1:${runtime.port}/api/v1/owner/identity`, { method: 'POST', headers: { authorization: `Bearer ${internalToken(id)}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: data.name }) });
        if (!identity.ok) { await closeRuntime(record); throw new Error('managed identity creation failed'); }
        records.push(record); persist();
        json(res, 201, { id, slug, token, publicApi: `/api/v1/cloud/cards/${slug}`, region: record.region, retentionDays: record.retentionDays });
        return;
      }

      if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'v1' && parts[2] === 'cloud' && parts[3] === 'admin' && parts[4] === 'accounts' && parts[6] === 'billing') {
        if (req.headers['x-vibecard-master-secret'] !== options.masterSecret) { json(res, 401, { error: { code: 'unauthorized', message: 'admin credentials required' } }); return; }
        const record = records.find(item => item.id === parts[5]);
        if (!record) { json(res, 404, { error: { code: 'not_found', message: 'account not found' } }); return; }
        const data = await body(req);
        if (!['active', 'past_due', 'canceled'].includes(String(data.status))) { json(res, 400, { error: { code: 'invalid_request', message: 'invalid billing status' } }); return; }
        record.billingStatus = data.status as BillingStatus; persist(); json(res, 200, { billingStatus: record.billingStatus }); return;
      }

      if (parts.slice(0, 4).join('/') === 'api/v1/cloud/accounts' && parts[4]) {
        const record = records.find(item => item.id === parts[4]);
        if (!record) { json(res, 404, { error: { code: 'not_found', message: 'account not found' } }); return; }
        if (!equal(hash(bearer(req)), record.tokenHash)) { json(res, 401, { error: { code: 'unauthorized', message: 'invalid account token' } }); return; }
        const suffix = parts.slice(5);
        const deletingAll = req.method === 'POST' && suffix[0] === 'owner' && suffix[1] === 'delete-all' && suffix.length === 2;
        if (deletingAll) {
          if (!await beginAccountClose(record.id)) { json(res, 409, { error: { code: 'account_deleting', message: 'account deletion is already in progress' } }); return; }
          closingAccountId = record.id;
        } else {
          releaseAccount = reserveAccount(record.id);
          if (!releaseAccount) { json(res, 409, { error: { code: 'account_deleting', message: 'account deletion is in progress' } }); return; }
        }
        if (record.pendingManagedErase) {
          try { await resumePendingErase(record); }
          catch { json(res, 503, { error: { code: 'account_recovery_unavailable', message: 'this account is temporarily unavailable' } }); return; }
        }
        const retainedNotifications = record.notifications.filter(item => item.createdAt >= retentionCutoff(record)).slice(-1_000);
        if (retainedNotifications.length !== record.notifications.length) { record.notifications = retainedNotifications; persist(); }
        if (req.method === 'GET' && suffix.join('/') === 'settings') { json(res, 200, { id: record.id, slug: record.slug, region: record.region, retentionDays: record.retentionDays, devices: record.deviceIds.length, storageScope: `regions/${record.region}/${record.id}` }); return; }
        if (req.method === 'PUT' && suffix.join('/') === 'settings/public-redirect') {
          const data = await body(req);
          if (data.url === null || data.url === '') {
            delete record.publicRedirectUrl; persist(); json(res, 200, { publicRedirectUrl: null }); return;
          }
          if (typeof data.url !== 'string' || data.url.length > 500) { json(res, 400, { error: { code: 'invalid_request', message: 'url must be an HTTPS URL or null' } }); return; }
          let destination: URL;
          try { destination = new URL(data.url); } catch { json(res, 400, { error: { code: 'invalid_request', message: 'url must be an HTTPS URL or null' } }); return; }
          if (destination.protocol !== 'https:' || destination.username || destination.password || destination.search || destination.hash) { json(res, 400, { error: { code: 'invalid_request', message: 'url must be an HTTPS base URL without credentials, query, or fragment' } }); return; }
          if (pointsAtManagedCardNamespace(destination, record.slug)) { json(res, 400, { error: { code: 'invalid_request', message: 'redirect target must not point back to this managed Card namespace' } }); return; }
          record.publicRedirectUrl = destination.toString().replace(/\/+$/, ''); persist();
          json(res, 200, { publicRedirectUrl: record.publicRedirectUrl }); return;
        }
        if (req.method === 'GET' && suffix.join('/') === 'plan') {
          json(res, 200, { plan: record.plan, billingStatus: record.billingStatus, aiMode: record.aiMode, usage: record.usage, limits: PLAN_LIMITS[record.plan] }); return;
        }
        if (req.method === 'PUT' && suffix.join('/') === 'ai') {
          const data = await body(req);
          if (data.mode === 'managed') { record.aiMode = 'managed'; delete record.byok; persist(); json(res, 200, { mode: record.aiMode }); return; }
          if (data.mode !== 'byok' || typeof data.base !== 'string' || typeof data.model !== 'string' || !data.model.trim() || data.model.length > 200 || typeof data.apiKey !== 'string' || !data.apiKey || data.apiKey.length > 20_000) { json(res, 400, { error: { code: 'invalid_request', message: 'BYOK requires a valid base, model and apiKey' } }); return; }
          let validatedBase: URL;
          try { validatedBase = (await resolvePublicByokBase(data.base, options.dnsLookup)).url; }
          catch (error) {
            const message = error instanceof Error ? error.message : 'invalid BYOK endpoint';
            json(res, 400, { error: { code: 'invalid_byok_endpoint', message } }); return;
          }
          record.aiMode = 'byok'; record.byok = { base: validatedBase.toString().replace(/\/+$/, ''), model: data.model.trim(), apiKey: seal(options.masterSecret, data.apiKey) }; persist();
          const runtime = runtimes.get(record.id);
          if (runtime) { await new Promise<void>(resolve => runtime.server.close(() => resolve())); runtime.app.close(); runtimes.delete(record.id); }
          await startRuntime(record);
          json(res, 200, { mode: record.aiMode, base: record.byok.base, model: record.byok.model }); return;
        }
        if (req.method === 'POST' && suffix[0] === 'devices' && suffix.length === 1) {
          const data = await body(req); const deviceId = typeof data.deviceId === 'string' && data.deviceId ? data.deviceId : `device-${randomUUID()}`;
          if (!/^[A-Za-z0-9._-]{1,128}$/.test(deviceId)) { json(res, 400, { error: { code: 'invalid_request', message: 'invalid device id' } }); return; }
          if (!record.deviceIds.includes(deviceId)) record.deviceIds.push(deviceId);
          persist();
          const { state } = await reconcile(record, deviceId);
          json(res, 201, { deviceId, sync: 'delta-v1', cursor: state.nextCursor - 1 }); return;
        }
        if (suffix[0] === 'devices' && suffix[1] && suffix[2] === 'sync') {
          const deviceId = suffix[1];
          if (!record.deviceIds.includes(deviceId)) { json(res, 404, { error: { code: 'device_not_found', message: 'register device before syncing' } }); return; }
          const { state } = await reconcile(record, deviceId);
          const currentCursor = state.nextCursor - 1;
          if (req.method === 'GET') {
            const since = Number(url.searchParams.get('since') ?? 0);
            if (!Number.isSafeInteger(since) || since < 0) { json(res, 400, { error: { code: 'invalid_request', message: 'since must be a non-negative integer' } }); return; }
            const firstRetained = state.changes[0]?.cursor ?? state.nextCursor;
            if (since > currentCursor) { json(res, 409, { error: { code: 'invalid_cursor', message: 'sync cursor is ahead of the server' }, cursor: currentCursor }); return; }
            if (since > 0 && since < firstRetained - 1) {
              json(res, 200, { protocol: 'delta-v1', resetRequired: true, cursor: currentCursor, snapshot: Object.values(state.snapshot), changes: [] }); return;
            }
            json(res, 200, { protocol: 'delta-v1', resetRequired: false, cursor: currentCursor, changes: state.changes.filter(change => change.cursor > since) }); return;
          }
          if (req.method === 'POST') {
            const data = await body(req);
            if (!Number.isSafeInteger(data.baseCursor) || data.baseCursor !== currentCursor) {
              json(res, 409, { error: { code: 'sync_conflict', message: 'pull and merge remote changes before retrying' }, cursor: currentCursor }); return;
            }
            const imported = importArchive(data.archive);
            if (imported.ok === false || imported.value.kind !== 'private') { json(res, 400, { error: { code: 'invalid_archive', message: 'a valid private .vibe archive is required' } }); return; }
            if (imported.value.conversations.length > 0 && data.includeRawData !== true) {
              json(res, 400, { error: { code: 'raw_data_not_selected', message: 'conversation upload requires includeRawData:true' } }); return;
            }
            const activeMemories = imported.value.memories.filter(memory => memory.status === 'confirmed' || memory.status === 'paused').length;
            if (activeMemories > PLAN_LIMITS[record.plan].memoryRecords) { json(res, 429, { error: { code: 'quota_exceeded', message: 'managed memory limit exceeded' } }); return; }
            const response = await internalFetch(record, '/api/v1/owner/import', { method: 'POST', body: JSON.stringify({ archive: data.archive, force: true }) });
            if (!response.ok) { json(res, response.status, await response.json()); return; }
            const result = await reconcile(record, deviceId);
            json(res, 200, { protocol: 'delta-v1', cursor: result.state.nextCursor - 1, applied: result.emitted.length }); return;
          }
        }

        if (suffix[0] === 'backups') {
          if (req.method === 'GET' && suffix.length === 1) {
            json(res, 200, loadRetainedBackups(record).map(({ ciphertext: _ciphertext, ...metadata }) => metadata)); return;
          }
          if (req.method === 'POST' && suffix.length === 1) {
            const archive = await privateArchive(record, true);
            const serialized = JSON.stringify({ format: 'vibecard-managed-backup', schemaVersion: 1, archive, knowledge: knowledgeFile(record) });
            const createdAt = clock();
            const backup = {
              id: `backup-${randomUUID()}`, createdAt,
              expiresAt: createdAt + record.retentionDays * 86_400_000,
              archiveSha256: archiveHash(serialized), ciphertext: seal(options.masterSecret, serialized),
            };
            const backups = loadRetainedBackups(record); backups.push(backup); saveBackups(recordDir(record), backups);
            json(res, 201, { id: backup.id, createdAt, expiresAt: backup.expiresAt, archiveSha256: backup.archiveSha256 }); return;
          }
          if (req.method === 'POST' && suffix[1] && suffix[2] === 'restore') {
            const data = await body(req);
            if (data.confirm !== 'RESTORE') { json(res, 400, { error: { code: 'confirmation_required', message: 'pass confirm: RESTORE' } }); return; }
            const backup = loadRetainedBackups(record).find(item => item.id === suffix[1]);
            if (!backup) { json(res, 404, { error: { code: 'not_found', message: 'backup not found or expired' } }); return; }
            let serialized = '';
            try { serialized = unseal(options.masterSecret, backup.ciphertext); } catch { json(res, 500, { error: { code: 'backup_corrupt', message: 'backup authentication failed' } }); return; }
            if (archiveHash(serialized) !== backup.archiveSha256) { json(res, 500, { error: { code: 'backup_corrupt', message: 'backup checksum failed' } }); return; }
            const parsed = JSON.parse(serialized);
            const archive = parsed?.format === 'vibecard-managed-backup' ? parsed.archive : parsed;
            const restoredKnowledge: ManagedKnowledgeFile = parsed?.format === 'vibecard-managed-backup'
              ? parsed.knowledge : { sources: [], chunks: [], deleted: [] };
            await closeRuntime(record);
            const dbPath = dbPathFor(record);
            for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}.owner.json`]) rmSync(path, { force: true });
            const response = await internalFetch(record, '/api/v1/owner/import', { method: 'POST', body: JSON.stringify({ archive }) });
            if (!response.ok) { json(res, 500, { error: { code: 'restore_failed', message: 'backup import failed' } }); return; }
            persistKnowledge(record, restoredKnowledge);
            record.usage.knowledgeBytes = restoredKnowledge.sources.reduce((sum, source) => sum + Number(source.byteSize ?? 0), 0);
            record.lastKnowledgeWriteAt = restoredKnowledge.sources.length ? clock() : null;
            record.lastKnowledgeExportAt = null;
            record.knowledgeRevision = (record.knowledgeRevision ?? 0) + 1;
            record.lastKnowledgeExportRevision = null;
            record.lastKnowledgeExportDigest = null;
            await vectorStore.dropNamespace(knowledgeNamespace(record, 'owner'));
            await vectorStore.dropNamespace(knowledgeNamespace(record, 'visitor'));
            indexedKnowledge.delete(record.id); persist();
            const result = await reconcile(record, null);
            json(res, 200, { restored: true, backupId: backup.id, cursor: result.state.nextCursor - 1 }); return;
          }
        }

        if (suffix[0] === 'knowledge') {
          const knowledge = knowledgeFile(record);
          record.usage.knowledgeBytes = knowledge.sources.reduce((sum, source) => sum + Number(source.byteSize ?? 0), 0);
          const limits = PLAN_LIMITS[record.plan];
          if (req.method === 'GET' && suffix.length === 1) {
            json(res, 200, knowledge.sources.map(({ content: _content, ...source }) => source)); return;
          }
          if (req.method === 'GET' && suffix[1] === 'export') {
            if (knowledgeExportActive) { json(res, 503, { error: { code: 'export_busy', message: 'another knowledge export is in progress; retry shortly' } }); return; }
            knowledgeExportActive = true;
            try {
            const exportedRevision = record.knowledgeRevision ?? 0;
            const exportedDigest = knowledgeDigest(knowledge);
            const cardResponse = await internalFetch(record, '/api/v1/owner/card');
            if (!cardResponse.ok) { json(res, 409, { error: { code: 'identity_required', message: 'canonical owner identity is required before knowledge export' } }); return; }
            const card = await cardResponse.json() as { ownerId?: unknown };
            if (typeof card.ownerId !== 'string' || !card.ownerId) { json(res, 500, { error: { code: 'invalid_state', message: 'canonical owner identity is invalid' } }); return; }
            const ownerId = card.ownerId;
            // Export only open Core fields. Account ids, plan/source-version
            // metadata, embeddings and vector-store state have no portable
            // representation and are intentionally discarded.
            const sources: CanonicalKnowledgeSource[] = knowledge.sources.map(source => ({
              id: String(source.id), schemaVersion: 1, ownerId,
              kind: (source.kind === 'file' || source.kind === 'url' ? source.kind : 'note'),
              title: String(source.title ?? ''), source: String(source.source ?? ''),
              status: source.status === 'pending' || source.status === 'failed' ? source.status : 'ingested',
              createdAt: Number(source.createdAt), updatedAt: Number(source.updatedAt),
              content: String(source.content ?? ''),
              visibility: (source.visibility ?? 'private') as CanonicalKnowledgeSource['visibility'],
              adapterKind: (source.managedKind === 'external' ? 'external' : source.kind) as CanonicalKnowledgeSource['adapterKind'],
            }));
            const portable = exportKnowledgeBundle({ ownerId, sources, app: { name: 'vibecard-cloud', version: '0.1.0' }, createdAt: clock() });
            if (options.knowledgeExportBarrier) await options.knowledgeExportBarrier(record.id);
            // A snapshot read before a concurrent mutation is still returned,
            // but it cannot become the receipt that authorizes delete-all.
            if ((record.knowledgeRevision ?? 0) === exportedRevision && knowledgeDigest(knowledgeFile(record)) === exportedDigest) {
              record.lastKnowledgeExportAt = clock();
              record.lastKnowledgeExportRevision = exportedRevision;
              record.lastKnowledgeExportDigest = exportedDigest;
              persist();
            }
            json(res, 200, portable); return;
            } finally { knowledgeExportActive = false; }
          }
          if (req.method === 'POST' && suffix[1] === 'search') {
            const data = await body(req);
            const audience = data.audience === 'visitor' ? 'visitor' : 'owner';
            if (typeof data.query !== 'string' || !data.query.trim() || data.query.length > 1_000) { json(res, 400, { error: { code: 'invalid_request', message: 'query must be 1-1000 characters' } }); return; }
            const allowed = checkManagedUsage({ plan: record.plan, billingStatus: record.billingStatus, usage: record.usage, retrievalCalls: 1 });
            if (!allowed.ok) { json(res, allowed.code === 'billing_required' ? 402 : 429, { error: { code: allowed.code, message: allowed.message } }); return; }
            const query = data.query.trim();
            const limit = typeof data.limit === 'number' ? Math.max(1, Math.min(20, Math.floor(data.limit))) : 8;
            const chunks = knowledge.chunks as unknown as KnowledgeChunk[];
            let results: any[];
            if (data.semantic === false) {
              results = retrieveKnowledgeChunks({ ownerId: record.id, audience, chunks, queryText: query, limit, now: clock() });
            } else {
              await ensureKnowledgeIndex(record, knowledge);
              const [queryVector] = await embeddingProvider.embed([query]);
              const hits = await vectorStore.query(knowledgeNamespace(record, audience), queryVector!, limit);
              const byId = new Map(chunks.map(chunk => [chunk.id, chunk]));
              results = hits.flatMap(hit => {
                const chunk = byId.get(hit.id); if (!chunk) return [];
                return [{ chunkId: chunk.id, sourceId: chunk.provenance.sourceId, score: hit.score, matchedReasons: [`semantic:${Math.max(0, hit.score).toFixed(3)}`], visibility: { rule: audience === 'owner' ? 'owner_session' : 'visitor_public_chunk', visibility: chunk.visibility, quotable: true }, provenance: chunk.provenance, chunk }];
              });
            }
            record.usage = addUsage(record.usage, { retrievalCalls: 1 }); persist();
            json(res, 200, { provider: data.semantic === false ? 'structured' : `semantic:${embeddingProvider.name}/${vectorStore.name}`, results }); return;
          }
          if ((req.method === 'POST' && suffix.length === 1) || (req.method === 'PUT' && suffix[1])) {
            // This route is already account-authenticated and plan-scoped.
            // Allow the advertised Pro source size plus JSON escaping
            // headroom without raising the 2 MiB limit on public routes.
            const data = await body(req, Math.max(2 * 1024 * 1024, limits.maxSourceBytes * 6 + 2 * 1024 * 1024));
            const adapter = adapterFor(data.kind);
            if (!adapter || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500
              || typeof data.locator !== 'string' || data.locator.length > 2_000
              || typeof data.content !== 'string'
              || (data.sourceVersion !== undefined && (typeof data.sourceVersion !== 'string' || data.sourceVersion.length > 256))) {
              json(res, 400, { error: { code: 'invalid_request', message: 'kind, title (1-500), locator (max 2000), optional sourceVersion (max 256), and content are required' } }); return;
            }
            if (!['public', 'agent_only', 'connected', 'private'].includes(String(data.visibility ?? 'private'))) { json(res, 400, { error: { code: 'invalid_request', message: 'invalid visibility' } }); return; }
            const bytes = Buffer.byteLength(data.content, 'utf8');
            if (bytes > limits.maxSourceBytes) { json(res, 413, { error: { code: 'source_too_large', message: 'source exceeds the plan file limit' } }); return; }
            const existingIndex = req.method === 'PUT' ? knowledge.sources.findIndex(source => source.id === suffix[1]) : -1;
            if (req.method === 'PUT' && existingIndex < 0) { json(res, 404, { error: { code: 'not_found', message: 'knowledge source not found' } }); return; }
            if (existingIndex < 0 && knowledge.sources.length >= limits.knowledgeSources) { json(res, 429, { error: { code: 'quota_exceeded', message: 'managed knowledge source limit exceeded' } }); return; }
            const existing = existingIndex >= 0 ? knowledge.sources[existingIndex]! : null;
            if (existing && data.sourceVersion !== undefined && data.sourceVersion === existing.sourceVersion) {
              const { content: _content, ...publicSource } = existing;
              json(res, 200, { source: publicSource, unchanged: true }); return;
            }
            const delta = bytes - Number(existing?.byteSize ?? 0);
            const allowed = checkManagedUsage({ plan: record.plan, billingStatus: record.billingStatus, usage: record.usage, knowledgeBytes: Math.max(0, delta) });
            if (!allowed.ok) { json(res, allowed.code === 'billing_required' ? 402 : 429, { error: { code: allowed.code, message: allowed.message } }); return; }
            const sourceId = existing ? String(existing.id) : `knowledge-${randomUUID()}`;
            const ingested = adapter.ingest({ ownerId: record.id, title: data.title, locator: data.locator, content: data.content, visibility: (data.visibility ?? 'private') as any }, clock(), { sourceId, chunkId: index => `${sourceId}:chunk:${index}` });
            const source = { ...ingested.source, content: data.content, managedKind: data.kind, visibility: data.visibility ?? 'private', sourceVersion: data.sourceVersion ?? null, byteSize: bytes };
            if (existingIndex >= 0) knowledge.sources[existingIndex] = source; else knowledge.sources.push(source);
            knowledge.chunks = knowledge.chunks.filter(chunk => (chunk as any).provenance?.sourceId !== sourceId).concat(ingested.chunks as any);
            knowledge.deleted = knowledge.deleted.filter(item => item.sourceId !== sourceId);
            record.usage = addUsage(record.usage, { knowledgeBytes: delta });
            record.lastKnowledgeWriteAt = clock();
            record.lastKnowledgeExportAt = null;
            record.knowledgeRevision = (record.knowledgeRevision ?? 0) + 1;
            record.lastKnowledgeExportRevision = null;
            record.lastKnowledgeExportDigest = null;
            persistKnowledge(record, knowledge);
            indexedKnowledge.delete(record.id);
            // accounts.json contains usage/receipts, not canonical knowledge.
            // Failure here is a safe stale cache: next request recomputes
            // usage and digest from knowledge.json.
            try { await options.knowledgeCommitBarrier?.(record.id); persist(); } catch {}
            let indexStatus: 'ready' | 'pending' = 'ready';
            try { await ensureKnowledgeIndex(record, knowledge); }
            catch { indexedKnowledge.delete(record.id); indexStatus = 'pending'; }
            json(res, existing ? 200 : 201, { source: (({ content: _content, ...publicSource }) => publicSource)(source), indexStatus }); return;
          }
          if (req.method === 'DELETE' && suffix[1]) {
            const index = knowledge.sources.findIndex(source => source.id === suffix[1]);
            if (index < 0) { json(res, 404, { error: { code: 'not_found', message: 'knowledge source not found' } }); return; }
            const [removed] = knowledge.sources.splice(index, 1);
            knowledge.chunks = knowledge.chunks.filter(chunk => (chunk as any).provenance?.sourceId !== suffix[1]);
            knowledge.deleted.push({ sourceId: suffix[1], deletedAt: clock() });
            knowledge.deleted = knowledge.deleted.filter(item => item.deletedAt >= retentionCutoff(record));
            record.usage = addUsage(record.usage, { knowledgeBytes: -Number(removed?.byteSize ?? 0) });
            record.lastKnowledgeWriteAt = clock();
            record.lastKnowledgeExportAt = null;
            record.knowledgeRevision = (record.knowledgeRevision ?? 0) + 1;
            record.lastKnowledgeExportRevision = null;
            record.lastKnowledgeExportDigest = null;
            persistKnowledge(record, knowledge);
            indexedKnowledge.delete(record.id);
            try { await options.knowledgeCommitBarrier?.(record.id); persist(); } catch {}
            let indexStatus: 'ready' | 'pending' = 'ready';
            try { await ensureKnowledgeIndex(record, knowledge); }
            catch { indexedKnowledge.delete(record.id); indexStatus = 'pending'; }
            json(res, 200, { deleted: true, sourceId: suffix[1], indexStatus }); return;
          }
        }

        if (req.method === 'GET' && suffix.join('/') === 'operations') {
          const sync = loadSyncState(recordDir(record), value => unseal(options.masterSecret, value));
          const backups = loadRetainedBackups(record);
          const knowledge = knowledgeFile(record);
          json(res, 200, {
            status: 'operational', region: record.region,
            supportBoundary: 'metadata-only; support cannot read owner content or provider keys',
            lastSyncAt: sync.lastSyncAt, lastBackupAt: backups.at(-1)?.createdAt ?? null,
            devices: record.deviceIds.length, retainedSyncEvents: sync.changes.length,
            knowledgeSources: knowledge.sources.length, knowledgeBytes: record.usage.knowledgeBytes,
            runtimeHealthy: runtimes.has(record.id),
          }); return;
        }
        if (req.method === 'GET' && suffix.join('/') === 'notifications') { json(res, 200, record.notifications); return; }
        if (suffix[0] === 'owner') {
          if (suffix[1] === 'knowledge') {
            json(res, 404, { error: { code: 'not_found', message: 'managed knowledge is available only through /knowledge endpoints' } }); return;
          }
          const target = `/api/v1/owner/${suffix.slice(1).join('/')}${url.search}`;
          const isMutation = !['GET', 'HEAD'].includes(req.method || 'GET');
          let requestData: Record<string, unknown> | undefined;
          if (isMutation && suffix[1] === 'import') {
            requestData = await body(req);
            const imported = importArchive(requestData.archive);
            if (imported.ok === false || imported.value.kind !== 'private') { json(res, 400, { error: { code: 'invalid_archive', message: 'a valid private .vibe archive is required' } }); return; }
            const count = imported.value.memories.filter(memory => memory.status === 'confirmed' || memory.status === 'paused').length;
            if (count > PLAN_LIMITS[record.plan].memoryRecords) { json(res, 429, { error: { code: 'quota_exceeded', message: 'managed memory limit exceeded' } }); return; }
          }
          const confirmingMemory = isMutation && req.method === 'POST' && suffix[1] === 'memories' && suffix[3] === 'confirm';
          if (confirmingMemory) {
            const archive = await privateArchive(record, false);
            const active = (archive.memories ?? []).filter((memory: any) => memory.status === 'confirmed' || memory.status === 'paused').length;
            if (active >= PLAN_LIMITS[record.plan].memoryRecords) { json(res, 429, { error: { code: 'quota_exceeded', message: 'managed memory limit exceeded' } }); return; }
          }
          if (deletingAll) {
            const knowledge = knowledgeFile(record);
            if (knowledge.sources.length > 0 && record.lastKnowledgeExportDigest !== knowledgeDigest(knowledge)) {
              json(res, 409, { error: { code: 'knowledge_export_required', message: 'export managed knowledge before deleting all data' } }); return;
            }
            record.pendingManagedErase = true; persist();
          }
          const status = await proxy(req, res, record, target, true, requestData, deletingAll ? () => eraseManagedData(record) : undefined);
          if (deletingAll && status >= 300) { delete record.pendingManagedErase; persist(); }
          if (isMutation && status < 300 && !deletingAll) {
            // The canonical mutation already committed. A transient local
            // runtime reconnect must not turn that success into a client
            // failure; the next pull reconciles the authoritative snapshot.
            await reconcile(record, typeof req.headers['x-vibecard-device-id'] === 'string' ? req.headers['x-vibecard-device-id'] : null).catch(() => undefined);
          }
          return;
        }
      }

      if (parts.slice(0, 4).join('/') === 'api/v1/cloud/cards' && parts[4]) {
        const record = records.find(item => item.slug === parts[4]);
        if (!record) { json(res, 404, { error: { code: 'not_found', message: 'card not found' } }); return; }
        releaseAccount = reserveAccount(record.id);
        if (!releaseAccount) { json(res, 409, { error: { code: 'account_deleting', message: 'account deletion is in progress' } }); return; }
        if (record.pendingManagedErase) {
          try { await resumePendingErase(record); }
          catch { json(res, 503, { error: { code: 'account_recovery_unavailable', message: 'this account is temporarily unavailable' } }); return; }
        }
        const publicParts = parts.slice(5);
        if (record.publicRedirectUrl) {
          // URL.pathname is already percent-encoded. Re-encoding each segment
          // would corrupt spaces/non-ASCII (`%20` -> `%2520`).
          const suffix = publicParts.length ? `/${publicParts.join('/')}` : '';
          res.writeHead(308, {
            location: `${record.publicRedirectUrl}${suffix}${url.search}`,
            'cache-control': 'public, max-age=300',
            'access-control-allow-origin': '*',
          });
          res.end();
          return;
        }
        let publicRequestData: Record<string, unknown> | undefined;
        if (req.method === 'POST' && (publicParts[0] === 'chat' || publicParts[0] === 'requests')) {
          publicRequestData = await body(req);
          const texts: string[] = [];
          if (publicParts[0] === 'chat') {
            if (typeof publicRequestData.message === 'string') texts.push(publicRequestData.message);
          } else {
            for (const key of ['visitorId', 'reason', 'visitorSummary', 'visitorWorkUrl']) {
              if (typeof publicRequestData[key] === 'string') texts.push(publicRequestData[key] as string);
            }
            if (Array.isArray(publicRequestData.possibleSharedContext)) {
              texts.push(...publicRequestData.possibleSharedContext.filter((value): value is string => typeof value === 'string'));
            }
          }
          const verdict = await moderateStrangerTexts(texts);
          if (verdict === 'unavailable') { json(res, 503, { error: { code: 'moderation_unavailable', message: 'stranger-content moderation is unavailable' } }); return; }
          if (verdict === 'blocked') { json(res, 403, { error: { code: 'moderation_blocked', message: 'content was not accepted' } }); return; }
        }
        if (req.method === 'POST' && publicParts.join('/') === 'knowledge/search') {
          const data = await body(req);
          if (typeof data.query !== 'string' || !data.query.trim() || data.query.length > 1_000) { json(res, 400, { error: { code: 'invalid_request', message: 'query must be 1-1000 characters' } }); return; }
          if (!consumePublicSearch(req, record)) { json(res, 429, { error: { code: 'rate_limited', message: 'public knowledge search rate exceeded' } }); return; }
          if (!options.moderatePublicText) { json(res, 503, { error: { code: 'moderation_unavailable', message: 'public knowledge search is unavailable' } }); return; }
          let safe = false;
          try { safe = await options.moderatePublicText(data.query); }
          catch { json(res, 503, { error: { code: 'moderation_unavailable', message: 'public knowledge search is unavailable' } }); return; }
          if (!safe) { json(res, 403, { error: { code: 'moderation_blocked', message: 'query was not accepted' } }); return; }
          const allowed = checkManagedUsage({ plan: record.plan, billingStatus: record.billingStatus, usage: record.usage, retrievalCalls: 1 });
          if (!allowed.ok) { json(res, allowed.code === 'billing_required' ? 402 : 429, { error: { code: allowed.code, message: allowed.message } }); return; }
          const query = data.query.trim();
          const limit = typeof data.limit === 'number' ? Math.max(1, Math.min(20, Math.floor(data.limit))) : 8;
          const knowledge = knowledgeFile(record);
          const chunks = knowledge.chunks as unknown as KnowledgeChunk[];
          await ensureKnowledgeIndex(record, knowledge);
          const [queryVector] = await embeddingProvider.embed([query]);
          const hits = await vectorStore.query(knowledgeNamespace(record, 'visitor'), queryVector!, limit);
          const byId = new Map(chunks.filter(chunk => chunk.visibility === 'public').map(chunk => [chunk.id, chunk]));
          const results = hits.flatMap(hit => {
            const chunk = byId.get(hit.id); if (!chunk) return [];
            return [{ chunkId: chunk.id, sourceId: chunk.provenance.sourceId, score: hit.score, matchedReasons: [`semantic:${Math.max(0, hit.score).toFixed(3)}`], visibility: { rule: 'visitor_public_chunk', visibility: 'public', quotable: true }, provenance: chunk.provenance, chunk }];
          });
          record.usage = addUsage(record.usage, { retrievalCalls: 1 }); persist();
          json(res, 200, { provider: `semantic:${embeddingProvider.name}/${vectorStore.name}`, results }); return;
        }
        const target = `/api/v1/public/${publicParts.join('/')}${url.search}`;
        const status = await proxy(req, res, record, target, false, publicRequestData);
        if (req.method === 'POST' && publicParts[0] === 'requests' && status < 300) {
          record.notifications.push({ id: `notification-${randomUUID()}`, type: 'connection_request', createdAt: clock(), read: false });
          record.notifications = record.notifications.filter(item => item.createdAt >= retentionCutoff(record)).slice(-1_000);
          persist();
        }
        return;
      }
      json(res, 404, { error: { code: 'not_found', message: 'unknown endpoint' } });
    } catch (error) {
      if (res.headersSent) throw error;
      if (error instanceof RequestBodyError) { json(res, error.status, { error: { code: error.code, message: error.message } }); return; }
      json(res, 500, { error: { code: 'service_unavailable', message: 'managed service unavailable' } });
    } finally {
      releaseAccount?.();
      if (closingAccountId) endAccountClose(closingAccountId);
    }
  };

  return {
    handler,
    async close() {
      for (const runtime of runtimes.values()) {
        await new Promise<void>(resolve => runtime.server.close(() => resolve()));
        runtime.app.close();
      }
    },
  };
}

export async function listenManaged(options: ManagedGatewayOptions, host: string, port: number) {
  const gateway = createManagedGateway(options);
  const server = createServer((req, res) => { void gateway.handler(req, res); });
  await new Promise<void>(resolve => server.listen(port, host, resolve));
  return { gateway, server };
}
