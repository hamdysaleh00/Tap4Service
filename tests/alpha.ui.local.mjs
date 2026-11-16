import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {translate,formatMoney} from '../lib/i18n.mjs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw new Error('Alpha fixtures must run locally.');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const headers={Cookie:'__sites_local_auth=1',Origin:base,'Content-Type':'application/json'};
let tenant;
async function cmd(action,body={},extraHeaders={}){const r=await fetch(base+'/api/command',{method:'POST',headers:{...headers,...extraHeaders},body:JSON.stringify({action,restaurantId:tenant,...body})});return {status:r.status,data:await r.json()}}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
async function staffState(){return (await(await fetch(`${base}/api/state?restaurant=${tenant}`,{headers})).json()).restaurant}
await fetch(base+'/api/state',{headers});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE,timeout:15000});
await mkdir('outputs',{recursive:true});
try{for(const language of (process.env.TEST_LANGUAGE?[process.env.TEST_LANGUAGE]:['en','ar'])){
 const tr=(key,params)=>translate(language,key,params),errors=[];
 tenant=ok(await cmd('platform.create',{name:`Alpha ${language} ${Date.now()}`})).id;
 ok(await cmd('settings.save',{name:`Alpha ${language}`,nameAr:'مطعم ألفا',tagline:'Testing together',taglineAr:'نختبر معًا',taxBps:1400,serviceBps:1200}));
 ok(await cmd('category.save',{name:'Main',nameAr:'الرئيسية'}));
 for(const [name,nameAr,price] of [['Burger','برجر',20000],['Pizza','بيتزا',25000],['Coca-Cola','كوكاكولا',5000]])ok(await cmd('menu.save',{item:{name,nameAr,description:'Freshly prepared',descriptionAr:'يُحضّر طازجًا',category:'Main',price,image:'',available:true,visible:true,modifiers:[]}}));
 let t=await staffState(),table=t.tables[0];
 const staff=await browser.newContext({viewport:{width:1440,height:1000}});await staff.addCookies([{name:'__sites_local_auth',value:'1',url:base}]);
 const dashboard=await staff.newPage();dashboard.setDefaultTimeout(30000);dashboard.on('pageerror',e=>errors.push(e.message));await dashboard.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
 await dashboard.getByRole('combobox',{name:'Switch restaurant',exact:true}).selectOption(tenant);
 await dashboard.getByRole('combobox',{name:'Language',exact:true}).selectOption(language);
 await dashboard.waitForFunction(lang=>document.documentElement.lang===lang,language);
 await dashboard.reload({waitUntil:'domcontentloaded'});await dashboard.getByRole('combobox',{name:tr('Switch restaurant'),exact:true}).waitFor();
 assert.equal(await dashboard.locator('html').getAttribute('dir'),language==='ar'?'rtl':'ltr');
 await dashboard.getByRole('combobox',{name:tr('Switch restaurant'),exact:true}).selectOption(tenant);
 await dashboard.getByRole('button',{name:tr('Open a table'),exact:true}).click();
 await dashboard.getByRole('textbox',{name:tr('Guest name (optional)'),exact:true}).fill('أحمد');await dashboard.getByRole('button',{name:tr('Open table'),exact:true}).click();await dashboard.getByRole('dialog').waitFor({state:'detached'});
 const guestContext=await browser.newContext({viewport:{width:390,height:844}}),otherContext=await browser.newContext({viewport:{width:390,height:844}});
 const guest=await guestContext.newPage(),other=await otherContext.newPage();for(const p of [guest,other]){p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));await p.goto(`${base}/?table=${table.token}`,{waitUntil:'domcontentloaded'});await p.getByRole('combobox',{name:'Language',exact:true}).selectOption(language);await p.waitForFunction(lang=>document.documentElement.lang===lang,language)}
 await guest.reload({waitUntil:'domcontentloaded'});await guest.getByRole('button',{name:tr('Menu'),exact:true}).waitFor();assert.equal(await guest.locator('html').getAttribute('lang'),language);
 // Place one shared order containing the example quantities through the actual guest UI.
 for(const [name,nameAr,qty] of [['Burger','برجر',3],['Pizza','بيتزا',2],['Coca-Cola','كوكاكولا',4]]){
  const displayed=language==='ar'?nameAr:name;
  await guest.getByRole('button',{name:tr('Add {p0}',{p0:displayed}),exact:true}).click();
  for(let n=1;n<qty;n++)await guest.getByRole('button',{name:tr('Increase quantity'),exact:true}).click();
  await guest.getByRole('textbox',{name:tr('Special instructions (optional)'),exact:true}).fill('بدون سكر');
  await guest.getByRole('button',{name:new RegExp('^'+tr('Add ·'))}).click();
 }
 await guest.getByRole('button',{name:tr('View your basket'),exact:false}).click();await guest.getByRole('button',{name:tr('Send order to kitchen'),exact:true}).click();await guest.getByRole('heading',{name:tr('Your shared orders.'),exact:true}).waitFor();
 t=await staffState();assert.equal(t.orders.length,1);assert.equal(t.orders[0].lines[0].notes,'بدون سكر');
 // Pending order edit remains available in each locale.
 await guest.getByRole('button',{name:tr('Edit this order'),exact:true}).click();await guest.getByRole('button',{name:tr('Save order changes'),exact:true}).click();await guest.getByRole('dialog').waitFor({state:'detached'});
 for(const p of [guest,other]){await p.getByRole('button',{name:tr('Table bill'),exact:true}).click();await p.getByRole('button',{name:tr('Split Bill'),exact:true}).click()}
 const before=await staffState();let calculatorWrites=0;guest.on('request',request=>{if(request.method()==='POST')calculatorWrites++});
 for(const [name,nameAr,count] of [['Burger','برجر',1],['Pizza','بيتزا',1],['Coca-Cola','كوكاكولا',2]])for(let n=0;n<count;n++)await guest.getByRole('button',{name:tr('Increase {p0}',{p0:language==='ar'?nameAr:name}),exact:true}).click();
 assert.equal(await guest.getByTestId('share-total').textContent(),`${formatMoney(language,69300)} ${tr('EGP')}`);
 assert.equal(await other.getByTestId('share-total').textContent(),`${formatMoney(language,0)} ${tr('EGP')}`);
 await other.getByRole('combobox',{name:tr('Language'),exact:true}).last().selectOption(language==='ar'?'en':'ar');assert.equal(await guest.locator('html').getAttribute('lang'),language);
 const burgerName=language==='ar'?'برجر':'Burger';await guest.getByRole('button',{name:tr('Increase {p0}',{p0:burgerName}),exact:true}).click();await guest.getByRole('button',{name:tr('Increase {p0}',{p0:burgerName}),exact:true}).click();assert(await guest.getByRole('button',{name:tr('Increase {p0}',{p0:burgerName}),exact:true}).isDisabled());
 await guest.getByRole('button',{name:tr('Decrease {p0}',{p0:burgerName}),exact:true}).click();
 assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile calculator overflow');await guest.screenshot({path:`outputs/tab2serve-alpha-calculator-${language}.png`,fullPage:true,animations:'disabled'});
 await guest.getByRole('button',{name:tr('Close'),exact:true}).click();await guest.getByRole('button',{name:tr('Split Bill'),exact:true}).click();assert.equal(await guest.getByTestId('share-total').textContent(),`${formatMoney(language,0)} ${tr('EGP')}`);
 const after=await staffState();assert.deepEqual(after.orders,before.orders);assert.deepEqual(after.payments,before.payments);assert.equal(calculatorWrites,0);
 await guest.getByRole('button',{name:tr('Close'),exact:true}).click();
 // Kitchen, service requests and private feedback remain independent of calculator use.
 await dashboard.getByRole('button',{name:tr('Kitchen display'),exact:true}).click();await dashboard.getByRole('button',{name:tr('Start preparing'),exact:true}).click();await dashboard.getByRole('button',{name:tr('Mark ready'),exact:true}).click();
 await dashboard.getByRole('button',{name:tr('Orders'),exact:true}).click();await dashboard.getByRole('button',{name:tr('Mark served'),exact:true}).click();
 await guest.getByRole('button',{name:tr('Call staff'),exact:true}).last().click();await dashboard.getByRole('button',{name:tr('Service requests'),exact:true}).click();await dashboard.getByRole('button',{name:tr('Acknowledge'),exact:true}).click();await dashboard.getByRole('button',{name:tr('Resolve'),exact:true}).click();
 await guest.getByRole('button',{name:tr('Request the table bill'),exact:true}).click();await guest.getByRole('button',{name:tr('{p0} stars',{p0:5}),exact:true}).click();await guest.getByRole('textbox',{name:tr('Anything you’d like us to know? (optional)'),exact:true}).fill('خدمة ممتازة');await guest.getByRole('button',{name:tr('Send private feedback'),exact:true}).click();
 // Management pages and localized forms, including Arabic content saved through UI.
 await dashboard.getByRole('button',{name:tr('Menu management'),exact:true}).click();await dashboard.getByRole('button',{name:tr('Edit item'),exact:true}).first().click();await dashboard.getByRole('textbox',{name:tr('Description (Arabic)'),exact:true}).fill('وصف عربي محفوظ');await dashboard.getByRole('button',{name:tr('Save menu item'),exact:true}).click();await dashboard.getByRole('dialog').waitFor({state:'detached'});assert.equal((await staffState()).menu[0].descriptionAr,'وصف عربي محفوظ');
 await dashboard.getByRole('button',{name:tr('Team & permissions'),exact:true}).click();await dashboard.getByRole('button',{name:tr('Add team member'),exact:true}).click();await dashboard.getByRole('textbox',{name:tr('Full name'),exact:true}).fill('موظف اختبار');await dashboard.getByRole('textbox',{name:tr('Sign-in email'),exact:true}).fill(`alpha-${language}-${Date.now()}@test.test`);await dashboard.getByRole('button',{name:tr('Save team access'),exact:true}).click();await dashboard.getByRole('dialog').waitFor({state:'detached'});
 await dashboard.getByRole('button',{name:tr('Guest feedback'),exact:true}).click();await dashboard.getByText('خدمة ممتازة',{exact:true}).waitFor();
 await dashboard.getByRole('button',{name:tr('Activity log'),exact:true}).click();await dashboard.getByRole('heading',{name:tr('Recent activity'),exact:true}).waitFor();
 await dashboard.getByRole('button',{name:tr('Restaurant settings'),exact:true}).click();assert.equal(await dashboard.getByRole('textbox',{name:tr('Restaurant name (Arabic)'),exact:true}).inputValue(),'مطعم ألفا');
 await dashboard.getByRole('button',{name:tr('Platform admin'),exact:true}).click();await dashboard.getByRole('heading',{name:tr('Platform admin'),exact:true}).waitFor();
 await dashboard.getByRole('button',{name:tr('Billing'),exact:true}).click();assert.equal(await dashboard.getByRole('button',{name:tr('Record payment'),exact:true}).count(),1);assert.equal(await dashboard.getByText(/Record .*payment/).count(),language==='ar'?0:1);
 await dashboard.getByRole('button',{name:tr('Print draft bill'),exact:true}).click();await dashboard.locator('#receipt').waitFor();assert.equal(await dashboard.locator('#receipt .total').textContent(),`${tr('Table total')}${formatMoney(language,163800)} ${tr('EGP')}`);await dashboard.getByRole('button',{name:tr('Close'),exact:true}).click();
 await dashboard.screenshot({path:`outputs/tab2serve-alpha-dashboard-${language}.png`,fullPage:true,animations:'disabled'});
 await dashboard.getByRole('button',{name:tr('Finalize bill'),exact:true}).click();await dashboard.getByRole('button',{name:tr('Confirm final bill'),exact:true}).click();await dashboard.getByRole('dialog').waitFor({state:'detached'});
 await dashboard.getByRole('button',{name:tr('Print final bill'),exact:true}).click();await dashboard.locator('#receipt').getByRole('heading',{name:tr('Final bill'),exact:true}).waitFor();await dashboard.getByRole('button',{name:tr('Close'),exact:true}).click();
 await dashboard.getByRole('button',{name:tr('Record payment'),exact:true}).click();await dashboard.getByRole('button',{name:language==='ar'?tr('Card (Visa / Mastercard) · paid in person'):tr('Cash'),exact:true}).click();await dashboard.getByRole('button',{name:tr('Confirm payment received'),exact:true}).click();await dashboard.getByRole('button',{name:tr('Make table available'),exact:true}).click();
 await guest.getByRole('heading',{name:tr('No active bill'),exact:true}).waitFor();
 // Closing a session while its calculator is open must not render a null bill.
 ok(await cmd('session.open',{tableId:table.id}));await guest.reload({waitUntil:'domcontentloaded'});await guest.getByRole('button',{name:tr('Table bill'),exact:true}).click();await guest.getByRole('button',{name:tr('Split Bill'),exact:true}).click();
 await guest.getByText(tr('No items in this table order yet.'),{exact:true}).waitFor();
 t=await staffState();const emptySession=t.sessions.find(s=>s.tableId===table.id&&s.status==='OPEN');ok(await cmd('billing.finalize',{sessionId:emptySession.id,expectedVersion:emptySession.version,expectedTotal:0}));ok(await cmd('session.close',{sessionId:emptySession.id}));await guest.getByRole('dialog').waitFor({state:'detached'});await guest.getByRole('heading',{name:tr('No active bill'),exact:true}).waitFor();
 // Navigation and forms must also fit a narrow staff viewport in each direction.
 await dashboard.setViewportSize({width:390,height:844});assert.equal(await dashboard.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await dashboard.getByRole('button',{name:tr('Open navigation'),exact:true}).click();await dashboard.getByRole('button',{name:tr('Menu management'),exact:true}).click();await dashboard.getByRole('textbox',{name:tr('Search the menu…'),exact:true}).fill('برجر');await dashboard.getByRole('heading',{name:burgerName,exact:true}).waitFor();await dashboard.getByRole('textbox',{name:tr('Search the menu…'),exact:true}).fill('');
 assert.equal(await dashboard.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await dashboard.screenshot({path:`outputs/tab2serve-alpha-mobile-management-${language}.png`,fullPage:true,animations:'disabled'});assert.deepEqual(errors,[]);
 await staff.close();await guestContext.close();await otherContext.close();
 console.log(`PASS: ${language} dashboard, guest ordering/edit, independent calculator, charge rounding, kitchen, service, feedback, management, Unicode forms, printing, payment, closure, saved preference and mobile layout.`);
}}catch(error){for(const page of browser.contexts().flatMap(c=>c.pages())){console.error('FAILED PAGE:',page.url(),(await page.locator('body').innerText().catch(()=>'' )).slice(0,7000));await page.screenshot({path:'outputs/alpha-failure-'+Date.now()+'.png'}).catch(()=>{})}throw error}finally{await browser.close()}
