import { env } from 'cloudflare:workers';
import { AppError, createInitialState, bindUser, isPlatformAdmin } from './domain.mjs';
import { staffView, guestView, applyCommand } from './domain.mjs';
import { createNormalizedStore } from './normalized-store.mjs';
import { classifyHostname, ensureRestaurantSlugs, enforceScope, scopeState, RoutingError } from './tenant-routing.mjs';
import { publicView } from './tenant-views.mjs';
import { currentTenantScope,type TenantScope } from './tenant-context';
import { createUpdatesRepository } from './updates-repository.mjs';
import { designState } from './restaurant-designs/config.mjs';
import { DESIGN_CATALOG } from './restaurant-designs/catalog.mjs';
type StaffIdentity={id:string;email:string;name?:string;authProvider?:string;isSuperAdmin?:boolean};
type PlatformState=ReturnType<typeof createInitialState>;

// Default stays legacy. No migration, environment change, or cutover occurs here.
function normalized() {
 const mode=env.TAP2SERVE_STORAGE;
 if(!mode||mode==='legacy')return null;
 if(mode!=='normalized')throw new AppError('Restaurant setup is not complete.',503);
 return createNormalizedStore(env.DB!);
}
export async function resolveScope(request:Request):Promise<TenantScope> {
 const cached=currentTenantScope();if(cached?.origin===new URL(request.url).origin)return cached;
 const scope={...classifyHostname(request.url,env),origin:new URL(request.url).origin};
 if(scope.kind!=='tenant')return scope;
 const store=normalized();
 let restaurant;
 if(store)restaurant=await store.findRestaurant(scope.slug);
 else{
  const matches=await env.DB!.prepare("SELECT json_extract(r.value,'$.id') id,json_extract(r.value,'$.name') name,json_extract(r.value,'$.slug') slug FROM app_state a,json_each(a.payload,'$.restaurants') r WHERE a.id='main' AND (json_extract(r.value,'$.slug')=? OR json_extract(r.value,'$.slug') IS NULL)").bind(scope.slug).all<{id:string;name:string;slug:string|null}>();
  // Old exports need only id/name metadata to derive their stable legacy slug.
  // Never materialize orders, payments or a full platform payload for routing.
  const resolved=ensureRestaurantSlugs({restaurants:matches.results}).restaurants.filter((t:{slug:string})=>t.slug===scope.slug);
  if(resolved.length>1)throw new RoutingError('Duplicate restaurant slug. Contact the platform administrator.',503);
  restaurant=resolved[0];
 }
 if(!restaurant)throw new RoutingError();
 return {...scope,restaurantId:restaurant.id};
}
export async function loadUpdates(user:StaffIdentity|null,input:{restaurantId:string|null;token:string|null;capability:string|null;view:string|null;cursor:string|null;etag:string|null},scope:TenantScope){
 const repository=createUpdatesRepository(env.DB!,{backend:normalized()?'normalized':'legacy'});
 let result=await repository.read({...input,user,scope});
 if(result.needsInitialize){
  if(input.token)throw new AppError('Restaurant setup is not complete.',503);
  await loadStaff(user,input.restaurantId,scope);
  result=await repository.read({...input,user,scope});
 }
 return result;
}
export async function loadPublicRestaurant(scope:TenantScope) {
 const store=normalized();if(store)return store.publicRestaurant(scope);
 const current=await readState();if(!current)throw new RoutingError();
 return publicView(scopeState(current.state,scope).restaurants[0]);
}
export async function loadRestaurantDesign(user:StaffIdentity|null,restaurantId:string,scope:TenantScope){
 if(!['admin','local'].includes(scope.kind))throw new AppError('Platform administrator access required.',403);
 if(!user?.id)throw new AppError('Staff sign-in required.',401);
 const store=normalized();
 let result;
 if(store)result=await store.design(user,restaurantId);
 else{
  const current=await readState();if(!current)throw new AppError('Restaurant setup is not complete.',503);
  if(!isPlatformAdmin(current.state,user))throw new AppError('Platform administrator access required.',403);
  const restaurant=current.state.restaurants.find((t:{id:string})=>t.id===restaurantId);if(!restaurant)throw new AppError('Restaurant not found.',404);
  result={management:designState(restaurant),restaurant:publicView(restaurant)};
 }
 return {...result,catalog:DESIGN_CATALOG.map(({id,name,description})=>({id,name,description}))};
}
export async function restaurantForToken(token:string){
 const store=normalized();if(store)return store.restaurantForToken(token);
 const current=await readState();if(!current)return null;
 return ensureRestaurantSlugs(current.state).restaurants.find((t:{tables:{token:string;enabled:boolean}[]})=>t.tables.some(table=>table.token===token&&table.enabled));
}
export async function loadGuest(token:string,capability:string|null,scope?:TenantScope) {
 if(scope)enforceScope(scope,null,'guest.read');
 const store=normalized();if(store)return store.guest(token,capability,scope);
 const current=await readState();if(!current)throw new AppError('Restaurant setup is not complete.',503);
 return guestView(scope?scopeState(current.state,scope):current.state,token,capability);
}
export async function loadStaff(user:StaffIdentity|null,restaurantId:string|null,scope?:TenantScope) {
 if(scope)enforceScope(scope,restaurantId);
 if(scope?.kind==='tenant')restaurantId=scope.restaurantId!;
 const store=normalized();if(store)return store.staff(user,restaurantId,scope);
 if(scope?.kind==='admin'){
  if(!user?.id)throw new AppError('Sign in with your staff account.',401);
  const platform=await readState();if(!platform)throw new AppError('Restaurant setup is not complete.',503);
  if(!isPlatformAdmin(platform.state,user))throw new AppError('Platform administrator access required.',403);
 }else await initialize(user,scope);
 const current=await readState();
 const state=scope?scopeState(current!.state,scope):current!.state;
 const view=staffView(state,user,restaurantId);
 if(scope?.kind==='admin')return {...view,restaurant:null,restaurants:[],permissions:[],revision:current!.revision};
 return {...view,revision:current!.revision};
}
export async function runCommand(user:StaffIdentity|null,body:Record<string,unknown>,scope?:TenantScope) {
 if(scope)enforceScope(scope,body.restaurantId,body.action);
 if(scope?.kind==='tenant')body={...body,restaurantId:scope.restaurantId};
 const store=normalized();if(store)return store.command(user,body,scope);
 if(body.action==='finance.report'){const snapshot=await readState();if(!snapshot)throw new AppError('A staff administrator must initialize this workspace.',503);return applyCommand(scope?scopeState(snapshot.state,scope):snapshot.state,user,body);}
 return transaction(state=>applyCommand(scope?scopeState(state,scope):state,user,body));
}
export async function readState() {
 const row=await env.DB!.prepare('SELECT revision, payload FROM app_state WHERE id = ?').bind('main').first<{revision:number,payload:string}>();
 return row?{revision:row.revision,state:JSON.parse(row.payload)}:null;
}
export async function transaction(fn:(s:PlatformState)=>unknown) {
 for(let attempt=0;attempt<8;attempt++) {
  const current=await readState();if(!current)throw new AppError('A staff administrator must initialize this workspace.',503);
  const result=fn(current.state);const payload=JSON.stringify(current.state);
  if(payload.length>1800000)throw new AppError('Alpha storage limit reached. Contact the platform administrator.',507);
  const saved=await env.DB!.prepare('UPDATE app_state SET payload = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(payload,'main',current.revision).run();
  if(saved.meta.changes===1)return result;
 }
 throw new AppError('Another update is in progress. Please try again.',409);
}
export async function initialize(user:StaffIdentity|null,scope?:TenantScope) {
 if(!user?.id)throw new AppError('Sign in with your staff account.',401);
 const current=await readState();
 if(!current){
  if(user.authProvider==='independent'||scope&&scope.kind!=='local')throw new AppError('Restaurant setup is not complete.',503);
  await env.DB!.prepare('INSERT OR IGNORE INTO app_state (id,revision,payload) VALUES (?,0,?)').bind('main',JSON.stringify(createInitialState(user))).run();
 }
 const check=await readState();if(bindUser(scope?scopeState(check!.state,scope):check!.state,user))await transaction(s=>bindUser(scope?scopeState(s,scope):s,user));
}
