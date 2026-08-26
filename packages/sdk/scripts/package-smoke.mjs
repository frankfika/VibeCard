import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sdkDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync('npm', ['run', 'build'], { cwd: sdkDir, stdio: 'inherit' });
const packed = JSON.parse(execFileSync('npm', ['pack', '--json'], { cwd: sdkDir, encoding: 'utf8' }));
const tarball = path.join(sdkDir, packed[0].filename);
const consumer = await mkdtemp(path.join(tmpdir(), 'vibecard-sdk-consumer-'));
try {
  await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ type: 'module', dependencies: { '@vibecard/sdk': `file:${tarball}` } }));
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumer, stdio: 'inherit' });
  await writeFile(path.join(consumer, 'smoke.mjs'), "import { VibeClient } from '@vibecard/sdk';\nif (typeof VibeClient !== 'function') throw new Error('SDK export missing');\nconsole.log('sdk package import ok');\n");
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: consumer, stdio: 'inherit' });
  await writeFile(path.join(consumer, 'smoke.ts'), "import { VibeClient, type VibeClientOptions } from '@vibecard/sdk';\nconst options: VibeClientOptions = { endpoint: 'http://127.0.0.1:8787', ownerToken: 'test' };\nvoid new VibeClient(options);\n");
  execFileSync(process.execPath, [path.join(sdkDir, '../../node_modules/typescript/bin/tsc'), 'smoke.ts', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--skipLibCheck'], { cwd: consumer, stdio: 'inherit' });
  const manifest = JSON.parse(await readFile(path.join(consumer, 'node_modules/@vibecard/sdk/package.json'), 'utf8'));
  if (!manifest.exports || !manifest.types) throw new Error('package metadata missing exports/types');
} finally {
  await rm(consumer, { recursive: true, force: true });
  await rm(tarball, { force: true });
}
