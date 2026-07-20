/**
 * Conformance suite running against the Core in-memory reference adapter.
 * Pinning the same behavior against a second, engine-independent
 * implementation proves the suite tests the contract, not SQLite quirks.
 */

import { runRepositoryConformanceTests } from '../conformance';
import { createInMemoryRepositories } from '../../../shared/in-memory-store';

runRepositoryConformanceTests('in-memory adapter', () => ({
  repositories: createInMemoryRepositories(),
}));
