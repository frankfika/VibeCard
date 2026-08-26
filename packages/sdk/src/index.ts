import {
  exportPrivateArchive,
  importArchive,
  type ConnectionRequest,
  type ConnectionSummary,
  type ContactMethod,
  type ExplicitDecisionPreference,
  type Memory,
  type NowItem,
  type NowItemTopic,
  type PrivateVibeArchive,
  type PublicCardSnapshot,
  type VibeCard,
} from '../../shared/index.ts';

export interface OwnerAuthAdapter {
  /** Resolve a short-lived owner credential immediately before every owner call. */
  getToken(): string | undefined | Promise<string | undefined>;
}

export type VibeClientNamespace =
  | { kind?: 'self-hosted' }
  | { kind: 'managed'; accountId: string; cardSlug: string };

export interface VibeClientOptions {
  endpoint: string;
  /** Static credentials are convenient for local/self-hosted tools. */
  ownerToken?: string;
  /** Use an adapter for session, OAuth, passkey, or rotating-token clients. */
  auth?: OwnerAuthAdapter;
  namespace?: VibeClientNamespace;
  fetch?: typeof globalThis.fetch;
}

export interface VisitorChatResult {
  conversationId: string;
  reply: string;
  evidenceRefs?: string[];
  nextAction?: 'continue' | 'invite_connection_reason' | 'offer_request_review' | 'end';
}
export interface OwnerMessageResult { reply: string; memoryProposalId?: string; nowDraftId?: string; agentNotice?: string }
export interface RequestActionResult extends ConnectionRequest {
  learningStatus?: 'proposed' | 'not_suggested' | 'already_handled' | 'unavailable';
  learningProposalId?: string;
}

export class VibeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter: string | null,
  ) {
    super(message);
    this.name = 'VibeApiError';
  }
}

type JsonRecord = Record<string, unknown>;
const record = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VibeApiError(502, 'invalid_response', `${label} response is invalid`, null);
  return value as JsonRecord;
};
const text = (value: unknown, label: string) => {
  if (typeof value !== 'string') throw new VibeApiError(502, 'invalid_response', `${label} must be a string`, null);
  return value;
};
const number = (value: unknown, label: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new VibeApiError(502, 'invalid_response', `${label} must be a number`, null);
  return value;
};
const texts = (value: unknown, label: string) => {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new VibeApiError(502, 'invalid_response', `${label} must be a string array`, null);
  return [...value] as string[];
};
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], label: string): T => {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new VibeApiError(502, 'invalid_response', `${label} is invalid`, null);
  return value as T;
};
const NOW_TOPICS = ['current_work', 'completed_work', 'exploring', 'looking_for', 'offer_help'] as const;
const NOW_STATUSES = ['draft', 'published', 'archived', 'hidden', 'deleted'] as const;
const MEMORY_KINDS = ['fact', 'preference', 'boundary', 'current'] as const;
const MEMORY_VISIBILITIES = ['private', 'agent_only', 'public', 'connected'] as const;
const MEMORY_STATUSES = ['proposed', 'confirmed', 'paused', 'deleted'] as const;
const REQUEST_ACTIONS = ['pending', 'connect', 'later', 'decline'] as const;
const CONTACT_KINDS = ['wechat', 'email', 'phone', 'telegram', 'other'] as const;
const RECOMMENDATIONS = ['worth_a_conversation', 'maybe_later', 'need_more_context', 'not_relevant_now'] as const;
const LEARNING_STATUSES = ['proposed', 'not_suggested', 'already_handled', 'unavailable'] as const;
const VISITOR_NEXT_ACTIONS = ['continue', 'invite_connection_reason', 'offer_request_review', 'end'] as const;

const inputText = (value: unknown, label: string, max: number): string => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new TypeError(`${label} must be a non-empty string (max ${max})`);
  }
  return value.trim();
};

function parseCard(value: unknown): VibeCard {
  const v = record(value, 'Card');
  if (v.schemaVersion !== 1 || typeof v.agentEnabled !== 'boolean') throw new VibeApiError(502, 'invalid_response', 'Card contract is invalid', null);
  if (!Array.isArray(v.highlights)) throw new VibeApiError(502, 'invalid_response', 'Card highlights are invalid', null);
  return {
    id: text(v.id, 'Card.id'), schemaVersion: 1, ownerId: text(v.ownerId, 'Card.ownerId'),
    name: text(v.name, 'Card.name'), avatarUrl: text(v.avatarUrl, 'Card.avatarUrl'),
    headline: text(v.headline, 'Card.headline'), currentFocus: text(v.currentFocus, 'Card.currentFocus'),
    canHelpWith: texts(v.canHelpWith, 'Card.canHelpWith'), wantsToMeet: texts(v.wantsToMeet, 'Card.wantsToMeet'),
    topics: texts(v.topics, 'Card.topics'),
    highlights: v.highlights.map((item, index) => { const h = record(item, `Card.highlights[${index}]`); return { id: text(h.id, 'highlight.id'), title: text(h.title, 'highlight.title'), ...(typeof h.url === 'string' ? { url: h.url } : {}) }; }),
    agentEnabled: v.agentEnabled, updatedAt: number(v.updatedAt, 'Card.updatedAt'),
  };
}

function parsePublicCard(value: unknown): PublicCardSnapshot {
  const v = record(value, 'public Card');
  const card = parseCard(v);
  if (!Array.isArray(v.now)) throw new VibeApiError(502, 'invalid_response', 'public Card.now is invalid', null);
  return { ...card, now: v.now.map((item, index) => { const n = record(item, `now[${index}]`); return { id: text(n.id, 'now.id'), text: text(n.text, 'now.text'), topic: oneOf(n.topic, NOW_TOPICS, 'now.topic'), publishedAt: n.publishedAt === null ? null : number(n.publishedAt, 'now.publishedAt') }; }) };
}

function parseMemory(value: unknown): Memory {
  const v = record(value, 'Memory');
  if (v.schemaVersion !== 1) throw new VibeApiError(502, 'invalid_response', 'Memory.schemaVersion is invalid', null);
  return {
    id: text(v.id, 'Memory.id'), schemaVersion: 1, ownerId: text(v.ownerId, 'Memory.ownerId'),
    kind: oneOf(v.kind, MEMORY_KINDS, 'Memory.kind'), content: text(v.content, 'Memory.content'),
    visibility: oneOf(v.visibility, MEMORY_VISIBILITIES, 'Memory.visibility'), status: oneOf(v.status, MEMORY_STATUSES, 'Memory.status'),
    sourceConversationId: text(v.sourceConversationId, 'Memory.sourceConversationId'), sourceMessageIds: texts(v.sourceMessageIds, 'Memory.sourceMessageIds'),
    createdAt: number(v.createdAt, 'Memory.createdAt'), updatedAt: number(v.updatedAt, 'Memory.updatedAt'),
  };
}

function parseNow(value: unknown): NowItem {
  const v = record(value, 'Now');
  if (v.schemaVersion !== 1) throw new VibeApiError(502, 'invalid_response', 'Now.schemaVersion is invalid', null);
  return {
    id: text(v.id, 'Now.id'), schemaVersion: 1, ownerId: text(v.ownerId, 'Now.ownerId'), text: text(v.text, 'Now.text'),
    topic: oneOf(v.topic, NOW_TOPICS, 'Now.topic'), sourceMemoryId: v.sourceMemoryId === null ? null : text(v.sourceMemoryId, 'Now.sourceMemoryId'),
    status: oneOf(v.status, NOW_STATUSES, 'Now.status'), publishedAt: v.publishedAt === null ? null : number(v.publishedAt, 'Now.publishedAt'),
    expiresAt: v.expiresAt === null ? null : number(v.expiresAt, 'Now.expiresAt'), createdAt: number(v.createdAt, 'Now.createdAt'), updatedAt: number(v.updatedAt, 'Now.updatedAt'),
  };
}

function parseRequest(value: unknown): ConnectionRequest {
  const v = record(value, 'ConnectionRequest');
  if (v.schemaVersion !== 1) throw new VibeApiError(502, 'invalid_response', 'ConnectionRequest.schemaVersion is invalid', null);
  return {
    id: text(v.id, 'request.id'), schemaVersion: 1, ownerId: text(v.ownerId, 'request.ownerId'), visitorId: text(v.visitorId, 'request.visitorId'),
    visitorSummary: text(v.visitorSummary, 'request.visitorSummary'), reason: text(v.reason, 'request.reason'), possibleSharedContext: texts(v.possibleSharedContext, 'request.possibleSharedContext'),
    ...(typeof v.visitorWorkUrl === 'string' ? { visitorWorkUrl: v.visitorWorkUrl } : {}), ownerAction: oneOf(v.ownerAction, REQUEST_ACTIONS, 'request.ownerAction'),
    sharedContactMethodIds: texts(v.sharedContactMethodIds, 'request.sharedContactMethodIds'), createdAt: number(v.createdAt, 'request.createdAt'), updatedAt: number(v.updatedAt, 'request.updatedAt'),
  };
}

function parseContact(value: unknown): ContactMethod {
  const v = record(value, 'contact');
  if (v.schemaVersion !== 1) throw new VibeApiError(502, 'invalid_response', 'contact schema is invalid', null);
  return { id: text(v.id, 'contact.id'), schemaVersion: 1, ownerId: text(v.ownerId, 'contact.ownerId'), kind: oneOf(v.kind, CONTACT_KINDS, 'contact.kind'), value: text(v.value, 'contact.value'), label: text(v.label, 'contact.label'), createdAt: number(v.createdAt, 'contact.createdAt'), updatedAt: number(v.updatedAt, 'contact.updatedAt') };
}

function parseList<T>(value: unknown, parser: (item: unknown) => T, label: string): T[] {
  if (!Array.isArray(value)) throw new VibeApiError(502, 'invalid_response', `${label} response must be an array`, null);
  return value.map(parser);
}

function assertPortableArchive(value: unknown): PrivateVibeArchive {
  const forbidden = new Set(['provider', 'providerRecord', 'databaseRecord', 'rawModelOutput', 'tokenHash', 'apiKey']);
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item as JsonRecord)) {
      if (key.startsWith('_') || forbidden.has(key)) throw new VibeApiError(502, 'invalid_response', 'archive contains implementation-specific fields', null);
      visit(child);
    }
  };
  visit(value);
  const imported = importArchive(value);
  if ('error' in imported) throw new VibeApiError(502, 'invalid_response', imported.error.message, null);
  if (imported.value.kind !== 'private') throw new VibeApiError(502, 'invalid_response', 'private archive required', null);
  const state = imported.value;
  if (!state.profile) throw new VibeApiError(502, 'invalid_response', 'private archive profile is missing', null);
  const raw = record(value, 'archive');
  const conversationSection = record(raw.conversations, 'archive.conversations');
  return exportPrivateArchive({
    profile: { id: text(state.profile.id, 'profile.id'), schemaVersion: 1, name: text(state.profile.name, 'profile.name'), avatarUrl: text(state.profile.avatarUrl, 'profile.avatarUrl') },
    card: parseCard(state.card),
    nowItems: state.nowItems.map(parseNow), memories: state.memories.map(parseMemory),
    includeConversations: conversationSection.exported === true,
    conversations: state.conversations.map(conversation => ({
      id: text(conversation.id, 'conversation.id'), schemaVersion: 1, ownerId: text(conversation.ownerId, 'conversation.ownerId'),
      kind: conversation.kind, visitorId: conversation.visitorId === null ? null : text(conversation.visitorId, 'conversation.visitorId'),
      messages: conversation.messages.map(message => ({ id: text(message.id, 'message.id'), schemaVersion: 1, conversationId: text(message.conversationId, 'message.conversationId'), role: message.role, text: text(message.text, 'message.text'), createdAt: number(message.createdAt, 'message.createdAt') })),
      createdAt: number(conversation.createdAt, 'conversation.createdAt'), updatedAt: number(conversation.updatedAt, 'conversation.updatedAt'),
    })),
    knowledgeSources: state.knowledgeSources.map(source => ({ id: text(source.id, 'knowledge.id'), schemaVersion: 1, ownerId: text(source.ownerId, 'knowledge.ownerId'), kind: source.kind, title: text(source.title, 'knowledge.title'), source: text(source.source, 'knowledge.source'), status: source.status, createdAt: number(source.createdAt, 'knowledge.createdAt'), updatedAt: number(source.updatedAt, 'knowledge.updatedAt') })),
    connectionRequests: state.connectionRequests.map(parseRequest), contactMethods: state.contactMethods.map(parseContact),
    attachments: state.attachments.map(attachment => ({ id: text(attachment.id, 'attachment.id'), schemaVersion: 1, fileName: text(attachment.fileName, 'attachment.fileName'), sizeBytes: number(attachment.sizeBytes, 'attachment.sizeBytes'), sha256: attachment.sha256 === null ? null : text(attachment.sha256, 'attachment.sha256'), mediaType: attachment.mediaType === null ? null : text(attachment.mediaType, 'attachment.mediaType'), note: text(attachment.note, 'attachment.note'), relatedTo: attachment.relatedTo === null ? null : { collection: text(attachment.relatedTo.collection, 'attachment.relatedTo.collection'), id: text(attachment.relatedTo.id, 'attachment.relatedTo.id') }, createdAt: number(attachment.createdAt, 'attachment.createdAt') })),
    app: { name: text(state.app.name, 'app.name'), version: text(state.app.version, 'app.version') }, createdAt: number(state.createdAt, 'archive.createdAt'),
  });
}

/**
 * Provider- and database-neutral client for the versioned VibeCard HTTP API.
 * The SDK only exposes canonical contracts; raw ORM/provider records never
 * cross this boundary.
 */
export class VibeClient {
  private readonly base: string;
  private readonly token?: string;
  private readonly auth?: OwnerAuthAdapter;
  private readonly ownerBase: string;
  private readonly publicBase: string;
  private readonly request: typeof globalThis.fetch;

  constructor(options: VibeClientOptions) {
    if (options.ownerToken && options.auth) throw new Error('configure ownerToken or auth, not both');
    this.base = options.endpoint.replace(/\/+$/, '');
    this.token = options.ownerToken;
    this.auth = options.auth;
    this.request = options.fetch ?? globalThis.fetch;
    if (options.namespace?.kind === 'managed') {
      this.ownerBase = `/api/v1/cloud/accounts/${encodeURIComponent(options.namespace.accountId)}/owner`;
      this.publicBase = `/api/v1/cloud/cards/${encodeURIComponent(options.namespace.cardSlug)}`;
    } else {
      this.ownerBase = '/api/v1/owner';
      this.publicBase = '/api/v1/public';
    }
  }

  private async call<T>(path: string, init: RequestInit = {}, owner = false, parse: (value: unknown) => T): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    const token = owner ? (this.auth ? await this.auth.getToken() : this.token) : undefined;
    if (token) headers.set('authorization', `Bearer ${token}`);
    const response = await this.request(`${this.base}${path}`, { ...init, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = data && typeof data === 'object' && !Array.isArray(data) ? (data as JsonRecord).error : undefined;
      const detail = error && typeof error === 'object' && !Array.isArray(error) ? error as JsonRecord : {};
      throw new VibeApiError(
        response.status,
        typeof detail.code === 'string' ? detail.code : 'http_error',
        typeof detail.message === 'string' ? detail.message : `HTTP ${response.status}`,
        response.headers.get('retry-after'),
      );
    }
    return parse(data);
  }

  publicCard(): Promise<PublicCardSnapshot> { return this.call(`${this.publicBase}/card`, {}, false, parsePublicCard); }
  visitorChat(visitorId: string, message: string, conversationId?: string): Promise<VisitorChatResult> {
    const body = {
      visitorId: inputText(visitorId, 'visitorId', 120),
      message: inputText(message, 'message', 2000),
      ...(conversationId ? { conversationId: inputText(conversationId, 'conversationId', 200) } : {}),
    };
    return this.call(`${this.publicBase}/chat`, { method: 'POST', body: JSON.stringify(body) }, false, value => {
      const v = record(value, 'visitor chat');
      return {
        conversationId: text(v.conversationId, 'conversationId'),
        reply: text(v.reply, 'reply'),
        ...(v.evidenceRefs !== undefined ? { evidenceRefs: texts(v.evidenceRefs, 'evidenceRefs') } : {}),
        ...(v.nextAction !== undefined ? { nextAction: oneOf(v.nextAction, VISITOR_NEXT_ACTIONS, 'nextAction') } : {}),
      };
    });
  }
  submitConnectionRequest(payload: Pick<ConnectionRequest, 'visitorId' | 'reason'> & Partial<Pick<ConnectionRequest, 'visitorSummary' | 'possibleSharedContext' | 'visitorWorkUrl'>>): Promise<{ id: string; ownerAction: string }> {
    const body = {
      visitorId: inputText(payload.visitorId, 'visitorId', 120),
      reason: inputText(payload.reason, 'reason', 1000),
      ...(payload.visitorSummary !== undefined ? { visitorSummary: inputText(payload.visitorSummary, 'visitorSummary', 300) } : {}),
      ...(payload.possibleSharedContext !== undefined ? { possibleSharedContext: texts(payload.possibleSharedContext, 'possibleSharedContext').map(item => item.trim()).filter(Boolean).slice(0, 3) } : {}),
      ...(payload.visitorWorkUrl !== undefined ? { visitorWorkUrl: inputText(payload.visitorWorkUrl, 'visitorWorkUrl', 500) } : {}),
    };
    return this.call(`${this.publicBase}/requests`, { method: 'POST', body: JSON.stringify(body) }, false, value => { const v = record(value, 'request submission'); return { id: text(v.id, 'request.id'), ownerAction: oneOf(v.ownerAction, REQUEST_ACTIONS, 'request.ownerAction') }; });
  }
  ownerCard(): Promise<VibeCard> { return this.call(`${this.ownerBase}/card`, {}, true, parseCard); }
  ownerMessage(message: string): Promise<OwnerMessageResult> {
    return this.call(`${this.ownerBase}/vibe/messages`, { method: 'POST', body: JSON.stringify({ message }) }, true, value => { const v = record(value, 'owner message'); return { reply: text(v.reply, 'reply'), ...(typeof v.memoryProposalId === 'string' ? { memoryProposalId: v.memoryProposalId } : {}), ...(typeof v.nowDraftId === 'string' ? { nowDraftId: v.nowDraftId } : {}), ...(typeof v.agentNotice === 'string' ? { agentNotice: v.agentNotice } : {}) }; });
  }
  listMemories(status?: Memory['status']): Promise<Memory[]> { return this.call(`${this.ownerBase}/memories${status ? `?status=${encodeURIComponent(status)}` : ''}`, {}, true, value => parseList(value, parseMemory, 'memories')); }
  confirmMemory(id: string, content?: string): Promise<Memory> {
    return this.call(`${this.ownerBase}/memories/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: JSON.stringify(content ? { content } : {}) }, true, parseMemory);
  }
  listNow(status?: NowItem['status']): Promise<NowItem[]> {
    return this.call(`${this.ownerBase}/now${status ? `?status=${encodeURIComponent(status)}` : ''}`, {}, true, value => parseList(value, parseNow, 'Now'));
  }
  createNowDraft(input: { text: string; topic: NowItemTopic; expiresAt?: number | null; sourceMemoryId?: string }): Promise<NowItem> {
    const body = {
      text: inputText(input.text, 'Now.text', 200),
      topic: oneOf(input.topic, NOW_TOPICS, 'Now.topic'),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt === null ? null : number(input.expiresAt, 'Now.expiresAt') } : {}),
      ...(input.sourceMemoryId !== undefined ? { sourceMemoryId: inputText(input.sourceMemoryId, 'Now.sourceMemoryId', 200) } : {}),
    };
    return this.call(`${this.ownerBase}/now`, { method: 'POST', body: JSON.stringify(body) }, true, parseNow);
  }
  publishNow(id: string): Promise<NowItem> { return this.nowAction(id, 'publish', 'POST'); }
  archiveNow(id: string): Promise<NowItem> { return this.nowAction(id, 'archive', 'POST'); }
  hideNow(id: string): Promise<NowItem> { return this.nowAction(id, 'hide', 'POST'); }
  deleteNow(id: string): Promise<NowItem> { return this.nowAction(id, 'delete', 'DELETE'); }
  private nowAction(id: string, action: string, method: 'POST' | 'DELETE'): Promise<NowItem> {
    return this.call(`${this.ownerBase}/now/${encodeURIComponent(id)}/${action}`, { method, body: method === 'POST' ? '{}' : undefined }, true, parseNow);
  }
  listConnectionRequests(action?: ConnectionRequest['ownerAction']): Promise<ConnectionRequest[]> {
    return this.call(`${this.ownerBase}/requests${action ? `?action=${encodeURIComponent(action)}` : ''}`, {}, true, value => parseList(value, parseRequest, 'requests'));
  }
  summarizeConnectionRequest(id: string): Promise<{ requestId: string; summary: ConnectionSummary }> {
    return this.call(`${this.ownerBase}/requests/${encodeURIComponent(id)}/summary`, {}, true, value => {
      const v = record(value, 'connection summary'); const s = record(v.summary, 'summary');
      return { requestId: text(v.requestId, 'requestId'), summary: { recommendation: oneOf(s.recommendation, RECOMMENDATIONS, 'recommendation'), why: texts(s.why, 'summary.why'), uncertainty: text(s.uncertainty, 'summary.uncertainty'), suggestedTopic: text(s.suggestedTopic, 'summary.suggestedTopic'), evidenceRefs: texts(s.evidenceRefs, 'summary.evidenceRefs') } };
    });
  }
  actOnConnectionRequest(id: string, action: 'connect' | 'later' | 'decline', options: { sharedContactMethodIds?: string[]; learningPreference?: ExplicitDecisionPreference; expectedUpdatedAt?: number } = {}): Promise<RequestActionResult> {
    return this.call(`${this.ownerBase}/requests/${encodeURIComponent(id)}/action`, { method: 'POST', body: JSON.stringify({ action, ...(action === 'connect' ? { sharedContactMethodIds: options.sharedContactMethodIds ?? [] } : {}), ...(options.learningPreference ? { learningPreference: options.learningPreference } : {}), ...(options.expectedUpdatedAt !== undefined ? { expectedUpdatedAt: options.expectedUpdatedAt } : {}) }) }, true, value => {
      const v = record(value, 'request action'); const request = parseRequest(v);
      return { ...request, ...(v.learningStatus !== undefined ? { learningStatus: oneOf(v.learningStatus, LEARNING_STATUSES, 'learningStatus') } : {}), ...(typeof v.learningProposalId === 'string' ? { learningProposalId: v.learningProposalId } : {}) };
    });
  }
  listContacts(): Promise<ContactMethod[]> {
    return this.call(`${this.ownerBase}/contacts`, {}, true, value => parseList(value, parseContact, 'contacts'));
  }
  createContact(input: Pick<ContactMethod, 'kind' | 'value' | 'label'>): Promise<ContactMethod> {
    const body = {
      kind: oneOf(input.kind, CONTACT_KINDS, 'contact.kind'),
      value: inputText(input.value, 'contact.value', 300),
      label: inputText(input.label, 'contact.label', 100),
    };
    return this.call(`${this.ownerBase}/contacts`, { method: 'POST', body: JSON.stringify(body) }, true, parseContact);
  }
  exportPrivate(includeConversations = true): Promise<PrivateVibeArchive> { return this.call(`${this.ownerBase}/export?kind=private&includeConversations=${includeConversations ? '1' : '0'}`, {}, true, assertPortableArchive); }
}
