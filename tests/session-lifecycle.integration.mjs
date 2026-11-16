import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw new Error('Local lifecycle fixtures only.');
const staff={Cookie:'__sites_local_auth=1'},key=()=>crypto.randomUUID();let tenant;
const read=async(query='',headers=staff)=>{const r=await fetch(base+'/api/state'+query,{headers});assert.equal(r.status,200);return r.json()};
const cmd=async(action,body={},headers=staff)=>{const r=await fetch(base+'/api/command',{method:'POST',headers:{...headers,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action,restaurantId:tenant,...body})});return {status:r.status,data:await r.json()}};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
const restaurant=async()=>(await read('?restaurant='+tenant)).restaurant;
const session=async id=>(await restaurant()).sessions.find(s=>s.id===id);
const finalBody=s=>({sessionId:s.id,expectedVersion:s.version,expectedTotal:s.bill.total});
await read();tenant=ok(await cmd('platform.create',{name:'Lifecycle races '+Date.now()})).id;
ok(await cmd('menu.save',{item:{name:'Lifecycle coffee',category:'Drinks',price:1234,modifiers:[]}}));
const t=await restaurant(),item=t.menu[0];
async function setup(table){ok(await cmd('session.open',{tableId:table.id}));const view=await read('?table='+table.token,{}),context={token:table.token,capability:view.session.capability};return {table,id:view.session.id,context,order:()=>cmd('guest.order',{...context,key:key(),lines:[{itemId:item.id,quantity:1}]},{})}}
// A bill request and an in-flight order serialize: the order is either included
// before the request, or rejected after it. It can never commit after the lock.
const a=await setup(t.tables[0]);ok(await a.order());
const requestRace=await Promise.all([cmd('guest.bill',a.context,{}),a.order()]);ok(requestRace[0]);assert([200,409].includes(requestRace[1].status));
let s=await session(a.id);assert.equal(s.status,'BILL_REQUESTED');const count=(await restaurant()).orders.filter(o=>o.sessionId===a.id).length;assert.equal(count,requestRace[1].status===200?2:1);
assert.equal((await a.order()).status,409);assert.equal((await cmd('session.open',{tableId:a.table.id})).status,409);
const duplicateRequests=await Promise.all([cmd('guest.bill',a.context,{}),cmd('guest.bill',a.context,{})]);assert.equal(ok(duplicateRequests[0]).id,ok(duplicateRequests[1]).id);assert.equal((await session(a.id)).version,s.version);
// Reopen and finalize the same reviewed version; exactly one wins.
const transitionRace=await Promise.all([cmd('session.reopen',{sessionId:s.id,expectedVersion:s.version}),cmd('billing.finalize',finalBody(s))]);assert.deepEqual(transitionRace.map(r=>r.status).sort(),[200,409]);
s=await session(a.id);if(s.status==='OPEN'){ok(await cmd('guest.bill',a.context,{}));s=await session(a.id)}
if(s.status!=='FINALIZED')ok(await cmd('billing.finalize',finalBody(s)));
const final=await session(a.id);assert.equal(final.status,'FINALIZED');assert.equal((await a.order()).status,409);
const old=await restaurant(),oldOrders=old.orders.filter(o=>o.sessionId===a.id),total=final.bill.total;
// Two replacement sessions race on the permanent table: only one opens.
const openings=await Promise.all([cmd('session.open',{tableId:a.table.id}),cmd('session.open',{tableId:a.table.id})]);assert.deepEqual(openings.map(r=>r.status).sort(),[200,409]);
const after=await restaurant(),current=after.sessions.filter(s=>s.tableId===a.table.id&&!s.releasedAt);assert.equal(current.length,1);assert.equal(current[0].status,'OPEN');assert.deepEqual(after.orders.filter(o=>o.sessionId===a.id),oldOrders);assert.equal(after.sessions.find(s=>s.id===a.id).bill.due,total);assert.equal(after.tables.find(tb=>tb.id===a.table.id).token,a.table.token);
const stale=await read('?table='+a.table.token+'&session='+a.context.capability,{});assert.equal(stale.session,null);assert.equal(stale.expired,true);assert.equal(stale.bill,null);assert.deepEqual(stale.orders,[]);assert.equal((await a.order()).status,409);
// Finalization racing an OPEN-session order uses the reviewed session revision.
const b=await setup(t.tables[1]);ok(await b.order());s=await session(b.id);const finalizationRace=await Promise.all([cmd('billing.finalize',finalBody(s)),b.order()]);assert.deepEqual(finalizationRace.map(r=>r.status).sort(),[200,409]);
s=await session(b.id);if(s.status==='OPEN')ok(await cmd('billing.finalize',finalBody(s)));s=await session(b.id);assert.equal(s.finalBill.total,(await restaurant()).orders.filter(o=>o.sessionId===b.id).reduce((sum,o)=>sum+o.lines.reduce((n,l)=>n+l.quantity*l.unitPrice,0),0));
// Identical finalization retries commit one snapshot/audit entry.
const c=await setup(t.tables[2]);ok(await c.order());s=await session(c.id);const body=finalBody(s),duplicates=await Promise.all([cmd('billing.finalize',body),cmd('billing.finalize',body)]);duplicates.forEach(ok);
assert.equal((await restaurant()).audit.filter(e=>e.action==='billing.finalize'&&e.detail===c.id).length,1);
// Old balances can still settle after replacement, with no effect on the new bill.
const pay={sessionId:a.id,key:key(),method:'cash',amount:total,expectedTotal:total};const payments=await Promise.all([cmd('billing.pay',pay),cmd('billing.pay',pay)]);payments.forEach(ok);
ok(await cmd('session.close',{sessionId:a.id}));const unchanged=await session(current[0].id);assert.equal(unchanged.status,'OPEN');assert.equal(unchanged.bill.paid,0);assert.equal((await session(a.id)).bill.total,total);
assert.equal(ok(await cmd('billing.print',{sessionId:a.id,mode:'final'})).bill.total,total);
assert.equal((await cmd('billing.finalize',finalBody(unchanged),{})).status,401);
// Releasing a settled finalized table and opening it may safely commit in either order.
const d=await setup(t.tables[3]);s=await session(d.id);ok(await cmd('billing.finalize',finalBody(s)));
const releaseRace=await Promise.all([cmd('session.close',{sessionId:d.id}),cmd('session.open',{tableId:d.table.id})]);releaseRace.forEach(ok);
const released=await restaurant(),occupants=released.sessions.filter(s=>s.tableId===d.table.id&&!s.releasedAt);assert.equal(occupants.length,1);assert.notEqual(occupants[0].id,d.id);assert.equal(occupants[0].status,'OPEN');assert(released.sessions.find(s=>s.id===d.id).closedAt);
console.log('PASS: real D1 lifecycle races, duplicate requests/finalization/opening/payments, stale capabilities, permanent QR, preserved balances and final snapshots.');
