// Requires npm run build. All secrets and accounts here are randomly generated
// synthetic fixtures in disposable Miniflare databases. No mail/deploy API runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import path from 'node:path';
import { Miniflare } from 'miniflare';
import { createInitialState,createRestaurant } from '../lib/domain.mjs';
import { hashPassword,randomToken,totp } from '../lib/auth-crypto.mjs';
import { prepareAuth } from '../scripts/prepare-auth.mjs';
import { migrationPlan } from '../lib/normalized-migration.mjs';
import { insertStatement } from '../lib/normalized-model.mjs';
import { schemaArtifacts } from '../scripts/generate-normalized-schema.mjs';
const root=path.resolve('dist/server'),files=await readdir(root,{recursive:true}),modules=['index.js',...files.filter(f=>f.endsWith('.js')&&f!=='index.js')].map(f=>({type:'ESModule',path:path.join(root,f)}));
const schema=await readFile(new URL('../db/staged/0002_auth.sql',import.meta.url),'utf8');
async function runtime({seed=true,storage='legacy'}={}){
 const owner={id:'independent-owner',email:'owner@example.test'},state=createInitialState(owner);state.restaurants.push(createRestaurant('Other'));
 const bindings={TAP2SERVE_AUTH:'independent',TAP2SERVE_STORAGE:storage,TAP2SERVE_LOCAL_DEV:'true',AUTH_RATE_LIMIT_SECRET:randomToken(),AUTH_MFA_KEY:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')};
 const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings});
 const db=await mf.getD1Database('DB');await db.prepare('CREATE TABLE app_state(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL)').run();if(seed)await db.prepare("INSERT INTO app_state VALUES('main',1,?)").bind(JSON.stringify(state)).run();
 if(storage==='normalized'){
  for(const sql of schemaArtifacts().sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const plan=migrationPlan({id:'main',revision:1,payload:JSON.stringify(state)});
  for(const [table,rows] of Object.entries(plan.tables))for(const row of rows){const s=insertStatement(table,row);await db.prepare(s.sql).bind(...s.params).run();}
  await db.prepare('UPDATE migration_runs SET verified=1').run();
 }
 for(const sql of schema.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 const origin=`https://${state.restaurants[0].slug}.tap2serve.com`;
 async function post(action,body,{cookie='',csrf='',url=origin,headers={}}={}){return mf.dispatchFetch(url+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:url,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...headers},body:JSON.stringify(body)});}
 return {mf,db,state,owner,origin,post};
}
test('built Worker independently authenticates without Sites headers and protects tenant commands, CSRF and logout',async()=>{
 const f=await runtime();try{
  const loginPage=await f.mf.dispatchFetch(f.origin+'/login');assert.equal(loginPage.status,200);assert.match(await loginPage.text(),/Staff sign in/);assert.match(loginPage.headers.get('Cache-Control'),/no-store/);
  await f.db.prepare("INSERT INTO auth_config VALUES('main',1,1)").run();await f.db.prepare('INSERT INTO users VALUES(?)').bind(f.owner.id).run();const password=randomToken();await f.db.prepare('INSERT INTO auth_accounts(user_id,email,display_name,password_hash,email_verified_at,created_at) VALUES(?,?,?,?,?,?)').bind(f.owner.id,f.owner.email,'Owner',await hashPassword(password),Date.now(),Date.now()).run();
  assert.equal((await f.mf.dispatchFetch(f.origin+'/api/state',{headers:{'oai-authenticated-user-id':f.owner.id,'oai-authenticated-user-email':f.owner.email,'cf-access-authenticated-user-email':f.owner.email}})).status,401);
  const login=await f.post('auth/login',{email:f.owner.email,password});assert.equal(login.status,200,await login.clone().text());const cookie=login.headers.get('Set-Cookie').split(';')[0],{csrf}=await login.json();
  const state=await f.mf.dispatchFetch(f.origin+'/api/state',{headers:{Cookie:cookie}});assert.equal(state.status,200);assert.equal((await state.json()).platform,false);
  const body={action:'settings.save',restaurantId:f.state.restaurants[0].id,name:'Independent',taxBps:0,serviceBps:0};assert.equal((await f.post('command',body,{cookie})).status,403);assert.equal((await f.post('command',body,{cookie,csrf})).status,200);
  assert.equal((await f.post('command',{...body,restaurantId:f.state.restaurants[1].id},{cookie,csrf})).status,403);
  const foreign=`https://${f.state.restaurants[1].slug}.tap2serve.com`;assert.equal((await f.mf.dispatchFetch(foreign+'/api/state',{headers:{Cookie:cookie}})).status,401);
  assert.equal((await f.post('auth/logout',{}, {cookie,csrf})).status,200);assert.equal((await f.mf.dispatchFetch(f.origin+'/api/state',{headers:{Cookie:cookie}})).status,401);
  assert.equal((await f.post('auth/signup',{email:'public@example.test',password:randomToken()})).status,404);
  assert.equal((await f.post('auth/login',{email:f.owner.email,password:'x'.repeat(9000)})).status,413);
 }finally{await f.mf.dispose();}
});
test('built Worker explicitly provisions and activates Super Admin with encrypted MFA; no public user claims ownership',async()=>{
 const f=await runtime();try{
  const origin='https://admin.tap2serve.com',prepared=await prepareAuth({id:'main',revision:1,payload:JSON.stringify(f.state)},{storage:'legacy',accounts:[{userId:f.owner.id,email:f.owner.email,superAdmin:true,origin}]});
  for(const sql of prepared.sql.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await f.db.prepare(sql).run();await f.db.prepare("UPDATE auth_config SET ready=1 WHERE id='main'").run();
  const token=new URL(prepared.links[0].url).hash.slice(7),info=await f.post('auth/activation-info',{token},{url:origin});assert.equal(info.status,200);const {enrollmentSecret}=await info.json();assert(enrollmentSecret);
  const currentStep=Math.floor(Date.now()/30000),password=randomToken();assert.equal((await f.post('auth/activate',{token,password,code:await totp(enrollmentSecret,currentStep)},{url:origin})).status,200);
  assert.equal((await f.post('auth/login',{email:f.owner.email,password},{url:origin})).status,401);
  const login=await f.post('auth/login',{email:f.owner.email,password,code:await totp(enrollmentSecret,currentStep+1)},{url:origin});assert.equal(login.status,200,await login.clone().text());const {csrf}=await login.json(),cookie=login.headers.get('Set-Cookie').split(';')[0];
  const state=await f.mf.dispatchFetch(origin+'/api/state',{headers:{Cookie:cookie}});assert.equal(state.status,200);assert.equal((await state.json()).platform,true);
  const created=await f.post('command',{action:'platform.create',name:'Admin created',slug:'independent-created'},{cookie,csrf,url:origin});assert.equal(created.status,200,await created.clone().text());
  const stored=await f.db.prepare('SELECT password_hash,mfa_secret_enc,is_super_admin FROM auth_accounts').first();assert.match(stored.password_hash,/^\$scrypt\$/);assert(!stored.mfa_secret_enc.includes(enrollmentSecret));assert.equal(stored.is_super_admin,1);
 }finally{await f.mf.dispose();}
});
test('built independent Worker never bootstraps platform state from the first signed-in public account',async()=>{
 const f=await runtime({seed:false});try{
  await f.db.prepare("INSERT INTO auth_config VALUES('main',1,1)").run();await f.db.prepare('INSERT INTO users VALUES(?)').bind(f.owner.id).run();const password=randomToken();await f.db.prepare('INSERT INTO auth_accounts(user_id,email,display_name,password_hash,email_verified_at,created_at) VALUES(?,?,?,?,?,?)').bind(f.owner.id,f.owner.email,'User',await hashPassword(password),Date.now(),Date.now()).run();
  const login=await f.post('auth/login',{email:f.owner.email,password},{url:'https://admin.tap2serve.com'});assert.equal(login.status,200);const cookie=login.headers.get('Set-Cookie').split(';')[0];assert.equal((await f.mf.dispatchFetch('https://admin.tap2serve.com/api/state',{headers:{Cookie:cookie}})).status,503);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM app_state').first()).n,0);
 }finally{await f.mf.dispose();}
});
test('independent authentication and normalized D1 work together without mutating the retained JSON source',async()=>{
 const f=await runtime({storage:'normalized'});try{
  await f.db.prepare("INSERT INTO auth_config VALUES('main',1,1)").run();const password=randomToken();await f.db.prepare('INSERT INTO auth_accounts(user_id,email,display_name,password_hash,email_verified_at,created_at) VALUES(?,?,?,?,?,?)').bind(f.owner.id,f.owner.email,'Owner',await hashPassword(password),Date.now(),Date.now()).run();
  const before=await f.db.prepare("SELECT revision,payload FROM app_state WHERE id='main'").first(),login=await f.post('auth/login',{email:f.owner.email,password});assert.equal(login.status,200);const {csrf}=await login.json(),cookie=login.headers.get('Set-Cookie').split(';')[0];
  const res=await f.mf.dispatchFetch(f.origin+'/api/state',{headers:{Cookie:cookie}});assert.equal(res.status,200);const data=await res.json(),table=data.restaurant.tables[1];
  assert.equal((await f.post('command',{action:'session.open',restaurantId:data.restaurant.id,tableId:table.id},{cookie,csrf})).status,200);
  const guest=await f.mf.dispatchFetch(f.origin+'/api/state?table='+table.token);assert.equal(guest.status,200);const view=await guest.json();assert(view.session.capability);
  const order=await f.post('command',{action:'guest.order',token:table.token,capability:view.session.capability,key:randomToken(),lines:[{itemId:data.restaurant.menu[0].id,quantity:1}]});assert.equal(order.status,200);
  assert.equal((await f.post('command',{action:'session.open',restaurantId:f.state.restaurants[1].id,tableId:f.state.restaurants[1].tables[0].id},{cookie,csrf})).status,403);
  assert.deepEqual(await f.db.prepare("SELECT revision,payload FROM app_state WHERE id='main'").first(),before);
 }finally{await f.mf.dispose();}
});
