import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5194';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Local design editor tests only.');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE,timeout:15000});
const headers={Cookie:'__sites_local_auth=1',Origin:base,'Content-Type':'application/json'};let restaurantId;
const command=async(action,body={})=>{const r=await fetch(base+'/api/command',{method:'POST',headers,body:JSON.stringify({action,restaurantId,...body})});assert.equal(r.status,200,await r.clone().text());return r.json();};
const design=async()=>{const r=await fetch(base+'/api/design?restaurant='+restaurantId,{headers});assert.equal(r.status,200);return r.json();};
const restaurant=async()=>(await (await fetch(base+'/api/state?restaurant='+restaurantId,{headers})).json()).restaurant;
try{
 await fetch(base+'/api/state',{headers});const name='Existing design editor QA '+Date.now();restaurantId=(await command('platform.create',{name})).id;
 const before=await restaurant(),context=await browser.newContext();await context.addCookies([{name:'__sites_local_auth',value:'1',url:base}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Localhost normally selects the restaurant dashboard. Select the existing
 // SuperAdmin component through its real, authorized platform snapshot; all
 // design reads, mutations and previews still use the actual local endpoints.
 // Hostname authorization itself is covered by the Worker tenant/auth suites.
 await page.route('**/api/updates?*',async route=>{const response=await route.fetch({url:base+'/api/updates?view=platform'}),body=await response.json();assert.equal(response.status(),200);body.routing.kind='admin';await route.fulfill({response,json:body});});
 await page.goto(base);const card=page.locator('.bill-card').filter({has:page.getByRole('heading',{name,exact:true})}),editor=card.getByRole('region',{name:'Website design',exact:true});
 await card.getByRole('button',{name:'Manage design',exact:true}).click();await editor.getByLabel('Hero title (English)',{exact:true}).fill('Verified existing design editor');await editor.getByRole('button',{name:'Save draft',exact:true}).click();await editor.getByRole('button',{name:'Preview saved draft',exact:true}).waitFor({state:'visible'});
 await page.waitForFunction(async id=>{const r=await fetch('/api/design?restaurant='+id);const d=await r.json();return d.management?.draft.branding.heroTitle.en==='Verified existing design editor';},restaurantId);
 assert.equal((await design()).management.published.branding.heroTitle.en,'');await editor.getByRole('button',{name:'Preview saved draft',exact:true}).click();await editor.frameLocator('iframe').getByRole('heading',{name:'Verified existing design editor',exact:true}).waitFor();
 await editor.getByRole('button',{name:'Publish saved draft',exact:true}).click();await page.waitForFunction(async id=>{const r=await fetch('/api/design?restaurant='+id);const d=await r.json();return d.management?.published.branding.heroTitle.en==='Verified existing design editor';},restaurantId);
 await editor.getByRole('button',{name:'Revert published design',exact:true}).click();await page.waitForFunction(async id=>{const r=await fetch('/api/design?restaurant='+id);const d=await r.json();return d.management?.published.branding.heroTitle.en==='';},restaurantId);
 await editor.getByRole('button',{name:'Close design editor',exact:true}).click();await editor.getByRole('button',{name:'Manage design',exact:true}).click();assert.equal(await editor.getByLabel('Hero title (English)',{exact:true}).inputValue(),'Verified existing design editor');
 const after=await restaurant();for(const key of ['orders','payments','notifications','taxBps','serviceBps'])assert.deepEqual(after[key],before[key]);assert.deepEqual(errors,[]);
 console.log('PASS: existing design editor loads, saves, previews, publishes, reverts and reopens through local authenticated endpoints; orders, notifications and bill rates are unchanged.');
}finally{await browser.close();}
