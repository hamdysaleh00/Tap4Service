// Audit observations only: these tests deliberately preserve current behavior.
// All state is synthetic and isolated in local workerd; no remote requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { createInitialState } from '../lib/domain.mjs';
import { migrationPlan } from '../lib/normalized-migration.mjs';
import { insertStatement } from '../lib/normalized-model.mjs';
import { schemaArtifacts } from '../scripts/generate-normalized-schema.mjs';
import { pollingWorker } from './helpers/polling-worker.mjs';

test('AUDIT SEC-01 reproduction: public HEAD rendering bypasses the GET rate limit', async () => {
  const root = path.resolve('dist/server'), files = await readdir(root, { recursive: true });
  const modules = ['index.js', ...files.filter(f => f.endsWith('.js') && f !== 'index.js')].map(f => ({ type: 'ESModule', path: path.join(root, f) }));
  const mf = new Miniflare({ modules, modulesRoot: root, compatibilityDate: '2026-05-15',
    compatibilityFlags: ['nodejs_compat'], log: new Log(LogLevel.NONE), d1Databases: ['DB'],
    bindings: { TAP2SERVE_PRODUCTION: 'true', TAP2SERVE_STORAGE: 'normalized', TAP2SERVE_AUTH: 'independent',
      AUTH_RATE_LIMIT_SECRET: 'audit-synthetic-secret'.repeat(3), AUTH_MFA_KEY: Buffer.alloc(32, 37).toString('base64') },
    ratelimits: { PUBLIC_READ_LIMITER: { simple: { limit: 1, period: 60 } }, GUEST_WRITE_LIMITER: { simple: { limit: 10, period: 60 } } },
    outboundService() { throw new Error('External access prohibited in audit fixture.'); },
  });
  try {
    const db = await mf.getD1Database('DB'), state = createInitialState({ id: 'audit-owner', email: 'audit@example.test' });
    state.restaurants[0].slug = 'audit';
    for (const sql of schemaArtifacts().sql.split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
    const plan = migrationPlan({ id: 'main', revision: 0, payload: JSON.stringify(state) });
    for (const [table, rows] of Object.entries(plan.tables)) for (const row of rows) {
      const s = insertStatement(table, row); await db.prepare(s.sql).bind(...s.params).run();
    }
    await db.prepare('UPDATE migration_runs SET verified=1').run();
    const url = 'https://audit.tap2serve.com/', headers = { 'cf-connecting-ip': '192.0.2.42' };
    assert.equal((await mf.dispatchFetch(url, { headers })).status, 200);
    assert.equal((await mf.dispatchFetch(url, { headers })).status, 429);
    // Passing reproduces an unresolved defect. It is not a security-control PASS.
    for (let i = 0; i < 3; i++) {
      const response = await mf.dispatchFetch(url, { method: 'HEAD', headers });
      assert.equal(response.status, 200); assert.equal(await response.text(), '');
    }
  } finally { await mf.dispose(); }
});

test('AUDIT bounded local timing: normalized changed vs unchanged polling with retained history', async () => {
  const f = await pollingWorker('normalized', { history: 100, restaurants: 2 });
  try {
    const url = '/api/updates?restaurant=' + f.state.restaurants[0].id;
    const cpuBefore = process.cpuUsage(), memoryBefore = process.memoryUsage();
    const changed = [], unchanged = [], changedRows = [], unchangedRows = [];
    for (let i = 0; i < 10; i++) {
      let start = performance.now(); const full = await f.read(url); await full.arrayBuffer();
      assert.equal(full.status, 200); changed.push(performance.now() - start);
      changedRows.push(Number(full.headers.get('X-Update-Rows-Read')));
      start = performance.now(); const conditional = await f.read(url, { 'If-None-Match': full.headers.get('ETag') });
      assert.equal(conditional.status, 304); await conditional.arrayBuffer();
      unchanged.push(performance.now() - start); unchangedRows.push(Number(conditional.headers.get('X-Update-Rows-Read')));
    }
    const summary = a => { const s = [...a].sort((x, y) => x - y); return { n: a.length, min: s[0], p50: s[Math.ceil(s.length * .5) - 1], p95: s[Math.ceil(s.length * .95) - 1], max: s.at(-1) }; };
    const report = { measuredAt: new Date().toISOString(), localOnly: true,
      scope: '20 sequential requests, 2 synthetic venues, 100 released history sessions/venue; no capacity claim',
      fullSnapshotMs: summary(changed), conditionalSnapshotMs: summary(unchanged),
      fullSnapshotRowsRead: summary(changedRows), conditionalRowsRead: summary(unchangedRows),
      hostProcessCpuMicros: process.cpuUsage(cpuBefore), hostProcessMemoryBefore: memoryBefore,
      hostProcessMemoryAfter: process.memoryUsage(),
      limitation: 'Node harness metrics exclude separate workerd CPU and do not measure per-isolate memory or paid Workers latency.' };
    await mkdir('outputs/project-audit', { recursive: true });
    await writeFile('outputs/project-audit/performance.json', JSON.stringify(report, null, 2));
  } finally { await f.mf.dispose(); }
});
