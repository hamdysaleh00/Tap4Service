import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,createRestaurant,applyCommand,guestView,staffView} from '../lib/domain.mjs';
import {priceBill,previewTableBill} from '../lib/bill-pricing.mjs';
import {calculateSplit} from '../lib/share-calculator.mjs';
const owner={id:'billing-owner',email:'billing@example.test'},key=()=>crypto.randomUUID();
function fixture(){
 const state=createInitialState(owner),t=state.restaurants[0],table=t.tables[1];
 const run=(action,body={})=>applyCommand(state,owner,{action,restaurantId:t.id,...body});
 run('session.open',{tableId:table.id});const s=t.sessions.at(-1);
 t.menu[0].price=20000;t.menu[1].price=30000;
 run('guest.order',{token:table.token,capability:s.capability,key:key(),lines:[{itemId:t.menu[0].id,quantity:1},{itemId:t.menu[1].id,quantity:1}]});
 const rates=(taxBps,serviceBps)=>run('settings.save',{name:t.name,taxBps,serviceBps});
 const guest=()=>guestView(state,table.token,s.capability);
 return {state,t,table,s,run,rates,guest};
}
test('500 EGP applies independent tax/service, including zero and fractional percentages',()=>{
 assert.deepEqual(priceBill(50000,{taxBps:1400,serviceBps:1200}),{subtotal:50000,service:6000,tax:7000,total:63000});
 assert.deepEqual(priceBill(50000),{subtotal:50000,service:0,tax:0,total:50000});
 assert.deepEqual(priceBill(101,{taxBps:1375,serviceBps:925}),{subtotal:101,service:9,tax:14,total:124});
});
test('updating settings reprices existing guest, requested, dashboard and printed draft bills',()=>{
 const f=fixture();f.rates(1400,1200);
 assert.equal(f.guest().bill.total,63000);assert.equal(f.guest().session.taxBps,1400);
 assert.equal(staffView(f.state,owner,f.t.id).restaurant.sessions.find(s=>s.id===f.s.id).bill.total,63000);
 f.run('guest.bill',{token:f.table.token,capability:f.s.capability});f.rates(1000,500);
 assert.equal(f.guest().bill.total,57500);assert.equal(f.s.status,'BILL_REQUESTED');
 assert.equal(f.run('billing.print',{sessionId:f.s.id}).bill.total,57500);
 f.rates(0,0);assert.equal(f.guest().bill.total,50000);
});
test('pre-fix stale session rates are repaired on reads without changing stored data',()=>{
 const f=fixture();f.t.taxBps=1400;f.t.serviceBps=1200;const before=JSON.stringify(f.s);
 assert.equal(f.guest().bill.total,63000);assert.equal(f.guest().session.serviceBps,1200);
 assert.equal(JSON.stringify(f.s),before);
});
test('settings changes invalidate stale finalization and payment; finalized rates stay recorded',()=>{
 const f=fixture(),version=f.s.version;f.rates(1400,1200);
 assert.throws(()=>f.run('billing.finalize',{sessionId:f.s.id,expectedVersion:version,expectedTotal:50000}),e=>e.status===409);
 assert.throws(()=>f.run('billing.pay',{sessionId:f.s.id,key:key(),method:'cash',amount:50000,expectedTotal:50000}),e=>e.status===409);
 f.run('billing.finalize',{sessionId:f.s.id,expectedVersion:f.s.version,expectedTotal:63000});
 const recorded=structuredClone(f.s);f.rates(0,0);assert.deepEqual(f.s,recorded);
 assert.equal(f.guest().bill.total,63000);assert.equal(f.guest().session.taxBps,1400);
 assert.equal(staffView(f.state,owner,f.t.id).restaurant.sessions.find(s=>s.id===f.s.id).bill.total,63000);
 f.run('billing.pay',{sessionId:f.s.id,key:key(),method:'card',amount:63000,expectedTotal:63000});
 assert.equal(f.guest().bill.due,0);assert.equal(f.t.payments.length,1);
});
test('dashboard uses the recorded financial snapshot, including recorded adjustments',()=>{
 const f=fixture();f.s.status='FINALIZED';f.s.finalBill={subtotal:50000,service:6000,tax:7000,rounding:1,total:63001};
 assert.equal(staffView(f.state,owner,f.t.id).restaurant.sessions.find(s=>s.id===f.s.id).bill.total,63001);
 const view=f.guest(),split=calculateSplit(view.orders,view.bill,view.orders[0].lines.map((l,i)=>({id:String(i),quantities:{[view.orders[0].id+':'+l.id]:1}})));
 assert.equal(split.guests.reduce((sum,g)=>sum+g.total,0),63001);assert(split.complete);
});
test('rates stay tenant scoped and invalid or underpaid reductions fail before any settings change',()=>{
 const f=fixture(),other=createRestaurant('Independent');f.state.restaurants.push(other);const before=JSON.stringify(other);
 f.rates(1400,1200);assert.equal(JSON.stringify(other),before);
 for(const value of [-1,10001,NaN,1.5])assert.throws(()=>f.rates(value,0));
 f.run('billing.pay',{sessionId:f.s.id,key:key(),method:'cash',amount:63000,expectedTotal:63000});
 assert.throws(()=>f.rates(0,0),e=>e.status===409);assert.equal(f.t.taxBps,1400);assert.equal(f.t.serviceBps,1200);
});
test('two guests get 252 + 378 EGP, live edits reconcile, finalized shares use original charges',()=>{
 const f=fixture();f.rates(1400,1200);let view=f.guest();const order=view.orders[0];
 const guests=order.lines.map((l,i)=>({id:String(i),quantities:{[order.id+':'+l.id]:1}}));
 let split=calculateSplit(view.orders,view.bill,guests);assert.deepEqual(split.guests.map(g=>g.total),[25200,37800]);assert(split.complete);
 f.run('guest.edit',{token:f.table.token,capability:f.s.capability,orderId:order.id,version:order.version,key:key(),lines:order.lines.map((l,i)=>({id:l.id,itemId:l.itemId,quantity:i?1:2}))});
 view=f.guest();split=calculateSplit(view.orders,view.bill,guests);assert.equal(split.unassigned.total,25200);assert(!split.complete);
 guests[0].quantities[order.id+':'+order.lines[0].id]=2;
 f.run('billing.finalize',{sessionId:f.s.id,expectedVersion:f.s.version,expectedTotal:view.bill.total});f.rates(0,0);
 view=f.guest();split=calculateSplit(view.orders,view.bill,guests);assert.deepEqual(split.guests.map(g=>g.total),[50400,37800]);assert(split.complete);
 assert.equal(split.guests.reduce((sum,g)=>sum+g.total,0),view.bill.total);assert.equal(f.t.payments.length,0);
});
test('basket preview adds new items and replaces edited orders, rounding only on the table subtotal',()=>{
 const orders=[{id:'a',lines:[{quantity:1,unitPrice:1}]},{id:'b',lines:[{quantity:1,unitPrice:2}]}],rates={taxBps:1400,serviceBps:1200};
 assert.deepEqual(previewTableBill(orders,[{quantity:1,unitPrice:2}],rates),priceBill(5,rates));
 assert.deepEqual(previewTableBill(orders,[{quantity:2,unitPrice:3}],rates,'b'),priceBill(7,rates));
});
