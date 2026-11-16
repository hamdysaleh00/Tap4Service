import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHostname, validSlug, ensureRestaurantSlugs, enforceScope, scopeState, routingFailure, restaurantOrigin } from '../lib/tenant-routing.mjs';
import { createInitialState, createRestaurant, applyCommand, staffView, guestView } from '../lib/domain.mjs';
const owner={id:'owner',email:'owner@test.example'};
test('apex, www, admin and tenant hosts use exact label boundaries and normalized case',()=>{
 for(const host of ['tap2serve.com','www.tap2serve.com'])assert.equal(classifyHostname(`https://${host}/`).kind,'platform');
 assert.equal(classifyHostname('https://ADMIN.TAP2SERVE.COM./dashboard').kind,'admin');
 assert.equal(classifyHostname('https://olive-ember.tap2serve.com/path?restaurant=other').slug,'olive-ember');
 for(const host of ['api.tap2serve.com','a.b.tap2serve.com','tap2serve.com.evil.test','evil-tap2serve.com','-bad.tap2serve.com','xn--abc.tap2serve.com','other.workers.dev','localhost'])assert.throws(()=>classifyHostname(`https://${host}`));
});
test('local and staging roots are explicit; longest configured root wins',()=>{
 const options={TAP2SERVE_LOCAL_DEV:'true',TAP2SERVE_BASE_DOMAINS:'staging.tap2serve.com'};
 assert.equal(classifyHostname('http://localhost:5173',options).kind,'local');
 assert.equal(classifyHostname('http://admin.localhost:5173',options).kind,'admin');
 const local=classifyHostname('http://olive.localhost:5173',options);assert.equal(local.slug,'olive');
 assert.equal(restaurantOrigin(local,'olive','http://olive.localhost:5173'),'http://olive.localhost:5173');
 assert.equal(classifyHostname('https://olive.staging.tap2serve.com',options).base,'staging.tap2serve.com');
 assert.equal(classifyHostname('https://staging.tap2serve.com',options).kind,'platform');
 assert.throws(()=>classifyHostname('https://olive.other.com',options));
 assert.throws(()=>classifyHostname('https://tap2serve.com',{TAP2SERVE_BASE_DOMAINS:'*'}));
});
test('reserved, noncanonical, malformed and overlong slugs cannot be registered',()=>{
 for(const slug of ['admin','api','www','auth','assets','staging','xn--test','Upper','a.b','a_b','-bad','bad-','a'.repeat(64),'','مطعم',null])assert.equal(validSlug(slug),false,String(slug));
 for(const slug of ['a','olive-ember','a'.repeat(63)])assert.equal(validSlug(slug),true);
 const state=createInitialState(owner);
 applyCommand(state,owner,{action:'platform.create',name:'One',slug:'olive'});
 assert.throws(()=>applyCommand(state,owner,{action:'platform.create',name:'Two',slug:'olive'}),e=>e.status===409);
 assert.throws(()=>applyCommand(state,owner,{action:'platform.create',name:'Bad',slug:'admin'}),e=>e.status===400);
 assert.throws(()=>applyCommand(state,{id:'staff'},{action:'platform.create',name:'Bad',slug:'unused'}),e=>e.status===403);
});
test('legacy slugs are stable across rename and ordering; ambiguous state fails closed',()=>{
 const state=createInitialState(owner);delete state.restaurants[0].slug;
 ensureRestaurantSlugs(state);const slug=state.restaurants[0].slug;
 state.restaurants[0].name='Renamed';ensureRestaurantSlugs(state);assert.equal(state.restaurants[0].slug,slug);
 state.restaurants.push({...createRestaurant('Other'),slug});assert.throws(()=>ensureRestaurantSlugs(state),e=>e.status===503);
});
test('tenant projections reject foreign IDs, tokens, platform actions and foreign object IDs',()=>{
 const state=createInitialState(owner),a=state.restaurants[0],b=createRestaurant('Other');state.restaurants.push(b);
 const scope={kind:'tenant',restaurantId:a.id,slug:a.slug};
 assert.throws(()=>enforceScope(scope,b.id,'session.open'),e=>e.status===403);
 assert.throws(()=>enforceScope(scope,a.id,'platform.create'),e=>e.status===403);
 const projection=scopeState(state,scope),view=staffView(projection,owner,a.id);
 assert.equal(view.platform,false);assert.deepEqual(view.platformRestaurants,[]);assert.equal(view.restaurants.length,1);
 assert.throws(()=>guestView(projection,b.tables[0].token),e=>e.status===404);
 assert.throws(()=>applyCommand(projection,owner,{action:'session.open',restaurantId:a.id,tableId:b.tables[0].id}),e=>e.status===404);
 assert.throws(()=>enforceScope({kind:'admin'},null,'guest.order'),e=>e.status===403);
 assert.throws(()=>enforceScope({kind:'platform'},a.id,'session.open'),e=>e.status===403);
 assert.throws(()=>staffView(state,{id:'outsider'},a.id),e=>e.status===403);
});
test('safe unknown-tenant response does not echo input or expose tenant information',async()=>{
 const response=routingFailure(new Error('<script>secret</script>'));
 assert.equal(response.status,503);assert.match(response.headers.get('cache-control'),/no-store/);assert.doesNotMatch(await response.text(),/script|secret/);
});
