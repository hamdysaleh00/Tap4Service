import { authService,independentAuth } from '../../../../lib/auth-server';
import { resolveScope } from '../../../../lib/store';
import { AppError } from '../../../../lib/domain.mjs';
import { RoutingError } from '../../../../lib/tenant-routing.mjs';
import { clearSessionCookie } from '../../../../lib/auth-service.mjs';
import { readAuthBody } from '../../../../lib/auth-body.mjs';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200,cookie?:string)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});
function errorResponse(error:unknown){const known=error instanceof AppError||error instanceof RoutingError;return reply({error:known?error.message:'Authentication is temporarily unavailable.'},known?error.status:500);}
export async function GET(request:Request){
 try{
  if(new URL(request.url).pathname!=='/api/auth/session')return reply({error:'Not found.'},404);
  if(!independentAuth())return reply({independent:false});
  const auth=await (await authService(request)).authenticate(request);
  return auth?reply({independent:true,user:auth.user,csrf:auth.csrf}):reply({independent:true,error:'Staff sign-in required.'},401,clearSessionCookie());
 }catch(error){return errorResponse(error);}
}
export async function POST(request:Request){
 try{
  const service=await authService(request);service.originCheck(request);
  const body=await readAuthBody(request);
  const action=new URL(request.url).pathname.split('/').at(-1);
  switch(action){
   case 'login':{const result=await service.login(request,body);return reply({ok:true,csrf:result.csrf},200,result.cookie);}
   case 'logout':return reply({ok:true},200,await service.logout(request));
   case 'recovery':return reply(await service.recovery(request,body));
   case 'activation-info':return reply(await service.activationInfo(request,body));
   case 'activate':return reply(await service.activate(request,body));
   case 'invitations':return reply(await service.invitation(request,body));
   case 'password':return reply(await service.changePassword(request,body),200,clearSessionCookie());
   case 'disable':{
    const scope=await resolveScope(request);if(!['admin','local'].includes(scope.kind))throw new AppError('Platform administrator access required.',403);
    return reply(await service.disableAccount(request,body));
   }
   default:return reply({error:'Not found.'},404);
  }
 }catch(error){return errorResponse(error);}
}
