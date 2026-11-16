'use client';
import React,{createContext,useContext,useEffect,useMemo,useState,useCallback} from 'react';
import {translate,translateError,formatMoney,localized,translateAuditDetail} from '../lib/i18n.mjs';
type Language='en'|'ar';
const I18nContext=createContext<any>(null);
const readPreference=(key:string)=>{try{const v=localStorage.getItem(key);return v==='ar'||v==='en'?v:null}catch{return null}};
export function I18nProvider({children,initialLanguage}:{children:React.ReactNode;initialLanguage?:Language}){
 const [language,setLanguage]=useState<Language>(initialLanguage||'en'),[identity,setIdentity]=useState('visitor'),[ready,setReady]=useState(false);
 const preferenceKey=`tab2serve.language:${identity}`;
 useEffect(()=>{const saved=readPreference(preferenceKey)||readPreference('tab2serve.language:visitor');setLanguage(initialLanguage||saved||'en');setReady(true)},[preferenceKey,initialLanguage]);
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.title=translate(language,'Tab2Serve Alpha — Initial Testing Release')},[language]);
 useEffect(()=>{
  const clear=(e:Event)=>{const input=e.target as HTMLInputElement;if(input?.setCustomValidity)input.setCustomValidity('')};
  const invalid=(e:Event)=>{const input=e.target as HTMLInputElement;input.setCustomValidity('');const v=input.validity;const key=v.valueMissing?'Required field.':v.typeMismatch&&input.type==='email'?'Enter a valid email address.':v.typeMismatch&&input.type==='url'?'Enter a valid URL.':'Enter a valid value.';input.setCustomValidity(translate(language,key))};
  document.querySelectorAll<HTMLInputElement>('input,select,textarea').forEach(i=>i.setCustomValidity(''));
  document.addEventListener('input',clear,true);document.addEventListener('invalid',invalid,true);
  return()=>{document.removeEventListener('input',clear,true);document.removeEventListener('invalid',invalid,true)};
 },[language]);
 useEffect(()=>{const sync=(event:StorageEvent)=>{if(event.key===preferenceKey&&['en','ar'].includes(event.newValue||''))setLanguage(event.newValue as Language)};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync)},[preferenceKey]);
 const changeLanguage=useCallback((value:Language)=>{setLanguage(value);try{localStorage.setItem(preferenceKey,value);if(identity==='visitor')localStorage.setItem('tab2serve.language:visitor',value)}catch{}},[preferenceKey,identity]);
 const value=useMemo(()=>({language,ready,setLanguage:changeLanguage,setIdentity,t:(key:string,params?:any)=>translate(language,key,params),error:(key:string)=>translateError(language,key),money:(n:number)=>formatMoney(language,n),content:(record:any,field='name')=>localized(record,field,language),auditDetail:(e:any)=>translateAuditDetail(language,e),date:(s:string)=>new Date(s).toLocaleDateString(language==='ar'?'ar-EG':'en-GB'),time:(s:string)=>new Date(s).toLocaleTimeString(language==='ar'?'ar-EG':'en-GB',{hour:'2-digit',minute:'2-digit'}),elapsed:(s:string)=>translate(language,'minutes',{count:Math.max(0,Math.floor((Date.now()-Date.parse(s))/60000))})}),[language,changeLanguage,ready]);
 return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n(){const value=useContext(I18nContext);if(!value)throw new Error('I18nProvider is required');return value}
export function LanguageSwitcher(){const {language,setLanguage,t,ready}=useI18n();return <label className="language-switcher"><span className="sr-only">{t('Language')}</span><select disabled={!ready} aria-label={t('Language')} value={language} onChange={e=>setLanguage(e.target.value as Language)}><option value="en" lang="en">English</option><option value="ar" lang="ar">العربية</option></select></label>}
