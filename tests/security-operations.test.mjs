import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonBody,validateCommand,validateGuestRead } from '../lib/request-validation.mjs';
import { limitTraffic } from '../lib/abuse.mjs';
import { requestEvent,secureResponse } from '../lib/observability.mjs';
import { readiness,monitorHealth,productionConfigReady } from '../lib/operations.mjs';
import { createInitialState,applyCommand,guestView,PERMISSIONS,bill } from '../lib/domain.mjs';
const owner={id:'owner',email:'owner@example.test'},key=()=>crypto.randomUUID();
test('streamed JSON is byte bounded and rejects malformed JSON, UTF-8, content types and prototype-shaped input',async()=>{
 const request=(value,headers={'content-type':'application/json'})=>new Request('https://olive.tap2serve.com/api/command',{method:'POST',headers,body:value});
 assert.deepEqual(await readJsonBody(request('{"ok":true}')),{ok:true});
 for(const input of ['[]','null','{','{"__proto__":{"polluted":true}}','{"nested":{"constructor":{}}}'])await assert.rejects(readJsonBody(request(input)),e=>e.status===400);
 await assert.rejects(readJsonBody(request('"'+ 'ش'.repeat(40000)+'"')),e=>e.status===413);
 await assert.rejects(readJsonBody(request('{}',{'content-type':'text/plain, application/json'})),e=>e.status===415);
 await assert.rejects(readJsonBody(request(new Uint8Array([123,255,125]))),e=>e.status===400);
 let chunks=0;const streamed=new ReadableStream({pull(controller){chunks++;controller.enqueue(new Uint8Array(33000));if(chunks===3)controller.close();}});
 await assert.rejects(readJsonBody(new Request('https://olive.tap2serve.com/api/command',{method:'POST',headers:{'content-type':'application/json'},body:streamed,duplex:'half'})),e=>e.status===413);
});
test('guest token, capability and nested order inputs are bounded before repository work',()=>{
 const body={action:'guest.order',token:key()+key(),capability:key()+key(),key:key(),lines:[{itemId:key(),quantity:1}]};validateCommand(body);
 for(const next of [{...body,capability:''},{...body,key:'x'},{...body,lines:[{itemId:key(),quantity:1,notes:'a'.repeat(501)}]},{...body,lines:[{itemId:key(),quantity:1,modifierIds:{}}]}])assert.throws(()=>validateCommand(next));
 assert.throws(()=>validateGuestRead(new URL('https://olive.tap2serve.com/api/state?table=short')));
 assert.throws(()=>validateGuestRead(new URL(`https://olive.tap2serve.com/api/state?table=${key()}&table=${key()}`)));
});
test('abuse limits hash IP/table keys, reject denied traffic and fail closed for missing/broken production bindings',async()=>{
 const keys=[],request=new Request('https://olive.tap2serve.com/api/command',{headers:{'cf-connecting-ip':'192.0.2.14','x-forwarded-for':'forged'}});
 await limitTraffic(request,{GUEST_WRITE_LIMITER:{async limit(input){keys.push(input.key);return {success:true};}}},'write','sensitive-table-token');
 assert.equal(keys.length,2);keys.forEach(value=>assert.match(value,/^[a-f0-9]{64}$/));assert.doesNotMatch(keys.join(''),/192|sensitive-table-token/);
 await assert.rejects(limitTraffic(request,{GUEST_WRITE_LIMITER:{async limit(){return {success:false};}}},'write'),e=>e.status===429);
 await assert.rejects(limitTraffic(request,{},'read'),e=>e.status===503);
 await assert.rejects(limitTraffic(request,{PUBLIC_READ_LIMITER:{async limit(){throw new Error('secret');}}},'read'),e=>e.status===503);
});
test('structured logs and error headers exclude URL, credentials, private fields and exception contents',()=>{
 const event=requestEvent({id:'server-generated',route:'command',method:'POST',status:500,duration:12.3,url:'?table=secret',body:{password:'do-not-log'},error:new Error('sensitive SQL')});
 assert.deepEqual(Object.keys(event).sort(),['duration_ms','event','method','request_id','route','severity','status']);assert.doesNotMatch(JSON.stringify(event),/secret|password|SQL/);
 const response=secureResponse(new Response('safe'),new Request('https://tap2serve.com/'),'server-id');
 for(const header of ['permissions-policy','content-security-policy','strict-transport-security','x-content-type-options','x-request-id'])assert(response.headers.has(header));
 assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('content-security-policy'),/object-src 'none'/);
});
test('health monitoring emits generic alerts with no secrets; failed delivery is safely logged',async()=>{
 const logs=[],sent=[],logger={log:value=>logs.push(value),error:value=>logs.push(value)};
 const env={TAP2SERVE_PRODUCTION:'false',OPS_ALERT_WEBHOOK_URL:'https://alerts.example.test/hook',OPS_ALERT_TOKEN:'secret-alert-token'};
 assert.equal(await readiness(env),false);assert.equal(productionConfigReady({}),false);
 await monitorHealth(env,{logger,send:async(url,options)=>{sent.push(JSON.parse(options.body));return new Response('',{status:503});}});
 assert.equal(sent.length,1);assert.deepEqual(Object.keys(sent[0]).sort(),['event','timestamp']);assert.doesNotMatch(logs.join(''),/secret-alert-token|alerts.example/);assert(logs.some(value=>value.includes('alert_delivery_failed')));
});
test('guest projections exclude private legacy fields; token rotation revokes the old table link and capability',()=>{
 const state=createInitialState(owner),t=state.restaurants[0],table=t.tables[1],run=(action,body={})=>applyCommand(state,owner,{action,restaurantId:t.id,...body});
 run('session.open',{tableId:table.id,key:key()});const session=t.sessions.at(-1),oldToken=table.token,oldCapability=session.capability;
 t.menu[0].internalCost=123;t.menu[0].supplierEmail='private@example.test';t.orders.push({id:key(),sessionId:session.id,number:10,status:'PENDING',version:1,key:'private-idempotency-key',requestPayload:'sensitive',privateField:'PRIVATE',lines:[{id:key(),itemId:t.menu[0].id,name:'Food',basePrice:10,unitPrice:10,quantity:1,notes:'',modifiers:[],privateStaffNote:'PRIVATE'}]});
 const encoded=JSON.stringify(guestView(state,oldToken,oldCapability));assert.doesNotMatch(encoded,/PRIVATE|internalCost|supplierEmail|requestPayload|private-idempotency-key/);
 run('table.rotate_token',{tableId:table.id});assert.notEqual(table.token,oldToken);assert.notEqual(session.capability,oldCapability);assert.throws(()=>guestView(state,oldToken),e=>e.status===404);assert.equal(guestView(state,table.token,oldCapability).session,null);
});
test('idempotent session opens survive later finalization, and payment key reuse cannot change amount or method',()=>{
 const state=createInitialState(owner),t=state.restaurants[0],table=t.tables[1],run=(action,body={})=>applyCommand(state,owner,{action,restaurantId:t.id,...body}),openKey=key();
 const first=run('session.open',{tableId:table.id,key:openKey});const session=t.sessions.at(-1);assert.deepEqual(run('session.open',{tableId:table.id,key:openKey}),first);
 applyCommand(state,null,{action:'guest.order',token:table.token,capability:session.capability,key:key(),lines:[{itemId:t.menu[0].id,quantity:1}]});
 const amount=bill(t,session).due,payKey=key(),payment={sessionId:session.id,key:payKey,method:'cash',amount,expectedTotal:amount};run('billing.pay',payment);run('billing.pay',payment);
 assert.throws(()=>run('billing.pay',{...payment,method:'card'}),e=>e.status===409);assert.equal(t.payments.filter(p=>p.sessionId===session.id).length,1);
 run('billing.finalize',{sessionId:session.id,expectedVersion:session.version,expectedTotal:amount});run('session.close',{sessionId:session.id});assert.deepEqual(run('session.open',{tableId:table.id,key:openKey}),first);assert.equal(t.sessions.filter(s=>s.tableId===table.id).length,1);
});
