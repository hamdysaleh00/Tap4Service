// Two independent venues, the staging template's strict production flags and
// native D1/rate-limit bindings. Entirely local; all identities are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { createRestaurant, PERMISSIONS } from '../lib/domain.mjs';
import { hashPassword, randomToken } from '../lib/auth-crypto.mjs';
import { migrationPlan } from '../lib/normalized-migration.mjs';
import { insertStatement } from '../lib/normalized-model.mjs';
import { schemaArtifacts } from '../scripts/generate-normalized-schema.mjs';

test('strict staging: two independent restaurants authenticate, order, bill and revoke sessions without Sites', async () => {
  const config = JSON.parse((await readFile('config/wrangler.staging.example.jsonc', 'utf8')).replace(/^\s*\/\/.*$/gm, ''));
  const root = path.resolve('dist/server'), files = await readdir(root, { recursive: true });
  const modules = ['index.js', ...files.filter(f => f.endsWith('.js') && f !== 'index.js')]
    .map(f => ({ type: 'ESModule', path: path.join(root, f) }));
  let outbound = 0;
  const mf = new Miniflare({ modules, modulesRoot: root,
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    log: new Log(LogLevel.NONE), d1Databases: ['DB'],
    assets: { directory: path.resolve('dist/client'), binding: 'ASSETS',
      routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true } },
    bindings: { ...config.vars, AUTH_RATE_LIMIT_SECRET: randomToken(), AUTH_MFA_KEY: Buffer.alloc(32, 29).toString('base64') },
    ratelimits: Object.fromEntries(config.ratelimits.map(r => [r.name, { simple: r.simple }])),
    outboundService() { outbound++; throw new Error('Unexpected outbound request in independent staging test.'); },
  });
  try {
    const db = await mf.getD1Database('DB');
    const state = { platformOwner: 'fixture-super-admin', platformAudit: [], sessionLifecycleVersion: 1,
      createdAt: new Date().toISOString(), restaurants: [] };
    const venues = ['olive', 'cedar'].map((slug, index) => {
      const restaurant = createRestaurant(`${slug} staging`);
      restaurant.slug = slug;
      const user = { id: `${slug}-manager`, email: `${slug}@example.test` };
      restaurant.members.push({ id: crypto.randomUUID(), userId: user.id, email: user.email,
        name: slug, active: true, permissions: [...PERMISSIONS] });
      restaurant.menu.push({ id: crypto.randomUUID(), category: restaurant.categories[0],
        name: `${slug} dish`, nameAr: 'طبق الاختبار', description: '', price: 10000 + index * 5000,
        available: true, visible: true, modifiers: [] });
      restaurant.taxBps = 1400; restaurant.serviceBps = 1200;
      state.restaurants.push(restaurant);
      return { restaurant, user, origin: `https://${slug}.staging.tap2serve.com`, password: randomToken() };
    });
    for (const sql of schemaArtifacts().sql.split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
    const plan = migrationPlan({ id: 'main', revision: 0, payload: JSON.stringify(state) });
    for (const [table, rows] of Object.entries(plan.tables)) for (const row of rows) {
      const s = insertStatement(table, row); await db.prepare(s.sql).bind(...s.params).run();
    }
    await db.prepare('UPDATE migration_runs SET verified=1').run();
    for (const sql of (await readFile('db/staged/0002_auth.sql', 'utf8')).split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
    await db.prepare("INSERT INTO auth_config VALUES('main',1,1)").run();
    for (const v of venues) await db.prepare('INSERT INTO auth_accounts(user_id,email,display_name,password_hash,email_verified_at,created_at) VALUES(?,?,?,?,?,?)')
      .bind(v.user.id, v.user.email, v.user.id, await hashPassword(v.password), Date.now(), Date.now()).run();
    const get = (v, pathname, headers = {}) => mf.dispatchFetch(v.origin + pathname, { headers, redirect: 'manual' });
    const post = (v, pathname, body, auth) => mf.dispatchFetch(v.origin + pathname, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: v.origin,
        ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}) }, body: JSON.stringify(body) });
    const ok = async response => { assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
    const auth = [];
    for (const v of venues) {
      const res = await post(v, '/api/auth/login', { email: v.user.email, password: v.password });
      const body = await ok(res), cookie = res.headers.get('Set-Cookie');
      assert.match(cookie, /__Host-t2s_session=/); assert.match(cookie, /Secure/); assert.match(cookie, /HttpOnly/);
      assert.doesNotMatch(cookie, /Domain=/i); auth.push({ cookie: cookie.split(';')[0], csrf: body.csrf });
    }
    for (let i = 0; i < venues.length; i++) {
      const v = venues[i], other = venues[1 - i], signed = auth[i], t = v.restaurant, table = t.tables[0];
      const command = (body, staff = false) => post(v, '/api/command', body, staff ? signed : null);
      const view = await ok(await get(v, '/api/state', { Cookie: signed.cookie }));
      assert.deepEqual(view.restaurants.map(r => r.id), [t.id]); assert.equal(view.platform, false);
      assert.equal((await get(other, '/api/state', { Cookie: signed.cookie })).status, 401);
      assert.equal((await command({ action: 'session.open', restaurantId: other.restaurant.id, tableId: other.restaurant.tables[0].id }, true)).status, 403);
      assert.equal((await get(v, '/api/state?table=' + other.restaurant.tables[0].token)).status, 404);
      await ok(await command({ action: 'session.open', tableId: table.id, key: crypto.randomUUID() }, true));
      const guest = await ok(await get(v, '/api/state?table=' + table.token));
      const context = { token: table.token, capability: guest.session.capability };
      const order = { action: 'guest.order', ...context, key: crypto.randomUUID(), lines: [{ itemId: t.menu[0].id, quantity: 2 }] };
      const first = await ok(await command(order)), duplicate = await ok(await command(order));
      assert.equal(first.id, duplicate.id);
      await ok(await command({ action: 'guest.bill', ...context }));
      assert.equal((await command({ ...order, key: crypto.randomUUID() })).status, 409);
      const bill = await ok(await get(v, '/api/state?table=' + table.token, { 'X-Guest-Session': context.capability }));
      assert.equal(bill.bill.total, Math.round(t.menu[0].price * 2 * 1.26));
      await ok(await command({ action: 'billing.finalize', sessionId: bill.session.id, expectedVersion: bill.session.version, expectedTotal: bill.bill.total }, true));
      const payment = { action: 'billing.pay', sessionId: bill.session.id, key: crypto.randomUUID(), amount: bill.bill.total, expectedTotal: bill.bill.total, method: i ? 'card' : 'cash' };
      await ok(await command(payment, true)); await ok(await command(payment, true));
      await ok(await command({ action: 'session.close', sessionId: bill.session.id }, true));
      assert.equal((await command({ ...order, key: crypto.randomUUID() })).status, 409);
      const closed = await ok(await get(v, '/api/state?table=' + table.token)); assert.equal(closed.session, null);
      const stored = await db.prepare('SELECT COUNT(*) n, SUM(amount) total FROM payments WHERE restaurant_id=?').bind(t.id).first();
      assert.equal(stored.n, 1); assert.equal(stored.total, bill.bill.total);
      assert.equal((await get(v, '/api/state', { 'oai-authenticated-user-id': v.user.id, 'oai-authenticated-user-email': v.user.email, Cookie: '__sites_local_auth=1' })).status, 401);
    }
    assert.equal((await mf.dispatchFetch('https://staging.tap2serve.com/readyz')).status, 200);
    const loginHTML = await (await get(venues[0], '/login')).text();
    const assetPaths = [...new Set([...loginHTML.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+\.(?:js|css))"/g)].map(m => m[1]))];
    assert(assetPaths.some(f => f.endsWith('.js')), 'Expected browser scripts in rendered login HTML.');
    assert(assetPaths.some(f => f.endsWith('.css')), 'Expected CSS in rendered login HTML.');
    for (const filename of ['/favicon.svg', ...assetPaths]) {
      const response = await get(venues[0], filename);
      assert.equal(response.status, 200, `Browser asset did not load: ${filename}`);
      assert(response.headers.has('Content-Security-Policy'));
      assert((await response.arrayBuffer()).byteLength > 0);
    }
    assert.equal((await get(venues[0], '/_next/static/nonexistent.js')).status, 404);
    assert.equal((await get(venues[0], '/.vite/manifest.json')).status, 404);
    assert.equal((await get(venues[0], '/.openai/hosting.json')).status, 404);
    assert.equal((await mf.dispatchFetch('https://unknown.staging.tap2serve.com' + assetPaths[0])).status, 404);
    const head = await mf.dispatchFetch(venues[0].origin + assetPaths[0], { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
    assert.equal(outbound, 0, 'No Sites, Access, connector, or mail identity service is required for these flows.');
  } finally { await mf.dispose(); }
});
