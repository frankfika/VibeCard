import {
  exportPrivateArchive,
  importArchive,
  type Memory,
  type NowItem,
  type PrivateVibeArchive,
  type VibeCard,
} from '@shared';
import type { Profile } from '../store';
import { loadNowItems, saveNowItems } from './now';

export type RuntimeMode = 'local' | 'self_hosted' | 'managed';

export interface RuntimeConfig {
  mode: RuntimeMode;
  endpoint: string;
  ownerToken: string;
  accountId?: string;
  cardSlug?: string;
}

export class OwnerApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'OwnerApiError';
  }
}

export const RUNTIME_STORAGE_KEY = 'vibecard_runtime_v1';
export const MEMORY_STORAGE_KEY = 'vibecard_owner_memories';
const OWNER_ID_KEY = 'vibecard_local_owner_id';
const MUTATION_QUEUE_KEY = 'vibecard_owner_mutation_queue_v1';

interface QueuedMutation {
  id: string;
  runtimeKey: string;
  path: string;
  method: string;
  body?: string;
  createdAt: number;
}

function mutationRuntimeKey(config: RuntimeConfig): string {
  const endpoint = normalizeEndpoint(config.endpoint, config.mode);
  return [config.mode, endpoint, config.accountId ?? ''].join('|');
}

export function loadRuntimeConfig(): RuntimeConfig | null {
  try {
    const value = JSON.parse(localStorage.getItem(RUNTIME_STORAGE_KEY) || 'null');
    if (!value || !['local', 'self_hosted', 'managed'].includes(value.mode)) return null;
    return {
      mode: value.mode,
      endpoint: typeof value.endpoint === 'string' ? value.endpoint : '',
      ownerToken: typeof value.ownerToken === 'string' ? value.ownerToken : '',
      ...(typeof value.accountId === 'string' ? { accountId: value.accountId } : {}),
      ...(typeof value.cardSlug === 'string' ? { cardSlug: value.cardSlug } : {}),
    };
  } catch {
    return null;
  }
}

export function saveRuntimeConfig(config: RuntimeConfig): void {
  if (config.mode === 'managed') {
    if (!validNamespace(config.accountId) || !validNamespace(config.cardSlug)) {
      throw new Error('Managed runtime requires a valid account id and Card slug');
    }
  }
  localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify({
    ...config,
    endpoint: normalizeEndpoint(config.endpoint, config.mode),
  }));
  window.dispatchEvent(new Event('vibecard-runtime-change'));
}

export function normalizeEndpoint(endpoint: string, mode: RuntimeMode = 'self_hosted'): string {
  const normalized = endpoint.trim().replace(/\/+$/, '');
  if (!normalized) return '';
  const parsed = new URL(normalized);
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash
    || (parsed.protocol === 'http:' && (!loopback || mode === 'managed'))) {
    throw new Error('Runtime endpoint must be an HTTP(S) base URL without credentials, query, or fragment');
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

/** Public projection used in share links; owner tokens and URL credentials never leave the owner runtime. */
function validNamespace(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value);
}

export function publicRuntimeEndpoint(config: RuntimeConfig): string {
  try {
    const endpoint = normalizeEndpoint(config.endpoint, config.mode);
    if (config.mode === 'managed') {
      if (!validNamespace(config.cardSlug)) return '';
      return `${endpoint}/api/v1/cloud/cards/${encodeURIComponent(config.cardSlug)}`;
    }
    return `${endpoint}/api/v1/public`;
  } catch {
    return '';
  }
}

export function normalizePublicSourceEndpoint(source: string): string {
  const endpoint = normalizeEndpoint(source);
  if (/\/api\/v1\/(?:public|cloud\/cards\/[A-Za-z0-9._-]+)$/.test(new URL(endpoint).pathname)) return endpoint;
  return `${endpoint}/api/v1/public`;
}

export function defaultRuntimeEndpoint(): string {
  if (typeof window === 'undefined') return 'http://127.0.0.1:8787';
  return runtimeEndpointForLocation(window.location.hostname, window.location.origin);
}

export function runtimeEndpointForLocation(hostname: string, origin: string): string {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname)
    ? 'http://127.0.0.1:8787'
    : origin;
}

export async function ownerApi<T>(config: RuntimeConfig, path: string, init: RequestInit = {}): Promise<T> {
  if (config.mode === 'local') throw new Error('local mode has no remote endpoint');
  const endpoint = normalizeEndpoint(config.endpoint, config.mode);
  const ownerBase = config.mode === 'managed'
    ? validNamespace(config.accountId) ? `${endpoint}/api/v1/cloud/accounts/${encodeURIComponent(config.accountId)}/owner` : ''
    : `${endpoint}/api/v1/owner`;
  if (!ownerBase) throw new Error('managed account id is required');
  const response = await fetch(`${ownerBase}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.ownerToken}`,
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new OwnerApiError(data?.error?.message || `HTTP ${response.status}`, response.status, data?.error?.code);
  return data as T;
}

export async function managedAccountApi<T>(config: RuntimeConfig, path: string, init: RequestInit = {}): Promise<T> {
  if (config.mode !== 'managed' || !validNamespace(config.accountId)) throw new Error('managed account id is required');
  const response = await fetch(`${normalizeEndpoint(config.endpoint, 'managed')}/api/v1/cloud/accounts/${encodeURIComponent(config.accountId)}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.ownerToken}`, ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new OwnerApiError(data?.error?.message || `HTTP ${response.status}`, response.status, data?.error?.code);
  return data as T;
}

function loadMutationQueue(): QueuedMutation[] {
  try {
    const value = JSON.parse(localStorage.getItem(MUTATION_QUEUE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function saveMutationQueue(queue: QueuedMutation[]) {
  localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent('vibecard-sync-change', { detail: { pending: queue.length } }));
}

/** Queue an idempotent owner mutation, coalescing repeated writes to a path. */
export async function queueOwnerMutation(config: RuntimeConfig, path: string, init: RequestInit): Promise<void> {
  if (config.mode === 'local') return;
  const method = (init.method || 'PUT').toUpperCase();
  if (!['PUT', 'DELETE'].includes(method)) throw new Error('only idempotent mutations can be queued');
  const runtimeKey = mutationRuntimeKey(config);
  const id = `${runtimeKey}:${method}:${path}`;
  const next: QueuedMutation = {
    id,
    runtimeKey,
    path,
    method,
    ...(typeof init.body === 'string' ? { body: init.body } : {}),
    createdAt: Date.now(),
  };
  saveMutationQueue([...loadMutationQueue().filter(item => item.id !== id), next]);
  await flushOwnerMutations(config);
}

export async function flushOwnerMutations(config = loadRuntimeConfig()): Promise<void> {
  if (!config || config.mode === 'local' || !navigator.onLine) return;
  const runtimeKey = mutationRuntimeKey(config);
  // Pre-namespace queue entries cannot be attributed safely. Discard them
  // instead of risking that owner A's payload is sent to owner B's runtime.
  const all = loadMutationQueue();
  const safeQueue = all.filter(item => typeof item.runtimeKey === 'string');
  if (safeQueue.length !== all.length) saveMutationQueue(safeQueue);
  const queue = safeQueue.filter(item => item.runtimeKey === runtimeKey);
  for (const mutation of queue) {
    try {
      await ownerApi(config, mutation.path, { method: mutation.method, ...(mutation.body ? { body: mutation.body } : {}) });
      // Remove only the exact revision that was sent. A newer coalesced write
      // with the same id must survive an older request completing later.
      saveMutationQueue(loadMutationQueue().filter(item => item.id !== mutation.id || item.createdAt !== mutation.createdAt));
    } catch {
      // Keep the mutation for the next reconnect. A later edit to the same
      // path replaces it, preventing duplicate Card writes.
      return;
    }
  }
}

export function loadLocalMemories(): Memory[] {
  try {
    const value = JSON.parse(localStorage.getItem(MEMORY_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveLocalMemories(memories: Memory[]): void {
  localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memories));
}

function localOwnerId(): string {
  let id = localStorage.getItem(OWNER_ID_KEY);
  if (!id) {
    id = `owner-local-${crypto.randomUUID()}`;
    localStorage.setItem(OWNER_ID_KEY, id);
  }
  return id;
}

export function profileToCard(profile: Profile): VibeCard {
  const ownerId = localOwnerId();
  return {
    id: `card-${ownerId}`,
    schemaVersion: 1,
    ownerId,
    name: profile.name,
    avatarUrl: profile.avatar,
    headline: profile.handle || profile.bio,
    currentFocus: profile.bio,
    canHelpWith: profile.canHelpWith || [],
    wantsToMeet: profile.lookingFor ? [profile.lookingFor] : [],
    topics: profile.tags.map(tag => tag.label).slice(0, 8),
    highlights: profile.highlights.filter(item => item.title).slice(0, 3).map(item => ({
      id: String(item.id),
      title: item.title,
      ...(item.link ? { url: item.link } : {}),
    })),
    agentEnabled: true,
    updatedAt: Date.now(),
  };
}

export function exportLocalVibe(profile: Profile): PrivateVibeArchive {
  const card = profileToCard(profile);
  return exportPrivateArchive({
    profile: { id: card.ownerId, schemaVersion: 1, name: card.name, avatarUrl: card.avatarUrl },
    card,
    nowItems: loadNowItems().filter(item => item.ownerId === card.ownerId || item.ownerId.startsWith('fixture-'))
      .map(item => ({ ...item, ownerId: card.ownerId })),
    memories: loadLocalMemories().map(memory => ({ ...memory, ownerId: card.ownerId })),
    conversations: [],
    includeConversations: false,
    knowledgeSources: [],
    connectionRequests: [],
    contactMethods: [],
    attachments: [],
    app: { name: 'vibecard-web', version: '0.1.0' },
    createdAt: Date.now(),
  });
}

export function importLocalVibe(raw: unknown): Profile {
  const result = importArchive(raw);
  if (result.ok === false) throw new Error(result.error.message);
  const state = result.value;
  if (state.kind !== 'private') {
    throw new Error('公开快照不能恢复主人数据，请选择私有 .vibe 备份。');
  }
  localStorage.setItem(OWNER_ID_KEY, state.card.ownerId);
  saveNowItems(state.nowItems as NowItem[]);
  saveLocalMemories(state.memories);
  const profile: Profile = {
    name: state.card.name,
    handle: state.card.headline,
    avatar: state.card.avatarUrl,
    bio: state.card.currentFocus,
    tags: state.card.topics.map(label => ({ label, icon: '✨' })),
    canHelpWith: state.card.canHelpWith,
    lookingFor: state.card.wantsToMeet[0] || '',
    highlights: state.card.highlights.map((item, index) => ({
      id: index + 1,
      title: item.title,
      type: 'project',
      icon: '✨',
      link: item.url || '',
    })),
    contacts: [],
    verified: { wallet: '', twitter: '', discord: '', wechat: '', telegram: '' },
    threads: [],
  };
  localStorage.setItem('vibecard_profile', JSON.stringify(profile));
  return profile;
}

export function clearLocalVibe(): void {
  [
    'vibecard_profile',
    'vibecard_now',
    MEMORY_STORAGE_KEY,
    OWNER_ID_KEY,
    'vibecard_namecard_id',
    MUTATION_QUEUE_KEY,
  ].forEach(key => localStorage.removeItem(key));
}
