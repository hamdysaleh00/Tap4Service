import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5194';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local notification browser tests only.');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE,timeout:15000});
const headers={Cookie:'__sites_local_auth=1',Origin:base,'Content-Type':'application/json'},key=()=>crypto.randomUUID();let tenant;
const cmd=async(action,body={})=>{const r=await fetch(base+'/api/command',{method:'POST',headers,body:JSON.stringify({action,restaurantId:tenant,...body})});assert.equal(r.status,200,await r.clone().text());return r.json();};
const read=async()=>(await (await fetch(base+'/api/state?restaurant='+tenant,{headers})).json()).restaurant;
const errors=[];await mkdir('outputs',{recursive:true});
try{
 await fetch(base+'/api/state',{headers});tenant=(await cmd('platform.create',{name:'Notifications browser QA '+Date.now()})).id;
 await cmd('menu.save',{item:{name:'Burger',category:'Main',price:20000,modifiers:[]}});await cmd('settings.save',{name:'Notifications QA',taxBps:1400,serviceBps:1200});
 let t=await read(),table=t.tables[0];await cmd('session.open',{tableId:table.id,key:key()});
 const staff=await browser.newContext({viewport:{width:1440,height:1000}}),secondStaff=await browser.newContext({viewport:{width:1440,height:1000}});
 // Count actual oscillator starts while preserving native browser audio behavior.
 const instrument=()=>{const start=OscillatorNode.prototype.start;window.__tones=0;OscillatorNode.prototype.start=function(...args){window.__tones++;return start.apply(this,args);};};
 for(const context of [staff,secondStaff]){await context.addCookies([{name:'__sites_local_auth',value:'1',url:base}]);await context.addInitScript(instrument);}
 const a=await staff.newPage(),b=await secondStaff.newPage();for(const p of [a,b]){p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.getByRole('combobox',{name:'Switch restaurant',exact:true}).selectOption(tenant);await p.getByRole('button',{name:'Notifications',exact:true}).click();const mark=p.getByRole('button',{name:/^Mark notifications read/});if(await mark.count())await mark.click();}
 await a.getByRole('button',{name:'Enable Sound Alerts',exact:true}).click();await a.getByRole('button',{name:'Mute sound alerts',exact:true}).waitFor();const enabledTones=await a.evaluate(()=>window.__tones);assert(enabledTones>0);
 const guestContext=await browser.newContext({viewport:{width:390,height:844}}),guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));await guest.goto(base+'/?table='+table.token);
 await guest.getByRole('button',{name:'Add Burger',exact:true}).click();await guest.getByRole('button',{name:/^Add ·/}).click();await guest.getByRole('button',{name:/View your basket/}).click();await guest.getByRole('button',{name:'Send order to kitchen',exact:true}).click();
 await a.getByRole('region',{name:'Notification history',exact:true}).getByText('New order received',{exact:true}).waitFor();await b.getByRole('region',{name:'Notification history',exact:true}).getByText('New order received',{exact:true}).waitFor();await a.waitForFunction(n=>window.__tones>n,enabledTones);
 t=await read();let order=t.orders[0],event=t.notifications.find(n=>n.kind==='order_created'),article=a.locator('[data-notification-id="'+event.id+'"]');assert(await article.getByText('Table '+table.label,{exact:true}).isVisible());
 const tones=await a.evaluate(()=>window.__tones);await cmd('guest.order',{token:table.token,capability:(await (await fetch(base+'/api/state?table='+table.token)).json()).session.capability,key:order.key,lines:JSON.parse(order.requestPayload)});
 // Two unchanged polls must not replay audio.
 await a.waitForTimeout(4500);assert.equal(await a.evaluate(()=>window.__tones),tones);
 await article.getByRole('button',{name:'Mark read',exact:true}).click();await b.locator('[data-notification-id="'+event.id+'"] .button-row small').waitFor();
 await article.getByRole('button',{name:'View order',exact:true}).click();await a.getByRole('dialog').getByText('Burger',{exact:true}).waitFor();await a.getByRole('button',{name:'Close',exact:true}).click();
 // Guest edits produce visible additions and removals; Split Bill stays local.
 await guest.getByRole('button',{name:'Edit this order',exact:true}).click();await guest.getByRole('button',{name:'Increase quantity',exact:true}).click();await guest.getByRole('button',{name:'Save order changes',exact:true}).click();
 await a.getByRole('button',{name:'Notifications',exact:true}).click();await a.getByRole('region',{name:'Notification history',exact:true}).getByText('New items added',{exact:true}).waitFor();
 await guest.getByRole('button',{name:'Edit this order',exact:true}).click();await guest.getByRole('button',{name:'Decrease quantity',exact:true}).click();await guest.getByRole('button',{name:'Save order changes',exact:true}).click();await a.getByRole('region',{name:'Notification history',exact:true}).getByText('Items cancelled or removed',{exact:true}).waitFor();
 await guest.getByRole('button',{name:'Table bill',exact:true}).click();const before=await read();await guest.getByRole('button',{name:'Split Bill',exact:true}).click();await guest.getByRole('button',{name:'Increase Burger',exact:true}).click();assert.equal(await guest.getByTestId('share-total').textContent(),'252.00 EGP');await guest.getByRole('button',{name:'Close',exact:true}).click();const after=await read();assert.deepEqual(after.orders,before.orders);assert.deepEqual(after.payments,before.payments);assert.deepEqual(after.notifications,before.notifications);
 await a.getByRole('button',{name:'Mute sound alerts',exact:true}).click();const mutedTones=await a.evaluate(()=>window.__tones);await guest.getByRole('button',{name:'Call staff',exact:true}).last().click();await a.getByRole('region',{name:'Notification history',exact:true}).getByText('Guest called a waiter',{exact:true}).waitFor();assert.equal(await a.evaluate(()=>window.__tones),mutedTones);
 await guest.getByRole('button',{name:'Request the table bill',exact:true}).click();await a.getByRole('region',{name:'Notification history',exact:true}).getByText('Guest requested the bill',{exact:true}).waitFor();
 // Pause one device, mutate on another, and verify catch-up without refresh.
 await secondStaff.setOffline(true);const s=(await read()).sessions.find(s=>s.tableId===table.id);await cmd('session.reopen',{sessionId:s.id,expectedVersion:s.version});await secondStaff.setOffline(false);await b.getByRole('region',{name:'Notification history',exact:true}).getByText('Ordering reopened',{exact:true}).waitFor();
 // Reopening a historical order uses the existing authorized state endpoint.
 await cmd('billing.finalize',{sessionId:s.id,expectedVersion:s.version+1,expectedTotal:s.bill.total});await cmd('billing.pay',{sessionId:s.id,key:key(),method:'cash',amount:s.bill.total,expectedTotal:s.bill.total});await cmd('session.close',{sessionId:s.id});
 await a.getByRole('region',{name:'Notification history',exact:true}).getByText('Table available',{exact:true}).waitFor();await a.locator('[data-notification-id="'+event.id+'"] button').filter({hasText:'View order'}).click();await a.getByRole('dialog').getByText('Burger',{exact:true}).waitFor();await a.getByRole('button',{name:'Close',exact:true}).click();
 // Remember mute across reload; autoplay failure leaves a visible fallback.
 assert.equal(await a.evaluate(scope=>localStorage.getItem('tab2serve.sound:'+scope),'local_seedy:'+tenant),'muted');await a.reload();await a.getByRole('combobox',{name:'Switch restaurant',exact:true}).selectOption(tenant);await a.getByRole('button',{name:'Notifications',exact:true}).click();await a.getByRole('button',{name:'Enable Sound Alerts',exact:true}).waitFor();
 await a.evaluate(()=>{window.AudioContext=class {constructor(){throw Error('Autoplay test');}};});await a.getByRole('button',{name:'Enable Sound Alerts',exact:true}).click();await a.getByRole('region',{name:'Notification history',exact:true}).getByText('Audio unavailable. Visual notifications remain active. Enable Sound Alerts to retry.',{exact:true}).waitFor();
 await a.setViewportSize({width:390,height:844});assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const panel=await a.locator('#notification-history').boundingBox();assert(panel.x>=0&&panel.x+panel.width<=390,'Notification panel fits the mobile viewport');await a.screenshot({path:'outputs/notifications-mobile.png',fullPage:true,animations:'disabled'});
 await a.getByRole('combobox',{name:'Language',exact:true}).selectOption('ar');await a.getByRole('region',{name:'سجل الإشعارات',exact:true}).waitFor();assert.equal(await a.locator('html').getAttribute('dir'),'rtl');await a.screenshot({path:'outputs/notifications-arabic.png',fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);console.log('PASS: two staff devices; guest order/edit/add/remove; bell/history/read/navigation; native audio unlock/mute/dedupe/fallback; offline recovery; tax/service and Split Bill; mobile and Arabic.');
}finally{await browser.close();}
