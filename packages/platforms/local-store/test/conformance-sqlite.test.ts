/**
 * Conformance suite running against the local SQLite reference store.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runRepositoryConformanceTests } from '../conformance';
import { createLocalRepositories } from '../src/sqlite-repositories';

runRepositoryConformanceTests('sqlite local store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibecard-conf-'));
  const local = createLocalRepositories(join(dir, 'store.db'));
  return {
    repositories: local,
    close() {
      local.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
});
