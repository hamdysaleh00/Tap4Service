// Audit-only command recorder. No application edits, deployments or remote D1.
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const phase = process.argv[2] || 'checks';
const out = path.resolve('outputs/project-audit');
await mkdir(out, { recursive: true });
const jobs = phase === 'registry' ? [
  ['dependency-audit', [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'audit', '--json']],
  ['dependency-signatures', [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'audit', 'signatures']],
] : phase === 'http' ? [
  ['api-integration', ['tests/api.integration.mjs']],
  ['lifecycle-integration', ['tests/session-lifecycle.integration.mjs']],
  ...['ui.local', 'alpha.ui.local', 'split-bill.ui.local', 'session-lifecycle.ui.local'].map(n => [n, [`tests/${n}.mjs`]]),
] : [
  ['lint', ['node_modules/eslint/bin/eslint.js', '.', '--ignore-pattern', 'dist', '--ignore-pattern', '.next', '--format', 'json']],
  ['audit-integration', ['tests/project-audit.integration.mjs']],
];
const results = [];
for (const [name, args] of jobs) {
  const started = Date.now();
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 180000,
    maxBuffer: 32 * 1024 * 1024, env: { ...process.env, TEST_BASE_URL: 'http://127.0.0.1:5199', NO_COLOR: '1' } });
  await writeFile(path.join(out, `${name}.stdout.log`), r.stdout || '');
  await writeFile(path.join(out, `${name}.stderr.log`), r.stderr || '');
  const item = { name, command: ['node', ...args], exitCode: r.status,
    elapsedMs: Date.now() - started, ...(r.error ? { error: r.error.code } : {}) };
  results.push(item); console.log(JSON.stringify(item));
}
await writeFile(path.join(out, `${phase}-execution.json`), JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
