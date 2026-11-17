import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {createInitialState,createRestaurant,PERMISSIONS} from '../lib/domain.mjs';
import {migrationPlan} from '../lib/normalized-migration.mjs';
import {insertStatement} from '../lib/normalized-model.mjs';
import {schemaArtifacts} from '../scripts/generate-normalized-schema.mjs';
import {createNormalizedStore} from '../lib/normalized-store.mjs';
import {createUpdatesRepository} from '../lib/updates-repository.mjs';
const owner={id:'d1-pos-owner',email:'d1@pos.test'},key=()=>crypto.randomUUID();
test('real D1 POS batches deduplicate orders/payments/refunds, serialize adjustments and retain immutable history',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("POS local test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');for(const sql of schemaArtifacts().sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const state=createInitialState(owner),t=state.restaurants[0],other=createRestaurant('Other POS');other.members.push({...t.members[0],id:key(),permissions:[...PERMISSIONS]});state.restaurants.push(other);
  const plan=migrationPlan({id:'main',revision:0,payload:JSON.stringify(state)}),inserts=Object.entries(plan.tables).flatMap(([table,rows])=>rows.map(row=>insertStatement(table,row)));
  for(let i=0;i<inserts.length;i+=40)await db.batch(inserts.slice(i,i+40).map(s=>db.prepare(s.sql).bind(...s.params)));await db.prepare('UPDATE migration_runs SET verified=1').run();
  const store=createNormalizedStore(db),run=(action,b={},user=owner)=>store.command(user,{action,restaurantId:t.id,...b}),table=t.tables[1];
  const creation={tableId:table.id,key:key(),lines:[{itemId:t.menu[0].id,quantity:2}]};
  const ordered=await Promise.all([run('cashier.order',creation),run('cashier.order',creation)]);assert.equal(ordered[0].id,ordered[1].id);
  let view=await store.guest(table.token);assert.equal(view.orders.length,1);
  const sessionId=view.session.id,order=view.orders[0];
  const race=await Promise.allSettled([run('cashier.edit',{sessionId,orderId:order.id,version:order.version,expectedVersion:view.session.version,key:key(),lines:[{id:order.lines[0].id,itemId:order.lines[0].itemId,quantity:3}]}),run('order.status',{orderId:order.id,version:order.version,status:'PREPARING'})]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  await run('shift.open',{openingCash:10000,key:key()});view=await store.guest(table.token);
  const discount={sessionId,expectedVersion:view.session.version,kind:'percent',value:1000,reason:'Manager promotion',key:key()};
  await Promise.all([run('billing.discount',discount),run('billing.discount',discount)]);view=await store.guest(table.token);
  const cancelled=await Promise.allSettled([run('cashier.cancel',{sessionId,orderId:order.id,version:view.orders[0].version,expectedVersion:view.session.version,reason:'Wrong dish',key:key()}),run('billing.finalize',{sessionId,expectedVersion:view.session.version,expectedTotal:view.bill.total})]);assert.equal(cancelled.filter(r=>r.status==='fulfilled').length,1);
  view=await store.guest(table.token);
  // Use a second bill for payment/refund contention, independent of who won.
  const second=await run('cashier.order',{tableId:t.tables[3].id,key:key(),lines:[{itemId:t.menu[1].id,quantity:3}]});let v=await store.guest(t.tables[3].token);
  await run('billing.finalize',{sessionId:second.sessionId,expectedVersion:v.session.version,expectedTotal:v.bill.total});v=await store.guest(t.tables[3].token);
  const pay={sessionId:second.sessionId,expectedTotal:v.bill.total,expectedDue:v.bill.due,amount:v.bill.due,method:'cash',key:key()};const payments=await Promise.all([run('billing.pay',pay),run('billing.pay',pay)]);assert.equal(payments[0].id,payments[1].id);
  v=await store.guest(t.tables[3].token);const refund={sessionId:second.sessionId,paymentId:payments[0].id,expectedVersion:v.session.version,amount:10000,reason:'Meal returned',key:key()};
  await Promise.all([run('billing.refund',refund),run('billing.refund',refund)]);
  v=await store.guest(t.tables[3].token);const excessive=await Promise.allSettled([run('billing.refund',{...refund,expectedVersion:v.session.version,amount:30000,key:key()}),run('billing.refund',{...refund,expectedVersion:v.session.version,amount:30000,key:key()})]);assert.equal(excessive.filter(r=>r.status==='fulfilled').length,1);
  const loaded=(await store.load(t.id)).state.restaurants[0],s=loaded.sessions.find(s=>s.id===second.sessionId);assert.equal(loaded.pos.refunds.length,2);assert.equal(loaded.payments.length,1);assert.equal(loaded.pos.credits.length,2);assert.equal(s.finalBill.total,43500);
  const updated=await createUpdatesRepository(db,{backend:'normalized'}).read({user:owner,restaurantId:t.id});assert.equal(updated.data.restaurant.pos.shifts[0].expectedCash,13500);
  await run('session.close',{sessionId:second.sessionId});await run('order.status',{orderId:second.id,version:1,status:'PREPARING'});await run('order.status',{orderId:second.id,version:2,status:'READY'});await run('order.status',{orderId:second.id,version:3,status:'SERVED'});
  const polled=await createUpdatesRepository(db,{backend:'normalized'}).read({user:owner,restaurantId:t.id});assert.equal(polled.data.restaurant.pos.shifts[0].expectedCash,13500);assert(!polled.data.restaurant.payments.some(p=>p.id===payments[0].id));
  const before=JSON.stringify((await store.load(other.id)).state.restaurants[0]);await assert.rejects(run('billing.refund',{...refund,restaurantId:other.id,key:key()}));assert.equal(JSON.stringify((await store.load(other.id)).state.restaurants[0]),before);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);assert.equal((await db.prepare('SELECT COUNT(*) n FROM commit_guards').first()).n,0);
 }finally{await mf.dispose();}
});
