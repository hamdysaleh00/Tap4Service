// Notification metadata is part of the existing audit outbox. Both storage
// adapters commit it atomically with the business mutation; no new binding or
// production migration is needed. Never include guest capabilities or payloads.
const audiences={order:['orders.read','kitchen.read','billing.read'],service:['staff_calls.read'],bill:['billing.read'],payment:['billing.read'],session:['sessions.read','billing.read']};
export function canReadNotification(notification,permissions){
 return !!notification&&audiences[notification.category]?.some(p=>permissions.includes(p));
}
export function notificationView(t,userId,permissions){
 const events=(t.notificationEvents||t.audit).filter(a=>canReadNotification(a.notification,permissions));
 const recent=new Set(events.slice(-150).map(a=>a.id));
 return events.map(a=>({id:a.id,at:a.at,...a.notification,readAt:a.notification.readBy?.find(r=>r.userId===userId)?.at||null}))
  .filter(n=>!n.readAt||recent.has(n.id)).map(({readBy,...n})=>{void readBy;return n;}).reverse();
}
export function attachNotification(t,body,result,auditLength,previousOrder){
 if(t.audit.length===auditLength)return; // Idempotent retries never emit again.
 const event=t.audit.at(-1),action=body.action;
 // Derive references only from the entity the validated action changed.
 // Unrelated fields supplied by a caller cannot redirect a notification.
 const orderId=['guest.order','guest.edit'].includes(action)?result?.id:action==='order.status'?body.orderId:null;
 const requestId=['guest.call','guest.bill'].includes(action)?result?.id:action==='request.status'?body.requestId:null;
 const order=t.orders.find(o=>o.id===orderId),request=t.requests.find(r=>r.id===requestId);
 const sessionId=order?.sessionId||request?.sessionId||(action==='session.open'?result?.id:['session.reopen','session.close','billing.finalize','billing.pay'].includes(action)?body.sessionId:null);
 const session=t.sessions.find(s=>s.id===sessionId);
 const table=t.tables.find(tb=>tb.id===(session?.tableId||request?.tableId));
 let category,kind,changes=[];
 if(action==='guest.order'){category='order';kind='order_created';}
 if(action==='guest.edit'){
  category='order';kind='order_updated';
  const old=previousOrder?.lines||[],next=order.lines;
  if(next.some(l=>l.quantity>(old.find(p=>p.id===l.id)?.quantity||0)))changes.push('items_added');
  if(old.some(l=>l.quantity>(next.find(p=>p.id===l.id)?.quantity||0)))changes.push('items_cancelled');
 }
 if(action==='order.status'){category='order';kind='order_updated';}
 if(action==='guest.call'){category='service';kind='waiter_called';}
 if(action==='guest.bill'){category='bill';kind='bill_requested';}
 if(action==='billing.pay'){category='payment';kind='payment_recorded';}
 if(['session.open','session.reopen','session.close','billing.finalize'].includes(action)){category='session';kind=action.replace('.','_');}
 if(action==='request.status'){category=request.kind==='bill'?'bill':'service';kind='request_'+request.status;}
 if(!category)return;
 event.notification={category,kind,changes,restaurantId:t.id,tableId:table?.id||null,tableLabel:table?.label||'',sessionId:session?.id||null,orderId:order?.id||null,orderNumber:order?.number||null,status:order?.status||session?.status||null,readBy:[]};
}

// Browser storage is optional; blocked storage must not break visual delivery.
/** @param {{read?:(scope:string)=>string[],write?:(scope:string,ids:string[])=>void}} options */
export function createNotificationTracker({read=()=>[],write=()=>{}}={}){
 let scope=null,seen=new Set();
 return {accept(nextScope,events){
  if(nextScope!==scope){scope=nextScope;try{seen=new Set(read(scope));}catch{seen=new Set();}}
  const fresh=events.filter(n=>!n.readAt&&!seen.has(n.id));
  for(const n of events)seen.add(n.id);
  // Keep the current unread backlog as well as recently seen IDs.
  const ids=[...new Set([...seen].slice(-1000).concat(events.filter(n=>!n.readAt).map(n=>n.id)))];
  seen=new Set(ids);try{write(scope,ids);}catch{}
  return fresh;
 }};
}
export const notificationTitle=n=>({order_created:'New order received',order_updated:'Order updated',waiter_called:'Guest called a waiter',bill_requested:'Guest requested the bill',payment_recorded:'Payment recorded',session_open:'Table session opened',session_reopen:'Ordering reopened',session_close:'Table available',billing_finalize:'Bill finalized',request_acknowledged:'Request acknowledged',request_resolved:'Request resolved'}[n.kind]||'Restaurant update');
