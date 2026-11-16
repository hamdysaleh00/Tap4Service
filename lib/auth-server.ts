import { env } from 'cloudflare:workers';
import { AppError } from './domain.mjs';
import { createAuthService } from './auth-service.mjs';
import { loadStaff,resolveScope } from './store';
import { authBackground } from './auth-background';

export function independentAuth(){
 if(!env.TAP2SERVE_AUTH||env.TAP2SERVE_AUTH==='sites')return false;
 if(env.TAP2SERVE_AUTH!=='independent')throw new AppError('Authentication is not configured.',503);
 return true;
}
export async function authService(request:Request){
 if(!independentAuth())throw new AppError('Independent authentication is not enabled.',503);
 // Validate the actual URL through the same registered-host/tenant resolver.
 // Never derive a trusted origin from Host/X-Forwarded-* header overrides.
 const scope=await resolveScope(request);
 return createAuthService(env.DB!,{
  origin:new URL(request.url).origin,rateSecret:env.AUTH_RATE_LIMIT_SECRET,mfaKey:env.AUTH_MFA_KEY,allowLocalHttp:env.AUTH_ALLOW_LOCAL_HTTP==='true'&&env.TAP2SERVE_LOCAL_DEV==='true',
  background:authBackground,
  async authorizeInvitation(user:Parameters<typeof loadStaff>[0],restaurantId:string,memberId:string){
   const view=await loadStaff(user,restaurantId,scope);
   if(!view.permissions.includes('staff.manage')||!view.permissions.includes('permissions.manage'))throw new AppError('Missing permission: staff.manage',403);
   const member=view.restaurant?.members.find((m:{id:string})=>m.id===memberId);
   if(!member?.active)throw new AppError('Staff member not found.',404);
   return member;
  },
  async sendEmail(message:{to:string;subject:string;text:string}){
   if(!env.AUTH_MAIL_API_KEY||!env.AUTH_MAIL_FROM)throw new Error('Mail is not configured.');
   const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.AUTH_MAIL_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.AUTH_MAIL_FROM,to:[message.to],subject:message.subject,text:message.text}),signal:AbortSignal.timeout(10000)});
   if(!result.ok)throw new Error('Mail delivery failed.');
  },
 });
}
