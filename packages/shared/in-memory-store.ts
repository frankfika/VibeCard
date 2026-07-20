/**
 * In-memory reference repository adapter (task 5.5 Core).
 *
 * A pure, platform-free implementation of the repository interfaces in
 * `repositories.ts`, backed by Maps with deep-copy-on-read/write semantics.
 * It exists so:
 * - Core and client tests can exercise repository-shaped code with zero
 *   storage setup,
 * - the adapter conformance suite has a second, engine-independent
 *   implementation to pin shared behavior against,
 * - demos can seed the deterministic fixture story (`createFixtureRepositories`).
 *
 * It holds data only for the lifetime of the process — no persistence, no
 * network, no platform APIs. Records are cloned with JSON serialization so
 * callers can never mutate stored state through a returned reference (this
 * mirrors what a real database adapter naturally provides).
 */

import type {
  ConnectionRequest,
  ContactMethod,
  Memory,
  VibeCard,
} from './vibe';
import type { NowItem } from './now';
import type { ArchiveConversation, ArchiveKnowledgeSource } from './archive';
import type {
  CardRepository,
  ConnectionQuery,
  ConnectionRepository,
  ContactMethodRepository,
  ConversationQuery,
  ConversationRepository,
  KnowledgeSourceQuery,
  KnowledgeSourceRepository,
  MemoryQuery,
  MemoryRepository,
  NowQuery,
  NowRepository,
  VibeRepositories,
} from './repositories';
import {
  fixtureConnectionRequest,
  fixtureOwnerCard,
  fixtureOwnerContactMethods,
  fixtureOwnerMemories,
  fixtureOwnerSensitiveMemories,
  fixtureWeakConnectionRequest,
} from './fixtures/vibe';
import { fixtureNowItems } from './fixtures/now';

/** Deep copy via canonical JSON round-trip (records are plain JSON data). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function matches<T extends string>(
  filter: T | readonly T[] | undefined,
  value: T,
): boolean {
  if (filter === undefined) return true;
  return Array.isArray(filter)
    ? (filter as readonly T[]).includes(value)
    : filter === value;
}

/** Deterministic list ordering: updatedAt desc, ties broken by id asc. */
function byUpdatedAtDesc<T extends { id: string; updatedAt: number }>(a: T, b: T): number {
  return b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export interface InMemorySeed {
  cards?: readonly VibeCard[];
  memories?: readonly Memory[];
  nowItems?: readonly NowItem[];
  conversations?: readonly ArchiveConversation[];
  connectionRequests?: readonly ConnectionRequest[];
  knowledgeSources?: readonly ArchiveKnowledgeSource[];
  contactMethods?: readonly ContactMethod[];
}

/** Create an empty (or explicitly seeded) in-memory repository set. */
export function createInMemoryRepositories(seed: InMemorySeed = {}): VibeRepositories {
  const memories = new Map<string, Memory>();
  const cards = new Map<string, VibeCard>();
  const nowItems = new Map<string, NowItem>();
  const conversations = new Map<string, ArchiveConversation>();
  const connections = new Map<string, ConnectionRequest>();
  const knowledgeSources = new Map<string, ArchiveKnowledgeSource>();
  const contactMethods = new Map<string, ContactMethod>();

  for (const m of seed.memories ?? []) memories.set(m.id, clone(m));
  for (const c of seed.cards ?? []) cards.set(c.id, clone(c));
  for (const n of seed.nowItems ?? []) nowItems.set(n.id, clone(n));
  for (const c of seed.conversations ?? []) conversations.set(c.id, clone(c));
  for (const r of seed.connectionRequests ?? []) connections.set(r.id, clone(r));
  for (const k of seed.knowledgeSources ?? []) knowledgeSources.set(k.id, clone(k));
  for (const c of seed.contactMethods ?? []) contactMethods.set(c.id, clone(c));

  const memoryRepository: MemoryRepository = {
    async get(id) {
      const found = memories.get(id);
      return found ? clone(found) : null;
    },
    async list(query: MemoryQuery) {
      return [...memories.values()]
        .filter(
          (m) =>
            m.ownerId === query.ownerId &&
            matches(query.status, m.status) &&
            matches(query.visibility, m.visibility),
        )
        .sort(byUpdatedAtDesc)
        .map(clone);
    },
    async save(memory) {
      memories.set(memory.id, clone(memory));
    },
    async remove(id) {
      memories.delete(id);
    },
  };

  const cardRepository: CardRepository = {
    async get(id) {
      const found = cards.get(id);
      return found ? clone(found) : null;
    },
    async getByOwner(ownerId) {
      const found = [...cards.values()].find((c) => c.ownerId === ownerId);
      return found ? clone(found) : null;
    },
    async save(card) {
      cards.set(card.id, clone(card));
    },
    async remove(id) {
      cards.delete(id);
    },
  };

  const nowRepository: NowRepository = {
    async get(id) {
      const found = nowItems.get(id);
      return found ? clone(found) : null;
    },
    async list(query: NowQuery) {
      return [...nowItems.values()]
        .filter((n) => n.ownerId === query.ownerId && matches(query.status, n.status))
        .sort(byUpdatedAtDesc)
        .map(clone);
    },
    async save(item) {
      nowItems.set(item.id, clone(item));
    },
    async remove(id) {
      nowItems.delete(id);
    },
  };

  const conversationRepository: ConversationRepository = {
    async get(id) {
      const found = conversations.get(id);
      return found ? clone(found) : null;
    },
    async list(query: ConversationQuery) {
      return [...conversations.values()]
        .filter(
          (c) =>
            c.ownerId === query.ownerId &&
            (query.kind === undefined || c.kind === query.kind) &&
            (query.visitorId === undefined || c.visitorId === query.visitorId),
        )
        .sort(byUpdatedAtDesc)
        .map(clone);
    },
    async save(conversation) {
      conversations.set(conversation.id, clone(conversation));
    },
    async remove(id) {
      conversations.delete(id);
    },
  };

  const connectionRepository: ConnectionRepository = {
    async get(id) {
      const found = connections.get(id);
      return found ? clone(found) : null;
    },
    async listForOwner(query: ConnectionQuery) {
      return [...connections.values()]
        .filter((r) => r.ownerId === query.ownerId && matches(query.action, r.ownerAction))
        .sort(byUpdatedAtDesc)
        .map(clone);
    },
    async listForVisitor(visitorId) {
      return [...connections.values()]
        .filter((r) => r.visitorId === visitorId)
        .sort(byUpdatedAtDesc)
        .map(clone);
    },
    async listByPair(ownerId, visitorId) {
      return [...connections.values()]
        .filter((r) => r.ownerId === ownerId && r.visitorId === visitorId)
        .sort(byUpdatedAtDesc)
        .map(clone);
    },
    async save(request) {
      connections.set(request.id, clone(request));
    },
    async remove(id) {
      connections.delete(id);
    },
  };

  const knowledgeSourceRepository: KnowledgeSourceRepository = {
    async get(id) {
      const found = knowledgeSources.get(id);
      return found ? clone(found) : null;
    },
    async list(query: KnowledgeSourceQuery) {
      return [...knowledgeSources.values()]
        .filter((k) => k.ownerId === query.ownerId && matches(query.status, k.status))
        .sort(byUpdatedAtDesc)
        .map(clone);
    },
    async save(source) {
      knowledgeSources.set(source.id, clone(source));
    },
    async remove(id) {
      knowledgeSources.delete(id);
    },
  };

  const contactMethodRepository: ContactMethodRepository = {
    async get(id) {
      const found = contactMethods.get(id);
      return found ? clone(found) : null;
    },
    async listByOwner(ownerId) {
      return [...contactMethods.values()]
        .filter((c) => c.ownerId === ownerId)
        .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map(clone);
    },
    async save(contact) {
      contactMethods.set(contact.id, clone(contact));
    },
    async remove(id) {
      contactMethods.delete(id);
    },
  };

  return {
    memories: memoryRepository,
    cards: cardRepository,
    now: nowRepository,
    conversations: conversationRepository,
    connections: connectionRepository,
    knowledgeSources: knowledgeSourceRepository,
    contactMethods: contactMethodRepository,
  };
}

/**
 * The deterministic fixture story (fixtures/vibe.ts + fixtures/now.ts) as a
 * ready-to-use repository set, for demos and fixture-driven tests.
 */
export function createFixtureRepositories(): VibeRepositories {
  return createInMemoryRepositories({
    cards: [fixtureOwnerCard],
    memories: [...fixtureOwnerMemories, ...fixtureOwnerSensitiveMemories],
    nowItems: fixtureNowItems,
    connectionRequests: [fixtureConnectionRequest, fixtureWeakConnectionRequest],
    contactMethods: fixtureOwnerContactMethods,
  });
}
