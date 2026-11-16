import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {translate,formatMoney} from '../lib/i18n.mjs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw new Error('Local preview only.');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE,timeout:15000});
await mkdir('outputs',{recursive:true});
function fixture(count=10,quantity=3,unitPrice=100){
 const lines=Array.from({length:count},(_,i)=>({id:'line'+i,itemId:'item'+i,name:'Dish '+i,nameAr:'طبق '+i,unitPrice,quantity,modifiers:[],notes:''}));
 const subtotal=count*quantity*unitPrice;
 return {restaurant:{name:'Regression restaurant',tagline:'',logo:'',currency:'EGP',categories:[],menu:[]},table:{label:'01'},session:{id:'regression',status:'OPEN',version:1,capability:'local-only',taxBps:0,serviceBps:0},orders:[{id:'order',number:1,status:'PENDING',version:1,lines,createdAt:new Date().toISOString()}],bill:{subtotal,tax:0,service:0,total:subtotal,paid:0,due:subtotal},requests:[]};
}
try{for(const language of ['en','ar'])for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let state=fixture(),writes=0;
 const tr=(key,params)=>translate(language,key,params),cash=n=>formatMoney(language,n)+' '+tr('EGP'),dish=n=>language==='ar'?'طبق '+n:'Dish '+n;
 const button=name=>page.getByRole('button',{name,exact:true}),plus=n=>button(tr('Increase {p0}',{p0:dish(n)})),minus=n=>button(tr('Decrease {p0}',{p0:dish(n)}));
 const selected=n=>page.getByLabel(tr('Selected quantity for {p0}',{p0:dish(n)}),{exact:true});
 const total=()=>page.getByTestId('share-total').textContent();
 const waitText=async(locator,text)=>{await locator.filter({hasText:text}).waitFor();assert.equal(await locator.textContent(),text)};
 await page.route('**/api/state?**',route=>route.fulfill({json:state}));
 await page.route('**/api/command',route=>{writes++;return route.fulfill({json:{ok:true}})});
 await page.goto(base+'/?table=regression',{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByRole('combobox',{name:'Language',exact:true}).selectOption(language);
 await button(tr('Table bill')).click();await button(tr('Call staff')).last().click();await page.locator('.toast').waitFor();
 await button(tr('Split Bill')).click();
 // A real pointer click catches toast interception; Playwright's locator.click
 // can auto-scroll the button away from the obstruction and hide the regression.
 const increase=plus(7);
 await increase.evaluate(button=>{const modal=button.closest('.modal'),toast=document.querySelector('.toast'),b=button.getBoundingClientRect(),t=toast.getBoundingClientRect();modal.scrollTop+=b.top+b.height/2-t.top-t.height/2});
 assert.equal(await increase.evaluate(button=>{const r=button.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.toast')?'toast':'calculator'}),'calculator','Notification must not intercept controls');
 const box=await increase.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 assert.equal(await page.locator('.toast').isVisible(),true);await waitText(page.getByTestId('share-total'),cash(100));
 await button(tr('Close')).click();await button(tr('Split Bill')).click();assert.equal(await total(),cash(0));
 const writesBefore=writes;
 // Exact rounding, three guests sharing all units of one item.
 state=fixture(1,3,1);state.bill={...state.bill,tax:1,service:1,total:5,due:5};
 await plus(7).waitFor({state:'detached'});await plus(0).click();assert.equal(await total(),cash(1));
 await button(tr('Add guest')).click();await plus(0).click();await button(tr('Add guest')).click();await plus(0).click();
 assert.equal(await total(),cash(1));assert(await plus(0).isDisabled());
 await waitText(page.getByTestId('split-allocated'),cash(5));assert.equal(await page.getByTestId('split-unassigned').textContent(),cash(0));
 assert.equal(await page.getByTestId('split-total-guest-1').textContent(),cash(3));
 assert.equal(await page.getByTestId('split-total-guest-2').textContent(),cash(1));
 assert.equal(await page.getByTestId('split-status').textContent(),tr('All items allocated. Guest totals match the table bill.'));
 const chooser=page.getByRole('combobox',{name:tr('Calculating for'),exact:true});await chooser.selectOption('guest-1');assert(await plus(0).isDisabled());assert.equal(await selected(0).textContent(),'1');
 await minus(0).click();assert.equal(await selected(0).textContent(),'0');assert(await minus(0).isDisabled());await chooser.selectOption('guest-2');await plus(0).click();assert.equal(await selected(0).textContent(),'2');assert(await plus(0).isDisabled());
 await button(tr('Remove guest')).click();assert.equal(await chooser.locator('option').count(),2);assert(await plus(0).isEnabled());
 // Changes from normal table polling reclamp and remove selections permanently.
 await plus(0).click();await plus(0).click();state=fixture(1,1,1);state.bill={...state.bill,tax:1,service:1,total:3,due:3};
 await page.waitForFunction(()=>document.querySelector('[data-testid="share-total"]').textContent.includes('0.03'));assert.equal(await selected(0).textContent(),'1');assert(await plus(0).isDisabled());
 state=fixture(1,3,1);await plus(0).waitFor({state:'visible'});await page.waitForFunction(()=>!Array.from(document.querySelectorAll('.calculator-choice button')).at(-1).disabled);assert.equal(await selected(0).textContent(),'1','Quantity increase must not resurrect removed allocations');
 // Authoritative discount and negative adjustment, no invented rates.
 state.bill={...state.bill,discount:1,tax:1,service:1,rounding:-1,total:3,due:3};
 await page.getByText(tr('Your discount share'),{exact:true}).waitFor();await page.getByText(tr('Your rounding adjustment'),{exact:true}).waitFor();
 await plus(0).click();await plus(0).click();assert.equal(await total(),cash(3));await waitText(page.getByTestId('split-allocated'),cash(3));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page fits viewport');
 assert.equal(await page.locator('.modal').evaluate(el=>el.scrollWidth>el.clientWidth),false,'Dialog fits viewport');
 assert.equal(await page.locator('html').getAttribute('dir'),language==='ar'?'rtl':'ltr');
 await page.screenshot({path:'outputs/split-bill-'+language+'-'+width+'.png',animations:'disabled'});
 state={...state,orders:[],bill:{subtotal:0,tax:0,service:0,total:0,paid:0,due:0}};
 await page.getByText(tr('No items in this table order yet.'),{exact:true}).waitFor();assert.equal(await total(),cash(0));
 state=fixture(1,3,1);await plus(0).waitFor();assert.equal(await selected(0).textContent(),'0');
 // Missing/inconsistent snapshots surface an error and recover on the next poll.
 state={...state,bill:null};await page.getByRole('alert').filter({hasText:tr('The table bill is not available yet.')}).waitFor();
 state=fixture(1,3,1);await plus(0).waitFor();await plus(0).click();assert.equal(await total(),cash(1));
 await button(tr('Close')).click();await button(tr('Split Bill')).click();assert.equal(await total(),cash(0));assert.equal(await chooser.locator('option').count(),1);
 state={...state,session:null,bill:null,orders:[]};await page.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(writes,writesBefore,'The calculator must never write orders, allocations or payments');assert.deepEqual(errors,[]);
 await context.close();console.log('PASS: '+language+' '+width+'px: notification clicks, quantities, guests, rounding/discount, polling, removed items, errors, reset, RTL/LTR, no writes.');
}}finally{await browser.close()}
