'use client';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from './i18n';
import { validateDesign } from '../lib/restaurant-designs/config.mjs';
import { DEFAULT_CONFIG } from '../lib/restaurant-designs/config.mjs';
import type { DesignConfig } from './restaurant-designs/types';
type Management={version:number;draft:DesignConfig;published:DesignConfig;previous:DesignConfig|null;publishedAt:string|null};
type DesignReply={management:Management;catalog:{id:string;name:string;description:string}[]};
async function fetchDesign(restaurantId:string,signal?:AbortSignal){
 const response=await fetch(`/api/design?restaurant=${encodeURIComponent(restaurantId)}`,{cache:'no-store',signal});const result=await response.json() as DesignReply&{error?:string};
 if(!response.ok)throw new Error(result.error);return result;
}
export default function DesignEditor({restaurantId,command}:{restaurantId:string;command:(action:string,body:object,message?:string)=>Promise<unknown>}){
 const {t,language,error:translateError}=useI18n();
 const [data,setData]=useState<DesignReply|null>(null),[draft,setDraft]=useState<DesignConfig>(structuredClone(DEFAULT_CONFIG));
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[open,setOpen]=useState(false),[preview,setPreview]=useState<number|null>(null),[size,setSize]=useState('mobile'),[previewLanguage,setPreviewLanguage]=useState('en'),[optionsText,setOptionsText]=useState('{}'),[previewView,setPreviewView]=useState('site');
 const acceptDesign=useCallback((result:DesignReply)=>{setData(result);setDraft(result.management.draft);setOptionsText(JSON.stringify(result.management.draft.options,null,2));setDirty(false);setPreview(null);},[]);
 async function read(){acceptDesign(await fetchDesign(restaurantId));}
 useEffect(()=>{if(!open)return;const controller=new AbortController();void fetchDesign(restaurantId,controller.signal).then(result=>{if(!controller.signal.aborted)acceptDesign(result);}).catch(error=>{if(!controller.signal.aborted)setMessage(error.message);});return()=>controller.abort();},[open,restaurantId,acceptDesign]);
 function change(next:DesignConfig){setDraft(next);setDirty(true);setPreview(null);setMessage('');}
 async function mutate(action:string){
  if(!data||busy)return;setBusy(true);setMessage('');
  try{
   const body:Record<string,unknown>={restaurantId,expectedVersion:data.management.version};
   if(action==='save')body.config=validateDesign({...draft,options:JSON.parse(optionsText)});
   await command(`platform.design.${action}`,body,t(action==='save'?'Design draft saved':action==='publish'?'Restaurant design published':'Previous design restored'));
   await read();setMessage(action==='save'?'Design draft saved':action==='publish'?'Restaurant design published':'Previous design restored');
  }catch(error){setMessage(error instanceof Error?error.message:'Unable to save restaurant design.');}finally{setBusy(false);}
 }
 const fonts=['system','sans','serif'];
 return <section className="design-editor" aria-label={t('Website design')}>
  <h3>{t('Website design')}</h3><p>{t('Only Tap2Serve Super Admin can change website appearance.')}</p>
  <button className="button" type="button" onClick={()=>{setOpen(!open);setMessage('');}}>{t(open?'Close design editor':'Manage design')}</button>
  {message&&<p className="design-editor-message" role="status">{translateError(message)}</p>}
  {open&&!data&&!message&&<p>{t('Loading design…')}</p>}
  {open&&data&&<>
   <p>{t('Design version')} {data.management.version} · {data.management.publishedAt?t('Published'):t('Default design')}</p>
   <label>{t('Design implementation')}<select disabled={busy} value={draft.implementationId} onChange={e=>{change({...draft,implementationId:e.target.value,options:{}});setOptionsText('{}');}}>
    {!data.catalog.some(entry=>entry.id===draft.implementationId)&&<option value={draft.implementationId}>{draft.implementationId} ({t('Unavailable — fallback active')})</option>}
    {data.catalog.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}
   </select></label>
   <div className="design-color-fields">{Object.entries(draft.colors).map(([key,value])=><label key={key}>{t(key)}<input aria-label={t(key)} value={value} maxLength={7} pattern="#[0-9a-fA-F]{6}" onChange={e=>change({...draft,colors:{...draft.colors,[key]:e.target.value}})}/></label>)}</div>
   <div className="design-editor-grid">{Object.entries(draft.typography).map(([key,value])=><label key={key}>{t(key==='heading'?'Heading font':key==='body'?'Body font':'Arabic font')}<select value={value} onChange={e=>change({...draft,typography:{...draft.typography,[key]:e.target.value}})}>{(key==='arabic'?['system','sans']:fonts).map(font=><option key={font} value={font}>{t(font)}</option>)}</select></label>)}</div>
   <div className="design-editor-grid">{(['logoUrl','heroImageUrl','backgroundImageUrl'] as const).map(key=><label key={key}>{t(key==='logoUrl'?'Logo image URL (HTTPS)':key==='heroImageUrl'?'Hero image URL (HTTPS)':'Background image URL (HTTPS)')}<input type="url" value={draft.branding[key]} maxLength={1500} onChange={e=>change({...draft,branding:{...draft.branding,[key]:e.target.value}})}/></label>)}</div>
   <div className="design-editor-grid">{(['en','ar'] as const).map(lang=><label key={lang}>{t(lang==='ar'?'Hero title (Arabic)':'Hero title (English)')}<input dir={lang==='ar'?'rtl':'ltr'} maxLength={180} value={draft.branding.heroTitle[lang]} onChange={e=>change({...draft,branding:{...draft.branding,heroTitle:{...draft.branding.heroTitle,[lang]:e.target.value}}})}/></label>)}</div>
   <label>{t('Gallery image URLs (one HTTPS URL per line, up to six)')}<textarea value={draft.branding.gallery.join('\n')} onChange={e=>change({...draft,branding:{...draft.branding,gallery:e.target.value.split('\n').filter(Boolean)}})}/></label>
   <div className="design-editor-grid">{(['showHero','showGallery'] as const).map(key=><label key={key} className="design-check"><input type="checkbox" checked={draft.components[key]} onChange={e=>change({...draft,components:{...draft.components,[key]:e.target.checked}})}/>{t(key==='showHero'?'Show hero':'Show gallery')}</label>)}
   <label>{t('Menu layout')}<select value={draft.components.menuStyle} onChange={e=>change({...draft,components:{...draft.components,menuStyle:e.target.value}})}><option value="cards">{t('Cards')}</option><option value="list">{t('List')}</option></select></label></div>
   <label>{t('Implementation options (JSON)')}<textarea spellCheck={false} dir="ltr" value={optionsText} onChange={e=>{setOptionsText(e.target.value);setDirty(true);setPreview(null);}}/></label>
   <div className="design-editor-actions"><button type="button" className="button" disabled={busy||!dirty} onClick={()=>mutate('save')}>{t('Save draft')}</button><button type="button" className="button" disabled={busy||dirty} onClick={()=>{setPreview(data.management.version);setPreviewLanguage(language);}}>{t('Preview saved draft')}</button><button type="button" className="button primary" disabled={busy||dirty} onClick={()=>mutate('publish')}>{t('Publish saved draft')}</button><button type="button" className="button" disabled={busy||dirty||!data.management.previous} onClick={()=>mutate('revert')}>{t('Revert published design')}</button></div>
   {dirty&&<p>{t('Save your draft before previewing or publishing.')}</p>}
   {preview!==null&&<><div className="design-editor-actions"><label>{t('Preview page')}<select value={previewView} onChange={e=>setPreviewView(e.target.value)}><option value="site">{t('Website')}</option><option value="guest">{t('Guest ordering')}</option></select></label><label>{t('Preview width')}<select value={size} onChange={e=>setSize(e.target.value)}><option value="mobile">{t('Mobile')}</option><option value="desktop">{t('Desktop')}</option></select></label><label>{t('Preview language')}<select value={previewLanguage} onChange={e=>setPreviewLanguage(e.target.value)}><option value="en">English</option><option value="ar">العربية</option></select></label></div><iframe className={size==='mobile'?'design-mobile-preview':''} title={t('Private design preview')} src={`/design-preview?restaurant=${encodeURIComponent(restaurantId)}&version=${preview}&lang=${previewLanguage}&view=${previewView}`} referrerPolicy="no-referrer"/></>}
  </>}
 </section>;
}
