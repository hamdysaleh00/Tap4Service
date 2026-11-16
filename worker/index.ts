import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import { withAuthBackground } from '../lib/auth-background';
import { cleanupAuth } from '../lib/auth-maintenance.mjs';
import { AppError } from '../lib/domain.mjs';
import { classifyHostname } from '../lib/tenant-routing.mjs';
import { productionEnabled, productionConfigReady, readiness, monitorHealth } from '../lib/operations.mjs';
import { limitTraffic } from '../lib/abuse.mjs';
import { secureResponse, logRequest, routeName } from '../lib/observability.mjs';
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { resolveScope, restaurantForToken } from '../lib/store';
import { withTenantScope } from '../lib/tenant-context';
import { routingFailure, RoutingError, restaurantOrigin } from '../lib/tenant-routing.mjs';

async function handleRequest(request:Request,env:Cloudflare.Env,ctx:ExecutionContext<{CONNECTORS?:ConnectorBinding}>){
 const url=new URL(request.url),classification=classifyHostname(request.url,env);
 if(url.pathname==='/healthz'||url.pathname==='/readyz'){
  if(!['platform','admin','local'].includes(classification.kind))throw new RoutingError();
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  if(url.pathname==='/healthz')return Response.json({status:'ok'});
  await limitTraffic(request,env,'read');const ok=await readiness(env);return Response.json({status:ok?'ok':'unavailable'},{status:ok?200:503});
 }
 if(!productionConfigReady(env))throw new AppError('Production configuration is not ready.',503);
 if(productionEnabled(env)&&url.protocol!=='https:')throw new AppError('HTTPS is required.',426);
 if(env.TAP2SERVE_MAINTENANCE==='true'&&request.method==='POST'&&url.pathname!=='/api/auth/logout')throw new AppError('The service is temporarily in maintenance.',503);
 if(url.pathname.startsWith('/api/')||request.method==='GET'&&!url.pathname.startsWith('/_next/')&&url.pathname!=='/favicon.svg')await limitTraffic(request,env,'read');
    const api=new URL(request.url).pathname.startsWith('/api/');
    let scope;
    try { scope=await resolveScope(request); } catch(error) { return routingFailure(error,api); }

    if((scope.kind==='platform'||scope.kind==='bridge')&&url.pathname==='/'&&url.searchParams.has('table')&&['GET','HEAD'].includes(request.method)){
      try{
        const restaurant=await restaurantForToken(url.searchParams.get('table')!);
        if(!restaurant)throw new RoutingError();
        const target=new URL(restaurantOrigin(scope,restaurant.slug,scope.kind==='bridge'?'https://tap2serve.com':request.url));
        target.searchParams.set('table',url.searchParams.get('table')!);
        return new Response(null,{status:307,headers:{Location:target.href,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
      }catch(error){return routingFailure(error);}
    }
    if(scope.kind==='bridge')return routingFailure(new RoutingError(),api);
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response=await withAuthBackground(ctx,()=>withTenantScope(scope,()=>runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx))));
    return response;
}
const worker={
 async scheduled(_event:ScheduledController,env:Cloudflare.Env,ctx:ExecutionContext){
  ctx.waitUntil(monitorHealth(env));
  if(env.TAP2SERVE_AUTH==='independent'&&env.DB)ctx.waitUntil(cleanupAuth(env.DB).catch(()=>{console.error(JSON.stringify({event:'auth_cleanup_failed'}));}));
 },
 async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext<{CONNECTORS?:ConnectorBinding}>){
  const id=crypto.randomUUID(),start=Date.now();let response:Response;
  try{response=await handleRequest(request,env,ctx);}catch(error){
   if(error instanceof RoutingError)response=routingFailure(error,new URL(request.url).pathname.startsWith('/api/'));
   else{const status=error instanceof AppError?error.status:500;response=Response.json({error:status===429?'Please wait a moment before trying again.':status>=500?'Service temporarily unavailable.':'Request rejected.'},{status,headers:{...(status===429?{'Retry-After':'60'}:{})}});}
  }
  logRequest({id,route:routeName(new URL(request.url).pathname),method:request.method,status:response.status,duration:Date.now()-start});
  return secureResponse(response,request,id);
 }
};
export default worker;
