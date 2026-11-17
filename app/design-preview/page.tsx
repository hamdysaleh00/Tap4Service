import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { currentTenantScope } from '../../lib/tenant-context';
import { loadRestaurantDesign } from '../../lib/store';
import { authenticatedUser } from '../auth';
import DesignPreviewClient from '../restaurant-designs/preview-client';
import { languageFrom } from '../../lib/i18n.mjs';
export const dynamic='force-dynamic';
export default async function DesignPreview({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const query=await searchParams,scope=currentTenantScope();if(!scope||!['admin','local','tenant'].includes(scope.kind))notFound();
 const request=new Request(new URL('/design-preview',scope.origin),{headers:await headers()});
 let result;
 try{const user=await authenticatedUser(request);result=await loadRestaurantDesign(user,query.restaurant||'',scope);}catch{notFound();}
 if(query.version!==String(result.management.version))return <main className="welcome"><h1>Preview expired / انتهت صلاحية المعاينة</h1><p>Reload the design editor to preview its latest saved draft.</p></main>;
 const language=languageFrom(query.lang);
 return <DesignPreviewClient restaurant={result.restaurant} initialConfig={result.management.draft} language={language} view={query.view||'site'}/>;
}
