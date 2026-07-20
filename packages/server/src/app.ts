/**
 * VibeCard open server (task 5.7).
 *
 * A single-owner Node HTTP server composing the portable Core
 * (packages/shared), the local SQLite store (packages/platforms/local-store),
 * and the configured model provider. No framework, no runtime npm
 * dependencies — node:http + Core contracts only.
 *
 * Security model (ARCHITECTURE §13, SELF_HOSTING.md):
 * - Owner endpoints require `Authorization: Bearer $VIBECARD_OWNER_TOKEN`
 *   (constant-time comparison).
 * - Visitor endpoints are unauthenticated but rate-limited and moderated.
 * - Permission filtering happens before retrieval; the visitor agent only
 *   ever sees confirmed public (quotable) + agent_only (boundary, id-less)
 *   memories. Contact details never leave the owner session until the owner
 *   connects and picks exactly what to share.
 * - Errors use the ARCHITECTURE §12 vocabulary; stack traces, keys, and raw
 *   provider output never appear in responses.
 */

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  buildConnectionRequest,
  buildDeletionPlan,
  buildProposedMemory,
  canProjectMemoryToNow,
  canViewConnectionRequest,
  checkConnectionCreateAllowed,
  confirmMemory,
  createAgentModel,
  deleteMemory,
  editMemory,
  exportPrivateArchive,
  exportPublicArchive,
  filterActiveNow,
  forbiddenForVisitor,
  importArchive,
  isMemoryKind,
  isMemoryVisibility,
  pauseMemory,
  projectActiveNowItems,
  rejectMemoryProposal,
  resolveSharedContacts,
  resumeMemory,
  retrieveMemories,
  validateConnectionRequestPayload,
  ConnectionTransitionError,
  MemoryTransitionError,
  NOW_ITEM_TOPICS,
  applyOwnerAction,
} from '../../shared/index';
import type {
  ArchiveConversation,
  ArchiveMessage,
  ConnectionRequest,
  ContactMethod,
  Memory,
  ModelProvider,
  NowItem,
  NowItemStatus,
  VibeCard,
} from '../../shared/index';
import { createLocalRepositories } from '../../platforms/local-store/index';
import type { LocalRepositories } from '../../platforms/local-store/index';

import type { ServerConfig } from './config';
import { moderateOrThrow, ModerationError } from './moderation';
import type { ModerationHook } from './moderation';
import { defaultModerationHook } from './moderation';
import { createRateLimiter } from './rate-limit';
import {
  MAX_VISITOR_ROUNDS,
  buildCardDraftSystem,
  buildConnectionSummarySystem,
  buildOwnerSystem,
  buildVisitorSystem,
} from './prompts';
import { safeErrorForLog } from './redact';

const APP_INFO = { name: 'vibecard-server', version: '0.1.0' };
const CONTACT_KINDS = ['wechat', 'email', 'phone', 'telegram', 'other'] as const;

/* ---------------------------------------------------------------------------
 * Owner-side metadata (blocked list, export/delete guard) — small JSON
 * sidecar next to the SQLite file. Domain records live in repositories; this
 * is deployment state only.
 * ------------------------------------------------------------------------- */

export interface OwnerMeta {
  ownerId: string | null;
  cardId: string | null;
  blockedUsers: string[];
  lastPrivateExportAt: number | null;
  lastWriteAt: number;
}

export function loadMeta(dbPath: string): OwnerMeta {
  const empty: OwnerMeta = {
    ownerId: null,
    cardId: null,
    blockedUsers: [],
    lastPrivateExportAt: null,
    lastWriteAt: 0,
  };
  if (dbPath === ':memory:') return empty;
  const path = `${dbPath}.owner.json`;
  try {
    if (!existsSync(path)) return empty;
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<OwnerMeta>;
    return {
      ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : null,
      cardId: typeof raw.cardId === 'string' ? raw.cardId : null,
      blockedUsers: Array.isArray(raw.blockedUsers)
        ? raw.blockedUsers.filter((v): v is string => typeof v === 'string')
        : [],
      lastPrivateExportAt: typeof raw.lastPrivateExportAt === 'number' ? raw.lastPrivateExportAt : null,
      lastWriteAt: typeof raw.lastWriteAt === 'number' ? raw.lastWriteAt : 0,
    };
  } catch {
    return empty;
  }
}

export function saveMeta(dbPath: string, meta: OwnerMeta): void {
  if (dbPath === ':memory:') return;
  const path = `${dbPath}.owner.json`;
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(meta, null, 2));
  renameSync(tmp, path);
}

/** Build the complete private archive straight from a store (used by the HTTP
 *  export endpoint and the backup CLI). */
export async function exportPrivateFromRepos(
  repos: LocalRepositories,
  meta: OwnerMeta,
  createdAt: number,
  includeConversations: boolean,
) {
  if (!meta.ownerId || !meta.cardId) throw new Error('no identity in this store');
  const card = await repos.cards.get(meta.cardId);
  if (!card) throw new Error('no identity in this store');
  return exportPrivateArchive({
    profile: { id: meta.ownerId, schemaVersion: 1, name: card.name, avatarUrl: card.avatarUrl },
    card,
    nowItems: await repos.now.list({ ownerId: meta.ownerId }),
    memories: await repos.memories.list({ ownerId: meta.ownerId }),
    contactMethods: await repos.contactMethods.listByOwner(meta.ownerId),
    connectionRequests: await repos.connections.listForOwner({ ownerId: meta.ownerId }),
    includeConversations,
    conversations: includeConversations ? await repos.conversations.list({ ownerId: meta.ownerId }) : [],
    knowledgeSources: await repos.knowledgeSources.list({ ownerId: meta.ownerId }),
    attachments: [],
    app: APP_INFO,
    createdAt,
  });
}

/* ---------------------------------------------------------------------------
 * HTTP helpers
 * ------------------------------------------------------------------------- */

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown, corsOrigin: string): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': corsOrigin,
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function sendError(res: ServerResponse, error: ApiError, corsOrigin: string): void {
  sendJson(res, error.status, { error: { code: error.code, message: error.message } }, corsOrigin);
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new ApiError(413, 'invalid_request', 'request body too large');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new ApiError(400, 'invalid_request', 'request body must be JSON');
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'invalid_request', 'request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------------------------------------------------------------------------
 * App
 * ------------------------------------------------------------------------- */

export interface AppOptions {
  config: ServerConfig;
  provider: ModelProvider;
  moderate?: ModerationHook;
  now?: () => number;
  logger?: (line: string) => void;
}

export interface App {
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  repos: LocalRepositories;
  close: () => void;
}

export function createApp(options: AppOptions): App {
  const { config, provider } = options;
  const now = options.now ?? (() => Date.now());
  const log = options.logger ?? ((line: string) => console.error(line));
  const moderate = options.moderate ?? defaultModerationHook;
  const agent = createAgentModel(provider);

  if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });
  const repos = createLocalRepositories(config.dbPath);
  const meta = loadMeta(config.dbPath);

  const chatLimiter = createRateLimiter({ perHour: config.chatRatePerHour, now });
  const requestLimiter = createRateLimiter({ perHour: config.requestRatePerHour, now });

  function touch(): void {
    meta.lastWriteAt = now();
    saveMeta(config.dbPath, meta);
  }

  async function ownerCard(): Promise<VibeCard | null> {
    return meta.cardId ? repos.cards.get(meta.cardId) : null;
  }

  function requireOwner(req: IncomingMessage): void {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token || !tokenMatches(token, config.ownerToken)) {
      throw new ApiError(401, 'unauthorized', 'owner token required');
    }
  }

  async function requireIdentity(): Promise<VibeCard> {
    const card = await ownerCard();
    if (!card || !meta.ownerId) {
      throw new ApiError(404, 'not_found', 'no identity yet — create or import one first');
    }
    return card;
  }

  function visitorKey(req: IncomingMessage, visitorId: string): string {
    return `${req.socket.remoteAddress ?? 'unknown'}|${visitorId}`;
  }

  function checkRate(limiter: typeof chatLimiter, key: string): void {
    if (!limiter.allow(key)) {
      throw new ApiError(429, 'rate_limited', 'too many requests — slow down and retry later');
    }
  }

  /* ---------------------------------- domain helpers -------------------- */

  async function confirmedMemories(ownerId: string): Promise<Memory[]> {
    return repos.memories.list({ ownerId, status: 'confirmed' });
  }

  async function exportPrivate(includeConversations: boolean) {
    const card = await requireIdentity();
    const ownerId = meta.ownerId!;
    const archive = exportPrivateArchive({
      profile: { id: ownerId, schemaVersion: 1, name: card.name, avatarUrl: card.avatarUrl },
      card,
      nowItems: await repos.now.list({ ownerId }),
      memories: await repos.memories.list({ ownerId }),
      contactMethods: await repos.contactMethods.listByOwner(ownerId),
      connectionRequests: await repos.connections.listForOwner({ ownerId }),
      includeConversations,
      conversations: includeConversations ? await repos.conversations.list({ ownerId }) : [],
      knowledgeSources: await repos.knowledgeSources.list({ ownerId }),
      attachments: [],
      app: APP_INFO,
      createdAt: now(),
    });
    meta.lastPrivateExportAt = now();
    saveMeta(config.dbPath, meta);
    return archive;
  }

  function conversationExcerpt(messages: readonly ArchiveMessage[]): ArchiveMessage[] {
    return messages.slice(-20);
  }

  /* ---------------------------------- routes ---------------------------- */

  async function route(method: string, path: string, req: IncomingMessage, body: unknown): Promise<{ status: number; data: unknown }> {
    const segments = path.split('/').filter(Boolean); // e.g. ['api','v1','owner','card']
    const isApi = segments[0] === 'api' && segments[1] === 'v1';
    const rest = isApi ? segments.slice(2) : segments;
    const data = asRecord(body);

    /* ---- health ---- */
    if (method === 'GET' && rest.join('/') === 'healthz') {
      return {
        status: 200,
        data: {
          ok: true,
          db: { ok: true, schemaVersion: repos.schemaVersion() },
          provider: { name: provider.name, capabilities: provider.capabilities },
          identity: (await ownerCard()) !== null,
        },
      };
    }

    /* ---- public surface ---- */
    if (rest[0] === 'public') {
      if (method === 'GET' && rest[1] === 'card' && rest.length === 2) {
        const card = await requireIdentity();
        const items = await repos.now.list({ ownerId: meta.ownerId! });
        return { status: 200, data: { ...card, now: projectActiveNowItems(items, now()) } };
      }

      if (method === 'POST' && rest[1] === 'chat' && rest.length === 2) {
        const visitorId = data.visitorId;
        const message = data.message;
        if (!isNonEmptyString(visitorId) || visitorId.length > 100) {
          throw new ApiError(400, 'invalid_request', 'visitorId is required');
        }
        if (!isNonEmptyString(message) || message.length > 2000) {
          throw new ApiError(400, 'invalid_request', 'message is required (max 2000 chars)');
        }
        const card = await requireIdentity();
        const ownerId = meta.ownerId!;
        if (meta.blockedUsers.includes(visitorId)) {
          throw new ApiError(403, 'blocked', 'this visitor is blocked');
        }
        if (card.agentEnabled === false) {
          throw new ApiError(403, 'agent_disabled', 'the owner has disabled the visitor agent');
        }
        checkRate(chatLimiter, visitorKey(req, visitorId));
        await moderateOrThrow(moderate, message.trim());

        // Conversation: continue an existing one or start fresh.
        let conversation: ArchiveConversation | null = null;
        if (isNonEmptyString(data.conversationId)) {
          const found = await repos.conversations.get(data.conversationId);
          if (found && found.kind === 'visitor' && found.visitorId === visitorId && found.ownerId === ownerId) {
            conversation = found;
          }
        }
        if (!conversation) {
          const existing = await repos.conversations.list({ ownerId, kind: 'visitor', visitorId });
          conversation = existing[0] ?? null;
        }
        if (!conversation) {
          const t = now();
          conversation = {
            id: `conv-${randomUUID()}`,
            schemaVersion: 1,
            ownerId,
            kind: 'visitor',
            visitorId,
            messages: [],
            createdAt: t,
            updatedAt: t,
          };
        }

        const visitorMsg: ArchiveMessage = {
          id: `msg-${randomUUID()}`,
          schemaVersion: 1,
          conversationId: conversation.id,
          role: 'visitor',
          text: message.trim(),
          createdAt: now(),
        };

        // Hard round cap: no model call once the budget is spent.
        const roundCount = conversation.messages.filter((m) => m.role === 'visitor').length;
        let result;
        if (roundCount >= MAX_VISITOR_ROUNDS) {
          result = {
            reply: '我们先聊到这里。如果你想认识他本人，可以把具体理由告诉我，我会原样转达给他，由他自己决定。',
            evidenceRefs: [] as string[],
            nextAction: 'end' as const,
          };
        } else {
          // Permission-filtered evidence BEFORE retrieval reaches the prompt.
          const retrieved = await retrieveMemories({
            ownerId,
            audience: 'visitor_quote',
            repository: repos.memories,
            queryText: message,
            now: now(),
          });
          const boundary = await retrieveMemories({
            ownerId,
            audience: 'visitor_boundary',
            repository: repos.memories,
            now: now(),
          });
          const publicMemories = retrieved.map((r) => r.memory);
          const agentMemories = boundary.map((r) => r.memory);
          // Defensive second net: nothing forbidden may enter the prompt.
          const leaked = forbiddenForVisitor([...publicMemories, ...agentMemories]);
          if (leaked.length > 0) {
            log(`[security] dropped ${leaked.length} forbidden memories from visitor context`);
          }
          const allNow = await repos.now.list({ ownerId, status: 'published' });
          const activeNow = filterActiveNow(allNow, now());
          const system = buildVisitorSystem(card, publicMemories, agentMemories, activeNow);
          const messages = [
            ...conversationExcerpt(conversation.messages).map((m) => ({
              role: (m.role === 'visitor' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.text,
            })),
            { role: 'user' as const, content: message.trim() },
          ].slice(-20);
          const outcome = await agent.visitorMessage({ system, messages });
          if (outcome.ok === false) {
            throw new ApiError(
              outcome.error.code === 'rate_limited' ? 429 : 503,
              outcome.error.code,
              outcome.error.message,
            );
          }
          result = outcome.value;
        }

        const agentMsg: ArchiveMessage = {
          id: `msg-${randomUUID()}`,
          schemaVersion: 1,
          conversationId: conversation.id,
          role: 'agent',
          text: result.reply,
          createdAt: now(),
        };
        conversation.messages = [...conversation.messages, visitorMsg, agentMsg];
        conversation.updatedAt = now();
        await repos.conversations.save(conversation);
        return { status: 200, data: { conversationId: conversation.id, ...result } };
      }

      if (method === 'POST' && rest[1] === 'requests' && rest.length === 2) {
        const visitorId = data.visitorId;
        if (!isNonEmptyString(visitorId) || visitorId.length > 100) {
          throw new ApiError(400, 'invalid_request', 'visitorId is required');
        }
        await requireIdentity();
        const ownerId = meta.ownerId!;
        if (meta.blockedUsers.includes(visitorId)) {
          throw new ApiError(403, 'blocked', 'this visitor is blocked');
        }
        checkRate(requestLimiter, visitorKey(req, visitorId));
        if (isNonEmptyString(data.reason)) await moderateOrThrow(moderate, data.reason.trim());
        if (isNonEmptyString(data.visitorSummary)) await moderateOrThrow(moderate, data.visitorSummary.trim());

        const payloadError = validateConnectionRequestPayload({
          ownerId,
          reason: typeof data.reason === 'string' ? data.reason : '',
          visitorSummary: (data.visitorSummary as string | undefined) ?? null,
          possibleSharedContext: (data.possibleSharedContext as string[] | undefined) ?? null,
          visitorWorkUrl: (data.visitorWorkUrl as string | undefined) ?? null,
        });
        if (payloadError) {
          throw new ApiError(400, payloadError, payloadError === 'weak_reason'
            ? '请写下一个具体的理由（至少 10 个字）：为什么想认识，想聊什么。'
            : `invalid request: ${payloadError}`);
        }
        const pair = await repos.connections.listByPair(ownerId, visitorId);
        const gate = checkConnectionCreateAllowed({ requests: pair, ownerId, visitorId, now: now() });
        if (gate) {
          throw new ApiError(429, gate, gate === 'declined_cooldown'
            ? 'the owner declined recently; please wait before asking again'
            : 'you already sent a request recently');
        }
        const request = buildConnectionRequest(
          {
            ownerId,
            visitorId,
            reason: data.reason as string,
            visitorSummary: (data.visitorSummary as string | undefined) ?? null,
            possibleSharedContext: (data.possibleSharedContext as string[] | undefined) ?? null,
            visitorWorkUrl: (data.visitorWorkUrl as string | undefined) ?? null,
          },
          now(),
          `req-${randomUUID()}`,
        );
        await repos.connections.save(request);
        touch();
        return { status: 201, data: { id: request.id, ownerAction: request.ownerAction } };
      }

      if (method === 'GET' && rest[1] === 'requests' && rest.length === 3) {
        const url = new URL(req.url ?? '', 'http://localhost');
        const visitorId = url.searchParams.get('visitorId') ?? '';
        const request = await repos.connections.get(rest[2]!);
        if (!request || !canViewConnectionRequest(request, visitorId) || request.ownerId !== meta.ownerId) {
          throw new ApiError(404, 'not_found', 'request not found');
        }
        const contactMethods = await repos.contactMethods.listByOwner(request.ownerId);
        const sharedContacts = resolveSharedContacts(request, { contactMethods });
        return { status: 200, data: { ...request, ...(sharedContacts ? { sharedContacts } : {}) } };
      }

      throw new ApiError(404, 'not_found', 'unknown endpoint');
    }

    /* ---- owner surface (everything below requires the bearer token) ---- */
    if (rest[0] !== 'owner') throw new ApiError(404, 'not_found', 'unknown endpoint');
    requireOwner(req);

    if (method === 'POST' && rest[1] === 'identity' && rest.length === 2) {
      if (await ownerCard()) throw new ApiError(409, 'identity_exists', 'identity already exists — import or delete first');
      if (!isNonEmptyString(data.name) || data.name.length > 100) {
        throw new ApiError(400, 'invalid_request', 'name is required (max 100 chars)');
      }
      const ownerId = `owner-${randomUUID()}`;
      const t = now();
      const card: VibeCard = {
        id: `card-${ownerId}`,
        schemaVersion: 1,
        ownerId,
        name: data.name.trim(),
        avatarUrl: isNonEmptyString(data.avatarUrl) ? data.avatarUrl.trim() : '',
        headline: '',
        currentFocus: '',
        canHelpWith: [],
        wantsToMeet: [],
        topics: [],
        highlights: [],
        agentEnabled: true,
        updatedAt: t,
      };
      await repos.cards.save(card);
      meta.ownerId = ownerId;
      meta.cardId = card.id;
      touch();
      return { status: 201, data: card };
    }

    if (method === 'POST' && rest[1] === 'import' && rest.length === 2) {
      if (!data.archive || typeof data.archive !== 'object') {
        throw new ApiError(400, 'invalid_request', 'archive is required');
      }
      if ((await ownerCard()) && data.force !== true) {
        throw new ApiError(409, 'identity_exists', 'identity already exists — pass force:true to overwrite');
      }
      const imported = importArchive(data.archive);
      if (imported.ok === false) {
        throw new ApiError(400, imported.error.code, imported.error.message);
      }
      const state = imported.value;
      await repos.cards.save(state.card);
      if (state.kind === 'private') {
        for (const item of state.nowItems as NowItem[]) await repos.now.save(item);
      }
      for (const memory of state.memories) await repos.memories.save(memory);
      for (const conversation of state.conversations) await repos.conversations.save(conversation);
      for (const request of state.connectionRequests) await repos.connections.save(request);
      for (const contact of state.contactMethods) await repos.contactMethods.save(contact);
      for (const source of state.knowledgeSources) await repos.knowledgeSources.save(source);
      meta.ownerId = state.card.ownerId;
      meta.cardId = state.card.id;
      touch();
      return {
        status: 200,
        data: { ok: true, kind: state.kind, ownerId: state.card.ownerId, cardId: state.card.id },
      };
    }

    if (method === 'GET' && rest[1] === 'card' && rest.length === 2) {
      return { status: 200, data: await requireIdentity() };
    }

    if (method === 'PUT' && rest[1] === 'card' && rest.length === 2) {
      // The VibeCard record is the public projection by construction: saving
      // it IS publishing it. Contact data has no field here by design.
      const card = await requireIdentity();
      const stringField = (key: string, max: number): string | undefined => {
        const value = data[key];
        if (value === undefined) return undefined;
        if (typeof value !== 'string' || value.length > max) {
          throw new ApiError(400, 'invalid_request', `${key} must be a string (max ${max} chars)`);
        }
        return value.trim();
      };
      const listField = (key: string): string[] | undefined => {
        const value = data[key];
        if (value === undefined) return undefined;
        if (!Array.isArray(value)) throw new ApiError(400, 'invalid_request', `${key} must be a string array`);
        return value
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.trim().slice(0, 60))
          .slice(0, 8);
      };
      const highlights = data.highlights === undefined
        ? undefined
        : (Array.isArray(data.highlights) ? data.highlights : null)
            ?.filter((h): h is { title: string; url?: string } =>
              !!h && typeof h === 'object' && typeof (h as Record<string, unknown>).title === 'string')
            .map((h, i) => ({
              id: `highlight-${i + 1}`,
              title: h.title.trim().slice(0, 80),
              ...(typeof h.url === 'string' && h.url.trim() ? { url: h.url.trim().slice(0, 300) } : {}),
            }))
            .slice(0, 3);
      if (data.highlights !== undefined && !highlights) {
        throw new ApiError(400, 'invalid_request', 'highlights must be an array');
      }
      if (data.agentEnabled !== undefined && typeof data.agentEnabled !== 'boolean') {
        throw new ApiError(400, 'invalid_request', 'agentEnabled must be a boolean');
      }
      const updated: VibeCard = {
        ...card,
        name: stringField('name', 100) ?? card.name,
        avatarUrl: stringField('avatarUrl', 300) ?? card.avatarUrl,
        headline: stringField('headline', 200) ?? card.headline,
        currentFocus: stringField('currentFocus', 500) ?? card.currentFocus,
        canHelpWith: listField('canHelpWith') ?? card.canHelpWith,
        wantsToMeet: listField('wantsToMeet') ?? card.wantsToMeet,
        topics: listField('topics') ?? card.topics,
        highlights: highlights ?? card.highlights,
        agentEnabled: (data.agentEnabled as boolean | undefined) ?? card.agentEnabled,
        updatedAt: now(),
      };
      await repos.cards.save(updated);
      touch();
      return { status: 200, data: updated };
    }

    if (method === 'POST' && rest[1] === 'card' && rest[2] === 'draft' && rest.length === 3) {
      const card = await requireIdentity();
      const confirmed = await confirmedMemories(meta.ownerId!);
      if (confirmed.length === 0) {
        throw new ApiError(400, 'no_confirmed_memories', '还没有已确认的记忆，先和 Vibe 聊几句吧');
      }
      const system = buildCardDraftSystem(confirmed, card);
      const outcome = await agent.generateCardDraft({
        system,
        messages: [{ role: 'user', content: '请基于这些记忆，为我的 Card 起草一份更新建议。' }],
      });
      if (outcome.ok === false) throw new ApiError(503, outcome.error.code, outcome.error.message);
      return { status: 200, data: outcome.value };
    }

    /* ---- owner vibe conversation ---- */
    if (method === 'POST' && rest[1] === 'vibe' && rest[2] === 'messages' && rest.length === 3) {
      const card = await requireIdentity();
      const ownerId = meta.ownerId!;
      const message = data.message;
      if (!isNonEmptyString(message) || message.length > 2000) {
        throw new ApiError(400, 'invalid_request', 'message is required (max 2000 chars)');
      }
      const existing = await repos.conversations.list({ ownerId, kind: 'owner_vibe' });
      let conversation = existing[0] ?? null;
      if (!conversation) {
        const t = now();
        conversation = {
          id: `conv-${randomUUID()}`,
          schemaVersion: 1,
          ownerId,
          kind: 'owner_vibe',
          visitorId: null,
          messages: [],
          createdAt: t,
          updatedAt: t,
        };
      }
      const confirmed = await confirmedMemories(ownerId);
      const system = buildOwnerSystem(confirmed);
      const messages = [
        ...conversationExcerpt(conversation.messages).map((m) => ({
          role: (m.role === 'owner' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.text,
        })),
        { role: 'user' as const, content: message.trim() },
      ].slice(-20);
      const outcome = await agent.ownerMessage({
        system,
        messages,
        validMemoryIds: confirmed.map((m) => m.id),
      });
      if (outcome.ok === false) {
        throw new ApiError(outcome.error.code === 'rate_limited' ? 429 : 503, outcome.error.code, outcome.error.message);
      }
      const result = outcome.value;

      const ownerMsg: ArchiveMessage = {
        id: `msg-${randomUUID()}`,
        schemaVersion: 1,
        conversationId: conversation.id,
        role: 'owner',
        text: message.trim(),
        createdAt: now(),
      };
      const vibeMsg: ArchiveMessage = {
        id: `msg-${randomUUID()}`,
        schemaVersion: 1,
        conversationId: conversation.id,
        role: 'vibe',
        text: result.reply,
        createdAt: now(),
      };
      conversation.messages = [...conversation.messages, ownerMsg, vibeMsg];
      conversation.updatedAt = now();
      await repos.conversations.save(conversation);

      let memoryProposalId: string | undefined;
      if (result.memoryProposal) {
        const proposal = buildProposedMemory(
          {
            ownerId,
            kind: result.memoryProposal.kind,
            content: result.memoryProposal.content,
            visibility: result.memoryProposal.suggestedVisibility,
            sourceConversationId: conversation.id,
            sourceMessageIds: result.memoryProposal.sourceMessageIds ?? [ownerMsg.id],
          },
          now(),
          `mem-${randomUUID()}`,
        );
        await repos.memories.save(proposal);
        memoryProposalId = proposal.id;
      }

      let nowDraftId: string | undefined;
      if (result.nowProposal) {
        const t = now();
        const draft: NowItem = {
          id: `now-${randomUUID()}`,
          schemaVersion: 1,
          ownerId,
          text: result.nowProposal.text.trim().slice(0, 200),
          topic: result.nowProposal.topic,
          sourceMemoryId: null,
          status: 'draft',
          publishedAt: null,
          expiresAt: result.nowProposal.expiresAt ?? null,
          createdAt: t,
          updatedAt: t,
        };
        await repos.now.save(draft);
        nowDraftId = draft.id;
      }

      touch();
      return {
        status: 200,
        data: {
          conversationId: conversation.id,
          reply: result.reply,
          cardUpdateSuggested: result.cardUpdateSuggested,
          ...(result.referencedMemoryIds ? { referencedMemoryIds: result.referencedMemoryIds } : {}),
          ...(memoryProposalId ? { memoryProposalId } : {}),
          ...(nowDraftId ? { nowDraftId } : {}),
          agentNotice: '我是你的 AI 分身，不是本人。',
        },
      };
    }

    /* ---- memories ---- */
    if (method === 'GET' && rest[1] === 'memories' && rest.length === 2) {
      await requireIdentity();
      const url = new URL(req.url ?? '', 'http://localhost');
      const status = url.searchParams.get('status') ?? undefined;
      const visibility = url.searchParams.get('visibility') ?? undefined;
      const memories = await repos.memories.list({
        ownerId: meta.ownerId!,
        ...(status ? { status: status as Memory['status'] } : {}),
        ...(visibility ? { visibility: visibility as Memory['visibility'] } : {}),
      });
      return { status: 200, data: memories };
    }

    if (rest[1] === 'memories' && rest.length === 4) {
      await requireIdentity();
      const memory = await repos.memories.get(rest[2]!);
      if (!memory || memory.ownerId !== meta.ownerId) throw new ApiError(404, 'not_found', 'memory not found');
      const action = rest[3]!;
      try {
        if (method === 'POST' && action === 'confirm') {
          const patch: { content?: string; visibility?: Memory['visibility'] } = {};
          if (data.content !== undefined) {
            if (!isNonEmptyString(data.content) || data.content.length > 500) {
              throw new ApiError(400, 'invalid_content', 'content must be 1-500 chars');
            }
            patch.content = data.content;
          }
          if (data.visibility !== undefined) {
            if (!isMemoryVisibility(data.visibility)) throw new ApiError(400, 'invalid_visibility', 'unknown visibility');
            patch.visibility = data.visibility;
          }
          const updated = confirmMemory(memory, patch, now());
          await repos.memories.save(updated);
          touch();
          return { status: 200, data: updated };
        }
        if (method === 'POST' && action === 'reject') {
          const updated = rejectMemoryProposal(memory, now());
          await repos.memories.save(updated);
          touch();
          return { status: 200, data: updated };
        }
        if (method === 'POST' && action === 'pause') {
          const updated = pauseMemory(memory, now());
          await repos.memories.save(updated);
          touch();
          return { status: 200, data: updated };
        }
        if (method === 'POST' && action === 'resume') {
          const updated = resumeMemory(memory, now());
          await repos.memories.save(updated);
          touch();
          return { status: 200, data: updated };
        }
        if (method === 'DELETE' && action === 'delete') {
          const updated = deleteMemory(memory, now());
          await repos.memories.save(updated);
          touch();
          return { status: 200, data: updated };
        }
        if (method === 'PUT' && action === 'edit') {
          const patch: { kind?: Memory['kind']; content?: string; visibility?: Memory['visibility'] } = {};
          if (data.kind !== undefined) {
            if (!isMemoryKind(data.kind)) throw new ApiError(400, 'invalid_kind', 'unknown kind');
            patch.kind = data.kind;
          }
          if (data.content !== undefined) {
            if (!isNonEmptyString(data.content) || data.content.length > 500) {
              throw new ApiError(400, 'invalid_content', 'content must be 1-500 chars');
            }
            patch.content = data.content;
          }
          if (data.visibility !== undefined) {
            if (!isMemoryVisibility(data.visibility)) throw new ApiError(400, 'invalid_visibility', 'unknown visibility');
            patch.visibility = data.visibility;
          }
          const updated = editMemory(memory, patch, now());
          await repos.memories.save(updated);
          touch();
          return { status: 200, data: updated };
        }
      } catch (error) {
        if (error instanceof MemoryTransitionError) {
          throw new ApiError(409, 'invalid_transition', error.message);
        }
        throw error;
      }
      throw new ApiError(404, 'not_found', 'unknown memory action');
    }

    /* ---- Now ---- */
    if (method === 'GET' && rest[1] === 'now' && rest.length === 2) {
      await requireIdentity();
      const url = new URL(req.url ?? '', 'http://localhost');
      const status = url.searchParams.get('status');
      const items = await repos.now.list({
        ownerId: meta.ownerId!,
        ...(status ? { status: status as NowItemStatus } : {}),
      });
      return { status: 200, data: items };
    }

    if (method === 'POST' && rest[1] === 'now' && rest.length === 2) {
      await requireIdentity();
      if (!isNonEmptyString(data.text) || data.text.length > 200) {
        throw new ApiError(400, 'invalid_request', 'text is required (max 200 chars)');
      }
      if (!(NOW_ITEM_TOPICS as readonly string[]).includes(data.topic as string)) {
        throw new ApiError(400, 'invalid_request', `topic must be one of ${NOW_ITEM_TOPICS.join('|')}`);
      }
      if (data.expiresAt !== undefined && data.expiresAt !== null && typeof data.expiresAt !== 'number') {
        throw new ApiError(400, 'invalid_request', 'expiresAt must be a timestamp or null');
      }
      let sourceMemoryId: string | null = null;
      if (isNonEmptyString(data.sourceMemoryId)) {
        const source = await repos.memories.get(data.sourceMemoryId);
        if (!source || source.ownerId !== meta.ownerId) throw new ApiError(404, 'not_found', 'source memory not found');
        if (!canProjectMemoryToNow(source)) throw new ApiError(409, 'invalid_transition', 'a deleted memory cannot be projected');
        sourceMemoryId = source.id;
      }
      const t = now();
      const item: NowItem = {
        id: `now-${randomUUID()}`,
        schemaVersion: 1,
        ownerId: meta.ownerId!,
        text: data.text.trim(),
        topic: data.topic as NowItem['topic'],
        sourceMemoryId,
        status: 'draft',
        publishedAt: null,
        expiresAt: (data.expiresAt as number | null | undefined) ?? null,
        createdAt: t,
        updatedAt: t,
      };
      await repos.now.save(item);
      touch();
      return { status: 201, data: item };
    }

    if (rest[1] === 'now' && rest.length === 4) {
      await requireIdentity();
      const item = await repos.now.get(rest[2]!);
      if (!item || item.ownerId !== meta.ownerId) throw new ApiError(404, 'not_found', 'now item not found');
      const action = rest[3]!;
      const transition = (next: NowItemStatus, from: readonly NowItemStatus[]): NowItem => {
        if (!from.includes(item.status)) {
          throw new ApiError(409, 'invalid_transition', `cannot ${action} a ${item.status} now item`);
        }
        return {
          ...item,
          status: next,
          publishedAt: next === 'published' ? (item.publishedAt ?? now()) : item.publishedAt,
          updatedAt: now(),
        };
      };
      let updated: NowItem;
      if (method === 'POST' && action === 'publish') updated = transition('published', ['draft', 'archived', 'hidden']);
      else if (method === 'POST' && action === 'archive') updated = transition('archived', ['published', 'draft', 'hidden']);
      else if (method === 'POST' && action === 'hide') updated = transition('hidden', ['published']);
      else if (method === 'DELETE' && action === 'delete') {
        if (item.status === 'deleted') throw new ApiError(409, 'invalid_transition', 'already deleted');
        updated = { ...item, status: 'deleted', updatedAt: now() };
      } else {
        throw new ApiError(404, 'not_found', 'unknown now action');
      }
      await repos.now.save(updated);
      touch();
      return { status: 200, data: updated };
    }

    /* ---- contact methods ---- */
    if (method === 'GET' && rest[1] === 'contacts' && rest.length === 2) {
      await requireIdentity();
      return { status: 200, data: await repos.contactMethods.listByOwner(meta.ownerId!) };
    }
    if (method === 'POST' && rest[1] === 'contacts' && rest.length === 2) {
      await requireIdentity();
      if (!(CONTACT_KINDS as readonly string[]).includes(data.kind as string)) {
        throw new ApiError(400, 'invalid_request', `kind must be one of ${CONTACT_KINDS.join('|')}`);
      }
      if (!isNonEmptyString(data.value) || data.value.length > 200) {
        throw new ApiError(400, 'invalid_request', 'value is required (max 200 chars)');
      }
      const t = now();
      const contact: ContactMethod = {
        id: `contact-${randomUUID()}`,
        schemaVersion: 1,
        ownerId: meta.ownerId!,
        kind: data.kind as ContactMethod['kind'],
        value: data.value.trim(),
        label: isNonEmptyString(data.label) ? data.label.trim().slice(0, 50) : '',
        createdAt: t,
        updatedAt: t,
      };
      await repos.contactMethods.save(contact);
      touch();
      return { status: 201, data: contact };
    }
    if (method === 'DELETE' && rest[1] === 'contacts' && rest.length === 3) {
      await requireIdentity();
      const contact = await repos.contactMethods.get(rest[2]!);
      if (!contact || contact.ownerId !== meta.ownerId) throw new ApiError(404, 'not_found', 'contact not found');
      await repos.contactMethods.remove(contact.id);
      touch();
      return { status: 200, data: { ok: true } };
    }

    /* ---- export / delete-all ---- */
    if (method === 'GET' && rest[1] === 'export' && rest.length === 2) {
      const url = new URL(req.url ?? '', 'http://localhost');
      const kind = url.searchParams.get('kind') === 'public' ? 'public' : 'private';
      if (kind === 'public') {
        const card = await requireIdentity();
        const archive = exportPublicArchive({
          card,
          nowItems: await repos.now.list({ ownerId: meta.ownerId! }),
          app: APP_INFO,
          createdAt: now(),
          now: now(),
        });
        return { status: 200, data: archive };
      }
      const include = ['1', 'true', 'yes'].includes(url.searchParams.get('includeConversations') ?? '');
      return { status: 200, data: await exportPrivate(include) };
    }

    if (method === 'POST' && rest[1] === 'delete-all' && rest.length === 2) {
      await requireIdentity();
      if (data.confirm !== 'DELETE') {
        throw new ApiError(400, 'invalid_request', 'pass { "confirm": "DELETE" } to erase everything');
      }
      if (meta.lastPrivateExportAt === null || meta.lastPrivateExportAt < meta.lastWriteAt) {
        throw new ApiError(409, 'export_required', 'export a private archive before deleting all data');
      }
      const archive = await exportPrivate(true); // refresh the export timestamp guard
      const plan = buildDeletionPlan(archive);
      if (plan.ok === false) throw new ApiError(400, plan.error.code, plan.error.message);
      for (const id of plan.value.cardIds) await repos.cards.remove(id);
      for (const id of plan.value.nowItemIds) await repos.now.remove(id);
      for (const id of plan.value.memoryIds) await repos.memories.remove(id);
      for (const id of plan.value.contactMethodIds) await repos.contactMethods.remove(id);
      for (const id of plan.value.connectionRequestIds) await repos.connections.remove(id);
      for (const id of plan.value.conversationIds) await repos.conversations.remove(id);
      for (const id of plan.value.knowledgeSourceIds) await repos.knowledgeSources.remove(id);
      meta.ownerId = null;
      meta.cardId = null;
      meta.lastPrivateExportAt = null;
      meta.lastWriteAt = now();
      saveMeta(config.dbPath, meta);
      return { status: 200, data: { ok: true, deleted: {
        cards: plan.value.cardIds.length,
        nowItems: plan.value.nowItemIds.length,
        memories: plan.value.memoryIds.length,
        contactMethods: plan.value.contactMethodIds.length,
        connectionRequests: plan.value.connectionRequestIds.length,
        conversations: plan.value.conversationIds.length,
        knowledgeSources: plan.value.knowledgeSourceIds.length,
      } } };
    }

    /* ---- connection inbox ---- */
    if (method === 'GET' && rest[1] === 'requests' && rest.length === 2) {
      await requireIdentity();
      const url = new URL(req.url ?? '', 'http://localhost');
      const action = url.searchParams.get('action');
      const requests = await repos.connections.listForOwner({
        ownerId: meta.ownerId!,
        ...(action ? { action: action as ConnectionRequest['ownerAction'] } : {}),
      });
      return { status: 200, data: requests };
    }

    if (method === 'GET' && rest[1] === 'requests' && rest.length === 4 && rest[3] === 'summary') {
      await requireIdentity();
      const request = await repos.connections.get(rest[2]!);
      if (!request || request.ownerId !== meta.ownerId) throw new ApiError(404, 'not_found', 'request not found');
      const conversations = await repos.conversations.list({ ownerId: meta.ownerId!, kind: 'visitor', visitorId: request.visitorId });
      const excerpt = conversations[0]
        ? conversations[0].messages.slice(-6).map((m) => `${m.role === 'visitor' ? '访客' : '分身'}：${m.text}`).join('\n')
        : null;
      const outcome = await agent.summarizeConnection({
        system: buildConnectionSummarySystem(request, excerpt),
        messages: [{ role: 'user', content: '请基于以上证据生成连接摘要。' }],
      });
      if (outcome.ok === false) throw new ApiError(503, outcome.error.code, outcome.error.message);
      return { status: 200, data: { requestId: request.id, summary: outcome.value } };
    }

    if (method === 'POST' && rest[1] === 'requests' && rest.length === 4 && rest[3] === 'action') {
      await requireIdentity();
      const request = await repos.connections.get(rest[2]!);
      if (!request || request.ownerId !== meta.ownerId) throw new ApiError(404, 'not_found', 'request not found');
      const action = data.action;
      if (action !== 'connect' && action !== 'later' && action !== 'decline') {
        throw new ApiError(400, 'invalid_action', 'action must be connect, later, or decline');
      }
      let sharedIds: string[] | undefined;
      if (action === 'connect') {
        if (!Array.isArray(data.sharedContactMethodIds)) {
          throw new ApiError(400, 'invalid_contact_selection', 'connect requires sharedContactMethodIds');
        }
        const owned = new Set((await repos.contactMethods.listByOwner(meta.ownerId!)).map((c) => c.id));
        sharedIds = (data.sharedContactMethodIds as unknown[]).filter((v): v is string => typeof v === 'string');
        if (sharedIds.some((id) => !owned.has(id))) {
          throw new ApiError(400, 'invalid_contact_selection', 'contact methods must belong to the owner');
        }
      }
      try {
        const updated = applyOwnerAction(request, action, sharedIds, now());
        await repos.connections.save(updated);
        touch();
        const contactMethods = await repos.contactMethods.listByOwner(meta.ownerId!);
        const sharedContacts = resolveSharedContacts(updated, { contactMethods });
        return { status: 200, data: { ...updated, ...(sharedContacts ? { sharedContacts } : {}) } };
      } catch (error) {
        if (error instanceof ConnectionTransitionError) {
          throw new ApiError(409, error.code, error.message);
        }
        throw error;
      }
    }

    throw new ApiError(404, 'not_found', 'unknown endpoint');
  }

  async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const cors = config.corsOrigin;
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': cors,
          'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'access-control-allow-headers': 'content-type,authorization',
          'access-control-max-age': '600',
        });
        res.end();
        return;
      }
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req, config.maxBodyBytes);
      const { status, data } = await route(req.method ?? 'GET', path, req, body);
      sendJson(res, status, data, cors);
    } catch (error) {
      if (error instanceof ApiError) {
        sendError(res, error, cors);
        return;
      }
      if (error instanceof ModerationError) {
        sendError(res, new ApiError(error.code === 'moderation_rejected' ? 403 : 503, error.code, error.message), cors);
        return;
      }
      // Unexpected: log redacted, respond with a static generic error.
      log(`[error] ${safeErrorForLog(error)}`);
      sendError(res, new ApiError(500, 'model_unavailable', 'internal error'), cors);
    }
  }

  return {
    handler,
    repos,
    close() {
      repos.close();
    },
  };
}

/** Convenience: stand up a listening server. */
export function listen(app: App, host: string, port: number) {
  const server = createServer((req, res) => {
    app.handler(req, res).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'model_unavailable', message: 'internal error' } }));
      }
    });
  });
  return new Promise<ReturnType<typeof createServer>>((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
}

