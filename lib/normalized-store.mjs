import { publicView } from './tenant-views.mjs';
import { designState } from './restaurant-designs/config.mjs';
import { enforceScope, scopeState } from './tenant-routing.mjs';
import { AppError, applyCommand, bindUser, staffView, guestView, isPlatformAdmin, authorizeDesign } from './domain.mjs';
import { MODEL_VERSION, models, encodeRestaurant, decodeRestaurant, insertStatement } from './normalized-model.mjs';

const tableNames=[...Object.keys(models),'membership_permissions'];
// Bound rows are individually below D1's parameter limit. Keep the complete
// command in one atomic batch; never split a financial mutation across batches.
const MAX_COMMAND_STATEMENTS=800;
const rowKey=(table,row)=>table==='membership_permissions'?`${row.membership_id}:${row.position}`:row.id;
const stmt=(sql,...params)=>({sql,params});
export function changedRows(before,after){
 after.restaurants[0].position=before.restaurants[0].position;
 const inserts=[],deletes=[];
 for(const table of tableNames){
  const old=new Map(before[table].map(row=>[rowKey(table,row),row])),next=new Map(after[table].map(row=>[rowKey(table,row),row]));
  for(const [key,row] of old)if(!next.has(key)){
   deletes.push(table==='membership_permissions'?stmt('DELETE FROM membership_permissions WHERE restaurant_id=? AND membership_id=? AND position=?',row.restaurant_id,row.membership_id,row.position):stmt(`DELETE FROM ${table} WHERE restaurant_id=? AND id=?`,row.restaurant_id,row.id));
  }
  for(const [key,row] of next){
   const previous=old.get(key);
   if(!previous){inserts.push(insertStatement(table,row));continue;}
   // Repository metadata must never be replaced by the domain projection.
   const changed=Object.keys(row).filter(k=>!['restaurant_id','id'].includes(k)&&row[k]!==previous[k]);
   if(changed.length){
    const where=table==='membership_permissions'?'restaurant_id=? AND membership_id=? AND position=?':'restaurant_id=? AND id=?';
    const keyParams=table==='membership_permissions'?[row.restaurant_id,row.membership_id,row.position]:[row.restaurant_id,row.id];
    inserts.push(stmt(`UPDATE ${table} SET ${changed.map(k=>k+'=?').join(',')} WHERE ${where}`,...changed.map(k=>row[k]),...keyParams));
   }
  }
 }
 // Child deletion precedes parents. Inserts/updates follow dependency order.
 return [...deletes.reverse(),...inserts];
}
export function commitStatements(snapshot,next,events=[]){
 const before=snapshot.rows,after=encodeRestaurant(next);
 const id=crypto.randomUUID(),rid=next.id;
 const knownUsers=new Set(before.memberships.map(m=>m.user_id));
 return [
  stmt('INSERT INTO commit_guards(id,valid) VALUES (?,COALESCE((SELECT revision=? FROM restaurants WHERE id=?),0))',id,snapshot.revision,rid),
  ...[...new Set(next.members.map(m=>m.userId).filter(id=>id&&!knownUsers.has(id)))].map(id=>stmt('INSERT INTO users(id) VALUES (?) ON CONFLICT DO NOTHING',id)),
  ...changedRows(before,after),
  ...events.map(event=>insertStatement('platform_audit',{id:crypto.randomUUID(),restaurant_id:rid,position:Date.now(),event_json:JSON.stringify(event)})),
  stmt('UPDATE restaurants SET revision=revision+1 WHERE id=?',rid),
  stmt('DELETE FROM commit_guards WHERE id=?',id),
 ];
}
const conflict=e=>String(e?.message).includes('tap2serve_revision_conflict')||String(e?.cause?.message).includes('tap2serve_revision_conflict');

// A Worker-compatible repository. It deliberately cannot bootstrap a platform or
// run a migration. Activation requires a separately verified staging database.
export function createNormalizedStore(db){
 const prepare=s=>db.prepare(s.sql).bind(...s.params);
 const batch=statements=>{
  if(statements.length>MAX_COMMAND_STATEMENTS)throw new AppError('Alpha storage limit reached. Contact the platform administrator.',507);
  return db.batch(statements.map(prepare));
 };
 async function config(){
  const result=await batch([stmt("SELECT * FROM platform_config WHERE id='main'"),stmt('SELECT * FROM migration_runs')]);
  if(!result[0].results[0]||result[1].results.length!==1||result[1].results[0].verified!==1||result[1].results[0].model_version!==MODEL_VERSION)throw new AppError('Restaurant setup is not complete.',503);
  return result[0].results[0];
 }
 async function load(restaurantId){
  const result=await batch([stmt("SELECT * FROM platform_config WHERE id='main'"),stmt('SELECT * FROM migration_runs'),...tableNames.map(t=>stmt(`SELECT * FROM ${t} WHERE restaurant_id=? ORDER BY position`,restaurantId))]);
  if(!result[0].results[0]||result[1].results.length!==1||result[1].results[0].verified!==1||result[1].results[0].model_version!==MODEL_VERSION)throw new AppError('Restaurant setup is not complete.',503);
  const rows=Object.fromEntries(tableNames.map((t,i)=>[t,result[i+2].results]));
  if(!rows.restaurants[0])throw new AppError('Restaurant not found.',404);
  const c=result[0].results[0];return {rows,revision:rows.restaurants[0].revision,state:{...JSON.parse(c.metadata_json),platformOwner:c.owner_id,platformAudit:[],restaurants:[decodeRestaurant(rows)]}};
 }
 async function mutate(restaurantId,fn){
  for(let attempt=0;attempt<8;attempt++){
   const snapshot=await load(restaurantId),result=fn(snapshot.state);
   try{await batch(commitStatements(snapshot,snapshot.state.restaurants[0],snapshot.state.platformAudit));return result;}
   catch(e){if(!conflict(e))throw e;}
  }
  throw new AppError('Another update is in progress. Please try again.',409);
 }
 async function tenantForToken(token,scope){const row=await (scope?.kind==='tenant'?db.prepare('SELECT restaurant_id FROM dining_tables WHERE token=? AND enabled=1 AND restaurant_id=?').bind(token,scope.restaurantId):db.prepare('SELECT restaurant_id FROM dining_tables WHERE token=? AND enabled=1').bind(token)).first();if(!row)throw new AppError('This table link is not available.',404);return row.restaurant_id;}
 async function initialize(user,scope){
  if(!user?.id)throw new AppError('Sign in with your staff account.',401);await config();
  const email=user.email?.toLowerCase()??'';
  const invitations=await (scope?.kind==='tenant'?db.prepare('SELECT DISTINCT restaurant_id FROM memberships WHERE email=? AND user_id IS NULL AND active=1 AND restaurant_id=?').bind(email,scope.restaurantId):db.prepare('SELECT DISTINCT restaurant_id FROM memberships WHERE email=? AND user_id IS NULL AND active=1').bind(email)).all();
  for(const invitation of invitations.results)await mutate(invitation.restaurant_id,s=>bindUser(s,user));
 }
 async function command(user,body,scope){
  if(scope)enforceScope(scope,body.restaurantId,body.action);
  if(scope?.kind==='tenant'&&!body.action?.startsWith('guest.'))body={...body,restaurantId:scope.restaurantId};
  if(body.action==='platform.create'){
   const c=await config(),state={...JSON.parse(c.metadata_json),platformOwner:c.owner_id,platformAudit:[],restaurants:[]};
   const result=applyCommand(state,user,body),t=state.restaurants[0],rows=encodeRestaurant(t);
   // Independent restaurant creation needs no platform-wide revision or payload.
   const position=await db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS next FROM restaurants').first();rows.restaurants[0].position=position.next;
   try{await batch([...t.members.filter(m=>m.userId).map(m=>stmt('INSERT INTO users(id) VALUES (?) ON CONFLICT DO NOTHING',m.userId)),...Object.entries(rows).flatMap(([table,values])=>values.map(row=>insertStatement(table,row))),...state.platformAudit.map(event=>insertStatement('platform_audit',{id:crypto.randomUUID(),restaurant_id:t.id,position:Date.now(),event_json:JSON.stringify(event)}))]);}catch(e){if(String(e?.message).includes('restaurants.slug')||String(e?.cause?.message).includes('restaurants.slug'))throw new AppError('Restaurant slug is already in use.',409);throw e;}return result;
  }
  const rid=body.action?.startsWith('guest.')?await tenantForToken(body.token,scope):body.restaurantId;
  return mutate(rid,s=>applyCommand(scope?scopeState(s,scope):s,user,body));
 }
 async function guest(token,capability,scope){if(scope)enforceScope(scope,null,'guest.read');const rid=await tenantForToken(token,scope),snapshot=await load(rid);return guestView(snapshot.state,token,capability);}
 async function staff(user,restaurantId,scope){
  if(scope)enforceScope(scope,restaurantId);
  if(scope?.kind==='tenant')restaurantId=scope.restaurantId;
  if(scope?.kind==='admin'){
   if(!user?.id)throw new AppError('Sign in with your staff account.',401);
   if(!isPlatformAdmin({platformOwner:(await config()).owner_id},user))throw new AppError('Platform administrator access required.',403);
  }else await initialize(user,scope);
  const membershipSQL='SELECT r.id,r.slug,r.name,r.name_ar FROM restaurants r JOIN memberships m ON m.restaurant_id=r.id WHERE m.user_id=? AND m.active=1';
  const memberships=scope?.kind==='admin'?{results:[]}:await (scope?.kind==='tenant'?db.prepare(membershipSQL+' AND r.id=? ORDER BY r.position,r.id').bind(user.id,scope.restaurantId):db.prepare(membershipSQL+' ORDER BY r.position,r.id').bind(user.id)).all();
  if(restaurantId&&!memberships.results.some(r=>r.id===restaurantId))throw new AppError('Restaurant access denied.',403);
  const rid=restaurantId??memberships.results[0]?.id,c=await config();
  const snapshot=rid?await load(rid):null;
  const state=snapshot?.state??{...JSON.parse(c.metadata_json),platformOwner:c.owner_id,restaurants:[]};
  const view=staffView(scope?scopeState(state,scope):state,user,rid);
  view.restaurants=memberships.results.map(r=>({id:r.id,slug:r.slug,name:r.name,nameAr:r.name_ar||''}));
  if(view.platform){
   const summaries=await db.prepare(`SELECT r.*,s.extra_json AS subscription_extra,s.present_json AS subscription_present,s.status AS subscription_status,s.monthly_per_table,s.setup_fee,u.extra_json AS setup_extra,u.present_json AS setup_present,u.menu,u.stands,u.printer,u.training,COUNT(t.id) AS table_count,COALESCE(SUM(t.billable),0) AS billable_tables FROM restaurants r JOIN subscriptions s ON s.restaurant_id=r.id JOIN restaurant_setup u ON u.restaurant_id=r.id LEFT JOIN dining_tables t ON t.restaurant_id=r.id GROUP BY r.id ORDER BY r.position,r.id`).all();
   view.platformRestaurants=summaries.results.map(r=>({id:r.id,slug:r.slug,name:r.name,nameAr:r.name_ar||'',subscription:{...JSON.parse(r.subscription_extra),status:r.subscription_status,monthlyPerTable:r.monthly_per_table,setupFee:r.setup_fee},setup:{...JSON.parse(r.setup_extra),menu:!!r.menu,stands:!!r.stands,printer:!!r.printer,training:!!r.training},supportStatus:r.support_status,tableCount:r.table_count,billableTables:r.billable_tables,monthlyTotal:r.monthly_per_table===null?null:r.billable_tables*r.monthly_per_table}));
  }
  return {...view,revision:snapshot?.revision??0};
 }
 async function findRestaurant(slug){
  const result=await db.prepare("SELECT r.id,r.slug,r.name,mr.verified,mr.model_version FROM platform_config c CROSS JOIN migration_runs mr LEFT JOIN restaurants r ON r.slug=? WHERE c.id='main'").bind(slug).all();
  if(result.results.length!==1||result.results[0].verified!==1||result.results[0].model_version!==MODEL_VERSION)throw new AppError('Restaurant setup is not complete.',503);
  const row=result.results[0];return row.id?{id:row.id,slug:row.slug,name:row.name}:null;
 }
 async function restaurantForToken(token){await config();return db.prepare('SELECT r.id,r.slug FROM restaurants r JOIN dining_tables t ON t.restaurant_id=r.id WHERE t.token=? AND t.enabled=1').bind(token).first();}
 async function publicRestaurant(scope){const snapshot=await load(scope.restaurantId);const t=scopeState(snapshot.state,scope).restaurants[0];return publicView(t);}
 async function design(user,restaurantId,scope){
  if(!user?.id)throw new AppError('Staff sign-in required.',401);
  if(scope)enforceScope(scope,restaurantId,scope.kind==='admin'?'platform.design.read':'design.read');
  if(scope?.kind==='admin'&&!isPlatformAdmin({platformOwner:(await config()).owner_id},user))throw new AppError('Platform administrator access required.',403);
  const snapshot=await load(restaurantId),restaurant=authorizeDesign(scope?scopeState(snapshot.state,scope):snapshot.state,user,restaurantId);
  return {management:designState(restaurant),restaurant:publicView(restaurant)};
 }
 return {load,initialize,command,guest,staff,findRestaurant,publicRestaurant,restaurantForToken,design};
}
