import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoller,createOrderTracker,parseRetryAfter } from '../lib/polling.mjs';
function clock(){let time=0,id=0;const timers=new Map();return {get time(){return time;},setTimer(fn,delay){const token=++id;timers.set(token,{at:time+delay,fn});return token;},clearTimer(token){timers.delete(token);},async advance(ms){const end=time+ms;for(;;){for(let i=0;i<12;i++)await Promise.resolve();const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();}time=end;for(let i=0;i<12;i++)await Promise.resolve();}};}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('a slow network never overlaps polls; interval starts after completion',async()=>{
 const c=clock(),starts=[];let active=0,maximum=0;
 const p=createPoller({...c,request:()=>{starts.push(c.time);active++;maximum=Math.max(maximum,active);return new Promise(resolve=>c.setTimer(()=>{active--;resolve({unchanged:true});},5000));},apply:()=>{}});
 p.start();await c.advance(14000);assert.deepEqual(starts,[0,7000,14000]);assert.equal(maximum,1);p.stop();
});
test('mutation refresh invalidates an older response and coalesces repeated refresh requests',async()=>{
 const c=clock(),old=deferred(),applied=[];let count=0;
 const p=createPoller({...c,request:()=>++count===1?old.promise:Promise.resolve({revision:2}),apply:value=>applied.push(value.revision)});p.start();await c.advance(0);const a=p.refresh(),b=p.refresh();old.resolve({revision:1});await c.advance(0);await Promise.all([a,b]);assert.deepEqual(applied,[2]);assert.equal(count,2);p.stop();
});
test('a stopped tenant context cannot apply its response even if the transport ignores abort',async()=>{
 const c=clock(),old=deferred(),applied=[];const p=createPoller({...c,request:()=>old.promise,apply:v=>applied.push(v)});p.start();await c.advance(0);p.stop();old.resolve({restaurant:'old'});await c.advance(10000);assert.deepEqual(applied,[]);assert.equal(p.metrics.discarded,1);
});
test('retries back off exponentially, honor Retry-After, and reconnect immediately',async()=>{
 const c=clock(),starts=[],states=[];let healthy=false;
 const p=createPoller({...c,random:()=>0.5,request:async()=>{starts.push(c.time);if(!healthy)throw new Error('Network');return {unchanged:true};},apply:()=>{},onStatus:s=>states.push(s)});p.start();await c.advance(14000);assert.deepEqual(starts,[0,2000,6000,14000]);healthy=true;p.resume();await c.advance(0);assert.equal(starts.at(-1),14000);assert.equal(states.at(-1).state,'connected');await c.advance(2000);assert.equal(starts.at(-1),16000);p.stop();
 const d=clock(),retry=createPoller({...d,request:async()=>{const error=new Error();error.status=429;error.retryAfter=90000;throw error;},apply:()=>{}});retry.start();await d.advance(89999);assert.equal(retry.metrics.requests,1);await d.advance(1);assert.equal(retry.metrics.requests,2);retry.stop();
});
test('inactive/offline polling pauses, aborts its request, and refreshes on return',async()=>{
 const c=clock();let aborted=0,hang=true;const p=createPoller({...c,request:signal=>hang?new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(new Error('Aborted'));})):Promise.resolve({unchanged:true}),apply:()=>{}});p.start();await c.advance(0);p.pause();await c.advance(3600000);assert.equal(p.metrics.requests,1);assert.equal(aborted,1);hang=false;p.resume();await c.advance(0);assert.equal(p.metrics.requests,2);p.stop();
});
test('authentication and permanent table-link failures stop retries until an explicit refresh/reconnect',async()=>{
 const c=clock();let valid=false;const p=createPoller({...c,request:async()=>{if(!valid){const e=new Error('Unauthorized');e.status=401;throw e;}return {unchanged:true};},apply:()=>{}});p.start();await c.advance(600000);assert.equal(p.metrics.requests,1);valid=true;p.resume();await c.advance(0);assert.equal(p.metrics.requests,2);p.stop();
});
test('hanging requests time out and abort before a retry starts',async()=>{
 const c=clock();let active=0,max=0;
 const p=createPoller({...c,random:()=>0.5,request:signal=>{active++;max=Math.max(max,active);return new Promise((_,reject)=>signal.addEventListener('abort',()=>{active--;reject(new Error('Timed out'));}));},apply:()=>{}});p.start();await c.advance(17000);assert.equal(p.metrics.requests,2);assert.equal(max,1);p.stop();
});
test('new orders are detected by ID despite equal counts, status changes, historical pages and tenant switches',()=>{
 const tracker=createOrderTracker();assert.deepEqual(tracker.accept('A',[{id:'a',status:'PENDING'}]),[]);assert.deepEqual(tracker.accept('A',[{id:'b',status:'PENDING'}]).map(o=>o.id),['b']);assert.deepEqual(tracker.accept('A',[{id:'b',status:'PREPARING'},{id:'historical',status:'SERVED'}]),[]);assert.deepEqual(tracker.accept('B',[{id:'other',status:'PENDING'}]),[]);
});
test('a healthy visible hour produces 1,801 polls; a fully hidden hour produces no extra requests',async()=>{
 const c=clock(),p=createPoller({...c,request:async()=>({unchanged:true}),apply:()=>{}});p.start();await c.advance(3600000);assert.equal(p.metrics.requests,1801);p.pause();await c.advance(3600000);assert.equal(p.metrics.requests,1801);p.stop();
});
test('Retry-After accepts seconds and HTTP dates without negative delays',()=>{assert.equal(parseRetryAfter('3'),3000);assert.equal(parseRetryAfter('invalid'),0);assert.equal(parseRetryAfter('Mon, 16 Nov 2026 12:00:10 GMT',Date.parse('2026-11-16T12:00:00Z')),10000);});
