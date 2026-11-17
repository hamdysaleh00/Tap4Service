import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSplit,calculatorLines,normalizeGuests,changeQuantity} from '../lib/share-calculator.mjs';
import {createInitialState,applyCommand,guestView,bill} from '../lib/domain.mjs';
const orders=[{id:'o',lines:[{id:'a',quantity:3,unitPrice:1}]}];
const guests=[1,2,3].map(id=>({id:String(id),quantities:{'o:a':1}}));
function reconciles(result){
 const parts=[...result.guests,result.unassigned];
 for(const key of ['subtotal','discount','tax','service','rounding','total'])assert.equal(parts.reduce((s,g)=>s+g[key],0),result.bill[key],key);
 for(const g of parts){assert.equal(g.total,g.subtotal-g.discount+g.tax+g.service+g.rounding);assert(g.total>=0);assert(Number.isSafeInteger(g.total))}
}
test('three guests split the same line and preserve every tax/service piastre',()=>{
 const b={subtotal:3,tax:1,service:1,total:5},result=calculateSplit(orders,b,guests);
 assert.deepEqual(result.guests.map(g=>g.total),[3,1,1]);assert(result.complete);reconciles(result);
 assert.deepEqual(calculateSplit(orders,b,guests),result,'Allocation is deterministic');
});
test('partial plan includes unassigned amounts, empty guests cost zero',()=>{
 const result=calculateSplit(orders,{subtotal:3,tax:1,service:1,total:5},[{id:'a',quantities:{'o:a':1}},{id:'b',quantities:{}}]);
 assert.equal(result.guests[1].total,0);assert.equal(result.unassigned.total,4);assert.equal(result.complete,false);reconciles(result);
});
test('actual discount and signed rounding adjustments reconcile without negative shares',()=>{
 for(const rounding of [-1,0,1]){
  const result=calculateSplit(orders,{subtotal:3,discount:1,tax:1,service:1,rounding,total:4+rounding},guests);reconciles(result);assert(result.complete);
 }
 // Discount remainder and negative rounding must not double-debit the first guest.
 reconciles(calculateSplit(orders,{subtotal:3,discount:2,rounding:-1,total:0},guests));
 const inferred=calculateSplit(orders,{subtotal:3,total:2},guests);assert.equal(inferred.bill.rounding,-1);reconciles(inferred);
});
test('group quantity limits, changes, removal, malformed selections and input immutability',()=>{
 const lines=calculatorLines(orders),input=[{id:'a',quantities:{'o:a':2}},{id:'b',quantities:{'o:a':8}}],before=JSON.stringify({input,orders});
 let plan=normalizeGuests(lines,input);assert.deepEqual(plan.map(g=>g.quantities['o:a']),[2,1]);
 plan=changeQuantity(lines,plan,'b','o:a',1);assert.equal(plan[1].quantities['o:a'],1);
 plan=changeQuantity(lines,plan,'a','o:a',-1);plan=changeQuantity(lines,plan,'b','o:a',1);assert.deepEqual(plan.map(g=>g.quantities['o:a']),[1,2]);
 assert.equal(JSON.stringify({input,orders}),before);
 assert.deepEqual(normalizeGuests(lines,[{id:'x',quantities:{'o:a':NaN,removed:8}}])[0].quantities,{'o:a':0});
 assert.deepEqual(normalizeGuests([{...lines[0],quantity:1}],plan).map(g=>g.quantities['o:a']),[1,0]);
 assert.deepEqual(normalizeGuests([],plan).map(g=>g.quantities),[{},{}]);
 assert.equal(changeQuantity(lines,plan,'missing','o:a',1).length,2);
 assert.deepEqual(changeQuantity(lines,plan,'a','o:a',NaN),plan);
});
test('zero-priced and empty orders do not divide by zero or drop fixed charges',()=>{
 const free=[{id:'f',lines:[{id:'a',unitPrice:0,quantity:2}]}];
 const r=calculateSplit(free,{subtotal:0,service:1,tax:0,total:1},[{id:'a',quantities:{'f:a':1}},{id:'b',quantities:{'f:a':1}}]);reconciles(r);assert(r.complete);
 const empty=calculateSplit([],{subtotal:0,tax:0,service:0,total:0},[{id:'a',quantities:{}}]);reconciles(empty);assert(empty.complete);
 const fee=calculateSplit([],{subtotal:0,service:1,total:1},[]);reconciles(fee);assert.equal(fee.unassigned.total,1);assert.equal(fee.complete,false);
});
test('large integer snapshots preserve fractional-cent proportions without per-piastre loops',()=>{
 const large=[{id:'o',lines:[{id:'a',unitPrice:99999999,quantity:10000}]}],subtotal=999999990000;
 const r=calculateSplit(large,{subtotal,tax:139999998600,service:119999998800,total:1259999987400},[{id:'a',quantities:{'o:a':3333}},{id:'b',quantities:{'o:a':3333}},{id:'c',quantities:{'o:a':3334}}]);reconciles(r);assert(r.complete);
});
test('inconsistent, missing or unsafe bill snapshots are rejected',()=>{
 for(const b of [null,{subtotal:2},{subtotal:3,tax:0.1},{subtotal:3,discount:4},{subtotal:3,total:4,rounding:2},{subtotal:3,total:-1},{subtotal:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>calculateSplit(orders,b,guests),/bill/);
});
test('restaurant session charges and modifier snapshots are reused; recorded payments do not alter shares',()=>{
 const owner={id:'owner',email:'owner@test.test'},state=createInitialState(owner),t=state.restaurants[0],table=t.tables[1];
 const run=(action,body={})=>applyCommand(state,owner,{action,restaurantId:t.id,...body});
 run('settings.save',{name:t.name,taxBps:1375,serviceBps:925});run('session.open',{tableId:table.id});const s=t.sessions.at(-1),item=t.menu.find(m=>m.modifiers.length);
 run('guest.order',{token:table.token,capability:s.capability,key:crypto.randomUUID(),lines:[{itemId:item.id,quantity:3,modifierIds:[item.modifiers[0].id]}]});
 run('billing.finalize',{sessionId:s.id,expectedVersion:s.version,expectedTotal:bill(t,s).total});
 run('settings.save',{name:t.name,taxBps:0,serviceBps:0});item.price+=10000;item.available=false;
 const view=guestView(state,table.token),line=view.orders[0].lines[0];assert.equal(view.bill.tax,Math.round(view.bill.subtotal*1375/10000));assert.equal(view.bill.service,Math.round(view.bill.subtotal*925/10000));
 const result=calculateSplit(view.orders,{...view.bill,paid:1,due:view.bill.total-1},[1,2,3].map(id=>({id:String(id),quantities:{[view.orders[0].id+':'+line.id]:1}})));reconciles(result);assert(result.complete);assert.equal(result.bill.total,view.bill.total);
});
test('many partial plans reconcile each component, including discounts and rounding',()=>{
 for(let quantity=1;quantity<=9;quantity++)for(let price=0;price<=5;price++)for(const rounding of [-1,0,1]){
  const subtotal=quantity*price,discount=Math.floor(subtotal/3),tax=subtotal?Math.ceil(subtotal/7):0,service=subtotal?Math.ceil(subtotal/5):0,before=subtotal-discount+tax+service;
  if(before+rounding<0)continue;
  const fixture=[{id:'o',lines:[{id:'a',quantity,unitPrice:price}]}];
  for(let allocated=0;allocated<=quantity;allocated++)reconciles(calculateSplit(fixture,{subtotal,discount,tax,service,rounding,total:before+rounding},Array.from({length:allocated},(_,i)=>({id:String(i),quantities:{'o:a':1}}))));
 }
});
