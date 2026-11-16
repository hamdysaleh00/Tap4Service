import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://localhost:5173';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw new Error('Integration fixtures must run against a local preview only.');
const staff={'Cookie':'__sites_local_auth=1'},key=()=>crypto.randomUUID();
async function read(query='',headers={}){const r=await fetch(`${base}/api/state${query}`,{headers});return {status:r.status,data:await r.json()};}
let tenant;
async function cmd(action,body={},headers=staff){const r=await fetch(base+'/api/command',{method:'POST',headers:{...headers,'Content-Type':'application/json','Origin':base},body:JSON.stringify({action,restaurantId:tenant,...body})});return {status:r.status,data:await r.json()};}
function ok(r){assert.equal(r.status,200,JSON.stringify(r.data));return r.data}
async function finalize(sessionId){const t=ok(await read('?restaurant='+tenant,staff)).restaurant,s=t.sessions.find(s=>s.id===sessionId);ok(await cmd('billing.finalize',{sessionId,expectedVersion:s.version,expectedTotal:s.bill.total}));}
assert.equal((await read()).status,401,'Anonymous staff reads must fail');
ok(await read('',staff));
tenant=ok(await cmd('platform.create',{name:`QA ${new Date().toISOString()}`})).id;
ok(await cmd('menu.save',{item:{name:'QA coffee',description:'Integration fixture',category:'Drinks',price:8500,available:true,visible:true,modifiers:[{name:'Extra shot',price:2500}]}}));
let t=ok(await read(`?restaurant=${tenant}`,staff)).restaurant;
const table=t.tables[0],item=t.menu[0];
const simultaneousOpen=await Promise.all([cmd('session.open',{tableId:table.id}),cmd('session.open',{tableId:table.id})]);
assert.deepEqual(simultaneousOpen.map(r=>r.status).sort(),[200,409],'Only one racing open can commit');
let guest=ok(await read(`?table=${table.token}`));const session=guest.session;
const context={token:table.token,capability:session.capability};
const submitKey=key(),lines=[{itemId:item.id,quantity:1,modifierIds:[item.modifiers[0].id],notes:'Less hot'}];
const pair=await Promise.all([cmd('guest.order',{...context,key:submitKey,lines},{}),cmd('guest.order',{...context,key:submitKey,lines},{})]);
assert.equal(ok(pair[0]).id,ok(pair[1]).id,'Concurrent duplicate submissions return one order');
guest=ok(await read(`?table=${table.token}`));assert.equal(guest.orders.length,1);let o=guest.orders[0];assert.equal(o.lines[0].unitPrice,11000);
const race=await Promise.all([cmd('guest.edit',{...context,key:key(),orderId:o.id,version:o.version,lines:[{...lines[0],id:o.lines[0].id,quantity:2}]},{}),cmd('order.status',{orderId:o.id,version:o.version,status:'PREPARING'})]);
assert.deepEqual(race.map(r=>r.status).sort(),[200,409],'Edit/preparing race must have exactly one winner');
guest=ok(await read(`?table=${table.token}`));o=guest.orders[0];if(o.status!=='PREPARING')ok(await cmd('order.status',{orderId:o.id,version:o.version,status:'PREPARING'}));
assert.equal((await cmd('guest.edit',{...context,key:key(),orderId:o.id,version:o.version,lines},{})).status,409);
ok(await cmd('guest.order',{...context,key:key(),lines},{}));
const bills=await Promise.all([cmd('guest.bill',context,{}),cmd('guest.bill',context,{})]);assert.equal(ok(bills[0]).id,ok(bills[1]).id);
const calls=await Promise.all([cmd('guest.call',context,{}),cmd('guest.call',context,{})]);assert.equal(ok(calls[0]).id,ok(calls[1]).id);
ok(await cmd('guest.feedback',{...context,key:key(),rating:5,comment:'API QA'},{}));
guest=ok(await read(`?table=${table.token}`));assert.equal(guest.feedback,undefined);assert.equal(guest.orders.length,2);
assert.equal((await cmd('session.close',{sessionId:session.id})).status,409);
const pay={sessionId:session.id,key:key(),method:'cash',expectedTotal:guest.bill.total,amount:guest.bill.due};
const payments=await Promise.all([cmd('billing.pay',pay),cmd('billing.pay',pay)]);payments.forEach(ok);
t=ok(await read(`?restaurant=${tenant}`,staff)).restaurant;assert.equal(t.payments.length,1);assert.equal(t.feedback.length,1);
await finalize(session.id);ok(await cmd('session.close',{sessionId:session.id}));
assert.equal((await read(`?table=${table.token}&session=${session.capability}`)).data.session,null);
ok(await cmd('session.open',{tableId:table.id}));
const previous=ok(await read(`?table=${table.token}&session=${session.capability}`));assert.equal(previous.expired,true);assert.equal(previous.orders.length,0);
const newVisit=ok(await read(`?table=${table.token}`));assert.notEqual(newVisit.session.id,session.id);assert.equal(newVisit.orders.length,0);
await finalize(newVisit.session.id);ok(await cmd('session.close',{sessionId:newVisit.session.id}));
const csrf=await fetch(base+'/api/command',{method:'POST',headers:{...staff,'Content-Type':'application/json',Origin:'https://untrusted.example'},body:JSON.stringify({action:'session.open',restaurantId:tenant,tableId:table.id})});assert.equal(csrf.status,403);
for(const language of ['en','ar']){
 const invalid=await fetch(base+'/api/state?table=not-a-table',{headers:{'Accept-Language':language}}),message=await invalid.json();assert.equal(invalid.status,404);assert.equal(message.errorKey,'This table link is not available.');assert.equal(/[\u0600-\u06ff]/.test(message.error),language==='ar');
 for(const body of ['{','null','[]','{"action":{}}']){const r=await fetch(base+'/api/command',{method:'POST',headers:{...staff,Origin:base,'Content-Type':'application/json','Accept-Language':language},body});const data=await r.json();assert.equal(r.status,400);assert.equal(/[\u0600-\u06ff]/.test(data.error),language==='ar');}
}
console.log('PASS: real D1 API, concurrent orders/edits, tenant boundaries, payment safeguards, revocation, CSRF, localized errors and malformed input in English and Arabic.');
