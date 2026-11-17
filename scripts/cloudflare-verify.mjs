// Local-only release checks. This script cannot deploy, change DNS, provision
// resources, or run a remote D1 command. Test databases contain synthetic data.
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { configureToolEnvironment } from './tool-environment.mjs';

configureToolEnvironment(process.cwd());
const output = path.resolve('outputs/cloudflare-verification');
await mkdir(output, { recursive: true });
const preload = ['--import', pathToFileURL(path.resolve('scripts/sites-env.mjs')).href];
const tests = (await readdir('tests')).filter(f => f.endsWith('.test.mjs')).map(f => `tests/${f}`);
const steps = [
  ['typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['unit', ['--test', ...tests]],
  ['build', ['scripts/run-framework.mjs', 'build']],
  ...['normalized', 'auth', 'tenant', 'production', 'updates'].map(name =>
    [`${name}-worker`, [`tests/${name}-worker.integration.mjs`]]),
  ['two-restaurants', ['tests/cloudflare-staging.integration.mjs']],
  ...['staging', 'production'].map(name => [`${name}-dry-run`, [
    ...preload, 'node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run',
    '--config', `config/wrangler.${name}.example.jsonc`,
    '--outdir', `outputs/cloudflare-verification/${name}-upload`,
  ]]),
];
const packagingOnly = process.argv.includes('--packaging-only');
const selected = packagingOnly ? steps.filter(([name]) => name.endsWith('-dry-run')) : steps;
const results = [];
for (const [name, args] of selected) {
  const started = Date.now();
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
  const log = `${result.stdout || ''}\n${result.stderr || ''}`;
  await writeFile(path.join(output, `${name}.log`), log);
  const item = { name, status: result.status, passed: result.status === 0 && !result.error,
    elapsedMs: Date.now() - started, ...(result.error ? { error: result.error.code } : {}) };
  results.push(item);
  console.log(JSON.stringify(item));
}
let previous = [];
if (packagingOnly) {
  try { previous = JSON.parse(await readFile(path.join(output, 'results.json'), 'utf8')).results
    .filter(r => !r.name.endsWith('-dry-run')); } catch { /* No earlier check report. */ }
}
await writeFile(path.join(output, 'results.json'), JSON.stringify({
  completedAt: new Date().toISOString(), node: process.version, localOnly: true, results: [...previous, ...results],
}, null, 2));
if (results.some(r => !r.passed)) process.exitCode = 1;
