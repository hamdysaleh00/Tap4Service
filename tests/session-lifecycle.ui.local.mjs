import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {translate,formatMoney} from '../lib/i18n.mjs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw new Error('Local lifecycle browser tests only.');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE,timeout:15000}),headers={Cookie:'__sites_local_auth=1',Origin:base,'Content-Type':'application/json'};let tenant;
const cmd=async(action,body={})=>{const r=await fetch(base+'/api/command',{method:'POST',headers,body:JSON.stringify({action,restaurantId:tenant,...body})});assert.equal(r.status,200,JSON.stringify(await r.clone().json()));return r.json()};
const state=async()=>(await(await fetch(base+'/api/state?restaurant='+tenant,{headers})).json()).restaurant;
const click=async(page,name)=>page.getByRole('button',{name,exact:true}).click();
await fetch(base+'/api/state',{headers});await mkdir('outputs',{recursive:true});
try{for(const language of ['en','ar']){
 const tr=(key,params)=>translate(language,key,params),cash=n=>formatMoney(language,n)+' '+tr('EGP'),errors=[];
 tenant=(await cmd('platform.create',{name:'Lifecycle UI '+language+' '+Date.now()})).id;
 await cmd('menu.save',{item:{name:'Coffee',nameAr:'قهوة',description:'Fresh',descriptionAr:'طازجة',category:'Drinks',price:10000,modifiers:[]}});
 let t=await state();const table=t.tables[0],item=t.menu[0];await cmd('session.open',{tableId:table.id});let s=(await state()).sessions.find(s=>s.tableId===table.id&&!s.releasedAt);const oldId=s.id;
 const guestData=await(await fetch(base+'/api/state?table='+table.token)).json(),cap=guestData.session.capability,order=()=>cmd('guest.order',{token:table.token,capability:cap,key:crypto.randomUUID(),lines:[{itemId:item.id,quantity:1}]});await order();
 const staff=await browser.newContext({viewport:{width:1440,height:1000}});await staff.addCookies([{name:'__sites_local_auth',value:'1',url:base}]);const dashboard=await staff.newPage();dashboard.on('pageerror',e=>errors.push(e.message));dashboard.setDefaultTimeout(15000);await dashboard.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
 await dashboard.getByRole('combobox',{name:'Switch restaurant',exact:true}).selectOption(tenant);await dashboard.getByRole('combobox',{name:'Language',exact:true}).selectOption(language);await click(dashboard,tr('Billing'));
 const context=await browser.newContext({viewport:{width:390,height:844}}),guest=await context.newPage(),other=await context.newPage();
 for(const p of [guest,other]){p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);await p.goto(base+'/?table='+table.token,{waitUntil:'domcontentloaded'});await p.getByRole('combobox',{name:'Language',exact:true}).selectOption(language)}
 const addName=tr('Add {p0}',{p0:language==='ar'?'قهوة':'Coffee'}),add=p=>p.getByRole('button',{name:addName,exact:true});assert(await add(guest).isEnabled());
 const card=id=>dashboard.locator('[data-session-id="'+id+'"]');
 await click(card(oldId),tr('Print draft bill'));await dashboard.locator('#receipt').getByRole('heading',{name:tr('Draft bill · not finalized'),exact:true}).waitFor();assert.equal((await state()).sessions.find(s=>s.id===oldId).status,'OPEN');await click(dashboard,tr('Close'));
 await click(guest,tr('Table bill'));await click(guest,tr('Request the table bill'));await click(guest,tr('Skip for now'));
 await card(oldId).getByText(tr('Bill requested · ordering paused'),{exact:true}).waitFor();
 await click(guest,tr('Menu'));for(const p of [guest,other]){await p.locator('.session-lifecycle').getByText(tr('Bill requested · ordering paused'),{exact:true}).waitFor();assert(await add(p).isDisabled())}
 await guest.getByRole('button',{name:new RegExp('^'+tr('Table orders'))}).click();assert.equal(await guest.getByRole('button',{name:tr('Edit this order'),exact:true}).count(),0);assert(await guest.getByRole('button',{name:tr('Add a new order'),exact:true}).isDisabled());
 await click(guest,tr('Table bill'));await click(guest,tr('Split Bill'));await guest.getByTestId('share-total').waitFor();await click(guest,tr('Close'));
 await click(card(oldId),tr('Reopen ordering'));await other.locator('.session-lifecycle').getByText(tr('Ordering open'),{exact:true}).waitFor();assert(await add(other).isEnabled());
 // The financial review becomes visibly stale when another guest adds an order.
 await click(card(oldId),tr('Finalize bill'));await order();await dashboard.getByRole('alert').filter({hasText:tr('Close this dialog and review the latest bill before trying again.')}).waitFor();assert(await dashboard.getByRole('button',{name:tr('Confirm final bill'),exact:true}).isDisabled());await click(dashboard,tr('Close'));
 await click(card(oldId),tr('Finalize bill'));await click(dashboard,tr('Confirm final bill'));await dashboard.getByRole('dialog').waitFor({state:'detached'});await other.locator('.session-lifecycle').getByText(tr('Bill finalized'),{exact:true}).waitFor();assert(await add(other).isDisabled());
 await click(card(oldId),tr('Print final bill'));await dashboard.locator('#receipt').getByRole('heading',{name:tr('Final bill'),exact:true}).waitFor();assert.equal(await dashboard.locator('#receipt .total').textContent(),tr('Table total')+cash(20000));await click(dashboard,tr('Close'));
 assert.equal(await dashboard.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await guest.screenshot({path:'outputs/session-finalized-'+language+'.png',fullPage:true,animations:'disabled'});
 await click(card(oldId),tr('Open new session'));await other.getByText(tr('Your table session has ended.'),{exact:true}).waitFor();assert(await add(other).isDisabled());
 t=await state();s=t.sessions.find(s=>s.tableId===table.id&&!s.releasedAt);assert.notEqual(s.id,oldId);assert.equal(t.tables.find(tb=>tb.id===table.id).token,table.token);assert.equal(t.sessions.find(s=>s.id===oldId).bill.due,20000);const newId=s.id;
 // A fresh scan uses the exact same permanent URL, and orders only into the new session.
 const fresh=await context.newPage();fresh.setDefaultTimeout(15000);fresh.on('pageerror',e=>errors.push(e.message));await fresh.goto(base+'/?table='+table.token,{waitUntil:'domcontentloaded'});await add(fresh).click();await fresh.getByRole('button',{name:new RegExp('^'+tr('Add ·'))}).click();await fresh.getByRole('button',{name:tr('View your basket'),exact:false}).click();await click(fresh,tr('Send order to kitchen'));await fresh.getByRole('heading',{name:tr('Your shared orders.'),exact:true}).waitFor();
 await card(oldId).getByText(tr('Previous session with an outstanding balance.'),{exact:true}).waitFor();await click(card(oldId),tr('Record payment'));await click(dashboard,tr('Confirm payment received'));await dashboard.getByRole('dialog').waitFor({state:'detached'});await card(oldId).waitFor({state:'detached'});
 await click(dashboard,tr('Previous bills'));await click(card(oldId),tr('Print final bill'));assert.equal(await dashboard.locator('#receipt .total').textContent(),tr('Table total')+cash(20000));await click(dashboard,tr('Close'));await click(dashboard,tr('Current bills'));
 await card(newId).getByRole('button',{name:tr('Finalize bill'),exact:true}).waitFor();assert.equal((await state()).sessions.find(s=>s.id===newId).bill.paid,0);
 await click(card(newId),tr('Finalize bill'));await click(dashboard,tr('Confirm final bill'));await dashboard.getByRole('dialog').waitFor({state:'detached'});await click(card(newId),tr('Record payment'));await click(dashboard,tr('Confirm payment received'));await dashboard.getByRole('dialog').waitFor({state:'detached'});await click(card(newId),tr('Make table available'));
 await click(fresh,tr('Table bill'));await fresh.getByRole('heading',{name:tr('No active bill'),exact:true}).waitFor();await fresh.locator('.session-lifecycle').getByText(tr('Table available'),{exact:true}).waitFor();
 t=await state();assert.equal(t.tables.find(tb=>tb.id===table.id).status,'TABLE_AVAILABLE');assert.equal(t.sessions.filter(s=>s.tableId===table.id&&!s.releasedAt).length,0);assert.equal(t.orders.filter(o=>o.sessionId===oldId).length,2);assert.equal(t.orders.filter(o=>o.sessionId===newId).length,1);assert.equal(t.payments.length,2);assert.deepEqual(errors,[]);
 await staff.close();await context.close();console.log('PASS: '+language+' lifecycle UI: draft/final printing, locks/reopen, stale review, new session, permanent QR, old balance payment/history, calculator, availability and responsive status.');
}}catch(error){for(const page of browser.contexts().flatMap(c=>c.pages())){console.error('FAILED PAGE:',page.url(),(await page.locator('body').innerText().catch(()=>'' )).slice(0,6000));await page.screenshot({path:'outputs/lifecycle-failure-'+Date.now()+'.png'}).catch(()=>{})}throw error}finally{await browser.close()}
