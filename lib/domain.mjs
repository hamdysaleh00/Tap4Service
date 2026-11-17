import { publicMenu, publicOrders } from './public-projection.mjs';
import { designCommand, publishedDesign } from './restaurant-designs/config.mjs';
import { ensureRestaurantSlugs, generatedSlug, requireSlug } from './tenant-routing.mjs';
import { priceBill, receiptRates } from './bill-pricing.mjs';
export const PERMISSIONS = ['menu.read','menu.write','orders.read','orders.manage','kitchen.read','kitchen.start_preparing','kitchen.mark_ready','sessions.read','sessions.open','sessions.close','billing.read','billing.print','billing.finalize','billing.record_payment','staff_calls.read','staff_calls.resolve','feedback.read_private','staff.manage','permissions.manage'];
export const SESSION_STATES=['OPEN','BILL_REQUESTED','FINALIZED'];
export const currentSession=(t,table)=>t.sessions.find(s=>s.tableId===table.id&&!s.releasedAt&&SESSION_STATES.includes(s.status));
export class AppError extends Error { constructor(message, status=400) { super(message); this.status=status; } }
const fail=(ok,message,status=400)=>{ if(!ok) throw new AppError(message,status); };
export const uid=()=>crypto.randomUUID();
export const isPlatformAdmin=(state,user)=>!!user?.id&&state.platformOwner===user.id&&(user.authProvider!=='independent'||user.isSuperAdmin===true);
const now=()=>new Date().toISOString();
const txt=(v,max=200)=>String(v??'').trim().slice(0,max);
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export const orderTotal=o=>o.lines.reduce((sum,l)=>sum+l.quantity*l.unitPrice,0);
export function bill(t,s) {
  const orders=t.orders.filter(o=>o.sessionId===s.id);
  const subtotal=orders.reduce((sum,o)=>sum+orderTotal(o),0);
  const pricing=s.finalBill||priceBill(subtotal,receiptRates(t,s));
  const paid=t.payments.filter(p=>p.sessionId===s.id).reduce((sum,p)=>sum+p.amount,0);
  return {...pricing,paid,due:Math.max(0,pricing.total-paid)};
}
// Upgrade the existing JSON model in place; the next successful CAS transaction
// persists it. Reads receive the same normalized view without a SQL migration.
export function upgradeSessionLifecycle(state) {
 if(state.sessionLifecycleVersion===1)return;
 for(const t of state.restaurants){
  for(const m of t.members)if(m.permissions.includes('permissions.manage')&&!m.permissions.includes('billing.finalize'))m.permissions.push('billing.finalize');
  for(const s of t.sessions){
   s.version??=1;
   if(s.status==='ACTIVE')s.status=t.requests.some(r=>r.sessionId===s.id&&r.kind==='bill'&&r.status!=='resolved')?'BILL_REQUESTED':'OPEN';
   if(s.status==='CLOSED'){
    s.status='FINALIZED';s.finalBill=financialSnapshot(bill(t,s));s.finalizedAt=s.closedAt||s.openedAt;s.finalizedBy=s.closedBy||s.openedBy;s.releasedAt=s.closedAt||s.openedAt;s.capability='';
   }
  }
 }
 state.sessionLifecycleVersion=1;
}
const financialSnapshot=({subtotal,service,tax,total})=>({subtotal,service,tax,total});
function releaseSession(t,s,by,reason) {
 s.releasedAt=now();s.releasedBy=by;s.releaseReason=reason;s.capability='';s.version++;
 for(const r of t.requests.filter(r=>r.sessionId===s.id))r.status='resolved';
}
function expectVersion(s,version){fail(Number.isInteger(version)&&s.version===version,'This session changed. Refresh and review the latest bill.',409);}
export function createRestaurant(name, sample=false) {
 const id=uid();
 const categories=['Small plates','From the grill','Something sweet','Coffee & drinks'];
 const photos={burger:'photo-1568901346375-23c9450c58cd',salad:'photo-1512621776951-a57141f2eefd',coffee:'photo-1509042239860-f550ce710b93',pasta:'photo-1473093295043-cdd812d0e601',dessert:'photo-1578985545062-69928b1d9587',toast:'photo-1547592180-85f173990554'};
 const item=(name,category,price,desc,photo,mods=[])=>({id:uid(),name,category,price:price*100,description:desc,image:`https://images.unsplash.com/${photos[photo]}?auto=format&fit=crop&w=700&q=80`,available:true,visible:true,modifiers:mods});
 const menu=sample?[
 item('The house burger',categories[1],245,'Chargrilled beef, aged cheddar, crisp lettuce & our house sauce.','burger',[{id:uid(),name:'Extra cheddar',price:2500},{id:uid(),name:'Beef bacon',price:4500}]),
 item('Garden greens',categories[0],145,'Seasonal leaves, avocado, cucumber & a bright citrus dressing.','salad'),
 item('Basil pesto pasta',categories[1],225,'Fresh basil pesto, cherry tomatoes & parmesan shavings.','pasta',[{id:uid(),name:'Grilled chicken',price:6000}]),
 item('Burrata toast',categories[0],185,'Creamy burrata, slow-roasted tomatoes & sourdough.','toast'),
 item('Chocolate celebration',categories[2],135,'A rich chocolate slice, made for one more moment.','dessert'),
 item('Flat white',categories[3],85,'A double shot of our house blend with silky steamed milk.','coffee',[{id:uid(),name:'Oat milk',price:2000},{id:uid(),name:'Extra shot',price:2500}])]:[];
 const t={id,slug:generatedSlug(name,id),name,nameAr:'',tagline:'Good food. Great company.',taglineAr:'طعام شهي وصحبة جميلة.',categoryNames:{},logo:'',currency:'EGP',categories,menu,tables:[],sessions:[],orders:[],payments:[],requests:[],feedback:[],members:[],audit:[],subscription:{status:'trial',monthlyPerTable:null,setupFee:null},setup:{menu:sample,stands:false,printer:false,training:false},supportStatus:'Onboarding',taxBps:0,serviceBps:0};
 for(let i=1;i<=(sample?12:4);i++)t.tables.push({id:uid(),label:String(i).padStart(2,'0'),zone:i<=8?'Main dining':'Terrace',capacity:i%3===0?6:4,token:uid()+uid().replaceAll('-',''),enabled:true,billable:true});
 if(sample){
  for(const [index,status,mi] of [[0,'PENDING',0],[2,'PREPARING',2],[4,'READY',1],[7,'SERVED',3]]){
   const s={id:uid(),tableId:t.tables[index].id,guestName:'',status:'OPEN',version:1,capability:uid()+uid(),openedAt:new Date(Date.now()-(index+2)*240000).toISOString(),taxBps:0,serviceBps:0,openedBy:'Sample data'};t.sessions.push(s);
   const m=menu[mi];t.orders.push({id:uid(),number:t.orders.length+1,sessionId:s.id,status,version:1,createdAt:s.openedAt,updatedAt:s.openedAt,lines:[{id:uid(),itemId:m.id,name:m.name,quantity:2,unitPrice:m.price,basePrice:m.price,modifiers:[],notes:''}],key:uid()});
  }
 }
 return t;
}
export function createInitialState(user) {
 fail(user?.id&&user?.email,'Sign in to initialize the workspace.',401);
 const t=createRestaurant('Olive & Ember',true);
 t.members.push({id:uid(),userId:user.id,email:user.email.toLowerCase(),name:user.name||user.email,permissions:[...PERMISSIONS],active:true});
 return {platformOwner:user.id,restaurants:[t],platformAudit:[],createdAt:now(),sessionLifecycleVersion:1};
}
export function actor(state,user,restaurantId) {
 fail(user?.id,'Staff sign-in required.',401);
 const t=state.restaurants.find(t=>t.id===restaurantId);fail(t,'Restaurant not found.',404);
 const m=t.members.find(m=>m.active&&m.userId===user.id);
 fail(m,'You do not have access to this restaurant.',403); return {t,m};
}
export function bindUser(state,user) {
 if(!user?.id||!user?.email)return false;let changed=false;
 for(const t of state.restaurants){let bound=false;for(const m of t.members)if(!m.userId&&m.active&&m.email===user.email.toLowerCase()){m.userId=user.id;changed=true;bound=true;}if(bound)t.pollRevision=(t.pollRevision||0)+1;}
 return changed;
}
function permit(m,p){fail(m.permissions.includes(p),`Missing permission: ${p}`,403);}
function audit(t,by,action,detail){t.audit.push({id:uid(),at:now(),by,action,detail:txt(detail,500)});}
export function staffView(state,user,restaurantId) {
 upgradeSessionLifecycle(state);
 ensureRestaurantSlugs(state);
 fail(user?.id,'Staff sign-in required.',401);
 const memberships=state.restaurants.filter(t=>t.members.some(m=>m.active&&m.userId===user.id));
 const t=memberships.find(t=>t.id===restaurantId)||memberships[0];
 const platform=isPlatformAdmin(state,user);
 if(restaurantId&&!t)throw new AppError('Restaurant access denied.',403);
 if(!t)return {user,restaurants:[],restaurant:null,platform,permissions:[],platformRestaurants:platform?state.restaurants.map(platformSummary):[]};
 if(restaurantId&&t.id!==restaurantId)throw new AppError('Restaurant access denied.',403);
 const m=t.members.find(m=>m.active&&m.userId===user.id),has=p=>m.permissions.includes(p);
 const sessions=has('sessions.read')||has('billing.read')||has('orders.read')||has('kitchen.read')||has('staff_calls.read')?t.sessions.map(({capability,finalBill,...s})=>({...s,...receiptRates(t,{...s,finalBill}),finalBill:has('billing.read')?finalBill:undefined,bill:has('billing.read')?bill(t,{...s,finalBill}):undefined})):[];
 return {user,platform,permissions:m.permissions,restaurants:memberships.map(x=>({id:x.id,slug:x.slug,name:x.name,nameAr:x.nameAr||''})),platformRestaurants:platform?state.restaurants.map(platformSummary):[],restaurant:{id:t.id,slug:t.slug,name:t.name,nameAr:t.nameAr||'',tagline:t.tagline,taglineAr:t.taglineAr||'',categoryNames:t.categoryNames||{},logo:t.logo,currency:t.currency,taxBps:t.taxBps,serviceBps:t.serviceBps,categories:has('menu.read')?t.categories:[],menu:has('menu.read')?t.menu:[],tables:t.tables.map(table=>({...table,status:sessionFor(t,table)?.status||'TABLE_AVAILABLE'})),sessions,orders:has('orders.read')||has('kitchen.read')||has('billing.read')?t.orders:[],payments:has('billing.read')?t.payments:[],requests: t.requests.filter(r=>r.kind==='bill'?has('billing.read'):has('staff_calls.read')),feedback:has('feedback.read_private')?t.feedback:[],members:has('staff.manage')?t.members:[],audit:has('permissions.manage')?t.audit.slice(-150).reverse():[],subscription:t.subscription,setup:t.setup,supportStatus:t.supportStatus}};
}
const platformSummary=t=>({id:t.id,slug:t.slug,name:t.name,nameAr:t.nameAr||'',subscription:t.subscription,setup:t.setup,supportStatus:t.supportStatus,tableCount:t.tables.length,billableTables:t.tables.filter(x=>x.billable).length,monthlyTotal:t.subscription.monthlyPerTable===null?null:t.tables.filter(x=>x.billable).length*t.subscription.monthlyPerTable});
function locate(state,token){for(const t of state.restaurants){const table=t.tables.find(x=>x.token===token&&x.enabled);if(table)return {t,table};}throw new AppError('This table link is not available.',404);}
const sessionFor=currentSession;
export function guestView(state,token,capability) {
 upgradeSessionLifecycle(state);
 const {t,table}=locate(state,token),active=sessionFor(t,table);
 const s=active&&(!capability||active.capability===capability)?active:null;
 return {restaurant:{appearance:publishedDesign(t),name:t.name,nameAr:t.nameAr||'',tagline:t.tagline,taglineAr:t.taglineAr||'',categoryNames:t.categoryNames||{},logo:publishedDesign(t).branding.logoUrl,currency:t.currency,categories:t.categories,menu:publicMenu(t.menu)},table:{label:table.label,status:active?.status||'TABLE_AVAILABLE'},session:s?{id:s.id,status:s.status,version:s.version,finalizedAt:s.finalizedAt,capability:s.capability,openedAt:s.openedAt,...receiptRates(t,s)}:null,expired:!!capability&&(!active||active.capability!==capability),orders:s?publicOrders(t.orders.filter(o=>o.sessionId===s.id)):[],bill:s?bill(t,s):null,requests:s?t.requests.filter(r=>r.sessionId===s.id).map(({id,kind,status,createdAt})=>({id,kind,status,createdAt})):[]};
}
function linesFrom(t,input,previous=[],s) {
 fail(Array.isArray(input)&&input.length>0&&input.length<=40,'Choose between 1 and 40 items.');
 const seen=new Set();
 return input.map(l=>{
  fail(integer(l.quantity,1,30),'Quantities must be between 1 and 30.');
  const old=previous.find(p=>p.id===l.id);if(old)fail(old.itemId===l.itemId,'Replace an item by adding a new line.');if(l.id){fail(!seen.has(l.id),'Duplicate order line.');seen.add(l.id);}
  const m=t.menu.find(m=>m.id===l.itemId);fail(m,'Menu item no longer exists.');
  fail((m.available&&m.visible)||(old&&l.quantity<=old.quantity),'An item is no longer available. Refresh the menu.');
  fail(!l.modifierIds||Array.isArray(l.modifierIds),'Invalid modifier selection.');const ids=[...new Set(l.modifierIds||[])];fail(ids.length<=10,'Too many modifiers.');
  const modifiers=ids.map(id=>{const oldMod=old?.modifiers.find(x=>x.id===id);const mod=oldMod||m.modifiers.find(x=>x.id===id);fail(mod,'A selected option is no longer available.');return {...mod};});
  const basePrice=old?.basePrice??m.price;
  return {id:old?.id||uid(),itemId:m.id,name:old?.name||m.name,nameAr:old?.nameAr??m.nameAr??'',basePrice,unitPrice:basePrice+modifiers.reduce((s,x)=>s+x.price,0),quantity:l.quantity,modifiers,notes:txt(l.notes,500)};
 });
}
function validateMenu(body,existing){
 fail(txt(body.name),'Item name is required.'); fail(integer(body.price,0,10000000),'Enter a valid price.');fail(txt(body.category),'Category is required.');
 fail(!body.image||/^https:\/\//.test(body.image),'Use an HTTPS image URL.');
 const modifiers=(body.modifiers||[]).slice(0,10).map(m=>{fail(txt(m.name)&&integer(m.price,0,10000000),'Invalid modifier.');return {id:m.id||uid(),name:txt(m.name,80),nameAr:txt(m.nameAr,80),price:m.price};});
 return {id:existing?.id||uid(),name:txt(body.name,100),nameAr:txt(body.nameAr??existing?.nameAr,100),description:txt(body.description,500),descriptionAr:txt(body.descriptionAr??existing?.descriptionAr,500),price:body.price,category:txt(body.category,80),image:txt(body.image,1500),available:body.available!==false,visible:body.visible!==false,modifiers};
}
export function applyCommand(state,user,body){
 const result=executeCommand(state,user,body);
 const restaurant=body.action==='platform.create'?state.restaurants.find(t=>t.id===result.id):body.action?.startsWith('guest.')?state.restaurants.find(t=>t.tables.some(table=>table.token===body.token)):state.restaurants.find(t=>t.id===body.restaurantId);
 if(restaurant)restaurant.pollRevision=(restaurant.pollRevision||0)+1;
 return result;
}
function executeCommand(state,user,body) {
 upgradeSessionLifecycle(state);
 const {action}=body;
 if(action?.startsWith('platform.design.')){
  fail(isPlatformAdmin(state,user),'Platform administrator access required.',403);
  const restaurant=state.restaurants.find(t=>t.id===body.restaurantId);fail(restaurant,'Restaurant not found.',404);
  const result=designCommand(restaurant,user,body);state.platformAudit.push({at:now(),by:user.id,action,restaurantId:restaurant.id,version:result.version});return result;
 }
 if(action==='platform.create'||action==='platform.update'){
  fail(isPlatformAdmin(state,user),'Platform administrator access required.',403);
  let t;if(action==='platform.create'){fail(txt(body.name),'Restaurant name required.');t=createRestaurant(txt(body.name));if(body.slug!==undefined)t.slug=requireSlug(body.slug);fail(!state.restaurants.some(r=>r.slug===t.slug),'Restaurant slug is already in use.',409);state.restaurants.push(t);t.members.push({id:uid(),userId:user.id,email:user.email.toLowerCase(),name:user.name||user.email,permissions:[...PERMISSIONS],active:true});}
  else{t=state.restaurants.find(t=>t.id===body.restaurantId);fail(t,'Restaurant not found.',404);fail(['trial','active','paused'].includes(body.status),'Invalid subscription status.'); for(const k of ['monthlyPerTable','setupFee'])fail(body[k]===null||integer(body[k],0,100000000),'Enter a valid subscription amount.');t.subscription={status:body.status,monthlyPerTable:body.monthlyPerTable,setupFee:body.setupFee};t.supportStatus=txt(body.supportStatus,80);for(const k of ['menu','stands','printer','training'])t.setup[k]=!!body.setup?.[k];}
  state.platformAudit.push({at:now(),by:user.id,action,restaurantId:t.id});return {id:t.id};
 }
 if(action?.startsWith('guest.')){
  const {t,table}=locate(state,body.token),s=sessionFor(t,table);fail(s&&body.capability===s.capability,'This table session has ended. Ask staff to open a new session.',409);
  const recent=t.audit.filter(a=>a.by===s.id&&Date.now()-Date.parse(a.at)<60000).length;fail(recent<45,'Please wait a moment before trying again.',429);
  if(action==='guest.order'||action==='guest.edit'){
   fail(typeof body.key==='string'&&body.key.length>=16&&body.key.length<=100,'A request identifier is required.');
   const duplicate=t.orders.find(o=>o.sessionId===s.id&&o.key===body.key);if(duplicate&&action==='guest.order'){fail(!duplicate.requestPayload||duplicate.requestPayload===JSON.stringify(body.lines),'Request identifier was reused with different data.',409);return {id:duplicate.id};}
   fail(s.status==='OPEN',s.status==='FINALIZED'?'This bill is finalized. Ask staff to open a new session.':'Ordering is paused while your bill is requested. Ask staff to reopen ordering.',409);
   let o;
   if(action==='guest.edit'){
    o=t.orders.find(o=>o.id===body.orderId&&o.sessionId===s.id);fail(o,'Order not found.',404);fail(['PENDING','ACCEPTED'].includes(o.status),'The kitchen has started this order. Add a new order instead.',409);fail(o.version===body.version,'This order changed. Refresh and review the latest version.',409);
    const previousLines=o.lines;o.lines=linesFrom(t,body.lines,o.lines,s);if(bill(t,s).total<bill(t,s).paid){o.lines=previousLines;throw new AppError('This edit would reduce the bill below recorded payments. Please ask staff for assistance.',409);}o.version++;o.updatedAt=now();
   }else{
    o={id:uid(),number:t.orders.length+1,sessionId:s.id,status:'PENDING',version:1,createdAt:now(),updatedAt:now(),lines:linesFrom(t,body.lines,[],s),key:body.key,requestPayload:JSON.stringify(body.lines)};t.orders.push(o);
   }
   s.version++;audit(t,s.id,action,`Order #${o.number}, revision ${o.version}`);return {id:o.id};
  }
  if(action==='guest.bill'||action==='guest.call'){
   if(action==='guest.bill'){
    fail(s.status!=='FINALIZED','This bill is finalized. Ask staff to open a new session.',409);
    if(s.status==='OPEN'){s.status='BILL_REQUESTED';s.billRequestedAt=now();s.version++;}
    else{const last=t.requests.filter(r=>r.sessionId===s.id&&r.kind==='bill').at(-1);if(last)return {id:last.id};}
   }
   const kind=action==='guest.bill'?'bill':'staff';const existing=t.requests.find(r=>r.sessionId===s.id&&r.kind===kind&&r.status!=='resolved');if(existing)return {id:existing.id};
   const last=t.requests.filter(r=>r.sessionId===s.id&&r.kind===kind).at(-1);fail(kind==='bill'||!last||Date.now()-Date.parse(last.createdAt)>30000,'Your recent request has been received. Please wait a moment.',429);
   const r={id:uid(),sessionId:s.id,tableId:table.id,kind,status:'pending',createdAt:now()};t.requests.push(r);audit(t,s.id,action,`Table ${table.label}`);return {id:r.id};
  }
  if(action==='guest.feedback'){
   fail(integer(body.rating,1,5),'Choose a rating from 1 to 5.');fail(typeof body.key==='string'&&body.key.length>=16,'Feedback identifier required.');
   if(t.feedback.some(f=>f.key===body.key&&f.sessionId===s.id))return {ok:true};
   fail(t.feedback.filter(f=>f.sessionId===s.id).length<30,'Thank you. Feedback for this table is complete.',429);
   t.feedback.push({id:uid(),sessionId:s.id,tableId:table.id,key:body.key,rating:body.rating,comment:txt(body.comment,1500),createdAt:now()});audit(t,s.id,action,'Private feedback submitted');return {ok:true};
  }
  throw new AppError('Unknown guest action.');
 }
 const {t,m}=actor(state,user,body.restaurantId),by=m.name||m.email;
 const table=t.tables.find(x=>x.id===body.tableId);
 const s=t.sessions.find(x=>x.id===body.sessionId);
 switch(action){
  case 'session.open':{
   permit(m,'sessions.open');if(body.key){const duplicate=t.sessions.find(session=>session.openKey===body.key);if(duplicate){fail(duplicate.tableId===body.tableId&&duplicate.guestName===txt(body.guestName,80),'Request identifier was reused with different data.',409);return {id:duplicate.id};}}fail(table&&table.enabled,'Table not found.',404);const previous=sessionFor(t,table);fail(!previous||previous.status==='FINALIZED','This table is already occupied.',409);
   if(previous)releaseSession(t,previous,by,'new_session');
   const s={id:uid(),tableId:table.id,guestName:txt(body.guestName,80),...(body.key?{openKey:body.key}:{}),status:'OPEN',version:1,capability:uid()+uid(),openedAt:now(),openedBy:by,taxBps:t.taxBps,serviceBps:t.serviceBps};t.sessions.push(s);audit(t,by,action,`Table ${table.label}`);return {id:s.id};
  }
  case 'session.reopen':{
   permit(m,'sessions.open');fail(s&&!s.releasedAt,'Active session not found.',404);fail(s.status==='BILL_REQUESTED','Only a requested bill can be reopened before finalization.',409);expectVersion(s,body.expectedVersion);
   s.status='OPEN';s.version++;s.reopenedAt=now();s.reopenedBy=by;for(const r of t.requests.filter(r=>r.sessionId===s.id&&r.kind==='bill'))r.status='resolved';audit(t,by,action,s.id);break;
  }
  case 'billing.finalize':{
   permit(m,'billing.finalize');fail(s,'Session not found.',404);
   if(s.status==='FINALIZED'){fail(s.finalizedFromVersion===body.expectedVersion&&s.finalBill.total===body.expectedTotal,'This bill has already been finalized.',409);return {ok:true};}
   fail(!s.releasedAt&&['OPEN','BILL_REQUESTED'].includes(s.status),'Active session not found.',409);expectVersion(s,body.expectedVersion);
   const b=bill(t,s);fail(b.total===body.expectedTotal,'The bill changed. Review the current total before recording payment.',409);
   Object.assign(s,receiptRates(t,s));s.finalBill=financialSnapshot(b);s.finalizedFromVersion=s.version;s.status='FINALIZED';s.finalizedAt=now();s.finalizedBy=by;s.version++;
   for(const r of t.requests.filter(r=>r.sessionId===s.id&&r.kind==='bill'))r.status='resolved';audit(t,by,action,s.id);break;
  }
  case 'session.close':{
   permit(m,'sessions.close');fail(s,'Session not found.',404);fail(bill(t,s).due===0,'Record the outstanding payment before closing this table.',409);fail(s.status==='FINALIZED','Finalize the bill before making the table available.',409);
   if(s.closedAt)return {ok:true};if(!s.releasedAt)releaseSession(t,s,by,'table_available');s.closedAt=now();s.closedBy=by;audit(t,by,action,s.id);break;
  }
  case 'order.status':{
   const o=t.orders.find(o=>o.id===body.orderId);fail(o,'Order not found.',404);fail(t.sessions.some(s=>s.id===o.sessionId&&SESSION_STATES.includes(s.status)),'Session has closed.',409);
   const perms={ACCEPTED:'orders.manage',PREPARING:'kitchen.start_preparing',READY:'kitchen.mark_ready',SERVED:'orders.manage'};fail(perms[body.status],'Invalid order status.');permit(m,perms[body.status]);
   const allowed={PENDING:['ACCEPTED','PREPARING'],ACCEPTED:['PREPARING'],PREPARING:['READY'],READY:['SERVED'],SERVED:[]};fail(allowed[o.status].includes(body.status),'This order has already moved on. Refresh the queue.',409);fail(body.version===o.version,'Order changed. Review the latest details before continuing.',409);
   o.status=body.status;o.version++;o.updatedAt=now();audit(t,by,action,`Order #${o.number} → ${o.status}`);break;
  }
  case 'billing.pay':{
   permit(m,'billing.record_payment');fail(s&&SESSION_STATES.includes(s.status),'Active session not found.',404);fail(['cash','card'].includes(body.method),'Select cash or card.');fail(!body.dinerId,'Only the combined table bill can be paid.');fail(typeof body.key==='string'&&body.key.length>=16&&body.key.length<=100,'Payment identifier required.');const duplicate=t.payments.find(p=>p.key===body.key&&p.sessionId===s.id);if(duplicate){fail(duplicate.amount===body.amount&&duplicate.method===body.method,'Request identifier was reused with different data.',409);return {ok:true};}const b=bill(t,s);fail(b.due>0,'This bill is already settled.',409);fail(b.total===body.expectedTotal&&b.due===body.amount,'The bill changed. Review the current total before recording payment.',409);
   t.payments.push({id:uid(),sessionId:s.id,amount:b.due,method:body.method,createdAt:now(),by,key:body.key});s.version++;for(const r of t.requests.filter(r=>r.sessionId===s.id&&r.kind==='bill'))r.status='resolved';audit(t,by,action,`${body.method}: ${b.due/100} ${t.currency}`);break;
  }
  case 'billing.print':{
   permit(m,'billing.print');fail(s,'Session not found.',404);const mode=body.mode??'draft';fail(['draft','final'].includes(mode),'Choose draft or final bill printing.');fail(mode!=='final'||s.status==='FINALIZED','Finalize the bill before printing a final bill.',409);
   audit(t,by,action,`Session ${s.id}; total ${bill(t,s).total/100}`);return {mode,sessionId:s.id,status:s.status,finalizedAt:s.finalizedAt,finalizedBy:s.finalizedBy,bill:bill(t,s),orders:t.orders.filter(o=>o.sessionId===s.id)};
  }
  case 'request.status':{
   const r=t.requests.find(r=>r.id===body.requestId);fail(r,'Request not found.',404);permit(m,r.kind==='bill'?'billing.read':'staff_calls.resolve');fail(['acknowledged','resolved'].includes(body.status),'Invalid request state.');r.status=body.status;r.updatedAt=now();audit(t,by,action,r.id);break;
  }
  case 'menu.save':{
   permit(m,'menu.write');const i=t.menu.findIndex(x=>x.id===body.item?.id);const item=validateMenu(body.item||{},t.menu[i]);if(i>=0)t.menu[i]=item;else t.menu.push(item);if(!t.categories.includes(item.category))t.categories.push(item.category);audit(t,by,action,item.name);break;
  }
  case 'menu.availability':{
   permit(m,'menu.write');const item=t.menu.find(x=>x.id===body.itemId);fail(item,'Item not found.',404);item.available=!!body.available;audit(t,by,action,`${item.name}: ${item.available?'Available':'Out of stock'}`);break;
  }
  case 'category.save':permit(m,'menu.write');fail(txt(body.name),'Category name required.');if(body.previous){fail(t.categories.includes(body.previous),'Category not found.');t.categories=t.categories.map(c=>c===body.previous?txt(body.name,80):c);for(const item of t.menu)if(item.category===body.previous)item.category=txt(body.name,80);}else if(!t.categories.includes(txt(body.name,80)))t.categories.push(txt(body.name,80));t.categoryNames||={};if(body.previous&&body.previous!==txt(body.name,80)){t.categoryNames[txt(body.name,80)]=t.categoryNames[body.previous]||'';delete t.categoryNames[body.previous];}if(body.nameAr!==undefined)t.categoryNames[txt(body.name,80)]=txt(body.nameAr,80);audit(t,by,action,body.name);break;
  case 'table.rotate_token':{
   permit(m,'sessions.open');permit(m,'permissions.manage');fail(table,'Table not found.',404);table.token=uid()+uid();const active=sessionFor(t,table);if(active){active.capability=uid()+uid();active.version++;}audit(t,by,action,'Permanent table link rotated');return {ok:true};
  }
  case 'table.save':{
   permit(m,'sessions.open');permit(m,'permissions.manage');fail(txt(body.label),'Table label required.');fail(!t.tables.some(x=>x.id!==body.tableId&&x.label===txt(body.label)),'Table labels must be unique.');const current=table||{id:uid(),token:uid()+uid()};fail(!table||body.enabled!==false||!sessionFor(t,table),'Close the session before disabling a table.',409);Object.assign(current,{label:txt(body.label,20),zone:txt(body.zone,40)||'Main dining',capacity:integer(body.capacity,1,30)?body.capacity:4,enabled:body.enabled!==false,billable:body.billable!==false});if(!table)t.tables.push(current);audit(t,by,action,current.label);break;
  }
  case 'staff.save':{
   permit(m,'staff.manage');permit(m,'permissions.manage');const email=txt(body.email,160).toLowerCase();fail(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter a valid staff email.');fail(Array.isArray(body.permissions)&&body.permissions.every(p=>PERMISSIONS.includes(p)),'Invalid permissions.');
   let member=t.members.find(x=>x.id===body.memberId);fail(!t.members.some(x=>x.email===email&&x!==member),'This email is already registered.');fail(member?.userId!==user.id||body.active!==false&&PERMISSIONS.every(p=>!m.permissions.includes(p)||body.permissions.includes(p)),'You cannot remove your own administrative access.');
   if(member){fail(member.email===email,'Create a new staff record to change the login email.');Object.assign(member,{name:txt(body.name,80)||email,permissions:[...new Set(body.permissions)],active:body.active!==false});}else t.members.push({id:uid(),userId:null,name:txt(body.name,80)||email,email,permissions:[...new Set(body.permissions)],active:true});audit(t,by,action,email);break;
  }
  case 'settings.save':{permit(m,'permissions.manage');fail(!['logo','websiteDesign','design','appearance','colors','typography','branding','components','implementationId'].some(key=>Object.hasOwn(body,key)),'Website design is managed by Tap2Serve.',403);fail(txt(body.name),'Restaurant name required.');fail(integer(body.taxBps,0,10000)&&integer(body.serviceBps,0,10000),'Enter percentages from 0 to 100.');const live=t.sessions.filter(s=>!s.finalBill&&!s.releasedAt&&['OPEN','BILL_REQUESTED'].includes(s.status));
   for(const session of live){const current=bill(t,session);fail(priceBill(current.subtotal,body).total>=current.paid,'These rates would reduce a bill below recorded payments. Please settle the table with staff first.',409);}
   const changed=t.taxBps!==body.taxBps||t.serviceBps!==body.serviceBps;
   for(const session of live){if(changed||session.taxBps!==body.taxBps||session.serviceBps!==body.serviceBps){session.taxBps=body.taxBps;session.serviceBps=body.serviceBps;session.version++;}}
   t.name=txt(body.name,100);t.nameAr=txt(body.nameAr??t.nameAr,100);t.tagline=txt(body.tagline,180);t.taglineAr=txt(body.taglineAr??t.taglineAr,180);t.taxBps=body.taxBps;t.serviceBps=body.serviceBps;audit(t,by,action,'Restaurant content and unfinalized bill rates updated');break;}
  default:throw new AppError('Unknown action.');
 }
 return {ok:true};
}
