import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const sdkDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.resolve(sdkDir, '../..');
const distDir = path.join(sdkDir, 'dist');
await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await build({
  entryPoints: [path.join(sdkDir, 'src/index.ts')],
  outfile: path.join(distDir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  sourcemap: true,
});
const tsc = path.join(repoDir, 'node_modules/typescript/bin/tsc');
const result = spawnSync(process.execPath, [
  tsc, path.join(sdkDir, 'src/index.ts'), '--target', 'ES2022', '--module', 'ESNext',
  '--moduleResolution', 'bundler', '--declaration', '--emitDeclarationOnly',
  '--allowImportingTsExtensions', '--outDir', path.join(distDir, 'types'),
  '--skipLibCheck', '--strict', 'false',
], { cwd: repoDir, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
await copyFile(path.join(repoDir, 'LICENSE'), path.join(sdkDir, 'LICENSE'));
