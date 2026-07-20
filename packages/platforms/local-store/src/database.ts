/**
 * Local reference store: database open + versioned migrations (task 5.5).
 *
 * Engine: `node:sqlite` (Node >= 22 built-in `DatabaseSync`). No network, no
 * native dependencies, no external services.
 *
 * Durability rules:
 * - Migrations are explicit, up-only, and recorded in a `schema_migrations`
 *   table (version, name, applied_at). The database version is
 *   `MAX(schema_migrations.version)`.
 * - Every migration runs inside a single `BEGIN IMMEDIATE` / `COMMIT`
 *   transaction together with its version-row insert. A crash or throw
 *   mid-migration therefore leaves the database at either the old version or
 *   the new one — never in between. Partial writes of a failed migration are
 *   rolled back.
 * - Re-running migrations is a no-op once applied (versions are skipped by
 *   comparison, and each transaction is idempotent at the record level).
 *
 * Concurrency rules:
 * - `PRAGMA journal_mode = WAL` so readers never block the single writer and
 *   one connection can read while another writes.
 * - `PRAGMA busy_timeout = 5000` so a second writer waits for the first
 *   instead of failing with SQLITE_BUSY.
 * - Within one process, `DatabaseSync` statements are synchronous, so writes
 *   from interleaved async callers are naturally serialized. Across
 *   connections/processes, SQLite serializes writers; combined with
 *   busy_timeout + WAL this gives safe concurrent behavior for a local
 *   single-owner store.
 */

import { DatabaseSync } from 'node:sqlite';

export interface Migration {
  /** Monotonic version this migration upgrades the database TO. */
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

function ensureMigrationTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
}

/** Current schema version: 0 on a fresh database. */
export function currentVersion(db: DatabaseSync): number {
  ensureMigrationTable(db);
  const row = db
    .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
    .get() as { v: number };
  return row.v;
}

export class MigrationError extends Error {
  constructor(
    readonly version: number,
    readonly migrationName: string,
    cause: unknown,
  ) {
    super(
      `Migration ${version} (${migrationName}) failed; database left at version ${
        version - 1
      }: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.cause = cause;
  }
}

/**
 * Apply every pending migration in version order. Each migration is
 * transactional: on failure the transaction is rolled back, a MigrationError
 * is thrown, and the database remains usable at its previous version.
 */
export function runMigrations(db: DatabaseSync, migrations: readonly Migration[]): void {
  ensureMigrationTable(db);
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  for (const migration of ordered) {
    if (migration.version <= currentVersion(db)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      ).run(migration.version, migration.name, Date.now());
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Connection-level failure; the database file is still consistent
        // because SQLite abandons uncommitted transactions.
      }
      throw new MigrationError(migration.version, migration.name, error);
    }
  }
}
