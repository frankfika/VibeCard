/**
 * Backup / restore CLI (task 5.7).
 *
 *   npm run backup  --prefix packages/server -- --out backup.vibe
 *   npm run restore --prefix packages/server -- --in backup.vibe [--force]
 *
 * Backup  = export the complete private `.vibe` archive (with conversations
 *           and integrity checksums). For a byte-exact disaster copy, also
 *           copy the SQLite file while the server is stopped — see
 *           docs/engineering/SELF_HOSTING.md.
 * Restore = validate + migrate + import a `.vibe` archive into the local
 *           store. Refuses to overwrite an existing identity unless --force.
 *
 * Both operate directly on the local store — the server should be stopped
 * (SQLite single-writer discipline) or pointed at a copy of the database.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { importArchive } from '../../shared/index';
import type { NowItem } from '../../shared/index';
import { createLocalRepositories } from '../../platforms/local-store/index';

import { exportPrivateFromRepos, loadMeta, saveMeta } from './app';

interface CliArgs {
  command: 'backup' | 'restore';
  out?: string;
  in?: string;
  force: boolean;
  dbPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { command: 'backup', force: false, dbPath: process.env.VIBECARD_DB_PATH?.trim() || './data/vibecard.db' };
  const [command, ...rest] = argv;
  if (command !== 'backup' && command !== 'restore') {
    throw new Error('usage: cli.ts <backup|restore> [--out file|--in file] [--force]');
  }
  args.command = command;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--out') args.out = rest[++i];
    else if (rest[i] === '--in') args.in = rest[++i];
    else if (rest[i] === '--force') args.force = true;
    else if (rest[i] === '--db') args.dbPath = rest[++i]!;
    else throw new Error(`unknown argument: ${rest[i]}`);
  }
  return args;
}

async function backup(args: CliArgs): Promise<void> {
  const repos = createLocalRepositories(args.dbPath);
  try {
    const meta = loadMeta(args.dbPath);
    const archive = await exportPrivateFromRepos(repos, meta, Date.now(), true);
    const json = JSON.stringify(archive, null, 2);
    if (args.out) {
      writeFileSync(args.out, json);
      console.log(`backup written to ${args.out} (owner ${meta.ownerId})`);
    } else {
      process.stdout.write(json);
    }
    meta.lastPrivateExportAt = Date.now();
    saveMeta(args.dbPath, meta);
  } finally {
    repos.close();
  }
}

async function restore(args: CliArgs): Promise<void> {
  if (!args.in) throw new Error('restore requires --in <file>');
  const raw = JSON.parse(readFileSync(args.in, 'utf8')) as unknown;
  const imported = importArchive(raw);
  if (imported.ok === false) {
    throw new Error(`archive rejected: ${imported.error.code} — ${imported.error.message}`);
  }
  const repos = createLocalRepositories(args.dbPath);
  try {
    const meta = loadMeta(args.dbPath);
    if (meta.cardId && !args.force) {
      throw new Error('this store already has an identity — pass --force to overwrite');
    }
    const state = imported.value;
    if (state.kind !== 'private') {
      throw new Error('restore requires a private (complete) archive; a public archive is only a projection');
    }
    await repos.cards.save(state.card);
    for (const item of state.nowItems as NowItem[]) await repos.now.save(item);
    for (const memory of state.memories) await repos.memories.save(memory);
    for (const conversation of state.conversations) await repos.conversations.save(conversation);
    for (const request of state.connectionRequests) await repos.connections.save(request);
    for (const contact of state.contactMethods) await repos.contactMethods.save(contact);
    for (const source of state.knowledgeSources) await repos.knowledgeSources.save(source);
    meta.ownerId = state.card.ownerId;
    meta.cardId = state.card.id;
    meta.lastWriteAt = Date.now();
    saveMeta(args.dbPath, meta);
    console.log(
      `restored owner ${state.card.ownerId}: ` +
      `${state.memories.length} memories, ${state.nowItems.length} now items, ` +
      `${state.contactMethods.length} contacts, ${state.connectionRequests.length} requests`,
    );
  } finally {
    repos.close();
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.command === 'backup') await backup(args);
else await restore(args);
