import test from 'node:test';
import assert from 'node:assert/strict';
import { pollingWorker } from './helpers/polling-worker.mjs';
for(const backend of ['legacy','normalized'])test(`${backend} built Worker: conditional snapshots, bounded history, independent tenant revisions and retained pending orders`,async()=>{
 const f=await pollingWorker(backend);try{
  const t=f.state.restaurants[0],url='/api/updates?restaurant='+t.id;
  const initial=await f.read(url);assert.equal(initial.status,200,await initial.clone().text());const etag=initial.headers.get('ETag'),data=await initial.json();assert.equal(data.restaurant.orders.length,4);assert.equal(data.restaurant.sessions.length,4);assert.equal(data.restaurant.payments.length,0);assert.match(initial.headers.get('Cache-Control'),/no-store/);
  const idle=await f.read(url,{'If-None-Match':etag});assert.equal(idle.status,304);assert.equal(await idle.text(),'');assert.equal(idle.headers.get('X-Update-Queries'),'1');
  const foreign=await f.command('settings.save',{restaurantId:f.state.restaurants[1].id,name:'Other changed',taxBps:0,serviceBps:0});assert.equal(foreign.status,200);assert.equal((await f.read(url,{'If-None-Match':etag})).status,304);
  const table=t.tables[0],s=t.sessions[0],newOrder=await f.command('guest.order',{token:table.token,capability:s.capability,key:crypto.randomUUID(),lines:[{itemId:t.menu[0].id,quantity:1}]});assert.equal(newOrder.status,200);const {id}=await newOrder.json();
  const changed=await f.read(url,{'If-None-Match':etag});assert.equal(changed.status,200);const changedData=await changed.json();assert(changedData.restaurant.orders.some(o=>o.id===id&&o.status==='PENDING'));assert.equal(changedData.restaurant.sessions[0].bill.total,73500);
  const history=await f.read(url+'&view=history'),page=await history.json();assert.equal(history.status,200);assert.equal(page.restaurant.sessions.filter(s=>s.releasedAt).length,50);assert(page.sync.hasMore);const next=await f.read(url+'&view=history&cursor='+page.sync.nextCursor),older=await next.json();const overlap=older.restaurant.sessions.filter(s=>s.releasedAt&&page.restaurant.sessions.some(other=>other.id===s.id));assert.equal(overlap.length,0);
  const guest=await f.read('/api/updates?table='+table.token+'&session='+s.capability);assert.equal(guest.status,200);const body=await guest.json();assert.equal(body.orders.length,2);assert.equal(body.bill.total,73500);assert(!body.restaurant.members);
  const unknown=await f.mf.dispatchFetch('http://localhost/api/updates?restaurant='+t.id);assert.equal(unknown.status,401);
  const o=changedData.restaurant.orders.find(o=>o.id===id);const acknowledge=await f.command('order.status',{orderId:id,version:o.version,status:'ACCEPTED'});assert.equal(acknowledge.status,200);const accepted=await (await f.read(url)).json();assert(accepted.restaurant.orders.some(o=>o.id===id&&o.status==='ACCEPTED'));
 }finally{await f.mf.dispose();}
});
