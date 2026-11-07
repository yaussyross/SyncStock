// Synthetic local production-browser test. Run with PLAYWRIGHT_MODULE pointing
// to an installed playwright module and SYNCSTOCK_TEST_ORIGIN (loopback only).
// Navigation tests require the temporary fixture documented in docs/connection-page-isolation.md.
import assert from 'node:assert/strict';
import {syntheticTestEnv} from './connection-page-test-env.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.SYNCSTOCK_TEST_ORIGIN || 'http://127.0.0.1:3187';
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const browser = await chromium.launch({env:await syntheticTestEnv(),headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}), ignoreDefaultArgs:['--disable-back-forward-cache'], args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
try {
 const context = await browser.newContext();
 const external=[]; const errors=[]; const documents=[];
 await context.route('**/*', async route => {
   const url=new URL(route.request().url());
   if(url.origin===origin) return route.continue();
   external.push(url.href);
   // Stub ordinary-layout resources; never contact a provider or Google.
   if(url.hostname==='cdn.shopify.com') return route.fulfill({contentType:'application/javascript',body:'window.__syntheticBridgeLoaded=true;'});
   return route.fulfill({contentType:'text/css',body:''});
 });
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.isNavigationRequest())documents.push(r.url());});
 await page.goto(origin+'/isolation-test-fixture');
 await page.waitForFunction(()=>window.__syntheticBridgeLoaded===true);
 await page.evaluate(()=>window.__ordinarySentinel=true);
 external.length=0; documents.length=0;
 await page.getByRole('link',{name:'Setup link',exact:true}).click();
 await page.waitForURL('**/settings/connections?*');
 await page.getByRole('button',{name:'Load connection status',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('input').value==='00000000-0000-4000-8000-000000000001');
 assert(documents.some(u=>u.includes('/settings/connections')), 'Link must cause a document request');
 assert.equal(await page.evaluate(()=>!!window.__ordinarySentinel||!!window.__syntheticBridgeLoaded),false);
 assert.equal(await page.locator('a.feedback-fab').count(),0);
 assert.deepEqual(external,[]);
 const html=await page.content();
 assert(!html.includes('fonts.googleapis.com')&&!html.includes('cdn.shopify.com'));
 assert.equal(await page.locator('script:not([src])').evaluateAll(s=>s.every(x=>!!x.nonce)),true);
 await page.goBack(); await page.waitForURL('**/isolation-test-fixture');
 await page.waitForFunction(()=>window.__syntheticBridgeLoaded===true);
 await page.goForward(); await page.waitForURL('**/settings/connections?*');
 assert.equal(await page.evaluate(()=>!!window.__syntheticBridgeLoaded),false);
 await page.goBack(); await page.waitForURL('**/isolation-test-fixture');
 documents.length=0;
 await page.getByRole('button',{name:'Setup router',exact:true}).click();
 await page.waitForURL('**/settings/connections');
 await page.getByRole('button',{name:'Load connection status',exact:true}).waitFor();
 assert(documents.some(u=>u.includes('/settings/connections')), 'router.push must cause a document request');
 assert.equal(await page.evaluate(()=>!!window.__syntheticBridgeLoaded),false);
 console.log('PASS: SSR/hydration, Next Link, router.push, back/forward document isolation; no third-party requests on setup.');
 const connection={connectionId:'00000000-0000-4000-8000-000000000001',provider:'xero',environment:'test',version:4,status:'available',accountStatus:'bound',providerAccountId:'synthetic-org',customerReady:false};
 let current={...connection}; let requests=[]; let responseMode='success';
 await page.route('**/api/expansion/connections/**',async route=>{
   if(route.request().url().endsWith('/disconnect')) {
     requests.push(route.request().postDataJSON());
     if(responseMode==='timeout') return; // Hold until the client aborts.
     current={...connection,version:5,status:'revoked',accountStatus:'unbound',providerAccountId:null,disconnectOutcome:responseMode==='unknown'?'outcome_unknown':requests.at(-1).mode==='local_only'?'local_only':'disconnected'};
   }
   return route.fulfill({json:{connection:current}});
 });
 await page.locator('input').first().fill(connection.connectionId);
 await page.getByRole('button',{name:'Load connection status',exact:true}).click();
 const confirm=page.getByRole('button',{name:'Confirm removal',exact:true});
 await confirm.waitFor(); assert(await confirm.isDisabled());
 await page.getByRole('combobox',{name:'Removal scope'}).selectOption('bound_organization');
 await page.getByRole('checkbox').check();
 await confirm.dblclick();
 await page.getByText('Local credentials and this bound Xero organization connection were removed.',{exact:false}).waitFor();
 assert.equal(requests.length,1); assert.deepEqual(requests[0],{version:4,mode:'bound_organization'});
 assert.equal(await confirm.count(),0);
 current={...connection}; responseMode='success';
 await page.getByRole('button',{name:'Load connection status',exact:true}).click();
 await page.getByRole('checkbox').check(); await confirm.click();
 await page.getByText('Local credentials were removed. Provider access was not revoked;', {exact:false}).waitFor();
 assert.equal(requests.at(-1).mode,'local_only');
 current={...connection}; responseMode='unknown';
 await page.getByRole('button',{name:'Load connection status',exact:true}).click();
 await page.getByRole('combobox',{name:'Removal scope'}).selectOption('bound_organization');
 await page.getByRole('checkbox').check(); await confirm.click();
 await page.getByText('Local credentials were removed, but the remote removal outcome is unconfirmed.',{exact:false}).waitFor();
 assert.equal(await confirm.count(),0);
 current={...connection}; responseMode='timeout';
 await page.getByRole('button',{name:'Load connection status',exact:true}).click();
 await page.clock.install();
 await page.getByRole('checkbox').check(); await confirm.click();
 await page.clock.fastForward(21000);
 await page.getByText('This request did not return a confirmed result.',{exact:false}).waitFor();
 assert(await confirm.isDisabled());
 const afterTimeout=requests.length;
 await page.clock.fastForward(60000); assert.equal(requests.length,afterTimeout);
 current={...connection,version:5,status:'revoked',accountStatus:'unbound',providerAccountId:null,disconnectOutcome:'outcome_unknown'};
 await page.getByRole('button',{name:'Load connection status',exact:true}).click();
 await page.getByText('Local credentials were removed, but the remote removal outcome is unconfirmed.',{exact:false}).waitFor();
 assert.equal(await confirm.count(),0);
 console.log('PASS: explicit scope confirmation, duplicate-click lock, local/remote/unknown result copy, timeout requires status reconciliation and never auto-retries.');
 assert.deepEqual(errors,[]);
 await page.getByRole('link',{name:'Back to dashboard'}).click();
 await page.waitForURL('**/login');
 await page.waitForFunction(()=>window.__syntheticBridgeLoaded===true);
 console.log('PASS: setup exit creates ordinary document and restores ordinary resources.');
 await context.close();
} finally {await browser.close();}
