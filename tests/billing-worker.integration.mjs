// Built Worker + temporary D1 only. Never connects to a hosted database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pollingWorker} from './helpers/polling-worker.mjs';
import {calculateSplit} from '../lib/share-calculator.mjs';
for(const backend of ['legacy','normalized'])test(`${backend}: billed rates propagate through settings, guest requests, dashboard, splits and final payment`,async()=>{
 const f=await pollingWorker(backend,{history:0,restaurants:2}),t=f.state.restaurants[0],other=f.state.restaurants[1],table=t.tables[0],session=t.sessions[0];
 const ok=async promise=>{const res=await promise;assert.equal(res.status,200,await res.clone().text());return res.json();};
 try{
  const foreignBefore=await ok(f.read('/api/updates?restaurant='+other.id));
  const url='/api/updates?table='+table.token+'&session='+session.capability;
  const before=await ok(f.read(url));
  await ok(f.command('settings.save',{name:t.name,taxBps:1400,serviceBps:1200}));
  const guest=await ok(f.read(url)),b=guest.bill;
  assert.equal(b.tax,Math.round(b.subtotal*.14));assert.equal(b.service,Math.round(b.subtotal*.12));assert.equal(b.total,b.subtotal+b.tax+b.service);
  assert.equal(guest.session.taxBps,1400);assert(guest.session.version>before.session.version);
  assert.deepEqual((await ok(f.read('/api/updates?restaurant='+other.id))).restaurant,foreignBefore.restaurant);
  const line=guest.orders[0].lines[0],lineKey=guest.orders[0].id+':'+line.id;
  const split=calculateSplit(guest.orders,b,[{id:'one',quantities:{[lineKey]:1}},{id:'two',quantities:{[lineKey]:1}}]);
  assert(split.complete);assert.equal(split.guests.reduce((sum,g)=>sum+g.total,0),b.total);
  assert.deepEqual((await ok(f.read('/api/updates?restaurant='+t.id))).restaurant.sessions.find(s=>s.id===session.id).bill,b);
  await ok(f.command('guest.bill',{token:table.token,capability:session.capability}));
  const requested=await ok(f.read(url));assert.equal(requested.session.status,'BILL_REQUESTED');assert.deepEqual(requested.bill,b);
  await ok(f.command('billing.finalize',{sessionId:session.id,expectedVersion:requested.session.version,expectedTotal:b.total}));
  await ok(f.command('settings.save',{name:t.name,taxBps:0,serviceBps:0}));
  assert.deepEqual((await ok(f.read(url))).bill,b);
  assert.deepEqual((await ok(f.read('/api/updates?restaurant='+t.id))).restaurant.sessions.find(s=>s.id===session.id).bill,b);
  await ok(f.command('billing.pay',{sessionId:session.id,key:crypto.randomUUID(),method:'cash',amount:b.total,expectedTotal:b.total}));
  const paid=await ok(f.read(url));assert.equal(paid.bill.due,0);assert.equal(paid.bill.total,b.total);
 }finally{await f.mf.dispose();}
});
