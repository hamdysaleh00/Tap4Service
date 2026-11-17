'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n';
import { DEFAULT_CONFIG, validateDesign, templateConfig, readable } from '../lib/restaurant-designs/config.mjs';
import { SUGGESTED_PALETTES } from '../lib/restaurant-designs/catalog.mjs';
import type { DesignConfig } from './restaurant-designs/types';

type History={version:number;config:DesignConfig;at:string|null;by:string|null};
type Management={version:number;draft:DesignConfig;published:DesignConfig;previous:DesignConfig|null;history:History[];publishedAt:string|null};
type DesignReply={management:Management;catalog:{id:string;name:string;description:string}[]};
export default function DesignEditor({restaurantId,command,platform=false}:{restaurantId:string;command:(action:string,body:object,message?:string)=>Promise<unknown>;platform?:boolean}){
 const {t,language,error:translateError}=useI18n();
 const [data,setData]=useState<DesignReply|null>(null),[draft,setDraft]=useState<DesignConfig>(structuredClone(DEFAULT_CONFIG));
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[open,setOpen]=useState(false);
 const [galleryText,setGalleryText]=useState(''),[size,setSize]=useState('mobile'),[previewLanguage,setPreviewLanguage]=useState(language),[previewView,setPreviewView]=useState('menu');
 const frame=useRef<HTMLIFrameElement>(null),latest=useRef(draft),loadedRestaurant=useRef('');latest.current=draft;
 async function read(signal?:AbortSignal){
  const response=await fetch('/api/design?restaurant='+encodeURIComponent(restaurantId),{cache:'no-store',signal});
  const result=await response.json() as DesignReply&{error?:string};
  if(!response.ok)throw new Error(result.error);
  if(signal?.aborted)return;
  loadedRestaurant.current=restaurantId;setData(result);setDraft(validateDesign(result.management.draft));setDirty(false);setGalleryText(result.management.draft.branding.gallery.join(String.fromCharCode(10)));
 }
 useEffect(()=>{setData(null);setDirty(false);setMessage('');if(!open)return;const controller=new AbortController();read(controller.signal).catch(error=>{if(!controller.signal.aborted)setMessage(error.message)});return()=>controller.abort()},[open,restaurantId]);
 function sendPreview(){try{const config=validateDesign(latest.current);frame.current?.contentWindow?.postMessage({type:'tab2serve.design.preview',config},location.origin)}catch{/* Incomplete fields are reported below. */}}
 useEffect(()=>{sendPreview()},[draft]);
 useEffect(()=>{function ready(event:MessageEvent){if(event.origin===location.origin&&event.source===frame.current?.contentWindow&&event.data?.type==='tab2serve.design.ready')sendPreview()}window.addEventListener('message',ready);return()=>window.removeEventListener('message',ready)},[]);
 function change(next:DesignConfig){setDraft(next);setDirty(true);setMessage('')}
 async function mutate(action:string,targetVersion?:number){
  if(!data||busy||loadedRestaurant.current!==restaurantId)return;setBusy(true);setMessage('');
  try{
   const body:Record<string,unknown>={restaurantId,expectedVersion:data.management.version};
   if(action==='save')body.config=validateDesign(draft);
   if(targetVersion!==undefined)body.targetVersion=targetVersion;
   const success=action==='save'?'Design draft saved':action==='publish'?'Restaurant design published':action==='reset'?'Default draft restored':'Previous design restored';
   await command((platform?'platform.design.':'design.')+action,body,t(success));await read();setMessage(success);
  }catch(error){setMessage(error instanceof Error?error.message:'Unable to save restaurant design.')}finally{setBusy(false)}
 }
 let validation='';try{validateDesign(draft)}catch(error){validation=error instanceof Error?error.message:'Invalid restaurant design configuration.'}
 const corrected=!validation&&['background','surface'].some(key=>readable(draft.colors.text,draft.colors[key as 'background'|'surface'])!==draft.colors.text||readable(draft.colors.muted,draft.colors[key as 'background'|'surface'])!==draft.colors.muted);
 const choices={buttonStyle:['square','rounded','pill'],cardVariant:['elevated','outlined','compact'],borders:['none','subtle','strong'],spacing:['compact','comfortable','spacious'],headerStyle:['simple','brand','banner'],menuStyle:['cards','list']};
 const choiceLabels={buttonStyle:'Button corners',cardVariant:'Product cards',borders:'Borders',spacing:'Spacing',headerStyle:'Header appearance',menuStyle:'Menu layout'};
 return <section className="design-editor" aria-label={t('Design Studio')}>
  <div className="studio-heading"><div><span className="eyebrow">TAB2SERVE</span><h2>{t('Design Studio')}</h2><p>{t('Make your restaurant feel like yours. Changes stay private until published.')}</p></div><button className="button" type="button" onClick={()=>setOpen(!open)}>{t(open?'Close design editor':'Manage design')}</button></div>
  {message&&<p className="design-editor-message" role="status">{translateError(message)}</p>}
  {open&&!data&&!message&&<p>{t('Loading design…')}</p>}
  {open&&data&&loadedRestaurant.current===restaurantId&&<>
   <div className="studio-status"><span>{t('Design version')} {data.management.version}</span><strong>{t(dirty?'Unsaved changes':data.management.publishedAt?'Published':'Default design')}</strong><button type="button" className="text-button" disabled={busy} onClick={()=>read().catch(error=>setMessage(error.message))}>{t('Reload saved draft')}</button></div>
   <div className="studio-layout"><div className="studio-controls"><fieldset disabled={busy}><legend>{t('Ready-made templates')}</legend>
    <div className="studio-templates">{data.catalog.map(entry=><button type="button" className={'studio-template '+(entry.id===draft.implementationId?'selected':'')} aria-pressed={entry.id===draft.implementationId} key={entry.id} onClick={()=>change(templateConfig(entry.id,draft.branding))}><span className="studio-swatches" aria-hidden="true">{Object.values(SUGGESTED_PALETTES.find(p=>p.id===entry.id)?.colors||{}).slice(0,4).map((color,index)=><i key={index} style={{background:color}}/>)}</span><strong>{t(entry.name)}</strong><small>{t(entry.description)}</small></button>)}</div>
   </fieldset><fieldset disabled={busy}><legend>{t('Colors & palettes')}</legend>
    <label>{t('Suggested palettes')}<select value="" onChange={e=>{const palette=SUGGESTED_PALETTES.find(p=>p.id===e.target.value);if(palette)change({...draft,colors:validateDesign({schemaVersion:1,implementationId:draft.implementationId,colors:palette.colors}).colors})}}><option value="">{t('Choose a palette')}</option>{SUGGESTED_PALETTES.map(p=><option key={p.id} value={p.id}>{t(p.name)}</option>)}</select></label>
    <div className="design-color-fields">{Object.entries(draft.colors).map(([key,value])=><div key={key}><label htmlFor={'design-'+restaurantId+'-'+key}>{t(key)}</label><div className="studio-color"><input type="color" aria-label={t(key)+' '+t('Color picker')} value={/^#[0-9a-fA-F]{6}$/.test(value)?value:'#000000'} onChange={e=>change({...draft,colors:{...draft.colors,[key]:e.target.value}})}/><input id={'design-'+restaurantId+'-'+key} aria-label={t(key)+' HEX'} dir="ltr" value={value} maxLength={7} pattern="#[0-9a-fA-F]{6}" onChange={e=>change({...draft,colors:{...draft.colors,[key]:e.target.value}})}/></div></div>)}</div>
    <p className="form-note">{t('Use any six-digit HEX color. Readable foregrounds are applied automatically.')}</p>{!validation&&corrected&&<p role="status">{t('Contrast protection is active. Your chosen colors are saved; text is adjusted where needed.')}</p>}
   </fieldset><fieldset disabled={busy}><legend>{t('Branding & typography')}</legend>
    {(['logoUrl','heroImageUrl','backgroundImageUrl'] as const).map(key=><label key={key}>{t(key==='logoUrl'?'Logo image URL (HTTPS)':key==='heroImageUrl'?'Hero image URL (HTTPS)':'Background image URL (HTTPS)')}<input type="url" value={draft.branding[key]} maxLength={1500} onChange={e=>change({...draft,branding:{...draft.branding,[key]:e.target.value}})}/></label>)}
    {(['en','ar'] as const).map(lang=><label key={lang}>{t(lang==='ar'?'Hero title (Arabic)':'Hero title (English)')}<input dir={lang==='ar'?'rtl':'ltr'} maxLength={180} value={draft.branding.heroTitle[lang]} onChange={e=>change({...draft,branding:{...draft.branding,heroTitle:{...draft.branding.heroTitle,[lang]:e.target.value}}})}/></label>)}
    <label>{t('Gallery image URLs (one HTTPS URL per line, up to six)')}<textarea value={galleryText} onChange={e=>{setGalleryText(e.target.value);change({...draft,branding:{...draft.branding,gallery:e.target.value.split(String.fromCharCode(10)).map(url=>url.trim()).filter(Boolean)}})}}/></label>
    {Object.entries(draft.typography).map(([key,value])=><label key={key}>{t(key==='heading'?'Heading font':key==='body'?'Body font':'Arabic font')}<select value={value} onChange={e=>change({...draft,typography:{...draft.typography,[key]:e.target.value}})}>{(key==='arabic'?['system','sans','noto']:['system','sans','serif']).map(font=><option key={font} value={font}>{t(font)}</option>)}</select></label>)}
   </fieldset><fieldset disabled={busy}><legend>{t('Visual details')}</legend>
    {Object.entries(choices).map(([key,values])=><label key={key}>{t(choiceLabels[key as keyof typeof choiceLabels])}<select value={draft.components[key as keyof typeof choices]} onChange={e=>change({...draft,components:{...draft.components,[key]:e.target.value}})}>{values.map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label>)}
    {(['showHero','showGallery'] as const).map(key=><label key={key} className="design-check"><input type="checkbox" checked={draft.components[key]} onChange={e=>change({...draft,components:{...draft.components,[key]:e.target.checked}})}/>{t(key==='showHero'?'Show hero':'Show gallery')}</label>)}
   </fieldset></div><div className="studio-preview"><div className="studio-preview-tools"><h3>{t('Live preview')}</h3><label>{t('Preview width')}<select value={size} onChange={e=>setSize(e.target.value)}><option value="mobile">{t('Mobile')}</option><option value="desktop">{t('Desktop')}</option></select></label><label>{t('Preview language')}<select value={previewLanguage} onChange={e=>setPreviewLanguage(e.target.value)}><option value="en">English · LTR</option><option value="ar">العربية · RTL</option></select></label><label>{t('Preview page')}<select value={previewView} onChange={e=>setPreviewView(e.target.value)}>{['site','menu','item','basket','orders','bill'].map(view=><option key={view} value={view}>{t(({site:'Website',menu:'Guest ordering',item:'Product details',basket:'Your basket',orders:'Table orders',bill:'Table bill'})[view]!)}</option>)}</select></label></div>
    <div className="studio-preview-viewport"><iframe ref={frame} onLoad={sendPreview} className={size==='mobile'?'design-mobile-preview':'design-desktop-preview'} title={t('Private design preview')} src={'/design-preview?restaurant='+encodeURIComponent(restaurantId)+'&version='+data.management.version+'&lang='+previewLanguage+'&view='+previewView} referrerPolicy="no-referrer"/></div><p className="form-note">{t('Live preview is read-only and never places orders.')}</p>
   </div></div>
   {validation&&<p className="design-editor-message" role="alert">{translateError(validation)}</p>}
   <div className="design-editor-actions studio-save"><button type="button" className="button" disabled={busy||!dirty||!!validation} onClick={()=>mutate('save')}>{t('Save draft')}</button><button type="button" className="button primary" disabled={busy||dirty||!!validation} onClick={()=>mutate('publish')}>{t('Publish Design')}</button><button type="button" className="button" disabled={busy} onClick={()=>mutate('reset')}>{t('Reset to Default')}</button><button type="button" className="button" disabled={busy||dirty||!data.management.previous} onClick={()=>mutate('revert')}>{t('Revert published design')}</button></div>
   {dirty&&<p>{t('Save your draft before publishing. Preview updates as you edit.')}</p>}
   <details className="studio-history"><summary>{t('Version History')}</summary><p>{t('Restoring a version publishes it immediately. The latest 20 published versions are retained.')}</p>{!data.management.history.length&&<p>{t('No previous versions yet.')}</p>}{data.management.history.slice().reverse().map((entry,index)=><div className="studio-history-row" key={index}><span>v{entry.version} · {t(data.catalog.find(c=>c.id===entry.config.implementationId)?.name||'Default design')} · {entry.at?new Date(entry.at).toLocaleString(language):t('Default design')}</span><button type="button" className="button small" disabled={busy||dirty} onClick={()=>mutate('revert',entry.version)}>{t('Restore version')}</button></div>)}</details>
  </>}
 </section>;
}
