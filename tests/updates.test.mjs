import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createInitialState,createRestaurant,applyCommand,staffView,guestView } from '../lib/domain.mjs';
import { migrationPlan } from '../lib/normalized-migration.mjs';
import { applyPlan } from '../scripts/normalized-migration.mjs';
import { createNormalizedStore } from '../lib/normalized-store.mjs';
import { createUpdatesRepository,PAGE_SIZE } from '../lib/updates-repository.mjs';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
const owner={id:'owner',email:'owner@example.test',name:'Owner'},key=()=>crypto.randomUUID();
function historical(t,count=120){for(let i=0;i<count;i++){
 const at='2020-01-01T00:00:00.000Z',id=key();t.sessions.push({id,tableId:t.tables[0].id,status:'FINALIZED',version:3,openedAt:at,openedBy:'Owner',releasedAt:at,closedAt:at,capability:'',taxBps:0,serviceBps:0,finalBill:{subtotal:100,service:0,tax:0,total:100}});
 t.orders.push({id:key(),number:t.orders.length+1,sessionId:id,status:'SERVED',version:4,createdAt:at,updatedAt:at,key:key(),lines:[{id:key(),itemId:t.menu[0].id,name:'Historical snapshot',quantity:1,unitPrice:100,basePrice:100,notes:'',modifiers:[]}]});t.payments.push({id:key(),sessionId:id,amount:100,method:'cash',by:'Owner',createdAt:at,key:key()});
 }return t;}
function fixture(backend='legacy',state=createInitialState(owner)){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE app_state(id TEXT PRIMARY KEY,revision INTEGER,payload TEXT)');db.prepare("INSERT INTO app_state VALUES('main',0,?)").run(JSON.stringify(state));
 if(backend==='normalized'){applyPlan(db,migrationPlan({id:'main',revision:0,payload:JSON.stringify(state)}));db.exec('UPDATE migration_runs SET verified=1');}
 const adapter=sqliteD1(db),repository=createUpdatesRepository(adapter,{backend}),t=state.restaurants[0],scope={kind:'tenant',restaurantId:t.id,slug:t.slug,base:'tap2serve.com',origin:`https://${t.slug}.tap2serve.com`};
 const read=extra=>repository.read({user:owner,scope,...extra});
 const command=async(action,body={})=>{if(backend==='normalized')return createNormalizedStore(adapter).command(owner,{action,restaurantId:t.id,...body});const row=db.prepare("SELECT revision,payload FROM app_state WHERE id='main'").get(),next=JSON.parse(row.payload),result=applyCommand(next,owner,{action,restaurantId:t.id,...body});db.prepare("UPDATE app_state SET payload=?,revision=revision+1 WHERE id='main'").run(JSON.stringify(next));return result;};
 return {backend,db,repository,adapter,state,t,scope,read,command};
}
for(const backend of ['legacy','normalized']){
 test(`${backend}: settings persist live rates, invalidate guest polls and preserve finalized bill history`,async()=>{
  const f=fixture(backend),s=f.t.sessions[0],table=f.t.tables[0];
  try{
   const initial=await f.read({user:null,token:table.token,capability:s.capability});
   await f.command('settings.save',{name:f.t.name,taxBps:1400,serviceBps:1200});
   const guest=await f.read({user:null,token:table.token,capability:s.capability,etag:initial.etag});
   assert(!guest.unchanged);assert.equal(guest.data.session.taxBps,1400);
   const b=guest.data.bill;assert.equal(b.total,b.subtotal+Math.round(b.subtotal*.14)+Math.round(b.subtotal*.12));
   const staff=await f.read();assert.deepEqual(staff.data.restaurant.sessions.find(x=>x.id===s.id).bill,b);
   await assert.rejects(f.command('billing.finalize',{sessionId:s.id,expectedVersion:initial.data.session.version,expectedTotal:initial.data.bill.total}),e=>e.status===409);
   await f.command('billing.finalize',{sessionId:s.id,expectedVersion:guest.data.session.version,expectedTotal:b.total});
   await f.command('settings.save',{name:f.t.name,taxBps:0,serviceBps:0});
   assert.deepEqual((await f.read({user:null,token:table.token})).data.bill,b);
   assert.deepEqual((await f.read()).data.restaurant.sessions.find(x=>x.id===s.id).bill,b);
  }finally{f.db.close();}
 });
 test(`${backend}: bootstrap returns operational state with exact bill totals; unchanged polls use the metadata fast path`,async()=>{
  const state=createInitialState(owner);historical(state.restaurants[0]);const f=fixture(backend,state),result=await f.read(),data=result.data;
  assert.equal(data.restaurant.sessions.length,4);assert.equal(data.restaurant.orders.length,4);assert.equal(data.restaurant.payments.length,0);
  const expected=staffView(state,owner,f.t.id);for(const s of data.restaurant.sessions)assert.deepEqual(s.bill,expected.restaurant.sessions.find(x=>x.id===s.id).bill);
  assert.equal(result.metrics.rowsWritten,0);const unchanged=await f.read({etag:result.etag});assert(unchanged.unchanged);assert.equal(unchanged.metrics.queries,1);assert(!unchanged.data);
  await f.command('menu.availability',{itemId:f.t.menu[0].id,available:false});assert.notEqual((await f.read({etag:result.etag})).etag,result.etag);
 });
 test(`${backend}: history pages retain all previous bills and old pending orders never age out`,async()=>{
  const state=createInitialState(owner),t=historical(state.restaurants[0]);t.orders[4].status='PENDING';const f=fixture(backend,state),live=await f.read();assert(live.data.restaurant.orders.some(o=>o.id===t.orders[4].id));
  const collected=new Set();let cursor=null;
  do{const result=await f.read({view:'history',cursor});assert(result.data.restaurant.sessions.length<=PAGE_SIZE+5);for(const s of result.data.restaurant.sessions)if(s.releasedAt)collected.add(s.id);cursor=result.data.sync.nextCursor;}while(cursor);
  assert.equal(collected.size,120);
  const latest=await f.read({view:'history'});await f.command('order.status',{orderId:t.orders[4].id,version:t.orders[4].version,status:'PREPARING'});const refreshed=await f.read({view:'history',etag:latest.etag});assert(refreshed.data.restaurant.orders.some(o=>o.id===t.orders[4].id&&o.status==='PREPARING'));
 });
 test(`${backend}: tenant changes are isolated, guessed IDs and unauthorized platform snapshots are rejected`,async()=>{
  const state=createInitialState(owner),other=createRestaurant('Other');other.members.push({...state.restaurants[0].members[0],id:key()});state.restaurants.push(other);const f=fixture(backend,state),before=await f.read();
  await f.command('settings.save',{restaurantId:other.id,name:'Changed other',taxBps:0,serviceBps:0});assert((await f.read({etag:before.etag})).unchanged);
  await assert.rejects(f.read({restaurantId:other.id}),e=>e.status===403);await assert.rejects(f.read({view:'platform'}),e=>e.status===403);await assert.rejects(f.repository.read({user:{id:'outsider',email:'outsider@example.test'},scope:f.scope}),e=>e.status===403);
 });
 test(`${backend}: guest reads only the current session, preserve bill snapshots and revoke previous capabilities`,async()=>{
  const state=createInitialState(owner);historical(state.restaurants[0]);const f=fixture(backend,state),table=f.t.tables[0],cap=f.t.sessions[0].capability;
  const result=await f.read({user:null,token:table.token,capability:cap});assert.deepEqual({...result.data,sync:undefined,revision:undefined},{...guestView(state,table.token,cap),sync:undefined,revision:undefined});
  const expired=await f.read({user:null,token:table.token,capability:'old-capability',etag:result.etag});assert.equal(expired.data.session,null);assert.deepEqual(expired.data.orders,[]);assert.notEqual(expired.etag,result.etag);
 });
 test(`${backend}: feedback and resolved requests are paged on demand; permission changes invalidate cached access`,async()=>{
  const state=createInitialState(owner),t=state.restaurants[0],s=t.sessions[0];for(let i=0;i<90;i++){t.feedback.push({id:key(),sessionId:s.id,tableId:s.tableId,key:key(),rating:5,comment:'Private',createdAt:s.openedAt});t.requests.push({id:key(),sessionId:s.id,tableId:s.tableId,kind:'staff',status:'resolved',createdAt:s.openedAt});}
  const f=fixture(backend,state),live=await f.read();assert.deepEqual(live.data.restaurant.feedback,[]);assert.deepEqual(live.data.restaurant.requests,[]);const feedback=await f.read({view:'feedback'});assert.equal(feedback.data.restaurant.feedback.length,50);assert(feedback.data.sync.hasMore);const service=await f.read({view:'service'});assert.equal(service.data.restaurant.requests.length,50);
 });
}
