/**
 * Core tests: platform-freedom proof (task 5.2).
 *
 * The Core must run in Node AND in a browser. These sources must never
 * reference browser globals, WeChat APIs, Node-only modules, model SDKs, or
 * DB clients. This test greps every Core source file for forbidden tokens so
 * a future edit cannot silently re-introduce platform coupling.
 *
 * (The check itself runs in Node and may read files — the Core cannot.)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SHARED_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Core sources (contracts, rules, projections, schemas, fixtures). */
const CORE_FILES = [
  'vibe.ts',
  'now.ts',
  'memory.ts',
  'visibility.ts',
  'public-card.ts',
  'connection.ts',
  'agent-schema.ts',
  'migration.ts',
  'index.ts',
  join('fixtures', 'vibe.ts'),
  join('fixtures', 'now.ts'),
];

/**
 * Forbidden tokens. Dot-usage patterns catch actual global access while
 * letting prose like "users document" appear in comments.
 */
const FORBIDDEN: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bwindow\s*[\[.]/, label: 'browser global window' },
  { pattern: /\bdocument\s*[\[.]/, label: 'browser global document' },
  { pattern: /\blocalStorage\b/, label: 'browser storage' },
  { pattern: /\bwx\s*\./, label: 'WeChat API' },
  { pattern: /\bprocess\s*[\[.]/, label: 'Node process global' },
  { pattern: /\brequire\s*\(/, label: 'CommonJS require' },
  { pattern: /from\s+['"](?:node:)?(?:fs|path|os|net|http|crypto|child_process)['"]/, label: 'Node-only module import' },
  { pattern: /from\s+['"]wx-server-sdk['"]/, label: 'WeChat cloud SDK import' },
  { pattern: /@google\/genai|openai|anthropic/, label: 'model SDK import' },
];

test('Core sources reference no platform globals, SDKs, or Node-only modules', () => {
  const offenders: string[] = [];
  for (const file of CORE_FILES) {
    const source = readFileSync(join(SHARED_ROOT, file), 'utf8');
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      for (const { pattern, label } of FORBIDDEN) {
        if (pattern.test(line)) {
          offenders.push(`${file}:${index + 1} (${label}): ${line.trim()}`);
        }
      }
    });
  }
  assert.deepEqual(offenders, []);
});

test('legacy shared modules stay platform-free as well', () => {
  // cards.ts / tags.ts / companion-types.ts predate the Core but are exported
  // from the same package and must not drag in platform APIs either.
  for (const file of ['cards.ts', 'tags.ts', 'companion-types.ts']) {
    const source = readFileSync(join(SHARED_ROOT, file), 'utf8');
    for (const { pattern, label } of FORBIDDEN) {
      assert.ok(!pattern.test(source), `${file} references ${label}`);
    }
  }
});

test('all files in the package directory are covered by one of the checks above', () => {
  const listed = new Set([...CORE_FILES, 'cards.ts', 'tags.ts', 'companion-types.ts', 'package.json', 'LICENSE']);
  const onDisk = readdirSync(SHARED_ROOT).filter((f) => f.endsWith('.ts'));
  for (const file of onDisk) {
    assert.ok(listed.has(file), `new Core file ${file} must be added to CORE_FILES in this test`);
  }
});
