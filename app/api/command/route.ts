import { runCommand, resolveScope } from '../../../lib/store';
import { RoutingError } from '../../../lib/tenant-routing.mjs';
import { DesignError } from '../../../lib/restaurant-designs/config.mjs';
import { AppError } from '../../../lib/domain.mjs';
import { authenticatedUser } from '../../auth';
import { languageFrom,translateError } from '../../../lib/i18n.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
 try{
  const scope=await resolveScope(request);
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new AppError('Cross-origin request rejected.',403);
  if(request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('Cross-origin request rejected.',403);
  if(!request.headers.get('content-type')?.includes('application/json'))throw new AppError('JSON request required.',415);
  const raw=await request.text();if(raw.length>64000)throw new AppError('Request too large.',413);const body=JSON.parse(raw);
  if(!body||Array.isArray(body)||typeof body!=='object'||typeof body.action!=='string')throw new AppError('Invalid request.',400);
  const user=body.action.startsWith('guest.')?null:await authenticatedUser(request,true,['staff.save','platform.create','platform.update'].includes(body.action));
  const result=await runCommand(user,body,scope);return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e:unknown){const known=e instanceof AppError||e instanceof RoutingError||e instanceof DesignError;const errorKey=known?e.message:e instanceof SyntaxError?'Invalid request.':'Unable to save. Please try again.';return Response.json({error:translateError(languageFrom(request.headers.get('accept-language')),errorKey),errorKey},{status:known?e.status:(e instanceof SyntaxError?400:500)});}
}

