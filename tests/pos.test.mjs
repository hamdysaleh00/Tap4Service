import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,createRestaurant,applyCommand,guestView,staffView,bill,PERMISSIONS} from '../lib/domain.mjs';
import {ROLE_PERMISSIONS,financialReport,shiftSummary} from '../lib/pos-domain.mjs';
import {calculateSplit} from '../lib/share-calculator.mjs';
import {previewTableBill,roundedRatio} from '../lib/bill-pricing.mjs';
const owner={id:'pos-owner',email:'owner@pos.test',name:'Owner'},key=()=>crypto.randomUUID();
function fixture(){
 const state=createInitialState(owner),t=state.restaurants[0],table=t.tables[1];
 const run=(action,b={},user=owner)=>applyCommand(state,user,{action,restaurantId:t.id,...b});
 const ordered=run('cashier.order',{tableId:table.id,key:key(),lines:[{itemId:t.menu[0].id,quantity:2,modifierIds:[t.menu[0].modifiers[0].id],notes:'No onions'},{itemId:t.menu[1].id,quantity:1}]});
 const s=t.sessions.find(s=>s.id===ordered.sessionId),o=t.orders.find(o=>o.id===ordered.id);
 const cmd=(action,b={},user=owner)=>run(action,{sessionId:s.id,expectedVersion:s.version,version:o.version,orderId:o.id,key:key(),...b},user);
 const finalize=()=>run('billing.finalize',{sessionId:s.id,expectedVersion:s.version,expectedTotal:bill(t,s).total});
 const pay=(method,amount= bill(t,s).due)=>run('billing.pay',{sessionId:s.id,method,amount,key:key(),expectedDue:bill(t,s).due,expectedTotal:bill(t,s).total});
 const open=()=>run('shift.open',{openingCash:10000,key:key()});
 return {state,t,table,s,o,run,cmd,finalize,pay,open};
}
test('cashier creates or reuses a table, retains modifiers, and synchronizes guests and kitchen',()=>{
 const f=fixture(),guest=()=>guestView(f.state,f.table.token,f.s.capability);
 assert.equal(guest().orders[0].lines[0].notes,'No onions');assert.equal(guest().orders[0].lines[0].unitPrice,27000);
 f.cmd('cashier.edit',{lines:[{id:f.o.lines[0].id,itemId:f.o.lines[0].itemId,quantity:3,notes:'Extra hot',modifierIds:[]}]});
 assert.equal(guest().orders[0].lines[0].quantity,3);assert.equal(guest().orders[0].lines[0].notes,'Extra hot');
 f.run('cashier.order',{tableId:f.table.id,sessionId:f.s.id,key:key(),lines:[{itemId:f.t.menu[1].id,quantity:1}]});
 assert.equal(guest().orders.length,2);assert.equal(f.t.sessions.filter(s=>s.tableId===f.table.id).length,1);
 assert(f.t.pos.events.some(e=>e.action==='cashier.edit'&&e.before.length===2));
 f.run('order.status',{orderId:f.o.id,version:f.o.version,status:'PREPARING'});
 assert.throws(()=>f.cmd('cashier.edit',{lines:[{itemId:f.t.menu[0].id,quantity:1}]}),e=>e.status===409);
});
test('POS idempotency rejects different payloads and actors, stale revisions, and shared payment keys',()=>{
 const f=fixture(),b={tableId:f.table.id,key:key(),lines:[{itemId:f.t.menu[1].id,quantity:1}]};
 assert.deepEqual(f.run('cashier.order',b),f.run('cashier.order',b));
 assert.throws(()=>f.run('cashier.order',{...b,lines:[{itemId:f.t.menu[1].id,quantity:2}]}),e=>e.status===409);
 assert.throws(()=>f.cmd('cashier.cancel',{expectedVersion:f.s.version-1,reason:'Wrong item'}),e=>e.status===409);
 f.pay('cash',100);const p=f.t.payments.at(-1);
 assert.throws(()=>f.cmd('cashier.edit',{lines:[{itemId:f.t.menu[0].id,quantity:10}]}),/refund/);
 assert.throws(()=>f.run('guest.edit',{token:f.table.token,capability:f.s.capability,orderId:f.o.id,version:f.o.version,key:key(),lines:[{itemId:f.t.menu[0].id,quantity:10}]}),/Ask staff/);
 assert.throws(()=>f.run('cashier.order',{...b,key:p.key}),e=>e.status===409);
});
test('item and entire-order cancellations preserve evidence, notify kitchen, and reopen only unpaid unprepared orders',()=>{
 const f=fixture(),first=f.o.lines[0].id;
 f.cmd('cashier.cancel',{lineIds:[first],reason:'Guest changed mind'});
 assert.equal(f.o.lines[0].cancelledQuantity,2);assert.equal(f.o.lines.length,2);assert.equal(guestView(f.state,f.table.token).orders[0].lines.length,1);assert.equal(guestView(f.state,f.table.token).orders[0].adjusted,true);
 assert.equal(bill(f.t,f.s).subtotal,14500);
 f.cmd('cashier.cancel',{reason:'Guest left'});assert(f.o.cancelledAt);assert.equal(bill(f.t,f.s).total,0);
 f.cmd('cashier.reopen',{reason:'Guest returned'});assert(!f.o.cancelledAt);assert.equal(bill(f.t,f.s).total,68500);
 f.pay('cash',100);assert.throws(()=>f.cmd('cashier.cancel',{reason:'Wrong order'}),/refund/);
 assert(f.t.pos.events.some(e=>e.notification==='Kitchen cancellation'));
});
test('prepared item voids require actual manager permissions and cannot be restored',()=>{
 const f=fixture(),cashier={id:'cashier',email:'cashier@pos.test'};
 f.t.members.push({id:key(),userId:cashier.id,email:cashier.email,name:'Cashier',active:true,permissions:[...ROLE_PERMISSIONS.cashier]});
 f.run('order.status',{orderId:f.o.id,version:f.o.version,status:'PREPARING'});
 assert.throws(()=>f.cmd('cashier.cancel',{reason:'Burnt meal'},cashier),e=>e.status===403);
 f.cmd('cashier.cancel',{reason:'Burnt meal'});assert.equal(bill(f.t,f.s).total,0);
 assert.throws(()=>f.cmd('cashier.reopen',{reason:'Restore meal'}),e=>e.status===409);
});
test('percent/fixed and item/order discounts use net tax, exact split allocation, and immutable final pricing',()=>{
 const f=fixture();f.t.taxBps=1400;f.t.serviceBps=1200;
 f.cmd('billing.discount',{kind:'fixed',value:5000,lineId:f.o.lines[0].id,reason:'Item promotion'});
 f.cmd('billing.discount',{kind:'percent',value:1000,reason:'Loyalty discount'});
 const b=bill(f.t,f.s);assert.equal(b.discount,11350);assert.equal(b.tax,8001);assert.equal(b.service,6858);
 const g=guestView(f.state,f.table.token),guests=g.orders[0].lines.map((l,i)=>({id:String(i),quantities:{[f.o.id+':'+l.id]:l.quantity}})),split=calculateSplit(g.orders,g.bill,guests);
 assert(split.complete);assert.equal(split.guests.reduce((n,g)=>n+g.total,0),b.total);
 assert.equal(split.guests[0].discount,9900);assert.equal(split.guests[1].discount,1450);
 assert.equal(previewTableBill(g.orders,[],g.session).total,b.total);
 f.finalize();const snapshot=structuredClone(f.s.finalBill);f.t.taxBps=0;assert.deepEqual(bill(f.t,f.s).total,snapshot.total);
 assert.throws(()=>f.cmd('billing.discount',{kind:'fixed',value:1,reason:'Late discount'}),e=>e.status===409);
});
test('cashier limits, discount removal and manager authorization use server identity',()=>{
 const f=fixture(),user={id:'limited',email:'limited@pos.test'};
 f.t.members.push({id:key(),userId:user.id,email:user.email,active:true,permissions:[...ROLE_PERMISSIONS.cashier],discountLimitBps:500});
 assert.throws(()=>f.cmd('billing.discount',{kind:'percent',value:1000,reason:'Restricted discount',approvedBy:owner.id},user),e=>e.status===403);
 f.cmd('billing.discount',{kind:'percent',value:500,reason:'Allowed discount'},user);
 const d=f.s.discounts[0];f.cmd('billing.remove_discount',{discountId:d.id,reason:'Promotion cancelled'},user);assert(f.s.discounts[0].revokedAt);assert.equal(bill(f.t,f.s).total,68500);
});
test('partial/mixed payments, refunds and credits reconcile balances and physical cash without deleting payments',()=>{
 const f=fixture();f.open();f.finalize();f.pay('cash',30000);f.pay('card');
 const original=structuredClone(f.t.payments),cash=original[0],card=original[1];
 assert.throws(()=>f.cmd('cashier.edit',{lines:[{itemId:f.t.menu[0].id,quantity:10}]}),e=>e.status===409);
 f.cmd('billing.refund',{paymentId:cash.id,amount:10000,reason:'Returned meal'});
 assert.equal(bill(f.t,f.s).due,0);assert.equal(bill(f.t,f.s).refunded,10000);
 assert.throws(()=>f.cmd('billing.refund',{paymentId:card.id,amount:100,reason:'Card return'}),/external/);
 f.cmd('billing.refund',{paymentId:card.id,amount:card.amount,reason:'Full card return',externalConfirmed:true,externalReference:'acquirer-123'});
 assert.deepEqual(f.t.payments,original);
 assert.throws(()=>f.cmd('billing.refund',{paymentId:card.id,amount:1,reason:'Duplicate refund',externalConfirmed:true,externalReference:'acquirer-124'}),/remaining/);
 const summary=shiftSummary(f.t,f.t.pos.shifts[0]);assert.equal(summary.expectedCash,30000);assert.equal(summary.cardPayments,38500);assert.equal(summary.cardRefunds,38500);
 const report=financialReport(f.t);assert.equal(report.grossSales,68500);assert.equal(report.collections,68500);assert.equal(report.refunds,48500);assert.equal(report.netSales,20000);
});
test('unpaid finalized voids issue a credit, paid balances require refunds, and reasons are mandatory',()=>{
 const f=fixture();f.finalize();const snapshot=structuredClone(f.s.finalBill);
 assert.throws(()=>f.cmd('billing.void',{amount:100,reason:''}));
 f.cmd('billing.void',{amount:5000,reason:'Authorized write off'});assert.equal(bill(f.t,f.s).due,63500);assert.deepEqual(f.s.finalBill,snapshot);
 f.pay('cash');assert.throws(()=>f.cmd('billing.void',{amount:1,reason:'Bad adjustment'}),/refund/);
});
test('shift activation blocks unshifted collections; cash movements, close and formal handover are audited',()=>{
 const f=fixture(),second={id:'incoming',email:'incoming@pos.test'},secondId=key();
 f.t.members.push({id:secondId,userId:second.id,email:second.email,name:'Incoming',active:true,permissions:[...ROLE_PERMISSIONS.cashier]});
 const opened=f.open();assert.throws(()=>f.run('shift.open',{openingCash:0,key:key()}),e=>e.status===409);
 f.pay('cash',10000);f.pay('card',10000);
 f.run('shift.move',{shiftId:opened.id,kind:'in',amount:2000,reason:'Change delivery',key:key()});
 f.run('shift.move',{shiftId:opened.id,kind:'out',amount:3000,reason:'Safe deposit',key:key()});
 const closed=f.run('shift.close',{shiftId:opened.id,actualCash:18500,reason:'End of shift count',key:key()});assert.equal(closed.expectedCash,19000);assert.equal(closed.discrepancy,-500);
 assert.throws(()=>f.pay('cash',100),/Open your cashier shift/);
 const h=f.run('handover.declare',{shiftId:opened.id,toMemberId:secondId,amount:18500,reason:'Transfer drawer',key:key()});
 assert.throws(()=>f.run('handover.declare',{shiftId:opened.id,toMemberId:secondId,amount:18500,reason:'Transfer again',key:key()}),e=>e.status===409);
 assert.throws(()=>f.run('handover.confirm',{handoverId:h.id,receivedCash:18000,reason:'Counted cash',key:key()}),e=>e.status===403);
 f.run('handover.confirm',{handoverId:h.id,receivedCash:18000,reason:'Counted shortage',key:key()},second);
 assert.equal(f.t.pos.handovers[0].discrepancy,-500);assert.equal(f.t.pos.shifts.at(-1).openingCash,18000);
 assert.throws(()=>f.run('handover.confirm',{handoverId:h.id,receivedCash:18000,reason:'Repeat confirmation',key:key()},second),e=>e.status===409);
});
test('permissions, assigned tables and tenant isolation apply to all POS endpoints',()=>{
 const f=fixture(),u={id:'area-staff',email:'area@pos.test'};
 f.t.members.push({id:key(),userId:u.id,email:u.email,active:true,permissions:[...ROLE_PERMISSIONS.cashier],allowedTableIds:[f.t.tables[0].id]});
 assert.throws(()=>f.cmd('cashier.cancel',{reason:'Wrong table'},u),e=>e.status===403);
 assert.throws(()=>f.run('cashier.order',{tableId:f.table.id,key:key(),lines:[{itemId:f.t.menu[0].id,quantity:1}]},u),e=>e.status===403);
 assert.throws(()=>f.run('finance.report',{},u),e=>e.status===403);
 const view=staffView(f.state,u,f.t.id);assert.equal(view.restaurant.tables.length,1);assert(!view.restaurant.orders.some(o=>o.id===f.o.id));assert(!JSON.stringify(guestView(f.state,f.table.token)).includes('permissionsUpgraded'));
 f.cmd('billing.discount',{kind:'percent',value:1000,reason:'Private manager concession'});
 const kitchen={id:'kitchen',email:'kitchen@pos.test'};f.t.members.push({id:key(),userId:kitchen.id,email:kitchen.email,active:true,permissions:['kitchen.read']});
 assert.equal(staffView(f.state,kitchen,f.t.id).restaurant.sessions.find(s=>s.id===f.s.id).discounts,undefined);
 const other=createRestaurant('Other');other.members.push({...f.t.members[0],id:key(),permissions:[...PERMISSIONS]});f.state.restaurants.push(other);
 assert.throws(()=>applyCommand(f.state,owner,{action:'billing.refund',restaurantId:other.id,sessionId:f.s.id,expectedVersion:f.s.version,paymentId:key(),amount:100,reason:'Foreign bill',key:key()}));
});
test('reports separate recognition from collections, date/cashier/shift filters and credited tax',()=>{
 const f=fixture();f.t.taxBps=1400;f.t.serviceBps=1200;const shift=f.open();f.pay('cash',10000);
 assert.equal(financialReport(f.t).grossSales,0);assert.equal(financialReport(f.t).collections,10000);
 f.finalize();f.pay('card');f.cmd('billing.refund',{paymentId:f.t.payments[0].id,amount:10000,reason:'Returned meal'});
 const r=f.run('finance.report',{shiftId:shift.id});assert.equal(r.byShift.length,1);assert.equal(r.daily.length,1);assert.equal(r.transactions.length,4);assert.equal(r.creditedTax,Math.round(10000*f.s.finalBill.tax/f.s.finalBill.total));
 assert.equal(f.run('finance.report',{from:'2000-01-01',to:'2000-01-01'}).collections,0);
 const cashId=f.t.members[0].id;assert.equal(f.run('finance.report',{cashierId:cashId}).collections,r.collections);
 assert.throws(()=>f.run('finance.report',{from:'bad'}));
});
test('large snapshot proportions and many partial refunds retain every tax/service piastre',()=>{
 const value=Number.MAX_SAFE_INTEGER-100;
 assert.equal(roundedRatio(value,9999,10000),Number((BigInt(value)*9999n+5000n)/10000n));
 const f=fixture();f.t.taxBps=1375;f.t.serviceBps=925;f.open();f.finalize();f.pay('cash');
 const p=f.t.payments[0],total=f.s.finalBill.total;
 for(const amount of [1,3,7,13,total-24])f.cmd('billing.refund',{paymentId:p.id,amount,reason:'Partial return'});
 const credits=f.t.pos.credits;assert.equal(credits.reduce((n,c)=>n+c.amount,0),total);assert.equal(credits.reduce((n,c)=>n+c.tax,0),f.s.finalBill.tax);assert.equal(credits.reduce((n,c)=>n+c.service,0),f.s.finalBill.service);assert.equal(bill(f.t,f.s).due,0);
});
