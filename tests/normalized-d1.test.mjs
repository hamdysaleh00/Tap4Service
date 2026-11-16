import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { createInitialState, createRestaurant, PERMISSIONS } from '../lib/domain.mjs';
import { migrationPlan, verifyTables } from '../lib/normalized-migration.mjs';
import { insertStatement } from '../lib/normalized-model.mjs';
import { schemaArtifacts } from '../scripts/generate-normalized-schema.mjs';
import { createNormalizedStore } from '../lib/normalized-store.mjs';

test('real local D1 batches isolate tenants, retry CAS conflicts and roll back failed writes',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("local test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');
  for(const sql of schemaArtifacts().sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const owner={id:'owner',email:'owner@example.test'},state=createInitialState(owner),other=createRestaurant('Other');
  other.members.push({id:crypto.randomUUID(),userId:owner.id,email:owner.email,permissions:[...PERMISSIONS],active:true});state.restaurants.push(other);
  const plan=migrationPlan({id:'main',revision:1,payload:JSON.stringify(state)});
  const inserts=Object.entries(plan.tables).flatMap(([table,rows])=>rows.map(row=>insertStatement(table,row)));
  for(let i=0;i<inserts.length;i+=40)await db.batch(inserts.slice(i,i+40).map(s=>db.prepare(s.sql).bind(...s.params)));
  const names=Object.keys(plan.tables),exported=await db.batch(names.map(t=>db.prepare(`SELECT * FROM ${t}${t==='restaurants'?' ORDER BY position,id':''}`)));
  assert(verifyTables(plan,Object.fromEntries(names.map((name,i)=>[name,exported[i].results]))).verified);
  assert.equal((await db.prepare('PRAGMA quick_check').first()).quick_check,'ok');
  await db.prepare('UPDATE migration_runs SET verified=1').run();
  const store=createNormalizedStore(db),t=state.restaurants[0];
  await Promise.all([store.command(owner,{action:'menu.availability',restaurantId:t.id,itemId:t.menu[0].id,available:false}),store.command(owner,{action:'menu.availability',restaurantId:t.id,itemId:t.menu[1].id,available:false}),store.command(owner,{action:'settings.save',restaurantId:other.id,name:'Changed',taxBps:0,serviceBps:0})]);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM menu_items WHERE available=0').first()).n,2);
  assert.equal((await db.prepare('SELECT revision FROM restaurants WHERE id=?').bind(t.id).first()).revision,2);
  assert.equal((await db.prepare('SELECT name FROM restaurants WHERE id=?').bind(other.id).first()).name,'Changed');
  const table=t.tables[1],opens=await Promise.allSettled([store.command(owner,{action:'session.open',restaurantId:t.id,tableId:table.id}),store.command(owner,{action:'session.open',restaurantId:t.id,tableId:table.id})]);assert.equal(opens.filter(r=>r.status==='fulfilled').length,1);
  const v=await store.guest(table.token),order={action:'guest.order',token:table.token,capability:v.session.capability,key:crypto.randomUUID(),lines:[{itemId:t.menu[2].id,quantity:1}]};
  const ordered=await Promise.all([store.command(null,order),store.command(null,order)]);assert.equal(ordered[0].id,ordered[1].id);
  const b=await store.guest(table.token),pay={action:'billing.pay',restaurantId:t.id,sessionId:b.session.id,expectedTotal:b.bill.total,amount:b.bill.due,key:crypto.randomUUID(),method:'cash'};
  await Promise.all([store.command(owner,pay),store.command(owner,pay)]);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM payments').first()).n,1);
  const before=await db.prepare('SELECT revision FROM restaurants WHERE id=?').bind(t.id).first();
  await assert.rejects(db.batch([db.prepare('UPDATE restaurants SET revision=revision+1 WHERE id=?').bind(t.id),db.prepare('UPDATE menu_items SET price=-1 WHERE restaurant_id=?').bind(t.id)]));
  assert.equal((await db.prepare('SELECT revision FROM restaurants WHERE id=?').bind(t.id).first()).revision,before.revision);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM commit_guards').first()).n,0);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 }finally{await mf.dispose();}
});
