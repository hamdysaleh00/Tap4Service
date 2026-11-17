'use client';
import React,{createContext,useContext,useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {translate,translateError,formatMoney,localized,translateAuditDetail} from '../lib/i18n.mjs';
import {createLanguagePreference} from '../lib/language-preference.mjs';
import {useBrowserReady} from '../hooks/use-browser-ready';
type Language='en'|'ar';
type Parameters=Record<string,unknown>;
type AuditEvent={detail?:string;detailKey?:string;detailParams?:Parameters};
type I18nValue={language:Language;ready:boolean;setLanguage:(language:Language)=>void;setIdentity:React.Dispatch<React.SetStateAction<string>>;t:(key:string,params?:Parameters)=>string;error:(message:string)=>string;money:(value:number)=>string;content:(record:object|null|undefined,field?:string)=>string;auditDetail:(event:AuditEvent)=>string;date:(value:string)=>string;time:(value:string)=>string;elapsed:(value:string)=>string};
const I18nContext=createContext<I18nValue|null>(null);
export function I18nProvider({children,initialLanguage}:{children:React.ReactNode;initialLanguage?:Language}){
 const [identity,setIdentity]=useState('visitor'),ready=useBrowserReady();
 const preferenceKey=`tab2serve.language:${identity}`;
 const preference=useMemo(()=>createLanguagePreference({key:preferenceKey,initialLanguage}),[preferenceKey,initialLanguage]);
 const language=useSyncExternalStore(preference.subscribe,preference.getSnapshot,preference.getServerSnapshot) as Language;
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.title=translate(language,'Tab2Serve Alpha — Initial Testing Release')},[language]);
 useEffect(()=>{
  const clear=(e:Event)=>{const input=e.target as HTMLInputElement;if(input?.setCustomValidity)input.setCustomValidity('')};
  const invalid=(e:Event)=>{const input=e.target as HTMLInputElement;input.setCustomValidity('');const v=input.validity;const key=v.valueMissing?'Required field.':v.typeMismatch&&input.type==='email'?'Enter a valid email address.':v.typeMismatch&&input.type==='url'?'Enter a valid URL.':'Enter a valid value.';input.setCustomValidity(translate(language,key))};
  document.querySelectorAll<HTMLInputElement>('input,select,textarea').forEach(i=>i.setCustomValidity(''));
  document.addEventListener('input',clear,true);document.addEventListener('invalid',invalid,true);
  return()=>{document.removeEventListener('input',clear,true);document.removeEventListener('invalid',invalid,true)};
 },[language]);
 const value=useMemo<I18nValue>(()=>({language,ready,setLanguage:preference.setLanguage,setIdentity,t:(key,params)=>translate(language,key,params),error:key=>translateError(language,key),money:n=>formatMoney(language,n),content:(record,field='name')=>localized(record,field,language),auditDetail:e=>translateAuditDetail(language,e),date:s=>new Date(s).toLocaleDateString(language==='ar'?'ar-EG':'en-GB'),time:s=>new Date(s).toLocaleTimeString(language==='ar'?'ar-EG':'en-GB',{hour:'2-digit',minute:'2-digit'}),elapsed:s=>translate(language,'minutes',{count:Math.max(0,Math.floor((Date.now()-Date.parse(s))/60000))})}),[language,preference,ready]);
 return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n(){const value=useContext(I18nContext);if(!value)throw new Error('I18nProvider is required');return value}
export function LanguageSwitcher(){const {language,setLanguage,t,ready}=useI18n();return <label className="language-switcher"><span className="sr-only">{t('Language')}</span><select disabled={!ready} aria-label={t('Language')} value={language} onChange={e=>setLanguage(e.target.value as Language)}><option value="en" lang="en">English</option><option value="ar" lang="ar">العربية</option></select></label>}
