import { MODEL_VERSION } from './normalized-model.mjs';
export const productionEnabled=env=>env.TAP2SERVE_PRODUCTION!=='false'&&env.TAP2SERVE_LOCAL_DEV!=='true';
export function productionConfigReady(env){
 if(!productionEnabled(env)&&env.TAP2SERVE_PRODUCTION!=='true')return true;
 return env.TAP2SERVE_LOCAL_DEV!=='true'&&env.AUTH_ALLOW_LOCAL_HTTP!=='true'&&env.TAP2SERVE_STORAGE==='normalized'&&!!env.DB&&!!env.PUBLIC_READ_LIMITER&&!!env.GUEST_WRITE_LIMITER&&env.TAP2SERVE_AUTH==='independent'&&typeof env.AUTH_RATE_LIMIT_SECRET==='string'&&env.AUTH_RATE_LIMIT_SECRET.length>=32&&typeof env.AUTH_MFA_KEY==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(env.AUTH_MFA_KEY);
}
export async function readiness(env){
 if(env.TAP2SERVE_MAINTENANCE==='true'||!productionConfigReady(env)||!env.DB)return false;
 try{
  const primary=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
  if(env.TAP2SERVE_STORAGE==='normalized'){
   const result=await primary.batch([primary.prepare("SELECT owner_id FROM platform_config WHERE id='main'"),primary.prepare('SELECT model_version,verified FROM migration_runs')]);
   if(!result[0].results?.[0]?.owner_id||result[1].results?.length!==1||result[1].results[0].model_version!==MODEL_VERSION||result[1].results[0].verified!==1)return false;
  }else if(!await primary.prepare("SELECT id FROM app_state WHERE id='main' AND json_valid(payload)=1").first())return false;
  if(env.TAP2SERVE_AUTH==='independent'){
   const row=await primary.prepare("SELECT ready,schema_version FROM auth_config WHERE id='main'").first();if(row?.ready!==1||row.schema_version!==1)return false;
  }
  return true;
 }catch{return false;}
}
export async function monitorHealth(env,{send=fetch,logger=console,now=()=>new Date().toISOString()}={}){
 const ok=await readiness(env);const event={event:'health_probe',status:ok?'ok':'unavailable',timestamp:now()};
 (ok?logger.log:logger.error).call(logger,JSON.stringify(event));
 if(!ok&&env.OPS_ALERT_WEBHOOK_URL){
  try{
   const target=new URL(env.OPS_ALERT_WEBHOOK_URL);if(target.protocol!=='https:'||target.username||target.password)throw new Error();
   const response=await send(target.href,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json',...(env.OPS_ALERT_TOKEN?{Authorization:`Bearer ${env.OPS_ALERT_TOKEN}`}:{})},body:JSON.stringify({event:'tap2serve_readiness_failed',timestamp:event.timestamp})});
   if(!response.ok)throw new Error();
  }catch{logger.error(JSON.stringify({event:'alert_delivery_failed',timestamp:event.timestamp}));}
 }
 return ok;
}
