// Runs the built Worker and two isolated D1 databases entirely on this machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { Miniflare, Response as MFResponse } from 'miniflare';
import { createInitialState, createRestaurant, PERMISSIONS } from '../lib/domain.mjs';
import { migrationPlan } from '../lib/normalized-migration.mjs';
import { insertStatement } from '../lib/normalized-model.mjs';
import { schemaArtifacts } from '../scripts/generate-normalized-schema.mjs';
import { DEFAULT_CONFIG } from '../lib/restaurant-designs/config.mjs';
const serverRoot=path.resolve('dist/server');const files=await readdir(serverRoot,{recursive:true});
const modules=['index.js',...files.filter(f=>f.endsWith('.js')&&f!=='index.js')].map(f=>({type:'ESModule',path:path.join(serverRoot,f)}));
const owner={id:'owner',email:'owner@example.test'},staff={id:'staff-a',email:'staff@example.test'};
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'worker-test',use:'sig',alg:'RS256'};
async function jwt(user){const prefix=[{kid:jwk.kid,alg:'RS256'},{iss:'https://test.cloudflareaccess.com',aud:['test-audience'],sub:user.id,email:user.email,iat:Math.floor(Date.now()/1000)-5,exp:Math.floor(Date.now()/1000)+300}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return prefix+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(prefix))).toString('base64url');}
for(const mode of ['legacy','normalized'])test(`built Worker ${mode}: hosts, public menus, guest lifecycle, dashboards, isolation and verified authentication`,async()=>{
 let keyFetches=0;
 const mf=new Miniflare({modules,modulesRoot:serverRoot,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{TAP2SERVE_PRODUCTION:'false',TAP2SERVE_STORAGE:mode,TAP2SERVE_BASE_DOMAINS:'staging.tap2serve.com',TAP2SERVE_LEGACY_GUEST_HOSTS:'old.example.test',TAP2SERVE_ACCESS_ISSUER:'https://test.cloudflareaccess.com',TAP2SERVE_ACCESS_AUDIENCE:'test-audience'},outboundService:async request=>{keyFetches++;assert.equal(request.url,'https://test.cloudflareaccess.com/cdn-cgi/access/certs');return MFResponse.json({keys:[jwk]});}});
 try{
  const state=createInitialState(owner),a=state.restaurants[0],b=createRestaurant('Other');a.slug='olive';b.slug='other';
  const removed={...structuredClone(DEFAULT_CONFIG),implementationId:'removed-custom'};
  b.websiteDesign={version:0,draft:removed,published:removed,previous:null};
  a.members.push({id:crypto.randomUUID(),userId:staff.id,email:staff.email,name:'Staff A',active:true,permissions:[...PERMISSIONS]});
  b.members.push({id:crypto.randomUUID(),userId:owner.id,email:owner.email,active:true,permissions:[...PERMISSIONS]});state.restaurants.push(b);
  const db=await mf.getD1Database('DB');
  if(mode==='legacy'){await db.prepare('CREATE TABLE app_state(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL)').run();await db.prepare('INSERT INTO app_state VALUES(?,0,?)').bind('main',JSON.stringify(state)).run();}
  else{for(const sql of schemaArtifacts().sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();const plan=migrationPlan({id:'main',revision:0,payload:JSON.stringify(state)});for(const [table,rows] of Object.entries(plan.tables))for(const row of rows){const s=insertStatement(table,row);await db.prepare(s.sql).bind(...s.params).run();}await db.prepare('UPDATE migration_runs SET verified=1').run();}
  const ownerAuth={'cf-access-jwt-assertion':await jwt(owner)},staffAuth={'cf-access-jwt-assertion':await jwt(staff)};
  const fetch=(host,path='/',headers={})=>mf.dispatchFetch(`https://${host}${path}`,{headers,redirect:'manual'});
  async function command(host,action,body={},headers={}){return mf.dispatchFetch(`https://${host}/api/command`,{method:'POST',headers:{...headers,'content-type':'application/json',origin:`https://${host}`},body:JSON.stringify({action,...body})});}
  async function ok(promise){const response=await promise;assert.equal(response.status,200,(await response.clone().text())+' key fetches='+keyFetches);return response.json();}
  let response=await fetch('tap2serve.com');assert.equal(response.status,200);assert.match(await response.text(),/Tap2Serve/);
  response=await fetch('olive.tap2serve.com');assert.equal(response.status,200);assert.match(await response.text(),/Olive/);
  response=await fetch('olive.tap2serve.com','/dashboard');assert.equal(response.status,200);
  for(const host of ['unknown.tap2serve.com','api.tap2serve.com','one.two.tap2serve.com','tap2serve.com.evil.test','localhost']){response=await fetch(host);assert.equal(response.status,404);assert.match(await response.text(),/Restaurant not found/);}
  response=await fetch('unknown.tap2serve.com','/api/state');assert.equal(response.status,404);assert.match(response.headers.get('content-type'),/json/);
  response=await fetch('olive.tap2serve.com','/api/state',{'oai-authenticated-user-id':owner.id,'oai-authenticated-user-email':owner.email,'x-tenant-id':b.id,'x-forwarded-host':'admin.tap2serve.com'});assert.equal(response.status,401);
  const dashboard=await ok(fetch('olive.tap2serve.com','/api/state',ownerAuth));assert.equal(dashboard.restaurant.id,a.id);assert.equal(dashboard.platform,false);assert.deepEqual(dashboard.platformRestaurants,[]);assert.deepEqual(dashboard.restaurants.map(r=>r.id),[a.id]);
  const parallel=await Promise.all(Array.from({length:12},(_,i)=>ok(fetch(`${i%2?'other':'olive'}.tap2serve.com`,'/api/state',ownerAuth))));
  parallel.forEach((view,i)=>{assert.equal(view.restaurant.id,i%2?b.id:a.id);assert.equal(view.platform,false);assert.equal(view.restaurants.length,1);});
  assert.equal((await fetch('olive.tap2serve.com','/api/state?restaurant='+b.id,ownerAuth)).status,403);
  assert.equal((await fetch('other.tap2serve.com','/api/state',staffAuth)).status,403);
  assert.equal((await fetch('admin.tap2serve.com','/api/state',staffAuth)).status,403);
  const admin=await ok(fetch('admin.tap2serve.com','/api/state',ownerAuth));assert.equal(admin.platform,true);assert.equal(admin.restaurant,null);assert.equal(admin.platformRestaurants.length,2);
  // Super Admin draft/preview/publication routes remain separate from tenant APIs.
  assert.equal((await fetch('admin.tap2serve.com','/api/design?restaurant='+a.id)).status,401);
  assert.equal((await fetch('admin.tap2serve.com','/api/design?restaurant='+a.id,staffAuth)).status,403);
  assert.equal((await fetch('olive.tap2serve.com','/api/design?restaurant='+a.id,ownerAuth)).status,403);
  const initialDesign=await ok(fetch('admin.tap2serve.com','/api/design?restaurant='+a.id,ownerAuth));assert.equal(initialDesign.management.version,0);
  const design=structuredClone(DEFAULT_CONFIG);design.branding.heroTitle={en:'PRIVATE DESIGN DRAFT',ar:'عنوان عربي خاص'};design.colors.primary='#103c54';
  await ok(command('admin.tap2serve.com','platform.design.save',{restaurantId:a.id,config:design,expectedVersion:0},ownerAuth));
  response=await fetch('olive.tap2serve.com');assert.doesNotMatch(await response.text(),/PRIVATE DESIGN DRAFT/);
  response=await fetch('admin.tap2serve.com',`/design-preview?restaurant=${a.id}&version=1&lang=ar`,ownerAuth);assert.equal(response.status,200);const previewHTML=await response.text();assert.match(previewHTML,/عنوان عربي خاص/);assert.match(previewHTML,/dir="rtl"/);assert.match(previewHTML,/inert/);
  response=await fetch('admin.tap2serve.com',`/design-preview?restaurant=${a.id}&version=1&view=guest`,ownerAuth);assert.equal(response.status,200);assert.match(await response.text(),/guest-nav/);
  assert.equal((await fetch('olive.tap2serve.com',`/design-preview?restaurant=${a.id}&version=1`,ownerAuth)).status,404);
  assert.equal((await fetch('admin.tap2serve.com',`/design-preview?restaurant=${a.id}&version=1`,staffAuth)).status,404);
  assert.equal((await command('olive.tap2serve.com','platform.design.publish',{restaurantId:a.id,expectedVersion:1},ownerAuth)).status,403);
  assert.equal((await command('olive.tap2serve.com','settings.save',{name:'Blocked',taxBps:0,serviceBps:0,logo:'https://example.test/hack.png'},staffAuth)).status,403);
  await ok(command('admin.tap2serve.com','platform.design.publish',{restaurantId:a.id,expectedVersion:1},ownerAuth));
  response=await fetch('olive.tap2serve.com');const liveHTML=await response.text();assert.match(liveHTML,/PRIVATE DESIGN DRAFT/);assert.match(liveHTML,/#103c54/);
  const guestDesign=await ok(fetch('olive.tap2serve.com','/api/state?table='+a.tables[0].token));assert.equal(guestDesign.restaurant.appearance.branding.heroTitle.en,'PRIVATE DESIGN DRAFT');assert.doesNotMatch(JSON.stringify(guestDesign),/publishedBy|updatedBy|websiteDesign/);
  response=await fetch('other.tap2serve.com');assert.match(await response.text(),/data-design="tap2serve-classic"/);
  assert.equal((await command('admin.tap2serve.com','platform.design.publish',{restaurantId:a.id,expectedVersion:1},ownerAuth)).status,409);
  await ok(command('admin.tap2serve.com','platform.design.revert',{restaurantId:a.id,expectedVersion:2},ownerAuth));
  response=await fetch('olive.tap2serve.com');assert.doesNotMatch(await response.text(),/PRIVATE DESIGN DRAFT/);
  assert.equal((await command('olive.tap2serve.com','platform.create',{name:'Denied',slug:'denied'},ownerAuth)).status,403);
  assert.equal((await command('olive.tap2serve.com','session.open',{restaurantId:b.id,tableId:b.tables[1].id},ownerAuth)).status,403);
  assert.equal((await fetch('olive.tap2serve.com','/api/state?table='+b.tables[0].token)).status,404);
  assert.equal((await command('olive.tap2serve.com','guest.call',{token:b.tables[0].token,capability:'foreign-capability'})).status,404);
  const table=a.tables[1];await ok(command('olive.tap2serve.com','session.open',{tableId:table.id},staffAuth));
  const guest=await ok(fetch('olive.tap2serve.com','/api/state?table='+table.token));assert(guest.session.capability);
  const context={token:table.token,capability:guest.session.capability};
  await ok(command('olive.tap2serve.com','guest.order',{...context,key:crypto.randomUUID(),lines:[{itemId:a.menu[0].id,quantity:1}]}));
  const ordered=await ok(fetch('olive.tap2serve.com','/api/state?table='+table.token));assert.equal(ordered.orders.length,1);
  await ok(command('olive.tap2serve.com','guest.bill',context));
  for(const host of ['tap2serve.com','old.example.test']){response=await fetch(host,'/?table='+table.token);assert.equal(response.status,307);assert.equal(response.headers.get('location'),`https://olive.tap2serve.com/?table=${table.token}`);}
  assert.equal((await fetch('old.example.test','/api/state',ownerAuth)).status,404);
  assert.equal((await fetch('tap2serve.com','/api/state',ownerAuth)).status,403);
  response=await fetch('olive.staging.tap2serve.com','/api/state?table='+table.token);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  const forged=await mf.dispatchFetch('https://olive.tap2serve.com/api/command',{method:'POST',headers:{...staffAuth,'content-type':'application/json',origin:'https://other.tap2serve.com'},body:JSON.stringify({action:'session.open',tableId:a.tables[2].id})});assert.equal(forged.status,403);
  await ok(command('admin.tap2serve.com','platform.create',{name:'New',slug:'new-restaurant'},ownerAuth));
  assert.equal((await fetch('new-restaurant.tap2serve.com')).status,200);
  assert.equal((await command('admin.tap2serve.com','platform.create',{name:'Collision',slug:'new-restaurant'},ownerAuth)).status,409);
  const claims=await Promise.all([command('admin.tap2serve.com','platform.create',{name:'Claim A',slug:'race-slug'},ownerAuth),command('admin.tap2serve.com','platform.create',{name:'Claim B',slug:'race-slug'},ownerAuth)]);
  assert.deepEqual(claims.map(r=>r.status).sort(),[200,409]);
 }finally{await mf.dispose();}
});
