import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  requiredPermissionForCapability,
  validateAdapterManifest,
  type AdapterManifest,
} from './adapter-contract.ts';
import {
  MemoryAdapterCredentialStore,
  projectPublicCard,
  type AdapterCredentialStore,
  type AdapterInvocation,
} from './adapter-runtime.ts';

export interface ProcessAdapterDescriptor {
  /** Manifest is inspected by the trusted host; the module is never imported there. */
  manifest: AdapterManifest;
  /** Absolute path to an ESM JavaScript adapter module below an allowed root. */
  modulePath: string;
  /** Named export containing the adapter. Defaults to `default`. */
  exportName?: string;
}

export interface ProcessAdapterHostOptions {
  /** Narrow install roots which may contain adapter code and its dependencies. */
  allowedRoots: string[];
  timeoutMs?: number;
  maxInputBytes?: number;
  maxOutputBytes?: number;
  maxOldSpaceMb?: number;
  runnerPath?: string;
}

type ProcessEntry = {
  descriptor: ProcessAdapterDescriptor;
  modulePath: string;
  moduleRoot: string;
  enabled: boolean;
  generation: number;
};

type OsSandbox = 'macos-seatbelt' | 'linux-bubblewrap';

const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_MAX_BYTES = 1_048_576;
const DEFAULT_MAX_OLD_SPACE_MB = 64;
const DEFAULT_RUNNER = fileURLToPath(new URL('./process-adapter-runner.mjs', import.meta.url));

/**
 * Host for unreviewed JavaScript adapters.
 *
 * The trusted parent never imports adapter code. Every invocation gets a new
 * child process with a scrubbed environment, bounded IPC, a deadline, and the
 * Node process permission model. Filesystem writes, native addons, workers,
 * and child processes are denied; filesystem reads are restricted to the
 * runner and the selected adapter root; network is granted only when declared.
 */
export class ProcessAdapterHost {
  private readonly entries = new Map<string, ProcessEntry>();
  private readonly inFlight = new Map<string, Set<ChildProcess>>();
  private readonly allowedRoots: string[];
  private readonly timeoutMs: number;
  private readonly maxInputBytes: number;
  private readonly maxOutputBytes: number;
  private readonly maxOldSpaceMb: number;
  private readonly runnerPath: string;
  private readonly osSandbox: OsSandbox;

  constructor(
    options: ProcessAdapterHostOptions,
    private readonly credentials: AdapterCredentialStore = new MemoryAdapterCredentialStore(),
  ) {
    if (!options.allowedRoots.length) throw new Error('adapter_root_required');
    this.allowedRoots = options.allowedRoots.map(root => {
      const actual = realpathSync(resolve(root));
      if (!statSync(actual).isDirectory()) throw new Error('invalid_adapter_root');
      if (actual === dirname(actual)) throw new Error('adapter_root_too_broad');
      return actual;
    });
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs');
    this.maxInputBytes = positiveInteger(options.maxInputBytes, DEFAULT_MAX_BYTES, 'maxInputBytes');
    this.maxOutputBytes = positiveInteger(options.maxOutputBytes, DEFAULT_MAX_BYTES, 'maxOutputBytes');
    this.maxOldSpaceMb = positiveInteger(options.maxOldSpaceMb, DEFAULT_MAX_OLD_SPACE_MB, 'maxOldSpaceMb');
    this.runnerPath = realpathSync(options.runnerPath ?? DEFAULT_RUNNER);
    this.osSandbox = detectOsSandbox();
  }

  register(descriptor: ProcessAdapterDescriptor): void {
    const checked = validateAdapterManifest(descriptor.manifest);
    if ('error' in checked) throw new Error(`invalid_adapter_manifest: ${checked.error}`);
    if (!isAbsolute(descriptor.modulePath)) throw new Error('adapter_module_must_be_absolute');
    const modulePath = realpathSync(descriptor.modulePath);
    if (!statSync(modulePath).isFile()) throw new Error('invalid_adapter_module');
    const moduleRoot = this.allowedRoots
      .filter(root => isWithin(root, modulePath))
      .sort((left, right) => right.length - left.length)[0];
    if (!moduleRoot) throw new Error('adapter_module_outside_allowed_roots');

    const previous = this.entries.get(checked.value.id);
    if (previous) this.revoke(checked.value.id, previous, true);
    this.entries.set(checked.value.id, {
      descriptor: { ...descriptor, manifest: checked.value },
      modulePath,
      moduleRoot,
      enabled: false,
      generation: 0,
    });
  }

  enable(adapterId: string, credential?: unknown): void {
    const entry = this.requireEntry(adapterId);
    if (credential !== undefined) {
      if (!entry.descriptor.manifest.permissions.includes('store_credentials')) {
        throw new Error('permission_denied: store_credentials');
      }
      assertSerializable(credential, this.maxInputBytes, 'credential_too_large');
      this.credentials.set(adapterId, credential);
    }
    entry.enabled = true;
    entry.generation += 1;
  }

  disable(adapterId: string): void {
    this.revoke(adapterId, this.requireEntry(adapterId), true);
  }

  remove(adapterId: string): void {
    const entry = this.requireEntry(adapterId);
    this.revoke(adapterId, entry, true);
    this.entries.delete(adapterId);
  }

  isEnabled(adapterId: string): boolean {
    return this.entries.get(adapterId)?.enabled === true;
  }

  async invoke<TInput, TOutput>(
    adapterId: string,
    invocation: AdapterInvocation<TInput>,
    options: { signal?: AbortSignal } = {},
  ): Promise<TOutput> {
    const entry = this.requireEntry(adapterId);
    if (!entry.enabled) throw new Error('adapter_disabled');
    const manifest = entry.descriptor.manifest;
    if (!manifest.capabilities.includes(invocation.capability)) {
      throw new Error(`unsupported_capability: ${invocation.capability}`);
    }
    if (!manifest.permissions.includes(invocation.permission)) {
      throw new Error(`permission_denied: ${invocation.permission}`);
    }
    const required = requiredPermissionForCapability(manifest, invocation.capability);
    if (!required || invocation.permission !== required) {
      throw new Error(`permission_denied: ${invocation.permission}`);
    }
    if (options.signal?.aborted) throw new Error('adapter_aborted');

    const generation = entry.generation;
    const safeInvocation = required === 'read_public_card'
      ? { ...invocation, input: projectPublicCard(invocation.input) }
      : invocation;
    const hasCredential = manifest.permissions.includes('store_credentials');
    const payload = {
      protocolVersion: 1,
      manifest,
      modulePath: entry.modulePath,
      exportName: entry.descriptor.exportName ?? 'default',
      invocation: safeInvocation,
      hasCredential,
      ...(hasCredential ? { credential: this.credentials.get(adapterId) } : {}),
    };
    const input = assertSerializable(payload, this.maxInputBytes, 'adapter_input_too_large');
    const args = [
      '--permission',
      `--allow-fs-read=${this.runnerPath}`,
      `--allow-fs-read=${entry.moduleRoot}`,
      `--max-old-space-size=${this.maxOldSpaceMb}`,
      this.runnerPath,
      String(this.maxInputBytes),
    ];
    if (manifest.permissions.includes('network')) args.splice(3, 0, '--allow-net');

    const sandboxed = sandboxCommand(this.osSandbox, process.execPath, args, entry.moduleRoot, this.runnerPath, manifest.permissions.includes('network'));
    const child = spawn(sandboxed.command, sandboxed.args, {
      cwd: entry.moduleRoot,
      env: { NODE_NO_WARNINGS: '1' },
      stdio: ['pipe', 'ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    const children = this.inFlight.get(adapterId) ?? new Set<ChildProcess>();
    children.add(child);
    this.inFlight.set(adapterId, children);

    return new Promise<TOutput>((resolvePromise, rejectPromise) => {
      let settled = false;
      let output = Buffer.alloc(0);
      const protocol = child.stdio[3];
      const finish = (error?: Error, value?: TOutput) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        children.delete(child);
        if (!children.size) this.inFlight.delete(adapterId);
        if (!child.killed) child.kill('SIGKILL');
        if (error) rejectPromise(error); else resolvePromise(value as TOutput);
      };
      const failAndDisable = (code: string) => {
        if (entry.enabled && entry.generation === generation) {
          entry.enabled = false;
          entry.generation += 1;
        }
        finish(new Error(code));
      };
      const timer = setTimeout(() => failAndDisable('adapter_timeout'), this.timeoutMs);
      const onAbort = () => finish(new Error('adapter_aborted'));
      options.signal?.addEventListener('abort', onAbort, { once: true });

      protocol?.on('data', chunk => {
        output = Buffer.concat([output, Buffer.from(chunk)]);
        if (output.byteLength > this.maxOutputBytes) failAndDisable('adapter_output_too_large');
      });
      protocol?.on('error', () => failAndDisable('adapter_failed'));
      child.on('error', () => failAndDisable('adapter_failed'));
      child.on('close', () => {
        if (settled) return;
        if (!entry.enabled || entry.generation !== generation) return finish(new Error('adapter_disabled'));
        try {
          const response = JSON.parse(output.toString('utf8')) as { protocolVersion?: unknown; ok?: unknown; value?: unknown };
          if (response.protocolVersion !== 1 || response.ok !== true || !('value' in response)) {
            return failAndDisable('adapter_failed');
          }
          finish(undefined, response.value as TOutput);
        } catch {
          failAndDisable('adapter_failed');
        }
      });
      child.stdin?.end(input);
    });
  }

  private revoke(adapterId: string, entry: ProcessEntry, deleteCredential: boolean): void {
    entry.enabled = false;
    entry.generation += 1;
    for (const child of this.inFlight.get(adapterId) ?? []) child.kill('SIGKILL');
    this.inFlight.delete(adapterId);
    if (deleteCredential) this.credentials.delete(adapterId);
  }

  private requireEntry(adapterId: string): ProcessEntry {
    const entry = this.entries.get(adapterId);
    if (!entry) throw new Error('adapter_not_found');
    return entry;
  }
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate <= 0) throw new Error(`invalid_${name}`);
  return candidate;
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function assertSerializable(value: unknown, maxBytes: number, errorCode: string): string {
  let json: string | undefined;
  try { json = JSON.stringify(value); } catch { throw new Error('adapter_input_not_serializable'); }
  if (json === undefined) throw new Error('adapter_input_not_serializable');
  if (Buffer.byteLength(json) > maxBytes) throw new Error(errorCode);
  return json;
}

function detectOsSandbox(): OsSandbox {
  if (process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec')) return 'macos-seatbelt';
  if (process.platform === 'linux' && existsSync('/usr/bin/bwrap')) return 'linux-bubblewrap';
  throw new Error('os_adapter_sandbox_unavailable');
}

function sandboxCommand(
  sandbox: OsSandbox,
  nodePath: string,
  nodeArgs: string[],
  moduleRoot: string,
  runnerPath: string,
  network: boolean,
): { command: string; args: string[] } {
  if (sandbox === 'macos-seatbelt') {
    const actualNodePath = realpathSync(nodePath);
    const cellarMarker = '/Cellar/';
    const nodeRoot = actualNodePath.includes(cellarMarker)
      ? actualNodePath.slice(0, actualNodePath.indexOf(cellarMarker))
      : dirname(dirname(actualNodePath));
    const literal = (path: string) => `\"${path.replaceAll('\\', '\\\\').replaceAll('\"', '\\\"')}\"`;
    const profile = [
      '(version 1)',
      '(deny default)',
      '(import "system.sb")',
      `(allow process-exec (literal ${literal(actualNodePath)}))`,
      '(deny process-fork)',
      // ESM resolution must stat ancestor directories; content reads remain
      // restricted by the following rule and Node's independent allowlist.
      '(allow file-read-metadata)',
      `(allow file-read* (subpath ${literal(nodeRoot)}) (subpath "/System") (subpath "/usr/lib") (subpath ${literal(moduleRoot)}) (literal ${literal(runnerPath)}))`,
      '(deny file-write*)',
      network ? '(allow network*)' : '(deny network*)',
    ].join(' ');
    return { command: '/usr/bin/sandbox-exec', args: ['-p', profile, nodePath, ...nodeArgs] };
  }

  const args = [
    '--die-with-parent', '--new-session', '--unshare-pid', '--unshare-ipc', '--unshare-uts',
    ...(network ? [] : ['--unshare-net']),
    '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
    nodePath, ...nodeArgs,
  ];
  return { command: '/usr/bin/bwrap', args };
}
