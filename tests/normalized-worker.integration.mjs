// Build first. Runs the generated Vinext Worker in an isolated local runtime;
// never connects to Wrangler state, a hosted database, or Sites production.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { createInitialState } from '../lib/domain.mjs';
import { migrationPlan } from '../lib/normalized-migration.mjs';
import { insertStatement } from '../lib/normalized-model.mjs';
import { schemaArtifacts } from '../scripts/generate-normalized-schema.mjs';

const owner={id:'worker-owner',email:'worker@example.test',name:'Worker Owner'};
const auth={'oai-authenticated-user-id':owner.id,'oai-authenticated-user-email':owner.email};
const serverRoot=path.resolve('dist/server');
const files=await readdir(serverRoot,{recursive:true});
const modules=['index.js',...files.filter(f=>f.endsWith('.js')&&f!=='index.js')].map(f=>({type:'ESModule',path:path.join(serverRoot,f)}));
const settings={modules,modulesRoot:serverRoot,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{TAP2SERVE_LOCAL_DEV:'true'}};
test('built Vinext API defaults to the existing legacy database with no normalized schema',async()=>{
 const mf=new Miniflare(settings);
 try{
  const db=await mf.getD1Database('DB');await db.prepare('CREATE TABLE app_state(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL)').run();
  let res=await mf.dispatchFetch('http://localhost/api/state');assert.equal(res.status,401);
  res=await mf.dispatchFetch('http://localhost/api/state',{headers:auth});assert.equal(res.status,200);const data=await res.json();assert.equal(data.restaurant.name,'Olive & Ember');assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='restaurants'").first()).n,0);
 }finally{await mf.dispose();}
});
test('built Vinext API supports normalized lifecycle, concurrency, validation and old-capability revocation',async()=>{
 const mf=new Miniflare({...settings,bindings:{TAP2SERVE_LOCAL_DEV:'true',TAP2SERVE_STORAGE:'normalized'}});
 try{
  const db=await mf.getD1Database('DB');for(const sql of schemaArtifacts().sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  let res=await mf.dispatchFetch('http://localhost/api/state',{headers:auth});assert.equal(res.status,503);
  const state=createInitialState(owner),plan=migrationPlan({id:'main',revision:21,payload:JSON.stringify(state)});
  for(const [table,rows] of Object.entries(plan.tables))for(const row of rows){const s=insertStatement(table,row);await db.prepare(s.sql).bind(...s.params).run();}
  await db.prepare('UPDATE migration_runs SET verified=1').run();
  async function read(query='',staff=false){const res=await mf.dispatchFetch('http://localhost/api/state'+query,{headers:staff?auth:{}});assert.equal(res.status,200,await res.clone().text());return res.json();}
  const tenant=state.restaurants[0].id;
  async function command(action,body={},staff=true){return mf.dispatchFetch('http://localhost/api/command',{method:'POST',headers:{...(staff?auth:{}),'content-type':'application/json',origin:'http://localhost'},body:JSON.stringify({action,restaurantId:tenant,...body})});}
  async function ok(promise){const res=await promise;assert.equal(res.status,200,await res.clone().text());return res.json();}
  const data=await read('?restaurant='+tenant,true),table=data.restaurant.tables[1],item=data.restaurant.menu[0];
  const opens=await Promise.all([command('session.open',{tableId:table.id}),command('session.open',{tableId:table.id})]);assert.deepEqual(opens.map(r=>r.status).sort(),[200,409]);
  const guest=await read('?table='+table.token),context={token:table.token,capability:guest.session.capability},orderBody={...context,key:crypto.randomUUID(),lines:[{itemId:item.id,quantity:1}]};
  const orders=await Promise.all([ok(command('guest.order',orderBody,false)),ok(command('guest.order',orderBody,false))]);assert.equal(orders[0].id,orders[1].id);
  await ok(command('guest.bill',context,false));assert.equal((await command('guest.order',{...orderBody,key:crypto.randomUUID()},false)).status,409);
  const requested=await read('?table='+table.token);await ok(command('billing.finalize',{sessionId:requested.session.id,expectedVersion:requested.session.version,expectedTotal:requested.bill.total}));
  await ok(command('billing.pay',{sessionId:requested.session.id,key:crypto.randomUUID(),amount:requested.bill.due,expectedTotal:requested.bill.total,method:'cash'}));await ok(command('session.close',{sessionId:requested.session.id}));
  await ok(command('session.open',{tableId:table.id}));const expired=await read('?table='+table.token+'&session='+context.capability);assert.equal(expired.expired,true);assert.deepEqual(expired.orders,[]);
  const csrf=await mf.dispatchFetch('http://localhost/api/command',{method:'POST',headers:{...auth,'content-type':'application/json',origin:'https://foreign.example'},body:JSON.stringify({action:'platform.create',name:'Denied'})});assert.equal(csrf.status,403);
  const localized=await mf.dispatchFetch('http://localhost/api/state?table=invalid',{headers:{'accept-language':'ar'}});assert.equal(localized.status,404);assert.match((await localized.json()).error,/[\u0600-\u06ff]/);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='app_state'").first()).n,0);
 }finally{await mf.dispose();}
});
