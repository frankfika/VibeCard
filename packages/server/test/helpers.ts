/**
 * Shared test helpers: fixture private archive + in-process app launcher.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  exportPrivateArchive,
  vibeFixtures,
  nowFixtures,
  createMockModelProvider,
} from '../../shared/index';
import type { ModelProvider } from '../../shared/index';

import { createApp, listen } from '../src/app';
import type { ServerConfig } from '../src/config';
import type { ModerationHook } from '../src/moderation';

export const OWNER_TOKEN = 'test-owner-token';

/** The complete Core fixture state as a private .vibe archive. */
export function fixturePrivateArchive() {
  return exportPrivateArchive({
    profile: {
      id: vibeFixtures.fixtureOwner.id,
      schemaVersion: 1,
      name: vibeFixtures.fixtureOwner.name,
      avatarUrl: vibeFixtures.fixtureOwner.avatarUrl,
    },
    card: vibeFixtures.fixtureOwnerCard,
    nowItems: nowFixtures.fixtureNowItems,
    memories: [
      ...vibeFixtures.fixtureOwnerMemories,
      ...vibeFixtures.fixtureOwnerSensitiveMemories,
    ],
    contactMethods: vibeFixtures.fixtureOwnerContactMethods,
    connectionRequests: [vibeFixtures.fixtureConnectionRequest],
    includeConversations: false,
    knowledgeSources: [],
    attachments: [],
    app: { name: 'vibecard-server-test', version: '0.0.0' },
    createdAt: Date.now(),
  });
}

export interface RunningApp {
  base: string;
  close: () => Promise<void>;
  dbDir: string;
}

export async function startApp(options: {
  provider?: ModelProvider;
  moderate?: ModerationHook;
  chatRatePerHour?: number;
  requestRatePerHour?: number;
  now?: () => number;
  knowledgeImportBarrier?: (stage: 'after_stage' | 'after_metadata' | 'after_commit') => Promise<void>;
} = {}): Promise<RunningApp> {
  const dbDir = mkdtempSync(join(tmpdir(), 'vibecard-server-test-'));
  const config: ServerConfig = {
    host: '127.0.0.1',
    port: 0,
    dbPath: join(dbDir, 'vibecard.db'),
    ownerToken: OWNER_TOKEN,
    ownerTokenGenerated: false,
    corsOrigin: '*',
    aiProvider: 'mock',
    aiApiBase: null,
    aiModel: null,
    aiApiKey: null,
    aiApiHeaders: null,
    aiTimeoutMs: 5000,
    moderationApiUrl: null,
    moderationApiKey: null,
    moderationTimeoutMs: 1000,
    requireModeration: false,
    chatRatePerHour: options.chatRatePerHour ?? 1000,
    requestRatePerHour: options.requestRatePerHour ?? 1000,
    maxBodyBytes: 2 * 1024 * 1024,
  };
  const app = createApp({
    config,
    provider: options.provider ?? createMockModelProvider(),
    ...(options.moderate ? { moderate: options.moderate } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.knowledgeImportBarrier ? { knowledgeImportBarrier: options.knowledgeImportBarrier } : {}),
    logger: () => undefined,
  });
  const server = await listen(app, '127.0.0.1', 0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    dbDir,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      app.close();
      rmSync(dbDir, { recursive: true, force: true });
    },
  };
}

export interface ApiResponse {
  status: number;
  body: any;
}

export async function api(
  base: string,
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

export const owner = (base: string, method: string, path: string, body?: unknown) =>
  api(base, method, path, { token: OWNER_TOKEN, ...(body !== undefined ? { body } : {}) });
