import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createInitialState,bill,guestView,staffView,currentSession,upgradeSessionLifecycle} from '../lib/domain.mjs';
const owner={id:'owner',email:'owner@example.test'},key=()=>crypto.randomUUID();
function fixture(){
 const state=createInitialState(owner),t=state.restaurants[0],table=t.tables[1];
 const run=(action,body={},user=owner)=>applyCommand(state,user,{action,restaurantId:t.id,...body});run('session.open',{tableId:table.id});const s=t.sessions.at(-1),cap=s.capability;
 const guest=(action,body={})=>run('guest.'+action,{token:table.token,capability:cap,...body},null);
 const order=()=>guest('order',{key:key(),lines:[{itemId:t.menu[0].id,quantity:1}]});
 const finalize=()=>run('billing.finalize',{sessionId:s.id,expectedVersion:s.version,expectedTotal:bill(t,s).total});
 const reopen=()=>run('session.reopen',{sessionId:s.id,expectedVersion:s.version});
 return {state,t,table,s,run,guest,order,finalize,reopen,cap};
}
test('OPEN -> BILL_REQUESTED -> OPEN -> FINALIZED -> TABLE_AVAILABLE preserves the permanent table token',()=>{
 const f=fixture(),token=f.table.token;assert.equal(f.s.status,'OPEN');f.order();f.guest('bill');assert.equal(f.s.status,'BILL_REQUESTED');
 assert.equal(guestView(f.state,token,f.cap).session.status,'BILL_REQUESTED');assert.equal(staffView(f.state,owner).restaurant.tables.find(t=>t.id===f.table.id).status,'BILL_REQUESTED');
 f.reopen();assert.equal(f.s.status,'OPEN');assert(f.t.requests.filter(r=>r.sessionId===f.s.id&&r.kind==='bill').every(r=>r.status==='resolved'));f.order();f.guest('bill');f.finalize();assert.equal(f.s.status,'FINALIZED');
 const b=bill(f.t,f.s);assert.throws(()=>f.run('session.close',{sessionId:f.s.id}),/payment/);
 f.run('billing.pay',{sessionId:f.s.id,key:key(),method:'cash',amount:b.due,expectedTotal:b.total});f.run('session.close',{sessionId:f.s.id});
 assert.equal(f.s.status,'FINALIZED');assert(f.s.releasedAt);assert.equal(guestView(f.state,token).table.status,'TABLE_AVAILABLE');assert.equal(guestView(f.state,token).session,null);assert.equal(f.table.token,token);
});
test('bill request immediately blocks both new orders and edits; request resolution and payment do not reopen ordering',()=>{
 const f=fixture();f.order();const o=f.t.orders.at(-1),id=f.guest('bill').id,version=f.s.version;
 assert.equal(f.guest('bill').id,id);assert.equal(f.s.version,version);assert.throws(f.order,/Ordering is paused/);
 assert.throws(()=>f.guest('edit',{orderId:o.id,version:o.version,key:key(),lines:[{id:o.lines[0].id,itemId:o.lines[0].itemId,quantity:2}]}),/Ordering is paused/);
 f.run('request.status',{requestId:id,status:'resolved'});assert.throws(f.order,/Ordering is paused/);
 const b=bill(f.t,f.s);f.run('billing.pay',{sessionId:f.s.id,key:key(),method:'cash',expectedTotal:b.total,amount:b.due});assert.throws(f.order,/Ordering is paused/);
 assert.equal(f.guest('bill').id,id);assert.equal(f.s.status,'BILL_REQUESTED');f.reopen();f.guest('bill');assert.equal(f.s.status,'BILL_REQUESTED','A new request cycle works immediately without cooldown');
});
test('draft printing never finalizes; final printing requires explicit finalization and snapshots stay stable',()=>{
 const f=fixture();f.order();const draft=f.run('billing.print',{sessionId:f.s.id});assert.equal(draft.mode,'draft');assert.equal(f.s.status,'OPEN');assert.throws(()=>f.run('billing.print',{sessionId:f.s.id,mode:'final'}),/Finalize/);
 assert.throws(()=>f.run('billing.print',{sessionId:f.s.id,mode:'other'}),/Choose draft/);f.finalize();const snapshot=structuredClone(f.s.finalBill);assert.equal(f.run('billing.print',{sessionId:f.s.id,mode:'final'}).mode,'final');
 f.run('settings.save',{name:f.t.name,taxBps:1400,serviceBps:1200});f.t.menu[0].price=100000;
 assert.deepEqual(f.s.finalBill,snapshot);assert.equal(bill(f.t,f.s).total,snapshot.total);assert.throws(f.order,/finalized/);assert.throws(f.reopen,/before finalization/);
 f.run('billing.pay',{sessionId:f.s.id,key:key(),method:'card',amount:snapshot.total,expectedTotal:snapshot.total});assert.deepEqual(f.s.finalBill,snapshot);assert.equal(bill(f.t,f.s).due,0);
});
test('new session can replace an unpaid finalized session without losing orders, balances or kitchen work',()=>{
 const f=fixture();f.order();const o=f.t.orders.at(-1);f.finalize();const old=structuredClone({orders:f.t.orders,payments:f.t.payments,bill:f.s.finalBill});
 f.run('session.open',{tableId:f.table.id});const next=currentSession(f.t,f.table);assert.notEqual(next.id,f.s.id);assert.equal(next.status,'OPEN');assert(f.s.releasedAt);assert.equal(f.t.sessions.filter(s=>s.tableId===f.table.id&&!s.releasedAt).length,1);
 assert.deepEqual(f.t.orders,old.orders);assert.deepEqual(f.t.payments,old.payments);assert.deepEqual(f.s.finalBill,old.bill);assert.equal(bill(f.t,f.s).due,old.bill.total);
 const expired=guestView(f.state,f.table.token,f.cap);assert.equal(expired.expired,true);assert.equal(expired.session,null);assert.deepEqual(expired.orders,[]);assert.equal(expired.bill,null);assert.throws(f.order,/session has ended/);
 f.run('guest.order',{token:f.table.token,capability:next.capability,key:key(),lines:[{itemId:f.t.menu[0].id,quantity:2}]},null);assert.equal(f.t.orders.at(-1).sessionId,next.id);assert.equal(guestView(f.state,f.table.token).orders.length,1);
 f.run('order.status',{orderId:o.id,version:o.version,status:'PREPARING'});assert.equal(o.status,'PREPARING');
 f.run('billing.pay',{sessionId:f.s.id,key:key(),method:'cash',amount:old.bill.total,expectedTotal:old.bill.total});f.run('session.close',{sessionId:f.s.id});assert.equal(currentSession(f.t,f.table).id,next.id);assert.equal(bill(f.t,next).paid,0);
});
test('duplicate opens are blocked in OPEN/BILL_REQUESTED, closure requires explicit finalization even for empty bills',()=>{
 const f=fixture();assert.throws(()=>f.run('session.open',{tableId:f.table.id}),/occupied/);assert.throws(()=>f.run('session.close',{sessionId:f.s.id}),/Finalize/);f.guest('bill');assert.throws(()=>f.run('session.open',{tableId:f.table.id}),/occupied/);f.finalize();f.run('session.close',{sessionId:f.s.id});f.run('session.close',{sessionId:f.s.id});assert(f.s.releasedAt);
});
test('authorization, missing sessions and cross-tenant guesses cannot bypass lifecycle guards',()=>{
 const f=fixture(),limited={id:'printer',email:'printer@example.test'};f.t.members.push({id:key(),userId:limited.id,active:true,permissions:['billing.read','billing.print']});
 assert.throws(()=>f.run('billing.finalize',{sessionId:f.s.id,expectedVersion:f.s.version,expectedTotal:0},limited),/Missing permission/);f.guest('bill');assert.throws(()=>f.run('session.reopen',{sessionId:f.s.id,expectedVersion:f.s.version},limited),/Missing permission/);
 assert.throws(()=>f.run('billing.finalize',{sessionId:f.s.id},null),/sign-in/);assert.throws(()=>f.run('billing.finalize',{sessionId:'foreign'}),/not found/);assert.throws(()=>f.run('session.reopen',{sessionId:'foreign'}),/not found/);
});
test('stale finalization and reopening versions reject competing commits in either order',()=>{
 for(const first of ['order','finalize']){const f=fixture(),v=f.s.version,total=bill(f.t,f.s).total;
  if(first==='order'){f.order();assert.throws(()=>f.run('billing.finalize',{sessionId:f.s.id,expectedVersion:v,expectedTotal:total}),/session changed/)}
  else{f.finalize();assert.throws(f.order,/finalized/)}
 }
 for(const first of ['reopen','finalize']){const f=fixture();f.guest('bill');const body={sessionId:f.s.id,expectedVersion:f.s.version,expectedTotal:0};f.run(first==='reopen'?'session.reopen':'billing.finalize',body);assert.throws(()=>f.run(first==='reopen'?'billing.finalize':'session.reopen',body),/session changed|before finalization/)}
});
test('identical finalization retries are idempotent; stale totals and unrelated revisions are rejected',()=>{
 const f=fixture();f.order();const body={sessionId:f.s.id,expectedVersion:f.s.version,expectedTotal:bill(f.t,f.s).total};assert.throws(()=>f.run('billing.finalize',{...body,expectedTotal:body.expectedTotal+1}),/bill changed/);assert.throws(()=>f.run('billing.finalize',{sessionId:f.s.id,expectedTotal:body.expectedTotal}),/session changed/);
 f.run('billing.finalize',body);f.run('billing.finalize',body);assert.equal(f.t.audit.filter(a=>a.action==='billing.finalize').length,1);assert.throws(()=>f.run('billing.finalize',{...body,expectedVersion:body.expectedVersion+1}),/already been finalized/);
});
test('order idempotency remains safe across bill request/finalization without creating another order',()=>{
 const f=fixture(),k=key(),body={key:k,lines:[{itemId:f.t.menu[0].id,quantity:1}]},first=f.guest('order',body);f.guest('bill');assert.equal(f.guest('order',body).id,first.id);f.finalize();assert.equal(f.guest('order',body).id,first.id);assert.equal(f.t.orders.filter(o=>o.sessionId===f.s.id).length,1);
});
test('legacy ACTIVE/CLOSED records upgrade without changing permanent identifiers, history or delegated permissions',()=>{
 const f=fixture();f.order();delete f.state.sessionLifecycleVersion;f.s.status='ACTIVE';delete f.s.version;f.t.members[0].permissions=f.t.members[0].permissions.filter(p=>p!=='billing.finalize');
 const limited={id:'limited',permissions:['billing.print'],active:true};f.t.members.push(limited);
 const closed=f.t.sessions.find(s=>s.id!==f.s.id);closed.status='CLOSED';closed.closedAt=new Date().toISOString();closed.closedBy='Legacy';closed.capability='';
 f.t.requests.push({id:key(),sessionId:f.s.id,kind:'bill',status:'pending'});const before=structuredClone({orders:f.t.orders,payments:f.t.payments,tables:f.t.tables});
 upgradeSessionLifecycle(f.state);assert.equal(f.s.status,'BILL_REQUESTED');assert.equal(f.s.version,1);assert.equal(closed.status,'FINALIZED');assert(closed.releasedAt);assert(closed.finalBill);assert(f.t.members[0].permissions.includes('billing.finalize'));assert(!limited.permissions.includes('billing.finalize'));
 assert.deepEqual({orders:f.t.orders,payments:f.t.payments,tables:f.t.tables},before);const once=JSON.stringify(f.state);upgradeSessionLifecycle(f.state);assert.equal(JSON.stringify(f.state),once);
});

test('final pricing snapshots remain private from kitchen/session readers without billing permission',()=>{
 const f=fixture();f.order();f.finalize();const kitchen={id:'kitchen',email:'kitchen@example.test'};f.t.members.push({id:key(),userId:kitchen.id,active:true,permissions:['kitchen.read','sessions.read']});
 const view=staffView(f.state,kitchen,f.t.id),session=view.restaurant.sessions.find(s=>s.id===f.s.id);assert.equal(session.status,'FINALIZED');assert.equal(session.finalBill,undefined);assert.equal(session.bill,undefined);assert.equal(session.capability,undefined);
});
