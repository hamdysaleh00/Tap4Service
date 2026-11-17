import { loadUpdates,resolveScope } from '../../../lib/store';
import { authenticatedUser } from '../../auth';
import { AppError } from '../../../lib/domain.mjs';
import { RoutingError } from '../../../lib/tenant-routing.mjs';
import { languageFrom,translateError } from '../../../lib/i18n.mjs';
import { validateGuestRead } from '../../../lib/request-validation.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const start=performance.now();
 const headers:Record<string,string>={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','Vary':'Cookie, Accept-Language, X-Guest-Session'};
 try{
  const scope=await resolveScope(request),url=new URL(request.url),token=url.searchParams.get('table');
  const capability=request.headers.get('x-guest-session');if(url.searchParams.has('table'))validateGuestRead(url,capability);
  const user=token?null:await authenticatedUser(request);
  const result=await loadUpdates(user,{restaurantId:url.searchParams.get('restaurant'),token,capability:capability||url.searchParams.get('session'),view:url.searchParams.get('view'),cursor:url.searchParams.get('cursor'),etag:request.headers.get('if-none-match')},scope);
  headers.ETag=result.etag!;
  headers['X-Update-Queries']=String(result.metrics.queries);
  headers['X-Update-Rows-Read']=String(result.metrics.rowsRead);
  headers['X-Update-Rows-Written']=String(result.metrics.rowsWritten);
  headers['Server-Timing']=`updates;dur=${(performance.now()-start).toFixed(1)}, snapshot-d1;desc="${result.metrics.queries} queries, ${result.metrics.rowsRead} rows read"`;
  if(result.unchanged)return new Response(null,{status:304,headers});
  return Response.json({...result.data,routing:{kind:scope.kind,base:scope.base,origin:scope.origin}},{headers});
 }catch(e){const known=e instanceof AppError||e instanceof RoutingError,errorKey=known?e.message:'Unable to load the workspace. Please try again.';return Response.json({error:translateError(languageFrom(request.headers.get('accept-language')),errorKey),errorKey},{status:known?e.status:500,headers});}
}
