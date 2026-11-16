// Shared mapping for the staged D1 adapter, offline migration, and verification.
// Only unmapped/retired fields live in extra_json; operational fields are columns.
export const MODEL_VERSION = 3;
const f = (property, column, type = 'TEXT', check = '') => ({ property, column, type, check });
const money = (p, c = p) => f(p, c, 'INTEGER', `${c} >= 0`);
const bool = p => f(p, p, 'BOOLEAN', `${p} IN (0,1)`);
export const models = {
 restaurants: { fields: [f('websiteDesign','website_design_json','JSON'),f('slug','slug'),f('name','name'),f('nameAr','name_ar'),f('tagline','tagline'),f('taglineAr','tagline_ar'),f('categoryNames','category_names_json','JSON'),f('logo','logo'),f('currency','currency'),money('taxBps','tax_bps'),money('serviceBps','service_bps'),f('supportStatus','support_status')] },
 memberships: { collection:'members', fields:[f('userId','user_id'),f('email','email'),f('name','name'),bool('active')] },
 menus: { fields:[] },
 menu_categories: { fields:[f('name','name')] },
 menu_items: { collection:'menu', fields:[f('name','name'),f('nameAr','name_ar'),f('description','description'),f('descriptionAr','description_ar'),money('price'),f('category','category'),f('image','image'),bool('available'),bool('visible')] },
 menu_modifiers: { fields:[f('name','name'),f('nameAr','name_ar'),money('price')] },
 dining_tables: { collection:'tables', fields:[f('label','label'),f('zone','zone'),f('capacity','capacity','INTEGER','capacity BETWEEN 1 AND 30'),f('token','token'),bool('enabled'),bool('billable')] },
 sessions: { collection:'sessions', fields:[f('tableId','table_id'),f('guestName','guest_name'),f('status','status','TEXT',"status IN ('OPEN','BILL_REQUESTED','FINALIZED')"),f('version','version','INTEGER','version >= 1'),f('capability','capability'),f('openedAt','opened_at'),f('openedBy','opened_by'),money('taxBps','tax_bps'),money('serviceBps','service_bps'),f('billRequestedAt','bill_requested_at'),f('finalizedAt','finalized_at'),f('finalizedBy','finalized_by'),f('finalizedFromVersion','finalized_from_version','INTEGER'),f('releasedAt','released_at'),f('releasedBy','released_by'),f('releaseReason','release_reason'),f('closedAt','closed_at'),f('closedBy','closed_by'),f('reopenedAt','reopened_at'),f('reopenedBy','reopened_by')] },
 bills: { fields:[money('subtotal'),money('service'),money('tax'),money('total')] },
 orders: { collection:'orders', fields:[f('sessionId','session_id'),f('number','number','INTEGER','number >= 1'),f('status','status','TEXT',"status IN ('PENDING','ACCEPTED','PREPARING','READY','SERVED')"),f('version','version','INTEGER','version >= 1'),f('createdAt','created_at'),f('updatedAt','updated_at'),f('key','idempotency_key')] },
 order_items: { fields:[f('itemId','item_id'),f('name','name'),f('nameAr','name_ar'),money('basePrice','base_price'),money('unitPrice','unit_price'),f('quantity','quantity','INTEGER','quantity BETWEEN 1 AND 30'),f('notes','notes')] },
 order_item_modifiers: { fields:[f('id','modifier_id'),f('name','name'),f('nameAr','name_ar'),money('price')] },
 payments: { collection:'payments', fields:[f('sessionId','session_id'),money('amount'),f('method','method'),f('createdAt','created_at'),f('by','recorded_by'),f('key','idempotency_key')] },
 service_requests: { collection:'requests', fields:[f('sessionId','session_id'),f('tableId','table_id'),f('kind','kind','TEXT',"kind IN ('bill','staff')"),f('status','status','TEXT',"status IN ('pending','acknowledged','resolved')"),f('createdAt','created_at'),f('updatedAt','updated_at')] },
 feedback: { collection:'feedback', fields:[f('sessionId','session_id'),f('tableId','table_id'),f('key','idempotency_key'),f('rating','rating','INTEGER','rating BETWEEN 1 AND 5'),f('comment','comment'),f('createdAt','created_at')] },
 subscriptions: { fields:[f('status','status'),money('monthlyPerTable','monthly_per_table'),money('setupFee','setup_fee')] },
 restaurant_setup: { fields:[bool('menu'),bool('stands'),bool('printer'),bool('training')] },
 audit_events: { collection:'audit', fields:[f('at','occurred_at'),f('by','actor'),f('action','action'),f('detail','detail')] },
};
export const parentColumns = {menu_categories:'menu_id',menu_items:'menu_id',menu_modifiers:'item_id',bills:'session_id',order_items:'order_id',order_item_modifiers:'order_item_id'};
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k])=>!keys.includes(k)));
export function encode(table, value, restaurantId, id, position=0, parent=null, excluded=[]) {
 const spec=models[table], keys=spec.fields.map(f=>f.property);
 const row={restaurant_id:restaurantId,id,position,extra_json:JSON.stringify(omit(value,[...keys,...excluded,...(table==='order_item_modifiers'?[]:['id'])])),present_json:JSON.stringify([...keys.filter(k=>Object.hasOwn(value,k)),...(Object.hasOwn(value,'id')?['$id']:[])])};
 if(parentColumns[table])row[parentColumns[table]]=parent;
 for(const f of spec.fields){const v=value[f.property];row[f.column]=v==null?null:f.type==='JSON'?JSON.stringify(v):f.type==='BOOLEAN'?Number(v):v;}
 return row;
}
export function decode(table,row,includeId=true) {
 const out=JSON.parse(row.extra_json), present=new Set(JSON.parse(row.present_json));
 if(includeId)out.id=row.id;
 for(const f of models[table].fields)if(present.has(f.property)){const v=row[f.column];out[f.property]=v===null?null:f.type==='JSON'?JSON.parse(v):f.type==='BOOLEAN'?!!v:v;}
 return out;
}
export function encodeRestaurant(t) {
 const rows=Object.fromEntries(Object.keys(models).map(k=>[k,[]]));
 const add=(table,value,id,position=0,parent=null,excluded=[])=>rows[table].push(encode(table,value,t.id,id,position,parent,excluded));
 add('restaurants',t,t.id,0,null,[...Object.values(models).map(m=>m.collection).filter(Boolean),'categories','subscription','setup']);
 add('menus',{},t.id);t.categories.forEach((name,i)=>add('menu_categories',{name},String(i),i,t.id));
 for(const [table,spec] of Object.entries(models))if(spec.collection)t[spec.collection].forEach((v,i)=>add(table,v,v.id??String(i),i,table==='menu_items'?t.id:null,table==='memberships'?['permissions']:table==='menu_items'?['modifiers']:table==='sessions'?['finalBill']:table==='orders'?['lines']:[]));
 t.menu.forEach(m=>m.modifiers.forEach((v,i)=>add('menu_modifiers',v,v.id,i,m.id)));
 t.sessions.forEach(s=>{if(s.finalBill)add('bills',s.finalBill,s.id,0,s.id);});
 t.orders.forEach(o=>o.lines.forEach((l,i)=>{add('order_items',l,l.id,i,o.id,['modifiers']);l.modifiers.forEach((m,j)=>add('order_item_modifiers',m,`${l.id}:${j}`,j,l.id));}));
 add('subscriptions',t.subscription,t.id);add('restaurant_setup',t.setup,t.id);
 rows.membership_permissions=t.members.flatMap(m=>m.permissions.map((permission,position)=>({restaurant_id:t.id,membership_id:m.id,position,permission})));
 return rows;
}
export function decodeRestaurant(rows) {
 const sorted=k=>[...(rows[k]||[])].sort((a,b)=>a.position-b.position);
 const t=decode('restaurants',rows.restaurants[0]);
 t.categories=sorted('menu_categories').map(r=>decode('menu_categories',r,false).name);
 for(const [table,spec] of Object.entries(models))if(spec.collection)t[spec.collection]=sorted(table).map(r=>decode(table,r,table!=='audit_events'||JSON.parse(r.present_json).includes('$id')));
 t.members.forEach(m=>m.permissions=sorted('membership_permissions').filter(r=>r.membership_id===m.id).map(r=>r.permission));
 t.menu.forEach(m=>m.modifiers=sorted('menu_modifiers').filter(r=>r.item_id===m.id).map(r=>decode('menu_modifiers',r)));
 t.sessions.forEach(s=>{const row=rows.bills.find(r=>r.session_id===s.id);if(row)s.finalBill=decode('bills',row,false);});
 t.orders.forEach(o=>o.lines=sorted('order_items').filter(r=>r.order_id===o.id).map(r=>({...decode('order_items',r),modifiers:sorted('order_item_modifiers').filter(m=>m.order_item_id===r.id).map(m=>decode('order_item_modifiers',m,false))})));
 t.subscription=decode('subscriptions',rows.subscriptions[0],false);t.setup=decode('restaurant_setup',rows.restaurant_setup[0],false);
 return t;
}
export const canonical = v => JSON.stringify(v, function(_key,value){return value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value;});
export function insertStatement(table,row) {
 const columns=Object.keys(row);return {sql:`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,params:columns.map(k=>row[k])};
}
