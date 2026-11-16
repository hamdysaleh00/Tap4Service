// Shared by the Worker, repositories, migration tooling and routing tests.
export const RESERVED_SLUGS = Object.freeze(['admin','www','api','app','auth','static','assets','cdn','mail','smtp','ftp','status','support','help','docs','billing','dashboard','staging','stage','dev','test','localhost']);
export class RoutingError extends Error { constructor(message='Restaurant not found.',status=404){super(message);this.status=status;} }
export function validSlug(slug){return typeof slug==='string'&&slug.length<=63&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)&&!RESERVED_SLUGS.includes(slug)&&!slug.startsWith('xn--');}
export function requireSlug(slug){if(!validSlug(slug))throw new RoutingError('Use a lowercase restaurant slug with letters, numbers and hyphens; system names are reserved.',400);return slug;}
export function generatedSlug(name,id){
 const base=String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,22).replace(/-$/,'')||'restaurant';
 const suffix=String(id).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,40);
 return requireSlug(`${base}-${suffix}`);
}
// Deterministic compatibility upgrade. Existing slugs are immutable; ambiguous
// or invalid data fails closed instead of silently routing to the wrong tenant.
export function ensureRestaurantSlugs(state){
 const seen=new Set();
 for(const t of state.restaurants){t.slug??=generatedSlug(t.name,t.id);requireSlug(t.slug);if(seen.has(t.slug))throw new RoutingError('Duplicate restaurant slug. Contact the platform administrator.',503);seen.add(t.slug);}
 return state;
}
const domainPattern=/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
export function classifyHostname(requestUrl,options={}){
 const url=new URL(requestUrl);const host=url.hostname.toLowerCase().replace(/\.$/,'');
 const bridges=String(options.TAP2SERVE_LEGACY_GUEST_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(bridges.some(h=>!domainPattern.test(h)))throw new RoutingError('Invalid routing configuration.',503);
 if(bridges.includes(host))return {kind:'bridge',base:'tap2serve.com',hostname:host};
 const roots=['tap2serve.com',...String(options.TAP2SERVE_BASE_DOMAINS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)];
 if(roots.some(root=>!domainPattern.test(root)))throw new RoutingError('Invalid routing configuration.',503);
 if(options.TAP2SERVE_LOCAL_DEV==='true'){
  if(['localhost','127.0.0.1','[::1]'].includes(host))return {kind:'local',base:'localhost',hostname:host};
  roots.push('localhost');
 }
 // Longest root first so staging.tap2serve.com is not treated as a tenant.
 for(const base of [...new Set(roots)].sort((a,b)=>b.length-a.length)){
  if(host===base||host===`www.${base}`)return {kind:'platform',base,hostname:host};
  if(!host.endsWith(`.${base}`))continue;
  const slug=host.slice(0,-base.length-1);
  if(slug==='admin')return {kind:'admin',base,hostname:host};
  if(validSlug(slug))return {kind:'tenant',base,hostname:host,slug};
  throw new RoutingError();
 }
 throw new RoutingError();
}
export function enforceScope(scope,restaurantId,action){
 if(scope?.kind==='local')return;
 if(scope?.kind==='tenant'){
  if(action?.startsWith('platform.'))throw new RoutingError('Platform administrator access required.',403);
  if(restaurantId&&restaurantId!==scope.restaurantId)throw new RoutingError('Restaurant access denied.',403);
  return;
 }
 if(scope?.kind==='admin'&&(!action||action.startsWith('platform.')))return;
 throw new RoutingError('Restaurant access denied.',403);
}
export function scopeState(state,scope){
 ensureRestaurantSlugs(state);
 if(scope?.kind!=='tenant')return state;
 const restaurant=state.restaurants.find(t=>t.id===scope.restaurantId&&t.slug===scope.slug);
 if(!restaurant)throw new RoutingError();
 // No platform ownership or global summaries escape onto a tenant origin.
 return {...state,platformOwner:null,platformAudit:[],restaurants:[restaurant]};
}
export function restaurantOrigin(scope,slug,requestUrl){
 requireSlug(slug);const url=new URL(requestUrl);url.hostname=`${slug}.${scope.base}`;url.pathname='/';url.search='';url.hash='';return url.origin;
}
export function routingFailure(error,api=false){
 const status=error instanceof RoutingError?error.status:503;
 const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"};
 if(api)return Response.json({error:status===404?'Restaurant not found.':'Workspace unavailable.'},{status,headers});
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${status===404?'Restaurant not found':'Workspace unavailable'} | Tap2Serve</title><body style="font-family:system-ui;padding:10vh 8vw"><h1>${status===404?'Restaurant not found':'Workspace unavailable'}</h1><p>${status===404?'Check the restaurant address and try again.':'Please try again later.'}</p></body></html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
