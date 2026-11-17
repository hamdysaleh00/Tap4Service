'use client';
import { useEffect, useState } from 'react';
import { validateDesign } from '../../lib/restaurant-designs/config.mjs';
import { I18nProvider } from '../i18n';
import { RestaurantWebsite } from './presentation';
import { GuestPresentationPreview } from '../tab2serve';
import type { DesignConfig, RestaurantContent } from './types';

// Only the authenticated same-origin parent can supply a visual configuration.
// This preview has no operational capabilities and never calls a mutation API.
export default function DesignPreviewClient({restaurant,initialConfig,language,view}:{restaurant:RestaurantContent;initialConfig:DesignConfig;language:'ar'|'en';view:string}){
 const [config,setConfig]=useState(initialConfig);
 useEffect(()=>{
  function receive(event:MessageEvent){
   if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='tab2serve.design.preview')return;
   try{setConfig(validateDesign(event.data.config));}catch{/* Keep the last valid preview while a HEX value is incomplete. */}
  }
  window.addEventListener('message',receive);
  window.parent.postMessage({type:'tab2serve.design.ready'},location.origin);
  return()=>window.removeEventListener('message',receive);
 },[]);
 const content={...restaurant,appearance:config,logo:config.branding.logoUrl};
 return <I18nProvider initialLanguage={language}><div className="design-preview-note"><strong>{language==='ar'?'معاينة خاصة — غير منشورة':'Private preview — unpublished'}</strong><span>{restaurant.name}</span></div><div inert>{view==='site'?<RestaurantWebsite restaurant={content} config={config}/>:<GuestPresentationPreview key={view} restaurant={content} screen={view}/>}</div></I18nProvider>;
}
