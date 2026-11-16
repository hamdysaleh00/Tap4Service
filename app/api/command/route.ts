import { runCommand, resolveScope } from '../../../lib/store';
import { RoutingError } from '../../../lib/tenant-routing.mjs';
import { DesignError } from '../../../lib/restaurant-designs/config.mjs';
import { AppError } from '../../../lib/domain.mjs';
import { authenticatedUser } from '../../auth';
import { languageFrom,translateError } from '../../../lib/i18n.mjs';
import { readJsonBody, validateCommand } from '../../../lib/request-validation.mjs';
import { limitTraffic } from '../../../lib/abuse.mjs';
import { env } from 'cloudflare:workers';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
 try{
  const scope=await resolveScope(request);
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new AppError('Cross-origin request rejected.',403);
  if(request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('Cross-origin request rejected.',403);
  const body=await readJsonBody(request);validateCommand(body);
  if(body.action.startsWith('guest.'))await limitTraffic(request,env,'write',body.token);
  const user=body.action.startsWith('guest.')?null:await authenticatedUser(request,true,body.action.startsWith('platform.')||['staff.save','table.rotate_token'].includes(body.action));
  const result=await runCommand(user,body,scope);return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e:unknown){const known=e instanceof AppError||e instanceof RoutingError||e instanceof DesignError;const errorKey=known?e.message:e instanceof SyntaxError?'Invalid request.':'Unable to save. Please try again.';return Response.json({error:translateError(languageFrom(request.headers.get('accept-language')),errorKey),errorKey},{status:known?e.status:(e instanceof SyntaxError?400:500),headers:{'Cache-Control':'private, no-store',...(known&&e.status===429?{'Retry-After':'60'}:{})}});}
}

