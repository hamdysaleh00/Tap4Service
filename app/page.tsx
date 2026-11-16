import {I18nProvider} from './i18n';
import Tab2Serve from './tab2serve';
import { RestaurantWebsite } from './restaurant-designs/presentation';
import { currentTenantScope } from '../lib/tenant-context';
import { loadPublicRestaurant } from '../lib/store';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const scope=currentTenantScope();const query=await searchParams;
 if(!scope)return <main className="welcome"><h1>Workspace unavailable</h1></main>;
 if(scope.kind==='local'||scope.kind==='admin'||(scope.kind==='tenant'&&query.table))return <I18nProvider><Tab2Serve/></I18nProvider>;
 if(scope.kind==='platform'){
  const admin=new URL(scope.origin!);admin.hostname=`admin.${scope.base}`;
  return <main className="welcome"><div className="welcome-card"><h1>Tap2Serve</h1><p>Every table, connected.</p><p>QR and NFC menus, guest ordering and restaurant operations in one place.</p><p>Visit your restaurant’s address to browse its menu or open its staff dashboard.</p><a className="button primary" href={admin.origin}>Platform administration</a></div></main>;
 }
 const restaurant=await loadPublicRestaurant(scope);
 return <I18nProvider><RestaurantWebsite restaurant={restaurant}/></I18nProvider>;
}
