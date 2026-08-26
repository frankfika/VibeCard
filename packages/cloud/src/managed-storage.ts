import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type SyncEntity = 'card' | 'now' | 'memory' | 'contact' | 'request' | 'knowledge_source';

export interface SyncChange {
  cursor: number;
  entity: SyncEntity;
  entityId: string;
  operation: 'upsert' | 'delete';
  record?: unknown;
  sourceDeviceId: string | null;
  createdAt: number;
}

export interface SyncState {
  nextCursor: number;
  snapshot: Record<string, unknown>;
  changes: SyncChange[];
  lastSyncAt: number | null;
}

export interface BackupEnvelope {
  id: string;
  createdAt: number;
  expiresAt: number;
  archiveSha256: string;
  ciphertext: string;
}

export interface ManagedKnowledgeFile {
  sources: Array<Record<string, unknown>>;
  chunks: Array<Record<string, unknown>>;
  deleted: Array<{ sourceId: string; deletedAt: number }>;
}

export function safeRegion(region: string): string {
  if (!/^[a-z0-9-]{2,40}$/.test(region)) throw new Error('invalid region');
  return region;
}

export function accountDataDir(root: string, region: string, accountId: string): string {
  const regions = join(root, 'regions');
  const regional = join(regions, safeRegion(region));
  const account = join(regional, accountId);
  for (const path of [regions, regional, account]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    chmodSync(path, 0o700);
  }
  return account;
}

function atomicJson(path: string, value: unknown): void {
  const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

export function loadSyncState(dir: string, decode?: (ciphertext: string) => string): SyncState {
  const path = join(dir, 'sync.json');
  if (!existsSync(path)) return { nextCursor: 1, snapshot: {}, changes: [], lastSyncAt: null };
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<SyncState> & { ciphertext?: string };
  const parsed = raw.ciphertext && decode ? JSON.parse(decode(raw.ciphertext)) as Partial<SyncState> : raw;
  return {
    nextCursor: Number.isSafeInteger(parsed.nextCursor) ? parsed.nextCursor! : 1,
    snapshot: parsed.snapshot && typeof parsed.snapshot === 'object' ? parsed.snapshot : {},
    changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    lastSyncAt: typeof parsed.lastSyncAt === 'number' ? parsed.lastSyncAt : null,
  };
}

export function saveSyncState(dir: string, state: SyncState, encode?: (plaintext: string) => string): void {
  atomicJson(join(dir, 'sync.json'), encode ? { version: 1, ciphertext: encode(JSON.stringify(state)) } : state);
}

export function flattenArchive(archive: Record<string, any>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const add = (entity: SyncEntity, records: unknown[]) => {
    for (const raw of records) {
      if (!raw || typeof raw !== 'object' || typeof (raw as any).id !== 'string') continue;
      result[`${entity}:${(raw as any).id}`] = raw;
    }
  };
  if (archive.card?.id) result[`card:${archive.card.id}`] = archive.card;
  add('now', Array.isArray(archive.nowItems) ? archive.nowItems : []);
  add('memory', Array.isArray(archive.memories) ? archive.memories : []);
  add('contact', Array.isArray(archive.contactMethods) ? archive.contactMethods : []);
  add('request', Array.isArray(archive.connectionRequests) ? archive.connectionRequests : []);
  add('knowledge_source', Array.isArray(archive.knowledgeSources) ? archive.knowledgeSources : []);
  return result;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function reconcileSnapshot(
  state: SyncState,
  next: Record<string, unknown>,
  sourceDeviceId: string | null,
  createdAt: number,
): SyncChange[] {
  const emitted: SyncChange[] = [];
  const keys = new Set([...Object.keys(state.snapshot), ...Object.keys(next)]);
  for (const key of [...keys].sort()) {
    const previous = state.snapshot[key];
    const current = next[key];
    if (current !== undefined && previous !== undefined && stable(current) === stable(previous)) continue;
    const separator = key.indexOf(':');
    const entity = key.slice(0, separator) as SyncEntity;
    const entityId = key.slice(separator + 1);
    const logicalDelete = current !== undefined && current && typeof current === 'object' && (current as any).status === 'deleted';
    const change: SyncChange = {
      cursor: state.nextCursor++, entity, entityId,
      operation: current === undefined || logicalDelete ? 'delete' : 'upsert',
      ...(current === undefined || logicalDelete ? {} : { record: current }),
      sourceDeviceId, createdAt,
    };
    state.changes.push(change); emitted.push(change);
  }
  state.snapshot = next;
  state.lastSyncAt = createdAt;
  return emitted;
}

export function enforceRetention<T extends { createdAt: number }>(items: T[], cutoff: number): T[] {
  return items.filter(item => item.createdAt >= cutoff);
}

export function loadBackups(dir: string): BackupEnvelope[] {
  const path = join(dir, 'backups.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
}

export function saveBackups(dir: string, backups: BackupEnvelope[]): void {
  atomicJson(join(dir, 'backups.json'), backups);
}

export function archiveHash(serialized: string): string {
  return createHash('sha256').update(serialized).digest('hex');
}

export function loadKnowledge(dir: string, decode: (ciphertext: string) => string): ManagedKnowledgeFile {
  const path = join(dir, 'knowledge.json');
  if (!existsSync(path)) return { sources: [], chunks: [], deleted: [] };
  const envelope = JSON.parse(readFileSync(path, 'utf8')) as { ciphertext: string };
  const parsed = JSON.parse(decode(envelope.ciphertext)) as Partial<ManagedKnowledgeFile>;
  return {
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    chunks: Array.isArray(parsed.chunks) ? parsed.chunks : [],
    deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
  };
}

export function saveKnowledge(dir: string, value: ManagedKnowledgeFile, encode: (plaintext: string) => string): void {
  atomicJson(join(dir, 'knowledge.json'), { version: 1, ciphertext: encode(JSON.stringify(value)) });
}
