import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_CONFIG,validateDesign,resolvedDesign,designState,publishedDesign,DesignError,safeAssetUrl } from '../lib/restaurant-designs/config.mjs';
import { DESIGN_CATALOG,DEFAULT_DESIGN_ID } from '../lib/restaurant-designs/catalog.mjs';
import { createInitialState,createRestaurant,applyCommand,staffView,guestView,PERMISSIONS } from '../lib/domain.mjs';
import { publicView } from '../lib/tenant-views.mjs';
import { scopeState } from '../lib/tenant-routing.mjs';
import { arabicMessages } from '../lib/i18n.mjs';
const owner={id:'owner',email:'owner@example.test'},admin={id:'restaurant-admin',email:'admin@example.test'};
function fixture(){const state=createInitialState(owner),restaurant=state.restaurants[0];restaurant.members.push({id:crypto.randomUUID(),userId:admin.id,email:admin.email,active:true,permissions:[...PERMISSIONS]});const command=(action,body={},user=owner)=>applyCommand(state,user,{action,restaurantId:restaurant.id,...body});return {state,restaurant,command};}
const config=()=>({...structuredClone(DEFAULT_CONFIG),branding:{...structuredClone(DEFAULT_CONFIG.branding),heroTitle:{en:'Draft only title',ar:'عنوان المسودة'}}});
test('draft save, publish and revert are independent, versioned and audited without changing operational state',()=>{
 const f=fixture(),operational=structuredClone({orders:f.restaurant.orders,sessions:f.restaurant.sessions,payments:f.restaurant.payments,tables:f.restaurant.tables});
 f.command('platform.design.save',{config:config(),expectedVersion:0});
 assert.equal(designState(f.restaurant).version,1);assert.notEqual(publishedDesign(f.restaurant).branding.heroTitle.en,'Draft only title');
 f.command('platform.design.publish',{expectedVersion:1});assert.equal(publishedDesign(f.restaurant).branding.heroTitle.en,'Draft only title');
 const next=config();next.branding.heroTitle.en='Second published title';f.command('platform.design.save',{expectedVersion:2,config:next});f.command('platform.design.publish',{expectedVersion:3});
 f.command('platform.design.revert',{expectedVersion:4});assert.equal(publishedDesign(f.restaurant).branding.heroTitle.en,'Draft only title');assert.equal(designState(f.restaurant).version,5);
 assert.deepEqual({orders:f.restaurant.orders,sessions:f.restaurant.sessions,payments:f.restaurant.payments,tables:f.restaurant.tables},operational);assert.equal(f.state.platformAudit.filter(e=>e.action.startsWith('platform.design.')).length,5);
});
test('stale saves, stale publishes and empty reverts are rejected atomically',()=>{
 const f=fixture();assert.throws(()=>f.command('platform.design.revert',{expectedVersion:0}),e=>e.status===409);
 f.command('platform.design.save',{config:config(),expectedVersion:0});const before=JSON.stringify(f.restaurant.websiteDesign);
 for(const action of ['save','publish','revert'])assert.throws(()=>f.command(`platform.design.${action}`,{config:config(),expectedVersion:0}),e=>e.status===409);
 assert.equal(JSON.stringify(f.restaurant.websiteDesign),before);
});
test('all restaurant permissions and tenant-scoped platform ownership cannot change designs or legacy logo settings',()=>{
 const f=fixture();
 for(const action of ['save','publish','revert'])assert.throws(()=>f.command(`platform.design.${action}`,{config:config(),expectedVersion:0},admin),e=>e.status===403);
 const scoped=scopeState(f.state,{kind:'tenant',restaurantId:f.restaurant.id,slug:f.restaurant.slug});
 assert.throws(()=>applyCommand(scoped,owner,{action:'platform.design.save',restaurantId:f.restaurant.id,config:config(),expectedVersion:0}),e=>e.status===403);
 for(const key of ['logo','websiteDesign','appearance','branding','typography','colors','implementationId','components','design'])assert.throws(()=>f.command('settings.save',{name:'Hacked',taxBps:0,serviceBps:0,[key]:'blocked'},admin),e=>e.status===403);
 f.command('settings.save',{name:'Operational name',tagline:'Operational welcome',taxBps:1400,serviceBps:1200},admin);assert.equal(f.restaurant.name,'Operational name');
});
test('drafts, previous versions and audit metadata are absent from public and restaurant staff projections',()=>{
 const f=fixture();f.command('platform.design.save',{config:config(),expectedVersion:0});
 for(const value of [publicView(f.restaurant),guestView(f.state,f.restaurant.tables[0].token),staffView(f.state,admin,f.restaurant.id)]){
  const encoded=JSON.stringify(value);assert.doesNotMatch(encoded,/Draft only title|websiteDesign|publishedBy|updatedBy/);
 }
 f.command('platform.design.publish',{expectedVersion:1});assert.equal(publicView(f.restaurant).appearance.branding.heroTitle.ar,'عنوان المسودة');
 assert.equal(staffView(f.state,admin,f.restaurant.id).restaurant.websiteDesign,undefined);
 const other=createRestaurant('Other');f.state.restaurants.push(other);assert.notEqual(publicView(other).appearance.branding.heroTitle.en,'Draft only title');
});
test('strict configuration rejects executable content, unknown fields/options, unsafe assets, huge values and inaccessible colors',()=>{
 for(const input of [null,[],{...config(),css:'body{}'},{...config(),implementationId:'unregistered'},{...config(),options:{html:'<script>'}},{...config(),components:{showHero:'yes'}},{...config(),typography:{body:'url(https://evil.test/font)'}},{...config(),colors:{background:'red'}},{...config(),colors:{text:'#ffffff'}},{...config(),branding:{heroTitle:{en:'x'.repeat(181)}}},{...config(),branding:{gallery:Array(7).fill('https://example.test/a.png')}}])assert.throws(()=>validateDesign(input),DesignError);
 for(const url of ['javascript:alert(1)','data:image/svg+xml;base64,AA','http://example.test/a','https://user:pass@example.test/a','https://example.test/a\") ; color:red','https://example.test/a#payload']){assert.equal(safeAssetUrl(url),false);assert.throws(()=>validateDesign({...config(),branding:{logoUrl:url}}));}
 const valid=validateDesign({...config(),branding:{logoUrl:'https://example.test/a.png?size=200&fit=crop'}});assert.match(valid.branding.logoUrl,/https:/);
});
test('missing or unavailable custom implementations and malformed published settings use a safe independent fallback',()=>{
 const legacy={logo:'https://example.test/logo.png'};assert.equal(publishedDesign(legacy).branding.logoUrl,legacy.logo);
 const unavailable={...config(),implementationId:'retired-internal-design'};const fallback=resolvedDesign(unavailable);assert.equal(fallback.implementationId,DEFAULT_DESIGN_ID);assert.equal(fallback.branding.heroTitle.ar,'عنوان المسودة');
 assert.equal(resolvedDesign({...config(),colors:{text:'evil'}}).implementationId,DEFAULT_DESIGN_ID);
 const one=resolvedDesign(),two=resolvedDesign();one.colors.primary='#000000';assert.notEqual(one.colors.primary,two.colors.primary);assert.notEqual(DEFAULT_CONFIG.colors.primary,'#000000');
 const registry=readFileSync('app/restaurant-designs/registry.tsx','utf8');for(const definition of DESIGN_CATALOG)assert(definition.id===DEFAULT_DESIGN_ID?registry.includes('[DEFAULT_DESIGN_ID]'):registry.includes(definition.id));
});
test('design UI and validation messages have Arabic translations',()=>{
 for(const filename of ['app/design-editor.tsx','app/restaurant-designs/classic.tsx','lib/restaurant-designs/config.mjs']){
  const source=readFileSync(filename,'utf8');
  for(const match of source.matchAll(/\bt\('([^']+)'\)/g))assert(Object.hasOwn(arabicMessages,match[1]),`${filename}: ${match[1]}`);
 }
});
