import {
  requiredPermissionForCapability,
  validateAdapterManifest,
  type AdapterManifest,
  type AdapterPermission,
} from './adapter-contract.ts';

export interface AdapterInvocation<T = unknown> {
  capability: string;
  permission: AdapterPermission;
  input: T;
}

export interface Adapter<TInput = unknown, TOutput = unknown> {
  manifest: AdapterManifest;
  run(invocation: AdapterInvocation<TInput>, context: { signal: AbortSignal; getCredential(): unknown }): Promise<TOutput>;
}

export interface AdapterCredentialStore {
  get(adapterId: string): unknown;
  set(adapterId: string, credential: unknown): void;
  delete(adapterId: string): void;
}

export class MemoryAdapterCredentialStore implements AdapterCredentialStore {
  private readonly values = new Map<string, unknown>();
  get(adapterId: string) { return this.values.get(adapterId); }
  set(adapterId: string, credential: unknown) { this.values.set(adapterId, credential); }
  delete(adapterId: string) { this.values.delete(adapterId); }
}

type RuntimeEntry = { adapter: Adapter<any, any>; enabled: boolean; generation: number };

/**
 * Small in-process enforcement boundary for third-party adapters. It denies
 * undeclared capabilities/permissions before adapter code runs and invalidates
 * cached handles whenever an adapter is disabled or removed.
 */
export class AdapterRuntime {
  private readonly entries = new Map<string, RuntimeEntry>();
  private readonly activeHandles = new Map<string, number>();
  private readonly inFlight = new Map<string, Set<AbortController>>();

  constructor(private readonly credentials: AdapterCredentialStore = new MemoryAdapterCredentialStore()) {}

  register(adapter: Adapter): void {
    const checked = validateAdapterManifest(adapter.manifest);
    if ('error' in checked) throw new Error(`invalid_adapter_manifest: ${checked.error}`);
    const previous = this.entries.get(checked.value.id);
    if (previous) {
      // Replacement is a lifecycle transition, not a map overwrite. Revoke
      // the old generation exactly like disable/remove so cached or in-flight
      // code cannot return after a new implementation has been registered.
      previous.enabled = false;
      previous.generation += 1;
      this.activeHandles.delete(checked.value.id);
      this.abortInFlight(checked.value.id);
      this.credentials.delete(checked.value.id);
    }
    // Keep class-instance adapters valid: spreading an instance drops
    // prototype methods such as `run`. Bind the supplied implementation while
    // replacing only the untrusted manifest with its validated projection.
    this.entries.set(checked.value.id, {
      adapter: { manifest: checked.value, run: adapter.run.bind(adapter) },
      enabled: false,
      generation: 0,
    });
    this.activeHandles.delete(checked.value.id);
  }

  enable(adapterId: string, credential?: unknown): void {
    const entry = this.requireEntry(adapterId);
    if (credential !== undefined) {
      if (!entry.adapter.manifest.permissions.includes('store_credentials')) throw new Error('permission_denied: store_credentials');
      this.credentials.set(adapterId, credential);
    }
    entry.enabled = true;
    entry.generation += 1;
    this.activeHandles.set(adapterId, entry.generation);
  }

  disable(adapterId: string): void {
    const entry = this.requireEntry(adapterId);
    entry.enabled = false;
    entry.generation += 1;
    this.activeHandles.delete(adapterId);
    this.abortInFlight(adapterId);
    this.credentials.delete(adapterId);
  }

  remove(adapterId: string): void {
    this.requireEntry(adapterId);
    this.entries.delete(adapterId);
    this.activeHandles.delete(adapterId);
    this.abortInFlight(adapterId);
    this.credentials.delete(adapterId);
  }

  isEnabled(adapterId: string): boolean {
    const entry = this.entries.get(adapterId);
    return Boolean(entry?.enabled && this.activeHandles.get(adapterId) === entry.generation);
  }

  async invoke<TInput, TOutput>(adapterId: string, invocation: AdapterInvocation<TInput>): Promise<TOutput> {
    const entry = this.requireEntry(adapterId);
    if (!entry.enabled || this.activeHandles.get(adapterId) !== entry.generation) throw new Error('adapter_disabled');
    if (!entry.adapter.manifest.capabilities.includes(invocation.capability)) throw new Error(`unsupported_capability: ${invocation.capability}`);
    if (!entry.adapter.manifest.permissions.includes(invocation.permission)) throw new Error(`permission_denied: ${invocation.permission}`);
    const requiredPermission = requiredPermissionForCapability(entry.adapter.manifest, invocation.capability);
    if (!requiredPermission || invocation.permission !== requiredPermission) {
      throw new Error(`permission_denied: ${invocation.permission}`);
    }
    const generation = entry.generation;
    const controller = new AbortController();
    const controllers = this.inFlight.get(adapterId) ?? new Set<AbortController>();
    controllers.add(controller); this.inFlight.set(adapterId, controllers);
    const safeInvocation = requiredPermission === 'read_public_card'
      ? { ...invocation, input: projectPublicCard(invocation.input) }
      : invocation;
    try {
      const output = await entry.adapter.run(safeInvocation, {
        signal: controller.signal,
        getCredential: () => {
          if (controller.signal.aborted || !entry.enabled || entry.generation !== generation) throw new Error('adapter_disabled');
          return entry.adapter.manifest.permissions.includes('store_credentials') ? this.credentials.get(adapterId) : undefined;
        },
      });
      if (controller.signal.aborted || !entry.enabled || entry.generation !== generation) throw new Error('adapter_disabled');
      return output as TOutput;
    } catch {
      if (controller.signal.aborted || !entry.enabled || entry.generation !== generation) throw new Error('adapter_disabled');
      // Adapter failures stay typed and do not activate a fallback adapter or
      // retry with a broader permission. Invalidate the active handle so a
      // cached caller cannot keep invoking a failing adapter until the owner
      // explicitly enables it again.
      entry.enabled = false;
      entry.generation += 1;
      this.activeHandles.delete(adapterId);
      throw new Error('adapter_failed');
    } finally {
      controllers.delete(controller);
      if (!controllers.size) this.inFlight.delete(adapterId);
    }
  }

  private abortInFlight(adapterId: string): void {
    for (const controller of this.inFlight.get(adapterId) ?? []) controller.abort();
    this.inFlight.delete(adapterId);
  }

  private requireEntry(adapterId: string): RuntimeEntry {
    const entry = this.entries.get(adapterId);
    if (!entry) throw new Error('adapter_not_found');
    return entry;
  }
}

/** Strict public projection used before any `read_public_card` adapter runs. */
export function projectPublicCard(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_public_card');
  const source = value as Record<string, unknown>;
  const string = (key: string) => typeof source[key] === 'string' ? source[key] as string : '';
  const strings = (key: string) => Array.isArray(source[key]) ? (source[key] as unknown[]).filter((item): item is string => typeof item === 'string') : [];
  const highlights = Array.isArray(source.highlights) ? source.highlights.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const h = item as Record<string, unknown>;
    if (typeof h.id !== 'string' || typeof h.title !== 'string') return [];
    return [{ id: h.id, title: h.title, ...(typeof h.url === 'string' ? { url: h.url } : {}) }];
  }) : [];
  const now = Array.isArray(source.now) ? source.now.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const n = item as Record<string, unknown>;
    if (typeof n.id !== 'string' || typeof n.text !== 'string' || typeof n.topic !== 'string') return [];
    return [{ id: n.id, text: n.text, topic: n.topic, publishedAt: typeof n.publishedAt === 'number' ? n.publishedAt : null }];
  }) : [];
  return {
    id: string('id'), schemaVersion: 1, ownerId: string('ownerId'), name: string('name'), avatarUrl: string('avatarUrl'),
    headline: string('headline'), currentFocus: string('currentFocus'), canHelpWith: strings('canHelpWith'), wantsToMeet: strings('wantsToMeet'),
    topics: strings('topics'), highlights, agentEnabled: source.agentEnabled === true, updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : 0,
    ...(Array.isArray(source.now) ? { now } : {}),
  };
}
