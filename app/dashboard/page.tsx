import {I18nProvider} from '../i18n';
import Tab2Serve from '../tab2serve';
import { currentTenantScope } from '../../lib/tenant-context';
import { notFound } from 'next/navigation';
export const dynamic='force-dynamic';
export default function DashboardPage(){
 const scope=currentTenantScope();if(!scope||!['tenant','admin','local'].includes(scope.kind))notFound();
 return <I18nProvider><Tab2Serve/></I18nProvider>;
}
