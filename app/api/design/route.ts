import { resolveScope, loadRestaurantDesign } from '../../../lib/store';
import { authenticatedUser } from '../../auth';
import { AppError } from '../../../lib/domain.mjs';
import { DesignError } from '../../../lib/restaurant-designs/config.mjs';
import { RoutingError } from '../../../lib/tenant-routing.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const scope=await resolveScope(request);
  const user=await authenticatedUser(request);
  const result=await loadRestaurantDesign(user,new URL(request.url).searchParams.get('restaurant')||'',scope);
  return Response.json(result,{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 }catch(error){const known=error instanceof AppError||error instanceof DesignError||error instanceof RoutingError;return Response.json({error:known?error.message:'Unable to load restaurant design.'},{status:known?error.status:500,headers:{'Cache-Control':'private, no-store'}});}
}
