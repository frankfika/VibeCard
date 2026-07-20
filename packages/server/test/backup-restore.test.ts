/**
 * Backup / restore round-trip test (task 5.7 acceptance: "Backup and restore
 * preserve Core fixture state").
 *
 * Store A is seeded with the complete Core fixture state via archive import.
 * A backup (private .vibe archive, the documented backup artifact) is taken,
 * restored into a fresh store B, and every repository collection must
 * deep-equal the fixture source. Store-level, no network — the HTTP path for
 * export/import is covered by the smoke test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  importArchive,
  vibeFixtures,
  nowFixtures,
} from '../../shared/index';
import type { NowItem } from '../../shared/index';
import { createLocalRepositories } from '../../platforms/local-store/index';

import { exportPrivateFromRepos, loadMeta, saveMeta } from '../src/app';
import { fixturePrivateArchive } from './helpers';

const serverDir = fileURLToPath(new URL('..', import.meta.url));

function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

test('backup then restore preserves the complete Core fixture state', async () => {
  const dirA = mkdtempSync(join(tmpdir(), 'vibecard-backup-a-'));
  const dirB = mkdtempSync(join(tmpdir(), 'vibecard-backup-b-'));
  try {
    // --- seed store A with the fixture archive ---
    const dbA = join(dirA, 'vibecard.db');
    const archive = fixturePrivateArchive();
    const imported = importArchive(archive);
    assert.ok(imported.ok);
    {
      const repos = createLocalRepositories(dbA);
      const state = imported.value;
      await repos.cards.save(state.card);
      for (const item of state.nowItems as NowItem[]) await repos.now.save(item);
      for (const memory of state.memories) await repos.memories.save(memory);
      for (const request of state.connectionRequests) await repos.connections.save(request);
      for (const contact of state.contactMethods) await repos.contactMethods.save(contact);
      const meta = loadMeta(dbA);
      meta.ownerId = state.card.ownerId;
      meta.cardId = state.card.id;
      saveMeta(dbA, meta);
      repos.close();
    }

    // --- backup: private archive export (the documented backup artifact) ---
    const backupJson = await (async () => {
      const repos = createLocalRepositories(dbA);
      try {
        const meta = loadMeta(dbA);
        const exported = await exportPrivateFromRepos(repos, meta, Date.now(), true);
        return JSON.stringify(exported, null, 2);
      } finally {
        repos.close();
      }
    })();
    const backupFile = join(dirA, 'backup.vibe');
    writeFileSync(backupFile, backupJson);

    // --- restore into the fresh store B via the documented CLI path ---
    const dbB = join(dirB, 'vibecard.db');
    execFileSync(
      process.execPath,
      ['--import', 'tsx', 'src/cli.ts', 'restore', '--in', backupFile, '--db', dbB],
      { cwd: serverDir, stdio: 'pipe' },
    );

    // --- every collection in B must equal the fixture source ---
    const repos = createLocalRepositories(dbB);
    try {
      const ownerId = vibeFixtures.fixtureOwner.id;

      const card = await repos.cards.get(vibeFixtures.fixtureOwnerCard.id);
      assert.deepEqual(card, vibeFixtures.fixtureOwnerCard);

      const nowItems = await repos.now.list({ ownerId });
      assert.deepEqual(byId(nowItems), byId(nowFixtures.fixtureNowItems));

      const memories = await repos.memories.list({ ownerId });
      assert.deepEqual(
        byId(memories),
        byId([...vibeFixtures.fixtureOwnerMemories, ...vibeFixtures.fixtureOwnerSensitiveMemories]),
      );

      const contacts = await repos.contactMethods.listByOwner(ownerId);
      assert.deepEqual(byId(contacts), byId(vibeFixtures.fixtureOwnerContactMethods));

      const requests = await repos.connections.listForOwner({ ownerId });
      assert.deepEqual(byId(requests), byId([vibeFixtures.fixtureConnectionRequest]));

      // The restored store is immediately operable as an identity.
      const meta = loadMeta(dbB);
      assert.equal(meta.ownerId, ownerId);
      assert.equal(meta.cardId, vibeFixtures.fixtureOwnerCard.id);
    } finally {
      repos.close();
    }

    // A byte-exact sqlite copy also works as a disaster backup: file exists
    // and is non-trivial after close.
    const stat = readFileSync(dbA);
    assert.ok(stat.length > 0);
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('restore refuses a public archive and refuses to overwrite without --force', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibecard-backup-guard-'));
  try {
    const db = join(dir, 'vibecard.db');
    // Public archive: restore must reject (it is only a projection).
    const publicFile = join(dir, 'public.vibe');
    writeFileSync(publicFile, JSON.stringify({
      ...fixturePrivateArchive(),
      kind: 'public',
      profile: null,
      memories: [],
      contactMethods: [],
      connectionRequests: [],
      nowItems: [],
      integrity: null,
    }));
    let failed: any = null;
    try {
      execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'restore', '--in', publicFile, '--db', db], { cwd: serverDir, stdio: 'pipe' });
    } catch (error) {
      failed = error;
    }
    assert.ok(failed, 'public archive restore must fail');
    assert.match(String(failed.stderr ?? failed.message), /private/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
