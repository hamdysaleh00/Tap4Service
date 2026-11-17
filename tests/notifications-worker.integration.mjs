import test from 'node:test';
import assert from 'node:assert/strict';
import {pollingWorker} from './helpers/polling-worker.mjs';
const key=()=>crypto.randomUUID();
for(const backend of ['legacy','normalized'])test(`${backend} built Workers/D1: notifications, receipts, idempotency, authorization and guest regression`,async()=>{
 const f=await pollingWorker(backend,{history:5,restaurants:2});try{
  const t=f.state.restaurants[0],table=t.tables[1],url='/api/updates?restaurant='+t.id;
  const command=async(action,body={})=>{const r=await f.command(action,body);assert.equal(r.status,200,await r.clone().text());return r.json();};
  const read=async()=>{const r=await f.read(url);assert.equal(r.status,200,await r.clone().text());return r.json();};
  const {id:sid}=await command('session.open',{tableId:table.id,key:key()});
  const guest=await (await f.read('/api/updates?table='+table.token)).json(),context={token:table.token,capability:guest.session.capability};
  const orderKey=key(),orderBody={...context,key:orderKey,lines:[{itemId:t.menu[0].id,quantity:2}]};
  const {id}=await command('guest.order',orderBody);const retries=await Promise.all(Array.from({length:4},()=>f.command('guest.order',orderBody)));assert(retries.every(r=>r.status===200));
  let d=await read(),o=d.restaurant.orders.find(o=>o.id===id);assert.equal(d.restaurant.notifications.filter(n=>n.orderId===id&&n.kind==='order_created').length,1);
  await command('guest.edit',{...context,orderId:id,version:o.version,key:key(),lines:[{id:o.lines[0].id,itemId:o.lines[0].itemId,quantity:3},{itemId:t.menu[1].id,quantity:1}]});
  d=await read();assert.deepEqual(d.restaurant.notifications[0].changes,['items_added']);o=d.restaurant.orders.find(o=>o.id===id);
  await command('guest.edit',{...context,orderId:id,version:o.version,key:key(),lines:[{id:o.lines[0].id,itemId:o.lines[0].itemId,quantity:1}]});d=await read();assert.deepEqual(d.restaurant.notifications[0].changes,['items_cancelled']);
  const {id:requestId}=await command('guest.call',context);await command('guest.call',context);await command('request.status',{requestId,status:'acknowledged'});
  await command('guest.bill',context);await command('guest.bill',context);let s=(await read()).restaurant.sessions.find(s=>s.id===sid);
  await command('session.reopen',{sessionId:sid,expectedVersion:s.version});await command('settings.save',{name:t.name,taxBps:1400,serviceBps:1200});
  s=(await read()).restaurant.sessions.find(s=>s.id===sid);const total=s.bill.total;assert.equal(total,s.bill.subtotal+Math.round(s.bill.subtotal*.14)+Math.round(s.bill.subtotal*.12));
  await command('billing.finalize',{sessionId:sid,expectedVersion:s.version,expectedTotal:total});
  const payment={sessionId:sid,key:key(),expectedTotal:total,amount:total,method:'card'};await command('billing.pay',payment);await command('billing.pay',payment);await command('session.close',{sessionId:sid});
  d=await read();for(const kind of ['session_open','order_created','order_updated','waiter_called','bill_requested','request_acknowledged','session_reopen','billing_finalize','payment_recorded','session_close'])assert(d.restaurant.notifications.some(n=>n.kind===kind),kind);
  for(const kind of ['waiter_called','bill_requested','payment_recorded'])assert.equal(d.restaurant.notifications.filter(n=>n.kind===kind).length,1);
  const event=d.restaurant.notifications.find(n=>n.orderId===id),before=await f.read(url),etag=before.headers.get('ETag');await command('notification.read',{ids:[event.id]});
  const secondDevice=await f.read(url,{'If-None-Match':etag});assert.equal(secondDevice.status,200);assert((await secondDevice.json()).restaurant.notifications.find(n=>n.id===event.id).readAt);
  await command('notification.read',{ids:[event.id]});assert.equal((await read()).restaurant.sessions.find(s=>s.id===sid).bill.total,total);
  const foreign=await f.command('notification.read',{restaurantId:f.state.restaurants[1].id,ids:[event.id]});assert.equal(foreign.status,403);
  const denied=await f.mf.dispatchFetch('http://localhost/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'notification.read',restaurantId:t.id,ids:[event.id]})});assert.equal(denied.status,401);
  await command('staff.save',{email:'kitchen@example.test',name:'Kitchen',permissions:['kitchen.read']});
  const kitchenHeaders={'oai-authenticated-user-id':'notification-kitchen','oai-authenticated-user-email':'kitchen@example.test'};
  const kitchen=await f.read(url,kitchenHeaders);assert.equal(kitchen.status,200);const kd=await kitchen.json();assert(kd.restaurant.notifications.every(n=>n.category==='order'));assert.equal(kd.restaurant.notifications.find(n=>n.id===event.id).readAt,null);
  const deniedRead=await f.mf.dispatchFetch('http://localhost/api/command',{method:'POST',headers:{...kitchenHeaders,Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({action:'notification.read',restaurantId:t.id,ids:[d.restaurant.notifications.find(n=>n.category==='payment').id]})});assert.equal(deniedRead.status,403);
  const gd=await (await f.read('/api/updates?table='+table.token)).json();assert(!gd.restaurant.notifications);assert(!gd.notifications);assert.equal(gd.session,null);
  assert.doesNotMatch(JSON.stringify(kd.restaurant.notifications),/capability|readBy|requestPayload|example.test/);
 }finally{await f.mf.dispose();}
});
