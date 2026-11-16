import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { currentTenantScope } from '../../lib/tenant-context';
import { loadRestaurantDesign } from '../../lib/store';
import { authenticatedUser } from '../auth';
import { RestaurantWebsite } from '../restaurant-designs/presentation';
import { I18nProvider } from '../i18n';
import { languageFrom } from '../../lib/i18n.mjs';
import { GuestPresentationPreview } from '../tab2serve';
export const dynamic='force-dynamic';
export default async function DesignPreview({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const query=await searchParams,scope=currentTenantScope();if(!scope||!['admin','local'].includes(scope.kind))notFound();
 const request=new Request(new URL('/design-preview',scope.origin),{headers:await headers()});
 let result;
 try{const user=await authenticatedUser(request);result=await loadRestaurantDesign(user,query.restaurant||'',scope);}catch{notFound();}
 if(query.version!==String(result.management.version))return <main className="welcome"><h1>Preview expired / انتهت صلاحية المعاينة</h1><p>Reload the design editor to preview its latest saved draft.</p></main>;
 const language=languageFrom(query.lang);
 const restaurant={...result.restaurant,appearance:result.management.draft,logo:result.management.draft.branding.logoUrl};
 return <I18nProvider initialLanguage={language}><div className="design-preview-note"><strong>{language==='ar'?'معاينة مسودة خاصة — غير منشورة':'Private draft preview — unpublished'}</strong><span>{result.restaurant.name} · v{result.management.version}</span></div><div inert>{query.view==='guest'?<GuestPresentationPreview restaurant={restaurant}/>:<RestaurantWebsite restaurant={restaurant} config={result.management.draft}/>}</div></I18nProvider>;
}
