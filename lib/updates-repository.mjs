import { AppError,staffView,guestView,isPlatformAdmin } from './domain.mjs';
import { models,decodeRestaurant,MODEL_VERSION } from './normalized-model.mjs';
import { enforceScope } from './tenant-routing.mjs';

const names=[...Object.keys(models),'membership_permissions'];
export const PAGE_SIZE=50;
const views=new Set(['live','history','feedback','service','activity','platform']);
export function updateContext(input){
 const view=input.view||'live',cursor=input.cursor===null||input.cursor===undefined||input.cursor===''?null:Number(input.cursor);
 if(!views.has(view)||cursor!==null&&(!Number.isSafeInteger(cursor)||cursor<0))throw new AppError('Invalid request.');
 if(view==='platform'&&input.scope&&!['admin','local'].includes(input.scope.kind))throw new AppError('Platform administrator access required.',403);
 if(!input.token&&!input.user?.id)throw new AppError('Staff sign-in required.',401);
 if(input.scope)enforceScope(input.scope,input.restaurantId,input.token?'guest.read':undefined);
 return {...input,view,cursor,restaurantId:input.scope?.kind==='tenant'?input.scope.restaurantId:input.restaurantId||null};
}
async function tag(ctx,meta){
 const source=JSON.stringify(['updates-v1',ctx.backend,meta.id,meta.revision,meta.owner_id,ctx.user?.id,ctx.user?.isSuperAdmin,ctx.scope?.kind,ctx.token,ctx.capability,ctx.view,ctx.cursor]);
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
 return '"u1-'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')+'"';
}
const sql=(query,...params)=>({sql:query,params});
export function createUpdatesRepository(db,{backend='legacy'}={}){
 async function read(input){
  const ctx=updateContext({...input,backend}),metrics={queries:0,rowsRead:0,rowsWritten:0};
  const prepared=s=>db.prepare(s.sql).bind(...s.params);
  const account=result=>{metrics.queries++;metrics.rowsRead+=result.meta?.rows_read??0;metrics.rowsWritten+=result.meta?.rows_written??0;return result.results;};
  const query=async s=>account(await prepared(s).all());
  const batch=async statements=>(await db.batch(statements.map(prepared))).map(account);
  let meta=await metadata(ctx,query);
  if(meta.needsInitialize)return {needsInitialize:true,metrics};
  const required={history:'billing.read',feedback:'feedback.read_private',service:'staff_calls.read',activity:'permissions.manage'}[ctx.view];
  if(required&&!ctx.token&&meta.id){
   const permissions=backend==='normalized'?await query(sql('SELECT p.permission FROM membership_permissions p JOIN memberships m ON m.restaurant_id=p.restaurant_id AND m.id=p.membership_id WHERE m.restaurant_id=? AND m.user_id=? AND m.active=1',meta.id,ctx.user.id)):await query(sql("SELECT p.value permission FROM app_state a,json_each(a.payload,'$.restaurants') r,json_each(r.value,'$.members') m,json_each(m.value,'$.permissions') p WHERE a.id='main' AND json_extract(r.value,'$.id')=? AND json_extract(m.value,'$.userId')=? AND json_extract(m.value,'$.active')=1",meta.id,ctx.user.id));
   if(!permissions.some(p=>p.permission===required))throw new AppError('Missing permission: '+required,403);
  }
  const etag=await tag(ctx,meta);
  if(input.etag===etag)return {unchanged:true,etag,revision:meta.revision,metrics};
  if(!meta.id){return {etag,data:{user:ctx.user,restaurant:null,restaurants:[],permissions:[],platform:isPlatformAdmin({platformOwner:meta.owner_id},ctx.user),platformRestaurants:[],revision:meta.revision,sync:{view:ctx.view,hasMore:false,nextCursor:null}},metrics};}
  if(ctx.scope?.kind==='admin'||ctx.view==='platform'){
   if(!isPlatformAdmin({platformOwner:meta.owner_id},ctx.user))throw new AppError('Platform administrator access required.',403);
   const result=await platform(ctx,query);meta=result.meta;
   return {etag:await tag(ctx,meta),data:{user:ctx.user,restaurant:null,restaurants:[],permissions:[],platform:true,platformRestaurants:result.summaries,revision:meta.revision,sync:{view:'platform',hasMore:false,nextCursor:null}},metrics};
  }
  for(let attempt=0;attempt<3;attempt++){
   const snapshot=backend==='normalized'?await normalized(ctx,meta,query,batch):await legacy(ctx,meta,query);
   if(snapshot.retry){meta=await metadata(ctx,query);continue;}
   const {restaurant,page}=snapshot;meta=snapshot.meta;
   const state={sessionLifecycleVersion:snapshot.lifecycleVersion,platformOwner:ctx.scope?.kind==='tenant'?null:meta.owner_id,platformAudit:[],restaurants:[restaurant]};
   const data=ctx.token?guestView(state,ctx.token,ctx.capability):staffView(state,ctx.user,restaurant.id);
   if(!ctx.token){data.restaurants=await navigation(ctx,query,restaurant);data.platformRestaurants=[];}
   return {etag:await tag(ctx,meta),data:{...data,revision:meta.revision,sync:{view:ctx.view,hasMore:page.hasMore,nextCursor:page.nextCursor}},metrics};
  }
  throw new AppError('Another update is in progress. Please try again.',409);
 }

 async function metadata(ctx,query){
  if(backend==='normalized'){
   const admin=ctx.scope?.kind==='admin'||ctx.view==='platform';
   const select=ctx.token?'SELECT restaurant_id FROM dining_tables WHERE token=? AND enabled=1'+(ctx.restaurantId?' AND restaurant_id=?':'')+' LIMIT 1':admin?'SELECT id FROM restaurants ORDER BY position,id LIMIT 1':`SELECT restaurant_id FROM memberships WHERE active=1 AND (user_id=? OR (user_id IS NULL AND email=?))${ctx.restaurantId?' AND restaurant_id=?':''} ORDER BY CASE WHEN user_id IS NULL THEN 1 ELSE 0 END,restaurant_id LIMIT 1`;
   const params=ctx.token?[ctx.token,...(ctx.restaurantId?[ctx.restaurantId]:[])]:admin?[]:[ctx.user.id,ctx.user.email.toLowerCase(),...(ctx.restaurantId?[ctx.restaurantId]:[])];
   const rows=await query(sql(`SELECT c.owner_id,mr.verified,mr.model_version,r.id,r.revision,${admin?'COALESCE((SELECT SUM(revision)+COUNT(*) FROM restaurants),0)':'NULL'} AS admin_revision,${!ctx.token&&!admin?'(SELECT user_id IS NULL FROM memberships WHERE restaurant_id=r.id AND active=1 AND (user_id=? OR (user_id IS NULL AND email=?)) ORDER BY user_id IS NULL LIMIT 1)':'0'} AS pending FROM platform_config c CROSS JOIN migration_runs mr LEFT JOIN restaurants r ON r.id=(${select}) WHERE c.id='main'`,...(!ctx.token&&!admin?[ctx.user.id,ctx.user.email.toLowerCase()]:[]),...params));
   if(rows.length!==1||rows[0].verified!==1||rows[0].model_version!==MODEL_VERSION)throw new AppError('Restaurant setup is not complete.',503);
   const row=rows[0];if(admin){if(!isPlatformAdmin({platformOwner:row.owner_id},ctx.user))throw new AppError('Platform administrator access required.',403);return {...row,id:'platform',revision:row.admin_revision};}
   if(!row.id&&ctx.token)throw new AppError('This table link is not available.',404);
   if(!row.id&&ctx.restaurantId)throw new AppError('Restaurant access denied.',403);
   return {...row,revision:row.revision??0,needsInitialize:!!row.pending};
  }
  const admin=ctx.scope?.kind==='admin'||ctx.view==='platform';
  const where=ctx.token?`EXISTS(SELECT 1 FROM json_each(r.value,'$.tables') tb WHERE json_extract(tb.value,'$.token')=? AND json_extract(tb.value,'$.enabled')=1)`:admin?'1=1':`EXISTS(SELECT 1 FROM json_each(r.value,'$.members') m WHERE json_extract(m.value,'$.active')=1 AND (json_extract(m.value,'$.userId')=? OR (json_extract(m.value,'$.userId') IS NULL AND lower(json_extract(m.value,'$.email'))=?)))`;
  const rows=await query(sql(`SELECT a.revision AS global_revision,json_extract(a.payload,'$.platformOwner') AS owner_id,json_extract(r.value,'$.id') AS id,COALESCE(json_extract(r.value,'$.pollRevision'),0) AS revision,${!ctx.token&&!admin?`NOT EXISTS(SELECT 1 FROM json_each(r.value,'$.members') m WHERE json_extract(m.value,'$.active')=1 AND json_extract(m.value,'$.userId')=?)`:'0'} AS pending FROM app_state a LEFT JOIN json_each(a.payload,'$.restaurants') r ON ${where}${ctx.restaurantId?" AND json_extract(r.value,'$.id')=?":''} WHERE a.id='main' ORDER BY CAST(r.key AS INTEGER) LIMIT 1`,...(!ctx.token&&!admin?[ctx.user.id]:[]),...(ctx.token?[ctx.token]:admin?[]:[ctx.user.id,ctx.user.email.toLowerCase()]),...(ctx.restaurantId?[ctx.restaurantId]:[])));
  if(!rows.length)return {needsInitialize:true};
  const row=rows[0];if(admin){if(!isPlatformAdmin({platformOwner:row.owner_id},ctx.user))throw new AppError('Platform administrator access required.',403);return {...row,id:'platform',revision:row.global_revision};}
  if(!row.id&&ctx.token)throw new AppError('This table link is not available.',404);
  if(!row.id&&ctx.restaurantId)throw new AppError('Restaurant access denied.',403);
  return {...row,needsInitialize:!!row.pending};
 }

 async function navigation(ctx,query,t){
  if(ctx.scope?.kind==='tenant')return [{id:t.id,slug:t.slug,name:t.name,nameAr:t.nameAr||''}];
  const rows=backend==='normalized'?await query(sql('SELECT r.id,r.slug,r.name,r.name_ar FROM restaurants r JOIN memberships m ON m.restaurant_id=r.id WHERE m.active=1 AND m.user_id=? ORDER BY r.position,r.id',ctx.user.id)):await query(sql("SELECT json_extract(r.value,'$.id') id,json_extract(r.value,'$.slug') slug,json_extract(r.value,'$.name') name,json_extract(r.value,'$.nameAr') name_ar FROM app_state a,json_each(a.payload,'$.restaurants') r WHERE a.id='main' AND EXISTS(SELECT 1 FROM json_each(r.value,'$.members') m WHERE json_extract(m.value,'$.active')=1 AND json_extract(m.value,'$.userId')=?) ORDER BY CAST(r.key AS INTEGER)",ctx.user.id));
  return rows.map(r=>({id:r.id,slug:r.slug,name:r.name,nameAr:r.name_ar||''}));
 }
 async function platform(ctx,query){
  if(backend==='normalized'){
   const rows=await query(sql('SELECT r.id,r.slug,r.name,r.name_ar,r.revision,r.support_status,s.status,s.monthly_per_table,s.setup_fee,u.menu,u.stands,u.printer,u.training,COUNT(t.id) table_count,COALESCE(SUM(t.billable),0) billable_tables FROM restaurants r JOIN subscriptions s ON s.restaurant_id=r.id JOIN restaurant_setup u ON u.restaurant_id=r.id LEFT JOIN dining_tables t ON t.restaurant_id=r.id GROUP BY r.id ORDER BY r.position,r.id'));
   return {meta:{id:'platform',owner_id:ctx.user.id,revision:rows.reduce((n,r)=>n+r.revision+1,0)},summaries:rows.map(r=>({id:r.id,slug:r.slug,name:r.name,nameAr:r.name_ar||'',supportStatus:r.support_status,subscription:{status:r.status,monthlyPerTable:r.monthly_per_table,setupFee:r.setup_fee},setup:{menu:!!r.menu,stands:!!r.stands,printer:!!r.printer,training:!!r.training},tableCount:r.table_count,billableTables:r.billable_tables,monthlyTotal:r.monthly_per_table===null?null:r.monthly_per_table*r.billable_tables}))};
  }
  const rows=await query(sql("SELECT a.revision,json_extract(a.payload,'$.platformOwner') owner_id,json_extract(r.value,'$.id') id,json_extract(r.value,'$.slug') slug,json_extract(r.value,'$.name') name,json_extract(r.value,'$.nameAr') name_ar,json_extract(r.value,'$.subscription') subscription,json_extract(r.value,'$.setup') setup,json_extract(r.value,'$.supportStatus') support_status,json_array_length(r.value,'$.tables') table_count,(SELECT COUNT(*) FROM json_each(r.value,'$.tables') tb WHERE json_extract(tb.value,'$.billable')=1) billable_tables FROM app_state a LEFT JOIN json_each(a.payload,'$.restaurants') r ON 1=1 WHERE a.id='main' ORDER BY CAST(r.key AS INTEGER)"));
  return {meta:{id:'platform',owner_id:rows[0].owner_id,revision:rows[0].revision},summaries:rows.filter(r=>r.id).map(r=>{const subscription=JSON.parse(r.subscription);return {id:r.id,slug:r.slug,name:r.name,nameAr:r.name_ar||'',supportStatus:r.support_status,subscription,setup:JSON.parse(r.setup),tableCount:r.table_count,billableTables:r.billable_tables,monthlyTotal:subscription.monthlyPerTable===null?null:subscription.monthlyPerTable*r.billable_tables};})};
 }

 async function normalized(ctx,meta,query,batch){
  const rid=meta.id,limit=ctx.view==='activity'?150:PAGE_SIZE;
  const pageTable={history:'sessions',feedback:'feedback',service:'service_requests',activity:'audit_events'}[ctx.view];
  const pageRows=pageTable&&!ctx.token?await query(sql(`SELECT id,position${['feedback','service_requests'].includes(pageTable)?',session_id':''} FROM ${pageTable} WHERE restaurant_id=?${ctx.view==='history'?" AND released_at IS NOT NULL":ctx.view==='service'?" AND status='resolved'":''}${ctx.cursor!==null?' AND position<?':''} ORDER BY position DESC LIMIT ?`,rid,...(ctx.cursor!==null?[ctx.cursor]:[]),limit+1)):[];
  const page={hasMore:pageRows.length>limit,nextCursor:pageRows.length>limit?String(pageRows[limit-1].position):null};
  const chosen=pageRows.slice(0,limit),pageIds=JSON.stringify(chosen.map(r=>r.id));
  let sessions;
  if(ctx.token)sessions=await query(sql('SELECT s.id FROM sessions s JOIN dining_tables t ON t.restaurant_id=s.restaurant_id AND t.id=s.table_id WHERE t.restaurant_id=? AND t.token=? AND t.enabled=1 AND s.released_at IS NULL',rid,ctx.token));
  else sessions=await query(sql(`SELECT id FROM sessions WHERE restaurant_id=? AND released_at IS NULL UNION SELECT session_id AS id FROM orders WHERE restaurant_id=? AND status IN ('PENDING','ACCEPTED','PREPARING','READY') UNION SELECT s.id FROM sessions s JOIN bills b ON b.restaurant_id=s.restaurant_id AND b.session_id=s.id WHERE s.restaurant_id=? AND s.status='FINALIZED' AND s.closed_at IS NULL AND b.total>COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.restaurant_id=s.restaurant_id AND p.session_id=s.id),0) UNION SELECT value AS id FROM json_each(?)`,rid,rid,rid,JSON.stringify([...chosen.filter(()=>ctx.view==='history').map(r=>r.id),...chosen.filter(r=>r.session_id).map(r=>r.session_id)])));
  const ids=JSON.stringify(sessions.map(s=>s.id)),conditions={sessions:['id IN (SELECT value FROM json_each(?))',ids],bills:['session_id IN (SELECT value FROM json_each(?))',ids],orders:['session_id IN (SELECT value FROM json_each(?))',ids],payments:['session_id IN (SELECT value FROM json_each(?))',ids],order_items:['order_id IN (SELECT id FROM orders WHERE restaurant_id=? AND session_id IN (SELECT value FROM json_each(?)))',rid,ids],order_item_modifiers:['order_item_id IN (SELECT oi.id FROM order_items oi JOIN orders o ON o.restaurant_id=oi.restaurant_id AND o.id=oi.order_id WHERE oi.restaurant_id=? AND o.session_id IN (SELECT value FROM json_each(?)))',rid,ids],feedback:[ctx.view==='feedback'?'id IN (SELECT value FROM json_each(?))':'0',...(ctx.view==='feedback'?[pageIds]:[])],audit_events:[ctx.view==='activity'?'id IN (SELECT value FROM json_each(?))':'0',...(ctx.view==='activity'?[pageIds]:[])],service_requests:ctx.token?['session_id IN (SELECT value FROM json_each(?))',ids]:["status<>'resolved' OR id IN (SELECT value FROM json_each(?))",ctx.view==='service'?pageIds:'[]']};
  if(ctx.token){conditions.memberships=['0'];conditions.membership_permissions=['0'];conditions.dining_tables=['token=? AND enabled=1',ctx.token];}
  const result=await batch([sql('SELECT revision FROM restaurants WHERE id=?',rid),...names.map(table=>{const [where,...params]=conditions[table]||['1=1'];return sql(`SELECT * FROM ${table} WHERE restaurant_id=? AND (${where}) ORDER BY position`,rid,...params);})]);
  if(result[0][0]?.revision!==meta.revision)return {retry:true};
  const rows=Object.fromEntries(names.map((name,i)=>[name,result[i+1]]));
  const restaurant=decodeRestaurant(rows);
  if(ctx.token&&!restaurant.tables.length)throw new AppError('This table link is not available.',404);
  return {restaurant,page,meta,lifecycleVersion:1};
 }

 async function legacy(ctx,meta,query){
  const limit=ctx.view==='activity'?150:PAGE_SIZE;
  const baseKeys=['id','slug','name','nameAr','tagline','taglineAr','categoryNames','logo','currency','taxBps','serviceBps','categories','menu','tables','members','subscription','setup','supportStatus','websiteDesign'];
  const pageCollection={history:'sessions',feedback:'feedback',service:'requests',activity:'audit'}[ctx.view];
  const pagePredicate=ctx.view==='history'?"(json_extract(j.value,'$.releasedAt') IS NOT NULL OR json_extract(j.value,'$.status')='CLOSED')":ctx.view==='service'?"json_extract(j.value,'$.status')='resolved'":'1=1';
  const text=`WITH tenant AS MATERIALIZED (SELECT a.revision AS global_revision,json_extract(a.payload,'$.sessionLifecycleVersion') lifecycle_version,json_extract(a.payload,'$.platformOwner') owner_id,r.value FROM app_state a,json_each(a.payload,'$.restaurants') r WHERE a.id='main' AND json_extract(r.value,'$.id')=?),
   orders AS MATERIALIZED (SELECT o.value,CAST(o.key AS INTEGER) position,json_extract(o.value,'$.sessionId') sid,json_extract(o.value,'$.status') status FROM tenant,json_each(tenant.value,'$.orders') o),
   prices AS MATERIALIZED (SELECT o.sid,SUM(json_extract(l.value,'$.quantity')*json_extract(l.value,'$.unitPrice')) subtotal FROM orders o,json_each(o.value,'$.lines') l GROUP BY o.sid),
   paid AS MATERIALIZED (SELECT json_extract(p.value,'$.sessionId') sid,SUM(json_extract(p.value,'$.amount')) amount FROM tenant,json_each(tenant.value,'$.payments') p GROUP BY sid),
   sessions AS MATERIALIZED (SELECT s.value,CAST(s.key AS INTEGER) position,json_extract(s.value,'$.id') id,json_extract(s.value,'$.tableId') table_id,(json_extract(s.value,'$.releasedAt') IS NULL AND json_extract(s.value,'$.status')<>'CLOSED') occupied,COALESCE(json_extract(s.value,'$.finalBill.total'),COALESCE(prices.subtotal,0)+ROUND(COALESCE(prices.subtotal,0)*COALESCE(CASE WHEN json_extract(s.value,'$.status') IN ('CLOSED','FINALIZED') THEN json_extract(s.value,'$.taxBps') ELSE json_extract(tenant.value,'$.taxBps') END,0)/10000.0)+ROUND(COALESCE(prices.subtotal,0)*COALESCE(CASE WHEN json_extract(s.value,'$.status') IN ('CLOSED','FINALIZED') THEN json_extract(s.value,'$.serviceBps') ELSE json_extract(tenant.value,'$.serviceBps') END,0)/10000.0))-COALESCE(paid.amount,0) due FROM tenant,json_each(tenant.value,'$.sessions') s LEFT JOIN prices ON prices.sid=json_extract(s.value,'$.id') LEFT JOIN paid ON paid.sid=json_extract(s.value,'$.id')),
   page AS (${pageCollection&&!ctx.token?`SELECT j.value,CAST(j.key AS INTEGER) position FROM tenant,json_each(tenant.value,'$.${pageCollection}') j WHERE ${pagePredicate}${ctx.cursor!==null?' AND CAST(j.key AS INTEGER)<?':''} ORDER BY CAST(j.key AS INTEGER) DESC LIMIT ${limit+1}`:'SELECT NULL value,0 position WHERE 0'}),
   selected AS MATERIALIZED (SELECT s.id FROM sessions s WHERE ${ctx.token?"s.occupied AND s.table_id IN (SELECT json_extract(tb.value,'$.id') FROM tenant,json_each(tenant.value,'$.tables') tb WHERE json_extract(tb.value,'$.token')=? AND json_extract(tb.value,'$.enabled')=1)":`s.occupied OR s.due>0 OR EXISTS(SELECT 1 FROM orders o WHERE o.sid=s.id AND o.status<>'SERVED') OR s.id IN (SELECT ${ctx.view==='history'?"json_extract(value,'$.id')":"json_extract(value,'$.sessionId')"} FROM page LIMIT ${limit})`})
   SELECT COALESCE(json_extract(tenant.value,'$.pollRevision'),0) revision,owner_id,lifecycle_version,
   json_object(${baseKeys.map(k=>`'${k}',${ctx.token&&k==='members'?"json('[]')":`json_extract(tenant.value,'$.${k}')`}`).join(',')}) base,
   (SELECT json_group_array(json(value)) FROM (SELECT value FROM sessions WHERE id IN (SELECT id FROM selected) ORDER BY position)) sessions,
   (SELECT json_group_array(json(value)) FROM (SELECT value FROM orders WHERE sid IN (SELECT id FROM selected) ORDER BY position)) orders,
   (SELECT json_group_array(json(p.value)) FROM json_each(tenant.value,'$.payments') p WHERE json_extract(p.value,'$.sessionId') IN (SELECT id FROM selected)) payments,
   (SELECT json_group_array(json(r.value)) FROM json_each(tenant.value,'$.requests') r WHERE ${ctx.token?"json_extract(r.value,'$.sessionId') IN (SELECT id FROM selected)":`json_extract(r.value,'$.status')<>'resolved'${ctx.view==='service'?` OR json_extract(r.value,'$.id') IN (SELECT json_extract(value,'$.id') FROM page LIMIT ${limit})`:''}`}) requests,
   (SELECT json_group_array(json(value)) FROM (SELECT value FROM page LIMIT ${limit})) page,
   (SELECT position FROM page LIMIT 1 OFFSET ${limit-1}) last_position,(SELECT COUNT(*) FROM page) page_count
   FROM tenant`;
  const rows=await query(sql(text,meta.id,...(pageCollection&&!ctx.token&&ctx.cursor!==null?[ctx.cursor]:[]),...(ctx.token?[ctx.token]:[])));
  if(!rows[0])throw new AppError('Restaurant not found.',404);
  const row=rows[0],restaurant=JSON.parse(row.base);
  for(const key of ['sessions','orders','payments','requests'])restaurant[key]=JSON.parse(row[key]);
  restaurant.feedback=ctx.view==='feedback'?JSON.parse(row.page):[];restaurant.audit=ctx.view==='activity'?JSON.parse(row.page).reverse():[];
  restaurant.categoryNames??={};restaurant.members??=[];restaurant.menu??=[];
  return {restaurant,meta:{id:meta.id,revision:row.revision,owner_id:row.owner_id},lifecycleVersion:row.lifecycle_version,page:{hasMore:row.page_count>limit,nextCursor:row.page_count>limit?String(row.last_position):null}};
 }
 return {read};
}
