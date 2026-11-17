import test from 'node:test';
import assert from 'node:assert/strict';
import {createLanguagePreference} from '../lib/language-preference.mjs';
function fixture(initial={}){
 const values=new Map(Object.entries(initial)),callbacks=new Set();
 return {values,options:{storage:()=>({getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}),listen:fn=>{callbacks.add(fn);return()=>callbacks.delete(fn);}},event:event=>{for(const callback of callbacks)callback(event);},callbacks};
}
test('language stores hydrate from persisted identity or visitor values without changing the server snapshot',()=>{
 const f=fixture({'tab2serve.language:visitor':'ar','tab2serve.language:one':'en'}),make=key=>createLanguagePreference({key,...f.options});
 const one=make('tab2serve.language:one'),two=make('tab2serve.language:two');assert.equal(one.getSnapshot(),'en');assert.equal(two.getSnapshot(),'ar');assert.equal(two.getServerSnapshot(),'en');
 one.setLanguage('ar');assert.equal(one.getSnapshot(),'ar');assert.equal(f.values.get('tab2serve.language:one'),'ar');assert.equal(make('tab2serve.language:one').getSnapshot(),'ar');
 const preview=createLanguagePreference({key:'preview',initialLanguage:'en',...f.options});assert.equal(preview.getSnapshot(),'en');preview.setLanguage('ar');assert.equal(preview.getSnapshot(),'ar');assert.equal(preview.getServerSnapshot(),'en');
});
test('cross-tab changes stay scoped to the staff identity and unsubscribe cleanly',()=>{
 const f=fixture(),store=createLanguagePreference({key:'staff',...f.options});let updates=0;const stop=store.subscribe(()=>updates++);
 f.event({key:'other-staff',newValue:'ar'});assert.equal(updates,0);f.event({key:'staff',newValue:'invalid'});assert.equal(updates,0);
 f.event({key:'staff',newValue:'ar'});assert.equal(updates,1);assert.equal(store.getSnapshot(),'ar');store.setLanguage('en');assert.equal(updates,2);assert.equal(store.getSnapshot(),'en');
 stop();assert.equal(f.callbacks.size,0);f.event({key:'staff',newValue:'ar'});assert.equal(updates,2);
});
test('blocked browser storage preserves choices for the current mounted store and ignores invalid values',()=>{
 const store=createLanguagePreference({key:'staff',storage:()=>{throw Error('blocked');},listen:()=>()=>{}});
 assert.equal(store.getSnapshot(),'en');store.setLanguage('ar');assert.equal(store.getSnapshot(),'ar');store.setLanguage('invalid');assert.equal(store.getSnapshot(),'ar');
});
