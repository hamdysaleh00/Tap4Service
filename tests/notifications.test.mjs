import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createInitialState,createRestaurant,applyCommand,PERMISSIONS} from '../lib/domain.mjs';
import {migrationPlan} from '../lib/normalized-migration.mjs';
import {applyPlan} from '../scripts/normalized-migration.mjs';
import {createNormalizedStore} from '../lib/normalized-store.mjs';
import {createUpdatesRepository} from '../lib/updates-repository.mjs';
import {sqliteD1} from './helpers/sqlite-d1.mjs';
import {createNotificationTracker} from '../lib/notifications.mjs';
import {createSoundAlerts,soundNotes} from '../lib/notification-sound.mjs';
const owner={id:'notification-owner',email:'owner@example.test'},key=()=>crypto.randomUUID();
function fixture(backend){
 const state=createInitialState(owner),t=state.restaurants[0],other=createRestaurant('Other');other.members.push({...t.members[0],id:key()});state.restaurants.push(other);
 for(const [id,permissions] of [['kitchen',['kitchen.read']],['waiter',['staff_calls.read']],['cashier',['billing.read']],['none',[]]])t.members.push({id:key(),userId:id,email:id+'@example.test',name:id,active:true,permissions});
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE app_state(id TEXT PRIMARY KEY,revision INTEGER,payload TEXT)');db.prepare("INSERT INTO app_state VALUES('main',0,?)").run(JSON.stringify(state));
 if(backend==='normalized'){applyPlan(db,migrationPlan({id:'main',revision:0,payload:JSON.stringify(state)}));db.exec('UPDATE migration_runs SET verified=1');}
 const adapter=sqliteD1(db),store=createNormalizedStore(adapter),repository=createUpdatesRepository(adapter,{backend}),scope={kind:'tenant',restaurantId:t.id,slug:t.slug};
 const run=async(action,body={},user=owner)=>{
  if(backend==='normalized')return store.command(user,{action,restaurantId:t.id,...body},scope);
  const next=JSON.parse(db.prepare("SELECT payload FROM app_state WHERE id='main'").get().payload),result=applyCommand(next,user,{action,restaurantId:t.id,...body});db.prepare("UPDATE app_state SET payload=?,revision=revision+1 WHERE id='main'").run(JSON.stringify(next));return result;
 };
 const read=(user=owner,extra={})=>repository.read({user:typeof user==='string'?{id:user,email:user+'@example.test'}:user,scope,...extra});
 const table=t.tables[1];
 return {db,t,other,run,read,repository,scope,table,async open(){await run('session.open',{tableId:table.id,key:key()});return (await read()).data.restaurant.sessions.find(s=>s.tableId===table.id);},async guest(action,body={}){const d=await repository.read({token:table.token,scope});return run('guest.'+action,{token:table.token,capability:d.data.session.capability,...body},null);}};
}
for(const backend of ['legacy','normalized']){
 test(`${backend}: durable notifications cover edits, additions/removals, service, billing, payment and table lifecycle`,async()=>{
  const f=fixture(backend);try{
   const session=await f.open(),orderKey=key(),lines=[{itemId:f.t.menu[0].id,quantity:2}];
   const {id}=await f.guest('order',{key:orderKey,lines,orderId:f.t.orders[0].id,sessionId:f.t.sessions[0].id});await f.guest('order',{key:orderKey,lines});
   let d=(await f.read()).data,o=d.restaurant.orders.find(o=>o.id===id);
   assert.equal(d.restaurant.notifications.filter(n=>n.kind==='order_created').length,1);
   const created=d.restaurant.notifications.find(n=>n.orderId===id);assert.equal(created.tableLabel,f.table.label);assert.equal(created.restaurantId,f.t.id);assert.equal(created.sessionId,session.id);assert.equal(created.orderNumber,o.number);assert(!Number.isNaN(Date.parse(created.at)));
   await f.guest('edit',{orderId:id,version:o.version,key:key(),lines:[{id:o.lines[0].id,itemId:o.lines[0].itemId,quantity:3},{itemId:f.t.menu[1].id,quantity:1}]});
   d=(await f.read()).data;o=d.restaurant.orders.find(o=>o.id===id);assert.deepEqual(d.restaurant.notifications[0].changes,['items_added']);
   await f.guest('edit',{orderId:id,version:o.version,key:key(),lines:[{id:o.lines[0].id,itemId:o.lines[0].itemId,quantity:1}]});
   d=(await f.read()).data;o=d.restaurant.orders.find(o=>o.id===id);assert.deepEqual(d.restaurant.notifications[0].changes,['items_cancelled']);
   await f.run('order.status',{orderId:id,version:o.version,status:'PREPARING'});
   const count=(await f.read()).data.restaurant.notifications.length;
   await assert.rejects(f.guest('edit',{orderId:id,version:o.version,key:key(),lines}),e=>e.status===409);assert.equal((await f.read()).data.restaurant.notifications.length,count);
   const call=await f.guest('call',{orderId:f.t.orders[0].id,sessionId:f.t.sessions[0].id});assert.equal((await f.read()).data.restaurant.notifications[0].tableId,f.table.id);await f.guest('call');await f.run('request.status',{requestId:call.id,status:'acknowledged'});await f.run('request.status',{requestId:call.id,status:'resolved'});
   await f.guest('bill');await f.guest('bill');let s=(await f.read()).data.restaurant.sessions.find(s=>s.id===session.id);
   await f.run('session.reopen',{sessionId:s.id,expectedVersion:s.version});
   await f.run('settings.save',{name:f.t.name,taxBps:1400,serviceBps:1200});s=(await f.read()).data.restaurant.sessions.find(x=>x.id===session.id);
   assert.equal(s.bill.total,s.bill.subtotal+Math.round(s.bill.subtotal*.14)+Math.round(s.bill.subtotal*.12));
   await f.run('billing.finalize',{sessionId:s.id,expectedVersion:s.version,expectedTotal:s.bill.total});
   const payment={sessionId:s.id,key:key(),amount:s.bill.total,expectedTotal:s.bill.total,method:'cash'};await f.run('billing.pay',payment);await f.run('billing.pay',payment);await f.run('session.close',{sessionId:s.id});
   d=(await f.read()).data;
   for(const kind of ['session_open','order_created','order_updated','waiter_called','bill_requested','request_acknowledged','request_resolved','session_reopen','billing_finalize','payment_recorded','session_close'])assert(d.restaurant.notifications.some(n=>n.kind===kind),kind);
   for(const kind of ['waiter_called','bill_requested','payment_recorded'])assert.equal(d.restaurant.notifications.filter(n=>n.kind===kind).length,1);
   // Delivered independently of which workspace page is currently polling.
   const activity=await f.read(owner,{view:'activity'});assert.deepEqual(activity.data.restaurant.notifications,d.restaurant.notifications);
   const guest=(await f.repository.read({token:f.table.token,scope:f.scope})).data;assert(!guest.notifications);assert(!guest.restaurant.notifications);
   assert.doesNotMatch(JSON.stringify(d.restaurant.notifications),/capability|requestPayload|readBy|owner@example/);
  }finally{f.db.close();}
 });
 test(`${backend}: read receipts sync per user across devices; RBAC, guest and tenant isolation fail closed`,async()=>{
  const f=fixture(backend);try{
   await f.open();await f.guest('order',{key:key(),lines:[{itemId:f.t.menu[0].id,quantity:1}]});await f.guest('call');await f.guest('bill');
   const kitchen=(await f.read('kitchen')).data.restaurant.notifications,waiter=(await f.read('waiter')).data.restaurant.notifications,cashier=(await f.read('cashier')).data.restaurant.notifications;
   assert(kitchen.length);assert(kitchen.every(n=>n.category==='order'));assert(waiter.every(n=>n.category==='service'));assert(cashier.some(n=>n.kind==='bill_requested'));assert(!cashier.some(n=>n.category==='service'));assert.deepEqual((await f.read('none')).data.restaurant.notifications,[]);
   const first=await f.read(),n=first.data.restaurant.notifications.find(n=>n.kind==='order_created'),beforeBill=first.data.restaurant.sessions.find(s=>s.tableId===f.table.id).bill;
   await f.run('notification.read',{ids:[n.id]});await f.run('notification.read',{ids:[n.id]});const second=await f.read(owner,{etag:first.etag});assert(!second.unchanged);assert(second.data.restaurant.notifications.find(e=>e.id===n.id).readAt);
   assert.equal((await f.read('kitchen')).data.restaurant.notifications.find(e=>e.id===n.id).readAt,null);
   assert.deepEqual(second.data.restaurant.sessions.find(s=>s.tableId===f.table.id).bill,beforeBill);
   await assert.rejects(f.run('notification.read',{ids:[n.id]}, {id:'waiter',email:'waiter@example.test'}),e=>e.status===403);
   await assert.rejects(f.run('notification.read',{ids:[n.id]},null),e=>e.status===401);
   await assert.rejects(f.run('notification.read',{ids:[n.id],restaurantId:f.other.id}),e=>[403,404].includes(e.status));
   await assert.rejects(f.read(owner,{restaurantId:f.other.id}),e=>e.status===403);
   await assert.rejects(f.run('notification.read',{ids:[n.id,'foreign-event']}),e=>e.status===403);
   await assert.rejects(f.run('notification.read',{ids:Array(101).fill(n.id)}),e=>e.status===400);
   await f.run('staff.save',{memberId:f.t.members[0].id,email:owner.email,name:'Owner',active:true,permissions:PERMISSIONS});
   const latest=await f.read();assert.equal((await f.read(owner,{etag:latest.etag})).metrics.queries,1);
  }finally{f.db.close();}
 });
 test(`${backend}: disconnected staff recover unread events beyond the 150-event history window`,async()=>{
  const state=createInitialState(owner),t=state.restaurants[0];
  for(let i=0;i<180;i++){const o=t.orders[0];applyCommand(state,null,{action:'guest.edit',token:t.tables[0].token,capability:t.sessions[0].capability,orderId:o.id,version:o.version,key:key(),lines:[{id:o.lines[0].id,itemId:o.lines[0].itemId,quantity:1+i%2}]});t.audit.at(-1).by='fixture';}
  const db=new DatabaseSync(':memory:');try{
   db.exec('CREATE TABLE app_state(id TEXT PRIMARY KEY,revision INTEGER,payload TEXT)');db.prepare("INSERT INTO app_state VALUES('main',0,?)").run(JSON.stringify(state));
   if(backend==='normalized'){applyPlan(db,migrationPlan({id:'main',revision:0,payload:JSON.stringify(state)}));db.exec('UPDATE migration_runs SET verified=1');}
   const repository=createUpdatesRepository(sqliteD1(db),{backend});const d=await repository.read({user:owner,restaurantId:t.id});assert.equal(d.data.restaurant.notifications.length,180);assert(d.data.restaurant.notifications.every(n=>!n.readAt));
  }finally{db.close();}
 });
}
test('notification dedupe survives polling, remounts and scope switching with optional storage',()=>{
 const stored=new Map(),options={read:scope=>stored.get(scope)||[],write:(scope,ids)=>stored.set(scope,ids)},events=[{id:'a',readAt:null}];
 const a=createNotificationTracker(options);assert.equal(a.accept('one',events).length,1);assert.equal(a.accept('one',events).length,0);assert.equal(createNotificationTracker(options).accept('one',events).length,0);assert.equal(a.accept('two',events).length,1);assert.equal(a.accept('one',events).length,0);
 assert.equal(a.accept('one',[...events,{id:'b',readAt:'read'}]).length,0);
 const unavailable=createNotificationTracker({read(){throw Error();},write(){throw Error();}});assert.equal(unavailable.accept('one',events).length,1);assert.equal(unavailable.accept('one',events).length,0);
});
test('sound needs an explicit unlock, supports distinct tones/mute and catches autoplay or API failures',async()=>{
 let count=0;const context={state:'suspended',currentTime:0,destination:{},async resume(){this.state='running';},async close(){this.state='closed';},createOscillator(){count++;return {frequency:{},connect(){},start(){},stop(){}};},createGain(){return {connect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}};}};
 const sound=createSoundAlerts({createContext:()=>context});assert.equal(sound.play('order'),false);assert(await sound.enable());for(const category of Object.keys(soundNotes)){assert(sound.play(category));}assert(count>10);sound.mute();assert.equal(sound.play('order'),false);await sound.close();assert.equal(context.state,'closed');
 const blocked=createSoundAlerts({createContext:()=>{throw Error('blocked');}});assert.equal(await blocked.enable(),false);assert.equal(blocked.play('order'),false);
 const suspended=createSoundAlerts({createContext:()=>({...context,state:'suspended',async resume(){}})});assert.equal(await suspended.enable(),false);
});
