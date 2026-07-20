/**
 * Local store concurrency tests (task 5.5).
 *
 * node:sqlite statements are synchronous within a process, so interleaved
 * async writers on one connection serialize naturally. The riskier shape is
 * TWO connections to the same file: these tests prove WAL + busy_timeout let
 * both connections write and read each other's committed data without
 * corruption or SQLITE_BUSY failures.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Memory } from '../../../shared/vibe';
import { openDatabase } from '../src/database';
import { createLocalRepositories } from '../src/sqlite-repositories';

function memory(id: string, ownerId: string): Memory {
  return {
    id,
    schemaVersion: 1,
    ownerId,
    kind: 'fact',
    content: `content ${id}`,
    visibility: 'private',
    status: 'confirmed',
    sourceConversationId: '',
    sourceMessageIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

test('two connections write interleaved batches without corruption', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibecard-conc-'));
  try {
    const path = join(dir, 'store.db');
    const a = createLocalRepositories(path); // creates + migrates
    const b = createLocalRepositories(openDatabase(path));
    try {
      const writesA = Array.from({ length: 40 }, (_, i) => () =>
        a.memories.save(memory(`a-${i}`, 'owner-a')),
      );
      const writesB = Array.from({ length: 40 }, (_, i) => () =>
        b.memories.save(memory(`b-${i}`, 'owner-b')),
      );
      // Interleave both connections' writes as concurrent async tasks.
      await Promise.all([
        ...writesA.map((w) => w()),
        ...writesB.map((w) => w()),
      ]);

      assert.equal((await a.memories.list({ ownerId: 'owner-a' })).length, 40);
      assert.equal((await a.memories.list({ ownerId: 'owner-b' })).length, 40);
      assert.equal((await b.memories.list({ ownerId: 'owner-a' })).length, 40);
      assert.equal((await b.memories.list({ ownerId: 'owner-b' })).length, 40);
      // Spot-check content integrity through the other connection.
      assert.equal((await b.memories.get('a-17'))?.content, 'content a-17');
      assert.equal((await a.memories.get('b-33'))?.content, 'content b-33');
    } finally {
      a.close();
      b.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('upserts of the same id from two connections converge to one record', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibecard-conc2-'));
  try {
    const path = join(dir, 'store.db');
    const a = createLocalRepositories(path);
    const b = createLocalRepositories(openDatabase(path));
    try {
      await Promise.all([
        a.memories.save(memory('shared-id', 'owner-a')),
        b.memories.save({ ...memory('shared-id', 'owner-a'), content: 'from b', updatedAt: 2 }),
        a.memories.save({ ...memory('shared-id', 'owner-a'), content: 'from a again', updatedAt: 3 }),
      ]);
      const all = await a.memories.list({ ownerId: 'owner-a' });
      assert.equal(all.length, 1, 'same id must never duplicate');
      const stored = await b.memories.get('shared-id');
      assert.ok(stored);
      assert.ok(['from b', 'from a again', 'content shared-id'].includes(stored!.content));
    } finally {
      a.close();
      b.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
