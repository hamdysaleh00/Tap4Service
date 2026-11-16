import { loadGuest, loadStaff, resolveScope } from '../../../lib/store';
import { RoutingError } from '../../../lib/tenant-routing.mjs';
import { AppError } from '../../../lib/domain.mjs';
import { authenticatedUser } from '../../auth';
import { languageFrom,translateError } from '../../../lib/i18n.mjs';
import { validateGuestRead } from '../../../lib/request-validation.mjs';
export const dynamic='force-dynamic';
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function GET(request:Request) {
 try{
  const scope=await resolveScope(request);const url=new URL(request.url);const token=url.searchParams.get('table');
  if(url.searchParams.has('table')){const capability=request.headers.get('x-guest-session');validateGuestRead(url,capability);return response(await loadGuest(token!,capability||url.searchParams.get('session'),scope));}
  const user=await authenticatedUser(request);
  return response({...await loadStaff(user,url.searchParams.get('restaurant'),scope),routing:{kind:scope.kind,base:scope.base,origin:scope.origin}});
 }catch(e:unknown){const known=e instanceof AppError||e instanceof RoutingError;const errorKey=known?e.message:'Unable to load the workspace. Please try again.';return response({error:translateError(languageFrom(request.headers.get('accept-language')),errorKey),errorKey},known?e.status:500);}
}

