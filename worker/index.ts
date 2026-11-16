import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import { withAuthBackground } from '../lib/auth-background';
import { cleanupAuth } from '../lib/auth-maintenance.mjs';
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { resolveScope, restaurantForToken } from '../lib/store';
import { withTenantScope } from '../lib/tenant-context';
import { routingFailure, RoutingError, restaurantOrigin } from '../lib/tenant-routing.mjs';

const worker = {
  async scheduled(_event:ScheduledController,env:Cloudflare.Env,ctx:ExecutionContext){
    if(env.TAP2SERVE_AUTH==='independent'&&env.DB)ctx.waitUntil(cleanupAuth(env.DB));
  },
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const api=new URL(request.url).pathname.startsWith('/api/');
    let scope;
    try { scope=await resolveScope(request); } catch(error) { return routingFailure(error,api); }
    const url=new URL(request.url);
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
    // Host-specific HTML/RSC/API must never enter a shared cache. No tenant data
    // is stored in globals, client-provided headers, or shared cookies.
    const secured=new Response(response.body,response);
    secured.headers.set('Cache-Control','private, no-store');
    secured.headers.set('Referrer-Policy','no-referrer');
    secured.headers.set('X-Content-Type-Options','nosniff');
    secured.headers.set('Content-Security-Policy',"frame-ancestors 'self'");
    return secured;
  },
};

export default worker;
