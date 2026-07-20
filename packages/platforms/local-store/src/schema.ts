/**
 * Local reference store: schema definition (task 5.5).
 *
 * One table per Core collection. Each table stores the full Core record as a
 * canonical JSON document in `data` plus a small set of extracted columns used
 * only for indexing/filtering. Rowids and index definitions are storage
 * metadata: they never appear in returned records — reads always deserialize
 * `data`, which contains exactly the Core record that was saved.
 *
 * Migrations are up-only; see database.ts for the transactional runner.
 */

import type { Migration } from './database';

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'create-core-tables',
    up(db) {
      db.exec(`
        CREATE TABLE memories (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          status TEXT NOT NULL,
          visibility TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE cards (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE now_items (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          status TEXT NOT NULL,
          published_at INTEGER,
          expires_at INTEGER,
          updated_at INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          visitor_id TEXT,
          updated_at INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE connection_requests (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          visitor_id TEXT NOT NULL,
          owner_action TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE knowledge_sources (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          status TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE contact_methods (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          data TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    name: 'add-query-indexes',
    up(db) {
      // Mirrors the required indexes in ARCHITECTURE §4.
      db.exec(`
        CREATE INDEX idx_memories_owner_status ON memories (owner_id, status);
        CREATE INDEX idx_memories_owner_visibility_updated
          ON memories (owner_id, visibility, updated_at);
        CREATE INDEX idx_cards_owner ON cards (owner_id);
        CREATE INDEX idx_now_owner_status_published
          ON now_items (owner_id, status, published_at);
        CREATE INDEX idx_now_owner_expires ON now_items (owner_id, expires_at);
        CREATE INDEX idx_conversations_owner ON conversations (owner_id, kind);
        CREATE INDEX idx_connections_owner_action_created
          ON connection_requests (owner_id, owner_action, created_at);
        CREATE INDEX idx_connections_visitor_created
          ON connection_requests (visitor_id, created_at);
        CREATE INDEX idx_knowledge_owner_status ON knowledge_sources (owner_id, status);
        CREATE INDEX idx_contacts_owner ON contact_methods (owner_id);
      `);
    },
  },
];

export const SCHEMA_VERSION = 2;
