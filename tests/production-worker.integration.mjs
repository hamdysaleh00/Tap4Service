// Built Vinext beta on real local workerd/D1. No hosted services are contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdir,readFile } from 'node:fs/promises';
import { Miniflare,Log,LogLevel } from 'miniflare';
import { createInitialState,createRestaurant,applyCommand } from '../lib/domain.mjs';
import { migrationPlan } from '../lib/normalized-migration.mjs';
import { insertStatement } from '../lib/normalized-model.mjs';
import { schemaArtifacts } from '../scripts/generate-normalized-schema.mjs';
const root=path.resolve('dist/server'),files=await readdir(root,{recursive:true});
const modules=['index.js',...files.filter(f=>f.endsWith('.js')&&f!=='index.js')].map(f=>({type:'ESModule',path:path.join(root,f)}));
class CapturedLogs extends Log{lines=[];constructor(){super(LogLevel.NONE);}log(message){this.lines.push(message);}info(message){this.lines.push(message);}warn(message){this.lines.push(message);}error(message){this.lines.push(String(message));}}
async function fixture({limit=2000,seed=true}={}){
 const log=new CapturedLogs(),mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],log,ratelimits:{PUBLIC_READ_LIMITER:{simple:{limit:5000,period:60}},GUEST_WRITE_LIMITER:{simple:{limit,period:60}}},bindings:{TAP2SERVE_PRODUCTION:'true',TAP2SERVE_STORAGE:'normalized',TAP2SERVE_AUTH:'independent',AUTH_RATE_LIMIT_SECRET:'x'.repeat(40),AUTH_MFA_KEY:Buffer.alloc(32,42).toString('base64')}});
 const db=await mf.getD1Database('DB'),owner={id:'production-test-owner',email:'owner@example.test'},state=createInitialState(owner),t=state.restaurants[0],table=t.tables[1];t.slug='olive';state.restaurants.push(createRestaurant('Other'));
 applyCommand(state,owner,{action:'session.open',restaurantId:t.id,tableId:table.id,key:crypto.randomUUID()});
 if(seed){for(const sql of schemaArtifacts().sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const plan=migrationPlan({id:'main',revision:0,payload:JSON.stringify(state)});const inserts=Object.entries(plan.tables).flatMap(([table,rows])=>rows.map(row=>insertStatement(table,row)));for(let i=0;i<inserts.length;i+=40)await db.batch(inserts.slice(i,i+40).map(s=>db.prepare(s.sql).bind(...s.params)));await db.prepare('UPDATE migration_runs SET verified=1').run();
  const auth=await readFile('db/staged/0002_auth.sql','utf8');for(const sql of auth.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();await db.prepare("INSERT INTO auth_config VALUES('main',1,1)").run();
 }
 const get=(host,pathname,headers={})=>mf.dispatchFetch(`https://${host}${pathname}`,{redirect:'manual',headers:{'cf-connecting-ip':'192.0.2.8',...headers}});
 const post=body=>mf.dispatchFetch('https://olive.tap2serve.com/api/command',{method:'POST',headers:{'content-type':'application/json',origin:'https://olive.tap2serve.com','cf-connecting-ip':'192.0.2.8'},body:JSON.stringify(body)});
 return {mf,db,state,t,table,get,post,log};
}
test('production health, security headers, authentication rejection and concurrent orders use the installed Vinext runtime',async()=>{
 const f=await fixture();try{
  let response=await f.get('tap2serve.com','/healthz');assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'ok'});
  response=await f.get('tap2serve.com','/readyz');assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'ok'});
  response=await f.get('olive.tap2serve.com','/api/state',{'oai-authenticated-user-id':'production-test-owner','oai-authenticated-user-email':'owner@example.test'});assert.equal(response.status,401);
  const guest=await (await f.get('olive.tap2serve.com','/api/state?table='+f.table.token)).json(),context={token:f.table.token,capability:guest.session.capability};
  const requests=Array.from({length:18},()=>({...context,action:'guest.order',key:crypto.randomUUID(),lines:[{itemId:f.t.menu[0].id,quantity:1}]}));
  let pending=requests,accepted=0,conflicts=0;const started=Date.now();
  for(let attempt=0;pending.length&&attempt<12;attempt++){
   const results=await Promise.all(pending.map(body=>f.post(body)));const next=[];
   for(let i=0;i<results.length;i++){const r=results[i];if(r.status===200)accepted++;else{assert.equal(r.status,409,await r.clone().text());conflicts++;next.push(pending[i]);}}
   pending=next;
  }
  assert.equal(pending.length,0);assert.equal(accepted,requests.length);
  const duplicate=await Promise.all(Array.from({length:8},()=>f.post(requests[0])));assert(duplicate.every(r=>r.status===200));
  const changed={...requests[0],lines:[{itemId:f.t.menu[0].id,quantity:2}]};assert.equal((await f.post(changed)).status,409);
  response=await f.get('olive.tap2serve.com','/api/state?table='+f.table.token,{'X-Guest-Session':context.capability});const current=await response.json();assert.equal(current.orders.length,requests.length);assert.equal(current.bill.total,requests.length*f.t.menu[0].price);assert.equal(new Set(current.orders.map(o=>o.id)).size,requests.length);
  for(const header of ['content-security-policy','strict-transport-security','x-request-id','permissions-policy'])assert(response.headers.has(header));assert.match(response.headers.get('cache-control'),/no-store/);
  const foreign=f.state.restaurants[1].tables[0];assert.equal((await f.get('olive.tap2serve.com','/api/state?table='+foreign.token)).status,404);
  response=await f.get('olive.tap2serve.com','/api/updates?table='+f.table.token,{'X-Guest-Session':context.capability});assert.equal(response.status,200);assert.equal((await response.json()).orders.length,requests.length);
  await f.db.prepare('UPDATE migration_runs SET verified=0').run();response=await f.get('tap2serve.com','/readyz');assert.equal(response.status,503);assert.deepEqual(await response.json(),{status:'unavailable'});
  response=await f.get('tap2serve.com','/healthz');assert.equal(response.status,200);
  console.log(JSON.stringify({test:'concurrent_guest_orders',accepted,duplicateRetries:8,observedConflicts:conflicts,elapsed_ms:Date.now()-started}));
 }finally{await f.mf.dispose();}
});
test('native rate-limit binding returns 429/Retry-After and no order is created after denial',async()=>{
 const f=await fixture({limit:1});try{
  const guest=await (await f.get('olive.tap2serve.com','/api/state?table='+f.table.token)).json();let denied=false;
  for(let i=0;i<10;i++){const r=await f.post({action:'guest.order',token:f.table.token,capability:guest.session.capability,key:crypto.randomUUID(),lines:[{itemId:f.t.menu[0].id,quantity:1}]});if(r.status===429){assert.equal(r.headers.get('retry-after'),'60');denied=true;break;}}
  assert.equal(denied,true);const before=await f.db.prepare('SELECT COUNT(*) n FROM orders').first();
  const response=await f.post({action:'guest.order',token:f.table.token,capability:guest.session.capability,key:crypto.randomUUID(),lines:[{itemId:f.t.menu[0].id,quantity:1}]});assert.equal(response.status,429);assert.deepEqual(await f.db.prepare('SELECT COUNT(*) n FROM orders').first(),before);
 }finally{await f.mf.dispose();}
});
test('uninitialized D1 and missing production bindings fail closed without leaking schema or query values',async()=>{
 const f=await fixture({seed:false});try{
  const r=await f.get('tap2serve.com','/readyz');assert.equal(r.status,503);assert.deepEqual(await r.json(),{status:'unavailable'});
  const failed=await f.get('olive.tap2serve.com','/api/state?table=secret-QR-value-123456');assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/SELECT|restaurants|DB|secret-QR/);
 }finally{await f.mf.dispose();}
 const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat']});try{const r=await mf.dispatchFetch('https://tap2serve.com/api/command',{method:'POST'});assert.equal(r.status,503);}finally{await mf.dispose();}
});
