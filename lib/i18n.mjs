import ar from './locales/ar.mjs';
import en from './locales/en.mjs';
export const DEFAULT_LANGUAGE='en';
export const LANGUAGES=['en','ar'];
export function languageFrom(value){return /^ar(?:-|$)/i.test(String(value||'').split(',')[0].split(';')[0].trim())?'ar':'en'}
export function translate(language,key,params={}) {
 let message=language==='ar'?(ar[key]??key):(en[key]??key);
 if(message&&typeof message==='object')message=message[new Intl.PluralRules(language).select(params.count)]??message.other;
 return String(message??'').replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??`{${name}}`));
}
export function translateError(language,message){
 if(message?.startsWith('Missing permission: '))return translate(language,'Missing permission: {permission}',{permission:translate(language,message.slice(20))});
 return translate(language,message);
}
export function formatMoney(language,value){return new Intl.NumberFormat(language==='ar'?'ar-EG':'en-EG',{minimumFractionDigits:2,maximumFractionDigits:2,numberingSystem:'latn'}).format((value||0)/100)}
export function localized(record,field,language){
 const original=record?.[field]||record?.[field+'Ar']||'';
 // Translate the authored sample menu too; arbitrary restaurant content is never guessed.
 const sampleNames=['The house burger','Garden greens','Basil pesto pasta','Burrata toast','Chocolate celebration','Flat white','Extra cheddar','Beef bacon','Grilled chicken','Oat milk','Extra shot'];
 const sample=sampleNames.includes(record?.name);
 return language==='ar'?(record?.[field+'Ar']||(sample?translate(language,original):original)):original;
}
export function translateAuditDetail(language,event){
 if(event.detailKey)return translate(language,event.detailKey,event.detailParams);
 const text=event.detail||'';let match;
 if((match=/^Table (.+)$/.exec(text)))return translate(language,'Table {label}',{label:match[1]});
 if((match=/^Order #(\d+), revision (\d+)$/.exec(text)))return translate(language,'Order #{number}, revision {revision}',{number:match[1],revision:match[2]});
 if((match=/^Order #(\d+) → (\w+)$/.exec(text)))return translate(language,'Order #{number} {status}',{number:match[1],status:translate(language,match[2].toLowerCase())});
 if((match=/^(cash|card): ([\d.]+) EGP$/.exec(text)))return `${translate(language,match[1]==='cash'?'Cash':'Card')}: ${formatMoney(language,Math.round(Number(match[2])*100))} ${translate(language,'EGP')}`;
 if((match=/^Session (.+); total ([\d.]+)$/.exec(text)))return translate(language,'Session {id}; total {amount}',{id:match[1],amount:formatMoney(language,Math.round(Number(match[2])*100))});
 if((match=/^(.+): (Available|Out of stock)$/.exec(text)))return `${match[1]}: ${translate(language,match[2])}`;
 return translate(language,text);
}
export {ar as arabicMessages};
