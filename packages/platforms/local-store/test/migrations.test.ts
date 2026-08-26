/**
 * Local store migration durability tests (task 5.5).
 *
 * Proves: migrations are explicit and ordered; a failed migration leaves the
 * database at the previous version with its partial writes rolled back; a
 * hard close mid-transaction (crash simulation) never corrupts committed
 * state; re-opening a migrated database is a no-op.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MigrationError,
  currentVersion,
  openDatabase,
  runMigrations,
  type Migration,
} from '../src/database';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/schema';
import { createLocalRepositories } from '../src/sqlite-repositories';

function tempDbPath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'vibecard-mig-'));
  return { dir, path: join(dir, 'store.db') };
}

test('fresh database migrates to the current schema version', () => {
  const { dir, path } = tempDbPath();
  try {
    const local = createLocalRepositories(path);
    assert.equal(local.schemaVersion(), SCHEMA_VERSION);
    local.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('database, WAL, and shared-memory files are owner-only', () => {
  const { dir, path } = tempDbPath();
  try {
    chmodSync(dir, 0o755);
    const local = createLocalRepositories(path);
    for (const file of [path, `${path}-wal`, `${path}-shm`]) {
      if (existsSync(file)) assert.equal(statSync(file).mode & 0o777, 0o600, file);
    }
    assert.equal(statSync(dir).mode & 0o777, 0o755, 'pre-existing parent permissions');
    local.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migrations are applied in version order and recorded by name', () => {
  const { dir, path } = tempDbPath();
  try {
    const db = openDatabase(path);
    runMigrations(db, MIGRATIONS);
    const rows = (
      db
        .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
        .all() as unknown as Array<{ version: number; name: string }>
    ).map((r) => ({ version: r.version, name: r.name })); // plain objects for deepEqual
    assert.deepEqual(rows, [
      { version: 1, name: 'create-core-tables' },
      { version: 2, name: 'add-query-indexes' },
    ]);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('re-opening a migrated database applies nothing', () => {
  const { dir, path } = tempDbPath();
  try {
    const first = createLocalRepositories(path);
    first.close();
    const second = createLocalRepositories(path);
    assert.equal(second.schemaVersion(), SCHEMA_VERSION);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failing migration rolls back: old version intact, partial writes gone', () => {
  const { dir, path } = tempDbPath();
  try {
    const v1: Migration = {
      version: 1,
      name: 'create-widget-table',
      up(db) {
        db.exec('CREATE TABLE widgets (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
      },
    };
    const brokenV2: Migration = {
      version: 2,
      name: 'broken-migration',
      up(db) {
        db.exec('CREATE TABLE partial_garbage (id TEXT)');
        db.prepare('INSERT INTO widgets (id, data) VALUES (?, ?)').run('w-partial', 'x');
        throw new Error('simulated migration failure');
      },
    };

    const db = openDatabase(path);
    runMigrations(db, [v1]);
    assert.equal(currentVersion(db), 1);
    db.prepare('INSERT INTO widgets (id, data) VALUES (?, ?)').run('w-committed', 'ok');

    assert.throws(() => runMigrations(db, [v1, brokenV2]), MigrationError);
    assert.equal(currentVersion(db), 1, 'version must stay at the last good migration');

    // The failed migration's writes were rolled back...
    const widgets = db.prepare('SELECT id FROM widgets ORDER BY id').all() as unknown as Array<{ id: string }>;
    assert.deepEqual(widgets.map((w) => w.id), ['w-committed']);
    // ...including its DDL.
    const garbage = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'partial_garbage'")
      .all();
    assert.deepEqual(garbage, []);

    // The database still works and can be migrated forward by a fixed v2.
    const fixedV2: Migration = {
      version: 2,
      name: 'fixed-migration',
      up(db2) {
        db2.prepare('INSERT INTO widgets (id, data) VALUES (?, ?)').run('w-v2', 'ok');
      },
    };
    runMigrations(db, [v1, fixedV2]);
    assert.equal(currentVersion(db), 2);
    const after = db.prepare('SELECT id FROM widgets ORDER BY id').all() as unknown as Array<{ id: string }>;
    assert.deepEqual(
      after.map((w) => w.id),
      ['w-committed', 'w-v2'],
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('crash simulation: closing with an open transaction leaves committed state intact', () => {
  const { dir, path } = tempDbPath();
  try {
    const db = openDatabase(path);
    runMigrations(db, MIGRATIONS);
    db.exec("INSERT INTO cards (id, owner_id, updated_at, data) VALUES ('c-committed', 'o1', 1, '{}')");

    // Begin a transaction, write, then drop the connection without COMMIT —
    // the closest in-process simulation of a crash mid-migration. SQLite must
    // abandon the uncommitted transaction.
    db.exec('BEGIN IMMEDIATE');
    db.exec("INSERT INTO cards (id, owner_id, updated_at, data) VALUES ('c-uncommitted', 'o1', 2, '{}')");
    db.exec('DELETE FROM schema_migrations WHERE version = 2');
    db.close();

    const reopened = openDatabase(path);
    assert.equal(currentVersion(reopened), SCHEMA_VERSION, 'version row must survive the crash');
    const cards = reopened.prepare('SELECT id FROM cards').all() as unknown as Array<{ id: string }>;
    assert.deepEqual(
      cards.map((c) => c.id),
      ['c-committed'],
    );
    // And the store is fully functional afterwards.
    const local = createLocalRepositories(reopened);
    assert.equal(local.schemaVersion(), SCHEMA_VERSION);
    local.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
