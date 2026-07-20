/**
 * Local reference store: SQLite implementation of the Core repository
 * interfaces (task 5.5).
 *
 * Every repository method maps Core records <-> table rows at the boundary:
 * writes extract indexed columns and serialize the record; reads deserialize
 * the `data` column only, so SQLite rowids, column names, and index
 * definitions never leak into domain code. Returned records are fresh objects
 * (JSON deserialization), so callers cannot mutate stored state by reference.
 *
 * Statements are synchronous (node:sqlite); the async interface is the
 * contract shape shared with remote adapters. Concurrent writes are safe by
 * construction — see database.ts (WAL + busy_timeout + serialized writers).
 */

import { DatabaseSync } from 'node:sqlite';

import type {
  ConnectionRequest,
  ContactMethod,
  Memory,
  VibeCard,
} from '../../../shared/vibe';
import type { NowItem } from '../../../shared/now';
import type {
  ArchiveConversation,
  ArchiveKnowledgeSource,
} from '../../../shared/archive';
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
} from '../../../shared/repositories';

import { currentVersion, openDatabase, runMigrations } from './database';
import { MIGRATIONS, SCHEMA_VERSION } from './schema';

export interface LocalRepositories extends VibeRepositories {
  /** Close the underlying database handle. */
  close(): void;
  /** The applied schema version (diagnostics only; not part of contracts). */
  schemaVersion(): number;
}

type Row = { data: string };

function decode<T>(row: Row | undefined): T | null {
  return row ? (JSON.parse(row.data) as T) : null;
}

/** Build `col IN (?, ...)` / `col = ?` fragments from a single-or-array filter. */
function filterFragment(
  column: string,
  filter: string | readonly string[] | undefined,
  where: string[],
  params: string[],
): void {
  if (filter === undefined) return;
  if (typeof filter === 'string') {
    where.push(`${column} = ?`);
    params.push(filter);
    return;
  }
  if (filter.length === 0) {
    where.push('1 = 0'); // an explicit empty filter matches nothing
    return;
  }
  where.push(`${column} IN (${filter.map(() => '?').join(', ')})`);
  params.push(...filter);
}

const UPDATED_DESC = 'ORDER BY updated_at DESC, id ASC';

/* eslint-disable @typescript-eslint/no-explicit-any */
function upsert(
  db: DatabaseSync,
  table: string,
  columns: string[],
  values: (string | number | null)[],
): void {
  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updates}`,
  ).run(...(values as any[]));
}

function removeById(db: DatabaseSync, table: string, id: string): void {
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function createMemoryRepository(db: DatabaseSync): MemoryRepository {
  const COLS = ['id', 'owner_id', 'status', 'visibility', 'created_at', 'updated_at', 'data'];
  return {
    async get(id) {
      return decode<Memory>(
        db.prepare('SELECT data FROM memories WHERE id = ?').get(id) as Row | undefined,
      );
    },
    async list(query: MemoryQuery) {
      const where = ['owner_id = ?'];
      const params: string[] = [query.ownerId];
      filterFragment('status', query.status, where, params);
      filterFragment('visibility', query.visibility, where, params);
      const rows = db
        .prepare(`SELECT data FROM memories WHERE ${where.join(' AND ')} ${UPDATED_DESC}`)
        .all(...params) as unknown as Row[];
      return rows.map((r) => JSON.parse(r.data) as Memory);
    },
    async save(memory) {
      upsert(db, 'memories', COLS, [
        memory.id,
        memory.ownerId,
        memory.status,
        memory.visibility,
        memory.createdAt,
        memory.updatedAt,
        JSON.stringify(memory),
      ]);
    },
    async remove(id) {
      removeById(db, 'memories', id);
    },
  };
}

function createCardRepository(db: DatabaseSync): CardRepository {
  const COLS = ['id', 'owner_id', 'updated_at', 'data'];
  return {
    async get(id) {
      return decode<VibeCard>(
        db.prepare('SELECT data FROM cards WHERE id = ?').get(id) as Row | undefined,
      );
    },
    async getByOwner(ownerId) {
      return decode<VibeCard>(
        db
          .prepare('SELECT data FROM cards WHERE owner_id = ? ORDER BY updated_at DESC, id ASC LIMIT 1')
          .get(ownerId) as Row | undefined,
      );
    },
    async save(card) {
      upsert(db, 'cards', COLS, [card.id, card.ownerId, card.updatedAt, JSON.stringify(card)]);
    },
    async remove(id) {
      removeById(db, 'cards', id);
    },
  };
}

function createNowRepository(db: DatabaseSync): NowRepository {
  const COLS = ['id', 'owner_id', 'status', 'published_at', 'expires_at', 'updated_at', 'data'];
  return {
    async get(id) {
      return decode<NowItem>(
        db.prepare('SELECT data FROM now_items WHERE id = ?').get(id) as Row | undefined,
      );
    },
    async list(query: NowQuery) {
      const where = ['owner_id = ?'];
      const params: string[] = [query.ownerId];
      filterFragment('status', query.status, where, params);
      const rows = db
        .prepare(`SELECT data FROM now_items WHERE ${where.join(' AND ')} ${UPDATED_DESC}`)
        .all(...params) as unknown as Row[];
      return rows.map((r) => JSON.parse(r.data) as NowItem);
    },
    async save(item) {
      upsert(db, 'now_items', COLS, [
        item.id,
        item.ownerId,
        item.status,
        item.publishedAt,
        item.expiresAt,
        item.updatedAt,
        JSON.stringify(item),
      ]);
    },
    async remove(id) {
      removeById(db, 'now_items', id);
    },
  };
}

function createConversationRepository(db: DatabaseSync): ConversationRepository {
  const COLS = ['id', 'owner_id', 'kind', 'visitor_id', 'updated_at', 'data'];
  return {
    async get(id) {
      return decode<ArchiveConversation>(
        db.prepare('SELECT data FROM conversations WHERE id = ?').get(id) as Row | undefined,
      );
    },
    async list(query: ConversationQuery) {
      const where = ['owner_id = ?'];
      const params: string[] = [query.ownerId];
      if (query.kind !== undefined) {
        where.push('kind = ?');
        params.push(query.kind);
      }
      if (query.visitorId !== undefined) {
        where.push('visitor_id = ?');
        params.push(query.visitorId);
      }
      const rows = db
        .prepare(`SELECT data FROM conversations WHERE ${where.join(' AND ')} ${UPDATED_DESC}`)
        .all(...params) as unknown as Row[];
      return rows.map((r) => JSON.parse(r.data) as ArchiveConversation);
    },
    async save(conversation) {
      upsert(db, 'conversations', COLS, [
        conversation.id,
        conversation.ownerId,
        conversation.kind,
        conversation.visitorId,
        conversation.updatedAt,
        JSON.stringify(conversation),
      ]);
    },
    async remove(id) {
      removeById(db, 'conversations', id);
    },
  };
}

function createConnectionRepository(db: DatabaseSync): ConnectionRepository {
  const COLS = ['id', 'owner_id', 'visitor_id', 'owner_action', 'created_at', 'updated_at', 'data'];
  const byOwner = (query: ConnectionQuery): ConnectionRequest[] => {
    const where = ['owner_id = ?'];
    const params: string[] = [query.ownerId];
    filterFragment('owner_action', query.action, where, params);
    const rows = db
      .prepare(`SELECT data FROM connection_requests WHERE ${where.join(' AND ')} ${UPDATED_DESC}`)
      .all(...params) as unknown as Row[];
    return rows.map((r) => JSON.parse(r.data) as ConnectionRequest);
  };
  return {
    async get(id) {
      return decode<ConnectionRequest>(
        db.prepare('SELECT data FROM connection_requests WHERE id = ?').get(id) as Row | undefined,
      );
    },
    async listForOwner(query) {
      return byOwner(query);
    },
    async listForVisitor(visitorId) {
      const rows = db
        .prepare(`SELECT data FROM connection_requests WHERE visitor_id = ? ${UPDATED_DESC}`)
        .all(visitorId) as unknown as Row[];
      return rows.map((r) => JSON.parse(r.data) as ConnectionRequest);
    },
    async listByPair(ownerId, visitorId) {
      const rows = db
        .prepare(
          `SELECT data FROM connection_requests WHERE owner_id = ? AND visitor_id = ? ${UPDATED_DESC}`,
        )
        .all(ownerId, visitorId) as unknown as Row[];
      return rows.map((r) => JSON.parse(r.data) as ConnectionRequest);
    },
    async save(request) {
      upsert(db, 'connection_requests', COLS, [
        request.id,
        request.ownerId,
        request.visitorId,
        request.ownerAction,
        request.createdAt,
        request.updatedAt,
        JSON.stringify(request),
      ]);
    },
    async remove(id) {
      removeById(db, 'connection_requests', id);
    },
  };
}

function createKnowledgeSourceRepository(db: DatabaseSync): KnowledgeSourceRepository {
  const COLS = ['id', 'owner_id', 'status', 'updated_at', 'data'];
  return {
    async get(id) {
      return decode<ArchiveKnowledgeSource>(
        db.prepare('SELECT data FROM knowledge_sources WHERE id = ?').get(id) as Row | undefined,
      );
    },
    async list(query: KnowledgeSourceQuery) {
      const where = ['owner_id = ?'];
      const params: string[] = [query.ownerId];
      filterFragment('status', query.status, where, params);
      const rows = db
        .prepare(`SELECT data FROM knowledge_sources WHERE ${where.join(' AND ')} ${UPDATED_DESC}`)
        .all(...params) as unknown as Row[];
      return rows.map((r) => JSON.parse(r.data) as ArchiveKnowledgeSource);
    },
    async save(source) {
      upsert(db, 'knowledge_sources', COLS, [
        source.id,
        source.ownerId,
        source.status,
        source.updatedAt,
        JSON.stringify(source),
      ]);
    },
    async remove(id) {
      removeById(db, 'knowledge_sources', id);
    },
  };
}

function createContactMethodRepository(db: DatabaseSync): ContactMethodRepository {
  const COLS = ['id', 'owner_id', 'kind', 'created_at', 'data'];
  return {
    async get(id) {
      return decode<ContactMethod>(
        db.prepare('SELECT data FROM contact_methods WHERE id = ?').get(id) as Row | undefined,
      );
    },
    async listByOwner(ownerId) {
      const rows = db
        .prepare('SELECT data FROM contact_methods WHERE owner_id = ? ORDER BY created_at ASC, id ASC')
        .all(ownerId) as unknown as Row[];
      return rows.map((r) => JSON.parse(r.data) as ContactMethod);
    },
    async save(contact) {
      upsert(db, 'contact_methods', COLS, [
        contact.id,
        contact.ownerId,
        contact.kind,
        contact.createdAt,
        JSON.stringify(contact),
      ]);
    },
    async remove(id) {
      removeById(db, 'contact_methods', id);
    },
  };
}

/**
 * Open (creating and migrating if needed) a local VibeCard store at `path`.
 * Use `':memory:'` for ephemeral stores. No network access of any kind.
 */
export function createLocalRepositories(path: string): LocalRepositories;
export function createLocalRepositories(db: DatabaseSync): LocalRepositories;
export function createLocalRepositories(source: string | DatabaseSync): LocalRepositories {
  const db = typeof source === 'string' ? openDatabase(source) : source;
  runMigrations(db, MIGRATIONS);
  return {
    memories: createMemoryRepository(db),
    cards: createCardRepository(db),
    now: createNowRepository(db),
    conversations: createConversationRepository(db),
    connections: createConnectionRepository(db),
    knowledgeSources: createKnowledgeSourceRepository(db),
    contactMethods: createContactMethodRepository(db),
    close() {
      db.close();
    },
    schemaVersion() {
      return currentVersion(db);
    },
  };
}

export { MIGRATIONS, SCHEMA_VERSION };
