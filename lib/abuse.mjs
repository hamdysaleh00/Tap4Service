import { AppError } from './domain.mjs';
import { productionEnabled } from './operations.mjs';
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function limitTraffic(request,env,kind,token=''){
 const binding=kind==='write'?env.GUEST_WRITE_LIMITER:env.PUBLIC_READ_LIMITER;
 if(!binding){if(productionEnabled(env))throw new AppError('Public traffic protection is not configured.',503);return;}
 // Cloudflare supplies CF-Connecting-IP at ingress. Never trust X-Forwarded-For.
 // Hash keys so bindings do not retain raw IPs/table tokens.
 const url=new URL(request.url),ip=request.headers.get('cf-connecting-ip')||'unknown';
 const ipKey=await digest(`${kind}:ip:${ip}`);
 try{
  if(!(await binding.limit({key:ipKey})).success)throw new AppError('Please wait a moment before trying again.',429);
  if(kind==='write'&&token&&!(await binding.limit({key:await digest(`${url.hostname}:table:${token}`)})).success)throw new AppError('Please wait a moment before trying again.',429);
 }catch(error){if(error instanceof AppError)throw error;throw new AppError('Public traffic protection is unavailable.',503);}
}
