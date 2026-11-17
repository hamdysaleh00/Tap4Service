import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInitialState, createRestaurant, guestView, staffView, PERMISSIONS } from '../lib/domain.mjs';
import { canonical, encodeRestaurant, decodeRestaurant } from '../lib/normalized-model.mjs';
import { migrationPlan, verifyTables, importSQL } from '../lib/normalized-migration.mjs';
import { applyPlan, readTables } from '../scripts/normalized-migration.mjs';
import { schemaArtifacts } from '../scripts/generate-normalized-schema.mjs';
import { createNormalizedStore, commitStatements } from '../lib/normalized-store.mjs';
import { scopeState } from '../lib/tenant-routing.mjs';

const owner={id:'owner',email:'owner@example.test',name:'Owner'},key=()=>crypto.randomUUID();
function source(state=createInitialState(owner)){return {id:'main',revision:17,payload:JSON.stringify(state)};}
function fixture(state=createInitialState(owner)){
 const db=new DatabaseSync(':memory:'),row=source(state),plan=migrationPlan(row);
 db.exec('CREATE TABLE app_state(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL)');db.prepare('INSERT INTO app_state VALUES(?,?,?)').run(row.id,row.revision,row.payload);
 applyPlan(db,plan);db.prepare('UPDATE migration_runs SET verified=1').run();
 const queries=[],adapter={
  prepare(sql){
   return {sql,params:[],bind(...params){return {...this,params};},async first(){queries.push(sql);return db.prepare(sql).get(...this.params)??null;},async all(){queries.push(sql);return {results:db.prepare(sql).all(...this.params)};}};
  },
  async batch(statements){
   db.exec('BEGIN IMMEDIATE');
   try{const results=statements.map(s=>{queries.push(s.sql);const prepared=db.prepare(s.sql);if(s.sql.startsWith('SELECT'))return {results:prepared.all(...s.params)};const result=prepared.run(...s.params);return {results:[],meta:{changes:result.changes}};});db.exec('COMMIT');return results;}
   catch(e){db.exec('ROLLBACK');throw e;}
  },
 };
 const store=createNormalizedStore(adapter),t=state.restaurants[0];
 const run=(action,body={},user=owner)=>store.command(user,{action,restaurantId:t.id,...body});
 return {db,adapter,store,queries,row,plan,t,run};
}
async function session(f){const table=f.t.tables[1];const {id}=await f.run('session.open',{tableId:table.id});const view=await f.store.guest(table.token);return {id,table,capability:view.session.capability,guest:(action,body={})=>f.run('guest.'+action,{token:table.token,capability:view.session.capability,...body},null),lines:[{itemId:f.t.menu[0].id,quantity:1,modifierIds:[f.t.menu[0].modifiers[0].id],notes:'بدون ملح'}]};}
test('generated schema and Drizzle declarations match committed artifacts',()=>{const a=schemaArtifacts(),read=file=>readFileSync(new URL(file,import.meta.url),'utf8').replaceAll('\r\n','\n');assert.equal(read('../db/schema.ts'),a.ts);assert.equal(read('../db/staged/0001_normalized.sql'),a.sql);});
test('migration preserves Unicode, retired fields, ids, raw app_state and financial history',()=>{
 const state=createInitialState(owner),t=state.restaurants[0];t.nameAr='مطعم';t.categoryNames={'Small plates':'مقبلات'};state.unrecognized={keep:true};t.diners=[{id:'legacy-diner'}];t.allocations=[{amount:100}];t.orders[0].lines[0].retiredAssignment={guest:'a'};t.payments.push({id:key(),sessionId:t.sessions[0].id,amount:100,method:'legacy',dinerId:'legacy-diner',key:key()});t.audit.push({at:'old',by:'old',action:'old'});
 const f=fixture(state);f.db.prepare('UPDATE migration_runs SET verified=0').run();const report=verifyTables(f.plan,readTables(f.db,f.plan));assert(report.verified);assert.equal(canonical(decodeRestaurant(encodeRestaurant(t))),canonical(t));assert.deepEqual({...f.db.prepare("SELECT * FROM app_state WHERE id='main'").get()},f.row);assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('migration resumes identically; changed source and target tampering fail closed',()=>{
 const f=fixture();f.db.prepare('UPDATE migration_runs SET verified=0').run();assert(applyPlan(f.db,f.plan).verified);const changed=migrationPlan({...f.row,revision:18});assert.throws(()=>applyPlan(f.db,changed),/another source/);
 f.db.prepare('UPDATE menu_items SET price=price+1').run();assert.throws(()=>applyPlan(f.db,f.plan),/Value mismatch/);assert.throws(()=>verifyTables(f.plan,readTables(f.db,f.plan)),/Value mismatch/);
});
test('resumable SQL works twice without replacing data and rejects conflicting rows',()=>{
 const plan=migrationPlan(source()),db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(schemaArtifacts().sql);const sql=importSQL(plan);db.exec(sql);db.exec(sql);assert(verifyTables(plan,readTables(db,plan)).verified);db.prepare('UPDATE restaurants SET name=?').run('Tampered');assert.throws(()=>db.exec(sql),/tap2serve_revision_conflict/);assert.equal(db.prepare('SELECT name FROM restaurants').get().name,'Tampered');
});
test('invalid relationships and duplicate tokens stop migration without repairing source',()=>{
 const state=createInitialState(owner),before=canonical(state);state.restaurants[0].orders[0].sessionId='missing';const db=new DatabaseSync(':memory:');assert.throws(()=>applyPlan(db,migrationPlan(source(state))),/FOREIGN KEY/);assert.notEqual(canonical(state),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM restaurants').get().n,0);
 const duplicate=createInitialState(owner);duplicate.restaurants[0].tables[1].token=duplicate.restaurants[0].tables[0].token;assert.throws(()=>applyPlan(new DatabaseSync(':memory:'),migrationPlan(source(duplicate))),/UNIQUE/);
});
test('historical sold item snapshots survive even when the live menu definition no longer exists',()=>{const state=createInitialState(owner);state.restaurants[0].orders[0].lines[0].itemId='retired-menu-item';const f=fixture(state);assert.equal(f.db.prepare('SELECT item_id FROM order_items WHERE item_id=?').get('retired-menu-item').item_id,'retired-menu-item');});
test('existing ACTIVE/CLOSED lifecycle conversion is deterministic and leaves original JSON intact',()=>{
 const state=createInitialState(owner);delete state.sessionLifecycleVersion;state.restaurants[0].sessions[0].status='ACTIVE';state.restaurants[0].sessions[1].status='CLOSED';const row=source(state),plan=migrationPlan(row);assert.equal(plan.state.restaurants[0].sessions[0].status,'OPEN');assert(plan.state.restaurants[0].sessions[1].finalBill);assert.equal(JSON.parse(row.payload).restaurants[0].sessions[1].status,'CLOSED');assert(applyPlan(new DatabaseSync(':memory:'),plan).verified);
});
test('unverified or incompatible staging database cannot serve traffic or bootstrap sample data',async()=>{const f=fixture();f.db.prepare('UPDATE migration_runs SET verified=0').run();await assert.rejects(f.store.staff(owner),e=>e.status===503);await assert.rejects(f.run('platform.create',{name:'Denied'}),e=>e.status===503);f.db.prepare('UPDATE migration_runs SET verified=1,model_version=999').run();await assert.rejects(f.store.staff(owner),e=>e.status===503);});
test('SQL constraints prevent cross-tenant references, duplicate occupancy and invalid money',()=>{
 const state=createInitialState(owner),other=createRestaurant('Other');state.restaurants.push(other);const f=fixture(state),s=f.t.sessions[0];assert.throws(()=>f.db.prepare('UPDATE sessions SET table_id=? WHERE restaurant_id=? AND id=?').run(other.tables[0].id,f.t.id,s.id),/FOREIGN KEY/);assert.throws(()=>f.db.prepare('UPDATE sessions SET table_id=? WHERE restaurant_id=? AND id=?').run(f.t.sessions[0].tableId,f.t.id,f.t.sessions[1].id),/UNIQUE/);assert.throws(()=>f.db.prepare('UPDATE menu_items SET price=-1').run(),/CHECK/);
});
test('staff and guest read contracts match existing domain views; staff RBAC is unchanged',async()=>{
 const state=createInitialState(owner),other=createRestaurant('Other');other.members.push({id:key(),userId:owner.id,email:owner.email,permissions:[...PERMISSIONS],active:true});state.restaurants.push(other);const f=fixture(state);
 const actual=await f.store.staff(owner,f.t.id),expected=staffView(structuredClone(state),owner,f.t.id);delete actual.revision;assert.equal(canonical(actual),canonical(expected));assert.equal(canonical(await f.store.guest(f.t.tables[0].token)),canonical(guestView(state,f.t.tables[0].token)));
 await assert.rejects(f.store.staff({id:'outsider',email:'x@test'},f.t.id),e=>e.status===403);await assert.rejects(f.run('settings.save',{name:'Hacked',taxBps:0,serviceBps:0},{id:'outsider'}),e=>e.status===403);
});
test('simultaneous actions in separate restaurants preserve both changes without platform reads/writes',async()=>{
 const state=createInitialState(owner),other=createRestaurant('Other');other.members.push({id:key(),userId:owner.id,email:owner.email,permissions:[...PERMISSIONS],active:true});state.restaurants.push(other);const f=fixture(state);f.queries.length=0;
 await Promise.all([f.run('menu.availability',{itemId:f.t.menu[0].id,available:false}),f.run('settings.save',{restaurantId:other.id,name:'Other changed',taxBps:0,serviceBps:0})]);
 assert.equal(f.db.prepare('SELECT available FROM menu_items WHERE restaurant_id=? AND id=?').get(f.t.id,f.t.menu[0].id).available,0);assert.equal(f.db.prepare('SELECT name FROM restaurants WHERE id=?').get(other.id).name,'Other changed');assert(!f.queries.some(q=>q.includes('app_state')));assert(!f.queries.some(q=>q.startsWith('SELECT * FROM ')&&tableIsTenant(q)&&!q.includes('WHERE restaurant_id=?')));assert.deepEqual({...f.db.prepare('SELECT * FROM app_state').get()},f.row);
});
function tableIsTenant(sql){return !/platform_config|migration_runs/.test(sql);}
test('same-tenant concurrent updates retry with fresh state and persist both independent actions',async()=>{const f=fixture();await Promise.all([f.run('menu.availability',{itemId:f.t.menu[0].id,available:false}),f.run('menu.availability',{itemId:f.t.menu[1].id,available:false})]);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM menu_items WHERE available=0').get().n,2);assert.equal(f.db.prepare('SELECT revision FROM restaurants').get().revision,2);});
test('concurrent session opens and duplicate orders/payments obey occupancy and idempotency',async()=>{
 const f=fixture(),table=f.t.tables[1];const opens=await Promise.allSettled([f.run('session.open',{tableId:table.id}),f.run('session.open',{tableId:table.id})]);assert.equal(opens.filter(r=>r.status==='fulfilled').length,1);
 const view=await f.store.guest(table.token),body={token:table.token,capability:view.session.capability,key:key(),lines:[{itemId:f.t.menu[0].id,quantity:1}]};const orders=await Promise.all([f.run('guest.order',body,null),f.run('guest.order',body,null)]);assert.equal(orders[0].id,orders[1].id);
 const b=(await f.store.guest(table.token)).bill,payment={sessionId:view.session.id,key:key(),method:'cash',amount:b.due,expectedTotal:b.total};await Promise.all([f.run('billing.pay',payment),f.run('billing.pay',payment)]);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM payments').get().n,1);
});
test('concurrent order edit/kitchen transition and bill/order races respect versions and final totals',async()=>{
 const f=fixture(),s=await session(f),o=await s.guest('order',{key:key(),lines:s.lines});const first=(await f.store.guest(s.table.token)).orders[0];
 const race=await Promise.allSettled([s.guest('edit',{orderId:o.id,version:1,key:key(),lines:[{...s.lines[0],id:first.lines[0].id,quantity:2}]}),f.run('order.status',{orderId:o.id,version:1,status:'PREPARING'})]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 await Promise.allSettled([s.guest('bill'),s.guest('order',{key:key(),lines:s.lines})]);const v=await f.store.guest(s.table.token);assert.equal(v.session.status,'BILL_REQUESTED');await assert.rejects(s.guest('order',{key:key(),lines:s.lines}),e=>e.status===409);
 await f.run('billing.finalize',{sessionId:s.id,expectedVersion:v.session.version,expectedTotal:v.bill.total});const finalized=await f.store.guest(s.table.token);assert.equal(finalized.bill.total,v.bill.total);await assert.rejects(s.guest('edit',{orderId:o.id,version:2,key:key(),lines:s.lines}),e=>e.status===409);
});
test('batch error rolls back revision, domain writes, audit and payment together',async()=>{
 const f=fixture(),snapshot=await f.store.load(f.t.id);snapshot.state.restaurants[0].menu[0].available=false;const statements=commitStatements(snapshot,snapshot.state.restaurants[0]);statements.splice(statements.length-1,0,{sql:'UPDATE menu_items SET price=-1 WHERE restaurant_id=?',params:[f.t.id]});await assert.rejects(f.adapter.batch(statements.map(s=>f.adapter.prepare(s.sql).bind(...s.params))),/CHECK/);assert.equal(f.db.prepare('SELECT revision FROM restaurants').get().revision,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM menu_items WHERE available=0').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM commit_guards').get().n,0);
});
test('invitations bind to one stable user under concurrency',async()=>{
 const state=createInitialState(owner);state.restaurants[0].members.push({id:key(),userId:null,email:'chef@test',permissions:['kitchen.read'],active:true});const f=fixture(state);await Promise.all([f.store.initialize({id:'chef-1',email:'chef@test'}),f.store.initialize({id:'chef-2',email:'chef@test'})]);const member=f.db.prepare("SELECT user_id FROM memberships WHERE email='chef@test'").get();assert(['chef-1','chef-2'].includes(member.user_id));assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM users WHERE id IN ('chef-1','chef-2')").get().n,1);
});
test('platform creation/update use normalized tables and preserve membership visibility',async()=>{const f=fixture(),created=await f.run('platform.create',{name:'New restaurant'});await f.run('platform.update',{restaurantId:created.id,status:'active',monthlyPerTable:7000,setupFee:100,setup:{menu:true},supportStatus:'Live'});const view=await f.store.staff(owner,created.id);assert.equal(view.restaurants.length,2);assert.equal(view.platformRestaurants.find(r=>r.id===created.id).monthlyTotal,28000);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM platform_audit').get().n,2);});
test('normalized repository preserves settings, menu edits, staff roles, requests, printing and released bill history',async()=>{
 const f=fixture();await f.run('settings.save',{name:'مطعم',nameAr:'مطعم عربي',tagline:'Welcome',taxBps:1400,serviceBps:1200});
 await f.run('category.save',{previous:'Small plates',name:'Starters',nameAr:'مقبلات'});
 const m={...f.t.menu[0],name:'Updated burger',nameAr:'برجر',price:26000,modifiers:[{name:'Sauce',price:1000}]};await f.run('menu.save',{item:m});
 await f.run('table.save',{tableId:f.t.tables[1].id,label:'VIP',capacity:6,zone:'Terrace',enabled:true,billable:false});
 await f.run('staff.save',{email:'chef@example.test',name:'Chef',permissions:['kitchen.read'],active:true});
 const chef={id:'chef',email:'chef@example.test'};await f.store.initialize(chef);const kitchen=await f.store.staff(chef,f.t.id);assert.deepEqual(kitchen.permissions,['kitchen.read']);assert.deepEqual(kitchen.restaurant.menu,[]);
 await assert.rejects(f.run('billing.print',{sessionId:f.t.sessions[0].id},chef),e=>e.status===403);
 const s=await session(f),current=(await f.store.staff(owner,f.t.id)).restaurant.menu.find(x=>x.id===m.id);s.lines=[{itemId:current.id,quantity:2,modifierIds:[current.modifiers[0].id]}];
 await s.guest('order',{key:key(),lines:s.lines});const call=await s.guest('call');await f.run('request.status',{requestId:call.id,status:'acknowledged'});await s.guest('feedback',{rating:5,key:key(),comment:'ممتاز'});await s.guest('bill');
 let view=await f.store.guest(s.table.token);assert.equal(view.bill.total,68040);assert.equal(view.requests.find(r=>r.id===call.id).status,'acknowledged');assert.equal(view.feedback,undefined);
 await f.run('session.reopen',{sessionId:s.id,expectedVersion:view.session.version});const draft=await f.run('billing.print',{sessionId:s.id});assert.equal(draft.mode,'draft');view=await f.store.guest(s.table.token);assert.equal(view.session.status,'OPEN');
 await f.run('billing.finalize',{sessionId:s.id,expectedVersion:view.session.version,expectedTotal:view.bill.total});const final=await f.run('billing.print',{sessionId:s.id,mode:'final'});assert.equal(final.bill.total,68040);
 await f.run('session.open',{tableId:s.table.id});assert.equal((await f.store.guest(s.table.token,s.capability)).expired,true);
 await f.run('billing.pay',{sessionId:s.id,key:key(),method:'card',amount:final.bill.due,expectedTotal:final.bill.total});await f.run('session.close',{sessionId:s.id});
 const history=(await f.store.staff(owner,f.t.id)).restaurant;assert(history.sessions.find(x=>x.id===s.id).releasedAt);assert.equal(history.sessions.find(x=>x.id===s.id).bill.due,0);assert.equal(history.feedback[0].comment,'ممتاز');assert.equal(history.menu.find(x=>x.id===f.t.menu[1].id).category,'Starters');assert.equal(history.categoryNames.Starters,'مقبلات');
});
test('offline CLI retains source bytes, verifies D1 export and emits approval-only activation',async()=>{
 const root=path.resolve('outputs');await mkdir(root,{recursive:true});const dir=await mkdtemp(path.join(root,'normalized-cli-test-')),row=source(),bytes='\uFEFF'+JSON.stringify([{success:true,results:[row]}]);const src=path.join(dir,'source.json'),out=path.join(dir,'candidate');await writeFile(src,bytes);
 const run=(...args)=>spawnSync(process.execPath,['scripts/normalized-migration.mjs',...args],{encoding:'utf8'});
 const prepared=run('prepare',src,out);assert.match(prepared.stdout,/NOT ACTIVATED/);assert.equal(await readFile(path.join(out,'source.json'),'utf8'),bytes);
 assert.match(run('verify',src,path.join(out,'candidate.sqlite')).stdout,/"verified": true/);
 const before=await readFile(path.join(out,'source.json'),'utf8');const refused=run('prepare',src,out);assert.match(refused.stderr,/exist/i);assert.equal(await readFile(path.join(out,'source.json'),'utf8'),before);
 const plan=migrationPlan(row),db=new DatabaseSync(path.join(out,'candidate.sqlite'));assert.equal(db.prepare('SELECT verified FROM migration_runs').get().verified,0);
 const exported=[...Object.entries(readTables(db,plan)).map(([name,rows])=>({success:true,results:rows.map(row=>({__table:name,...row}))})),{success:true,results:[]},{success:true,results:[{quick_check:'ok'}]}];db.close();
 const target=path.join(dir,'staging-rows.json'),report=path.join(dir,'report');await writeFile(target,JSON.stringify(exported));assert.match(run('verify-export',src,target,report).stdout,/"verified": true/);assert.match(await readFile(path.join(report,'activation.sql'),'utf8'),/Manual approval/);
 exported[0].results[0].id='tampered';await writeFile(target,JSON.stringify(exported));assert.match(run('verify-export',src,target,path.join(dir,'rejected')).stderr,/Missing row|Value mismatch/);
});

test('hostname-scoped normalized reads and commands isolate staff, guests and platform ownership',async()=>{
 const state=createInitialState(owner),a=state.restaurants[0],b=createRestaurant('Other');
 b.members.push({id:key(),userId:owner.id,email:owner.email,active:true,permissions:[...PERMISSIONS]});state.restaurants.push(b);
 const f=fixture(state),scope={kind:'tenant',slug:a.slug,restaurantId:a.id};
 assert.equal((await f.store.findRestaurant(a.slug)).id,a.id);assert.equal(await f.store.findRestaurant('missing'),null);
 const view=await f.store.staff(owner,null,scope);assert.equal(view.restaurant.id,a.id);assert.equal(view.platform,false);assert.deepEqual(view.platformRestaurants,[]);assert.deepEqual(view.restaurants.map(r=>r.id),[a.id]);
 await assert.rejects(f.store.staff(owner,b.id,scope),e=>e.status===403);
 await assert.rejects(f.store.guest(b.tables[0].token,null,scope),e=>e.status===404);
 await assert.rejects(f.store.command(owner,{action:'session.open',restaurantId:b.id,tableId:b.tables[1].id},scope),e=>e.status===403);
 await assert.rejects(f.store.command(owner,{action:'platform.create',name:'Denied',slug:'denied'},scope),e=>e.status===403);
 await assert.rejects(f.store.command(null,{action:'guest.call',token:b.tables[0].token,capability:'foreign-capability'},scope),e=>e.status===404);
 const publicData=await f.store.publicRestaurant(scope);assert.equal(publicData.slug,a.slug);for(const field of ['members','payments','sessions','tables','orders','audit'])assert.equal(publicData[field],undefined);
 const staffOnly={id:'ordinary',email:'ordinary@example.test'};a.members.push({id:key(),userId:staffOnly.id,email:staffOnly.email,active:true,permissions:[...PERMISSIONS]});
 const f2=fixture(state);await assert.rejects(f2.store.staff(staffOnly,null,{kind:'admin'}),e=>e.status===403);
 const admin=await f2.store.staff(owner,null,{kind:'admin'});assert.equal(admin.platform,true);assert.equal(admin.restaurant,null);assert.equal(admin.platformRestaurants.length,2);
});

test('database uniquely claims concurrent slugs atomically and rejects reserved/invalid SQL slugs',async()=>{
 const f=fixture(),scope={kind:'admin'};
 const results=await Promise.allSettled([f.store.command(owner,{action:'platform.create',name:'A',slug:'same-slug'},scope),f.store.command(owner,{action:'platform.create',name:'B',slug:'same-slug'},scope)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM restaurants WHERE slug='same-slug'").get().n,1);
 assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
 for(const slug of ['admin','api','www','UPPER','bad.name','-edge','a'.repeat(64)])assert.throws(()=>f.db.prepare('UPDATE restaurants SET slug=? WHERE id=?').run(slug,f.t.id),/CHECK/);
 assert.equal(scopeState(f.plan.state,{kind:'tenant',slug:f.t.slug,restaurantId:f.t.id}).restaurants.length,1);
});

test('normalized design drafts and publication persist per tenant with authorization and optimistic concurrency',async()=>{
 const state=createInitialState(owner),other=createRestaurant('Other');state.restaurants.push(other);const f=fixture(state),scope={kind:'admin'};
 const {DEFAULT_CONFIG}=await import('../lib/restaurant-designs/config.mjs');const config=structuredClone(DEFAULT_CONFIG);config.branding.heroTitle.en='Private draft';
 await f.store.command(owner,{action:'platform.design.save',restaurantId:f.t.id,config,expectedVersion:0},scope);
 const stored=JSON.parse(f.db.prepare('SELECT website_design_json FROM restaurants WHERE id=?').get(f.t.id).website_design_json);assert.equal(stored.draft.branding.heroTitle.en,'Private draft');assert.notEqual(stored.published.branding.heroTitle.en,'Private draft');
 assert.equal((await f.store.design(owner,f.t.id)).management.version,1);await assert.rejects(f.store.design({id:'outsider'},f.t.id),e=>e.status===403);
 const raced=await Promise.allSettled([f.store.command(owner,{action:'platform.design.publish',restaurantId:f.t.id,expectedVersion:1},scope),f.store.command(owner,{action:'platform.design.save',restaurantId:f.t.id,config,expectedVersion:1},scope)]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.equal(raced.find(r=>r.status==='rejected').reason.status,409);
 assert.equal((await f.store.design(owner,f.t.id)).management.version,2);assert.equal(f.db.prepare('SELECT website_design_json FROM restaurants WHERE id=?').get(other.id).website_design_json,null);
 const tenantScope={kind:'tenant',restaurantId:f.t.id,slug:f.t.slug};await assert.rejects(f.store.command(owner,{action:'platform.design.publish',restaurantId:f.t.id,expectedVersion:2},tenantScope),e=>e.status===403);
 const rawBefore=f.db.prepare('SELECT payload FROM app_state').get().payload;await f.store.command(owner,{action:'platform.design.revert',restaurantId:f.t.id,expectedVersion:2},scope);assert.equal(f.db.prepare('SELECT payload FROM app_state').get().payload,rawBefore);
 assert.equal((await f.store.guest(f.t.tables[0].token)).restaurant.appearance.branding.heroTitle.en,'');assert.equal((await f.store.load(f.t.id)).state.restaurants[0].orders.length,f.t.orders.length);
});
