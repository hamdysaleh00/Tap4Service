const valid=value=>value==='en'||value==='ar';
const read=(storage,key)=>{try{const value=storage()?.getItem(key);return valid(value)?value:null;}catch{return null;}};
// An external store gives React a stable server snapshot while keeping browser
// storage, user choices and cross-tab updates outside the render/effect cycle.
export function createLanguagePreference({key,initialLanguage,storage=()=>globalThis.localStorage,listen=callback=>{globalThis.addEventListener('storage',callback);return()=>globalThis.removeEventListener('storage',callback);}}){
 let choice=valid(initialLanguage)?initialLanguage:null;
 const listeners=new Set();
 const notify=()=>{for(const listener of listeners)listener();};
 return {
  getSnapshot:()=>choice||read(storage,key)||read(storage,'tab2serve.language:visitor')||'en',
  getServerSnapshot:()=>valid(initialLanguage)?initialLanguage:'en',
  subscribe(listener){
   listeners.add(listener);
   const stop=listen(event=>{if(event.key===key&&valid(event.newValue)){choice=event.newValue;notify();}});
   return()=>{listeners.delete(listener);stop();};
  },
  setLanguage(value){
   if(!valid(value))return;
   choice=value;
   try{storage()?.setItem(key,value);}catch{}
   notify();
  },
 };
}
