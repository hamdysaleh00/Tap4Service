// Real built Worker routing/auth/validation + disposable D1, in both adapters.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pollingWorker} from './helpers/polling-worker.mjs';
const key=()=>crypto.randomUUID();
for(const backend of ['legacy','normalized'])test(`${backend}: POS HTTP commands synchronize guest bills, adjustments, drawer counts and handovers`,async()=>{
 const f=await pollingWorker(backend,{history:0,restaurants:2}),t=f.state.restaurants[0],table=t.tables[1];
 const ok=async p=>{const r=await p;assert.equal(r.status,200,await r.clone().text());return r.json();};
 const staff=()=>ok(f.read('/api/state?restaurant='+t.id)),guest=()=>ok(f.read('/api/state?table='+table.token));
 try{
  const foreignBefore=(await ok(f.read('/api/state?restaurant='+f.state.restaurants[1].id))).restaurant;
  const shift=await ok(f.command('shift.open',{openingCash:10000,key:key()}));
  const order={tableId:table.id,key:key(),lines:[{itemId:t.menu[0].id,quantity:2,notes:'POS HTTP fixture'}]};
  const pair=await Promise.all([ok(f.command('cashier.order',order)),ok(f.command('cashier.order',order))]);assert.equal(pair[0].id,pair[1].id);
  let g=await guest(),s=g.session,o=g.orders[0];assert.equal(g.orders.length,1);
  await ok(f.command('cashier.edit',{sessionId:s.id,orderId:o.id,version:o.version,expectedVersion:s.version,lines:[{id:o.lines[0].id,itemId:o.lines[0].itemId,quantity:3}],key:key()}));
  g=await guest();assert.equal(g.orders[0].lines[0].quantity,3);
  await ok(f.command('billing.discount',{sessionId:s.id,expectedVersion:g.session.version,kind:'percent',value:1000,reason:'Manager promotion',key:key()}));
  g=await guest();assert(g.bill.discount>0);assert.equal((await staff()).restaurant.sessions.find(x=>x.id===s.id).bill.total,g.bill.total);
  const stale=await f.command('billing.discount',{sessionId:s.id,expectedVersion:s.version,kind:'fixed',value:100,reason:'Stale discount',key:key()});assert.equal(stale.status,409);
  await ok(f.command('billing.finalize',{sessionId:s.id,expectedVersion:g.session.version,expectedTotal:g.bill.total}));
  const first=await ok(f.command('billing.pay',{sessionId:s.id,method:'cash',amount:10000,expectedTotal:g.bill.total,expectedDue:g.bill.due,key:key()}));
  g=await guest();const card=await ok(f.command('billing.pay',{sessionId:s.id,method:'card',amount:g.bill.due,expectedTotal:g.bill.total,expectedDue:g.bill.due,key:key()}));
  g=await guest();assert.equal(g.bill.due,0);
  assert.equal((await f.command('billing.refund',{sessionId:s.id,paymentId:card.id,expectedVersion:g.session.version,amount:100,reason:'No external confirmation',key:key()})).status,400);
  const refund={sessionId:s.id,paymentId:first.id,expectedVersion:g.session.version,amount:5000,reason:'Meal return',key:key()};
  await Promise.all([ok(f.command('billing.refund',refund)),ok(f.command('billing.refund',refund))]);
  g=await guest();assert.equal(g.bill.refunded,5000);assert.equal(g.bill.credits,5000);assert.equal(g.bill.due,0);
  await ok(f.command('billing.refund',{sessionId:s.id,paymentId:card.id,expectedVersion:g.session.version,amount:1000,reason:'External refund completed',externalConfirmed:true,externalReference:'terminal-return-1',key:key()}));
  g=await guest();assert.equal(g.bill.refunded,6000);assert.equal(g.bill.credits,6000);
  assert.equal((await f.command('billing.refund',{sessionId:s.id,paymentId:card.id,expectedVersion:g.session.version,amount:1000,reason:'Duplicate reference',externalConfirmed:true,externalReference:'terminal-return-1',key:key()})).status,409);
  const updated=await ok(f.read('/api/updates?restaurant='+t.id));assert.equal(updated.restaurant.pos.shifts[0].expectedCash,15000);assert.equal(updated.restaurant.pos.refunds.length,2);
  const report=await ok(f.command('finance.report',{}));assert.equal(report.refunds,6000);assert.equal(report.collections,g.bill.total);
  const close=await ok(f.command('shift.close',{shiftId:shift.id,actualCash:14900,reason:'Counted end of shift',key:key()}));assert.equal(close.discrepancy,-100);
  assert.equal((await f.command('billing.refund',{sessionId:s.id,paymentId:first.id,expectedVersion:g.session.version,amount:1,reason:'Closed drawer',key:key()})).status,409);
  const member=(await staff()).restaurant.members[0];
  await ok(f.command('staff.save',{email:'incoming@http.test',name:'Incoming',permissions:['shifts.manage'],role:'cashier',active:true}));
  const recipient=(await staff()).restaurant.members.find(m=>m.email==='incoming@http.test');
  const h=await ok(f.command('handover.declare',{shiftId:shift.id,toMemberId:recipient.id,amount:14900,reason:'Shift transfer',key:key()}));
  assert.equal((await f.command('handover.confirm',{handoverId:h.id,receivedCash:14900,reason:'Cannot self confirm',key:key()})).status,403);
  assert.equal((await staff()).restaurant.pos.handovers[0].fromMemberId,member.id);
  const incomingAuth={'oai-authenticated-user-id':'incoming-http','oai-authenticated-user-email':recipient.email};
  await ok(f.mf.dispatchFetch('http://localhost/api/state?restaurant='+t.id,{headers:incomingAuth}));
  const confirmation={action:'handover.confirm',restaurantId:t.id,handoverId:h.id,receivedCash:14800,reason:'Counted transfer shortage',key:key()};
  const confirm=()=>f.mf.dispatchFetch('http://localhost/api/command',{method:'POST',headers:{...incomingAuth,Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify(confirmation)});
  const confirmed=await Promise.all([ok(confirm()),ok(confirm())]);assert.equal(confirmed[0].id,confirmed[1].id);
  const handed=(await staff()).restaurant.pos;assert.equal(handed.handovers[0].discrepancy,-100);assert.equal(handed.shifts.find(x=>x.id===confirmed[0].id).openingCash,14800);
  await ok(f.command('shift.move',{shiftId:confirmed[0].id,kind:'in',amount:1000,reason:'Manager delivered change',key:key()}));
  assert.equal((await staff()).restaurant.pos.shifts.find(x=>x.id===confirmed[0].id).expectedCash,15800);
  assert.deepEqual((await ok(f.read('/api/state?restaurant='+f.state.restaurants[1].id))).restaurant,foreignBefore);
  // New POS actions must pass the existing HTTP auth boundary as well.
  const unauth=await f.mf.dispatchFetch('http://localhost/api/command',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost'},body:JSON.stringify({action:'finance.report',restaurantId:t.id})});assert.equal(unauth.status,401);
 }finally{await f.mf.dispose();}
});
