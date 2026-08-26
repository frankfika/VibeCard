/**
 * Server configuration (task 5.7).
 *
 * Every knob is a plain environment variable — no VibeCard Cloud account or
 * key is ever required. Defaults are secure for self-hosting: localhost bind,
 * deterministic mock model, SQLite file under ./data.
 */

import { randomBytes } from 'node:crypto';

export interface ServerConfig {
  /** Bind host. Defaults to loopback; set 0.0.0.0 only behind a reverse proxy. */
  host: string;
  port: number;
  /** SQLite file path (':memory:' for ephemeral tests). */
  dbPath: string;
  /** Single-owner bearer token. Generated ephemeral (and logged) when unset. */
  ownerToken: string;
  /** True when the token was generated because none was configured. */
  ownerTokenGenerated: boolean;
  /** CORS Access-Control-Allow-Origin value. */
  corsOrigin: string;
  /** Model provider selection (see docs/engineering/MODEL_ADAPTERS.md). */
  aiProvider: 'mock' | 'openai-compatible';
  aiApiBase: string | null;
  aiModel: string | null;
  aiApiKey: string | null;
  aiApiHeaders: Record<string, string> | null;
  aiTimeoutMs: number;
  /** Optional HTTP moderation service. It receives { text } and returns { ok, reason? }. */
  moderationApiUrl: string | null;
  moderationApiKey: string | null;
  moderationTimeoutMs: number;
  /** Refuse startup without real moderation when this deployment accepts public text. */
  requireModeration: boolean;
  /** Visitor rate limits (token bucket, per visitor id + ip). */
  chatRatePerHour: number;
  requestRatePerHour: number;
  /** Max JSON body bytes accepted by any endpoint. */
  maxBodyBytes: number;
}

function intFromEnv(value: string | undefined, fallback: number, min: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const configured = typeof env.VIBECARD_OWNER_TOKEN === 'string' && env.VIBECARD_OWNER_TOKEN.trim().length > 0;
  const ownerToken = configured
    ? env.VIBECARD_OWNER_TOKEN!.trim()
    : randomBytes(24).toString('base64url');

  let aiProvider: 'mock' | 'openai-compatible';
  if (env.AI_PROVIDER === 'openai-compatible') aiProvider = 'openai-compatible';
  else if (env.AI_PROVIDER === 'mock') aiProvider = 'mock';
  else aiProvider = env.AI_API_BASE ? 'openai-compatible' : 'mock';

  let aiApiHeaders: Record<string, string> | null = null;
  if (typeof env.AI_API_HEADERS === 'string' && env.AI_API_HEADERS.trim()) {
    try {
      const parsed = JSON.parse(env.AI_API_HEADERS) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        aiApiHeaders = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === 'string') aiApiHeaders[key] = value;
        }
      }
    } catch {
      aiApiHeaders = null; // invalid JSON headers are ignored, never fatal
    }
  }

  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port: intFromEnv(env.PORT, 8787, 0),
    dbPath: env.VIBECARD_DB_PATH?.trim() || './data/vibecard.db',
    ownerToken,
    ownerTokenGenerated: !configured,
    corsOrigin: env.CORS_ORIGIN?.trim() || '*',
    aiProvider,
    aiApiBase: env.AI_API_BASE?.trim() || null,
    aiModel: env.AI_MODEL?.trim() || null,
    aiApiKey: env.AI_API_KEY?.trim() || null,
    aiApiHeaders,
    aiTimeoutMs: intFromEnv(env.AI_TIMEOUT_MS, 15000, 1000),
    moderationApiUrl: env.MODERATION_API_URL?.trim() || null,
    moderationApiKey: env.MODERATION_API_KEY?.trim() || null,
    moderationTimeoutMs: intFromEnv(env.MODERATION_TIMEOUT_MS, 5000, 500),
    requireModeration: env.REQUIRE_MODERATION === '1',
    chatRatePerHour: intFromEnv(env.RATE_LIMIT_CHAT_PER_HOUR, 30, 1),
    requestRatePerHour: intFromEnv(env.RATE_LIMIT_REQUESTS_PER_HOUR, 10, 1),
    maxBodyBytes: intFromEnv(env.MAX_BODY_BYTES, 2 * 1024 * 1024, 1024),
  };
}
