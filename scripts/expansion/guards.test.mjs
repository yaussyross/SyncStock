import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {SOURCES,DESTINATIONS,EXPERIENCES,REQUIRED,checkExperience,launchMatrix,evidenceValid,channelBindingFingerprint} from '../../src/lib/expansion/registry.mjs';
import {beginConsent,consumeConsent,validateCallback,safeConnectionSummary} from '../../src/lib/expansion/oauth-guard.mjs';
import {validateReadRequest,parseUsd,retryDelay} from '../../src/lib/expansion/read-safety.mjs';
const NOW=Date.parse('2026-11-07T19:20:00Z');
function config(source='ebay',destination='qbo',environment='sandbox'){let c={enabled:true,source,destination,environment,tenantId:'synthetic-tenant',boundSourceId:'synthetic-shop',boundDestinationId:'synthetic-company',mappingRevision:'revision-1',currency:'USD',writerOwner:'syncstock',cutoverAt:'2026-11-07T18:00:00Z',evidence:{}};for(const gate of [...REQUIRED,'cross_channel_ownership'])c.evidence[gate]={status:'passed',mode:'provider',environment,tenantId:c.tenantId,source,destination,boundSourceId:c.boundSourceId,boundDestinationId:c.boundDestinationId,mappingRevision:c.mappingRevision,runId:'SYNTHETIC-NOT-A-REAL-PROVIDER-RECEIPT',receipt:'https://example.invalid/synthetic',checkedAt:'2026-11-07T19:00:00Z',expiresAt:'2026-11-08T19:00:00Z'};return c;}
function consentStore(){const map=new Map();return {map,async insert(k,v){if(map.has(k))throw Error('duplicate');map.set(k,v)},async take(k){const v=map.get(k);map.delete(k);return v}};}
const context={provider:'ebay',environment:'sandbox',tenantId:'synthetic-tenant',sessionId:'synthetic-session'};const callback='https://example.invalid/api/expansion/ebay/callback';const options=store=>({store,allowedCallbacks:[callback],callbackUrl:callback,now:NOW});
async function started(){let store=consentStore();const b=await beginConsent(context,options(store));return {store,b,arg:{state:b.state,context,callbackUrl:callback,authorizationCode:'SYNTHETIC-CODE-NOT-ISSUED-BY-PROVIDER'}};}
test('exact16 experiences',()=>assert.equal(EXPERIENCES.length,16));
test('no duplicate experiences',()=>assert.equal(new Set(EXPERIENCES.map(x=>x.id)).size,16));
test('seven providers and two destinations',()=>{assert.equal(SOURCES.length,7);assert.equal(DESTINATIONS.length,2)});
for(const pair of EXPERIENCES)test(`${pair.id} blocked by default`,()=>{const r=checkExperience(pair.id);assert.equal(r.allowed,false);assert.equal(r.customerReady,false)});
test('launch matrix cannot infer readiness',()=>assert.equal(launchMatrix().filter(x=>x.customerReady).length,0));
test('sandbox never customer-ready',()=>{const r=checkExperience('ebay-qbo',config(),NOW,()=>true);assert.equal(r.allowed,true);assert.equal(r.customerReady,false)});
test('synthetic mode evidence cannot satisfy provider gate',()=>{const c=config();c.evidence.read_acceptance.mode='synthetic';assert.equal(checkExperience('ebay-qbo',c,NOW).allowed,false)});
test('stale evidence rejected',()=>{const c=config();c.evidence.read_acceptance.expiresAt='2026-11-07T19:00:00Z';assert.equal(checkExperience('ebay-qbo',c,NOW).allowed,false)});
test('future evidence rejected',()=>{const c=config();c.evidence.read_acceptance.checkedAt='2026-11-07T20:00:00Z';assert.equal(checkExperience('ebay-qbo',c,NOW).allowed,false)});
test('wrong environment evidence rejected',()=>{const c=config();c.evidence.read_acceptance.environment='production';assert.equal(checkExperience('ebay-qbo',c,NOW).allowed,false)});
test('wrong tenant evidence rejected',()=>{const c=config();c.evidence.read_acceptance.tenantId='other';assert.equal(checkExperience('ebay-qbo',c,NOW).allowed,false)});
test('wrong destination evidence rejected',()=>{const c=config();c.evidence.read_acceptance.destination='xero';assert.equal(checkExperience('ebay-qbo',c,NOW).allowed,false)});
test('wrong source evidence rejected',()=>{const c=config();c.evidence.read_acceptance.source='shopify';assert.equal(checkExperience('ebay-qbo',c,NOW).allowed,false)});
test('unbound provider accounts fail',()=>{const c=config();delete c.boundSourceId;assert.equal(checkExperience('ebay-qbo',c,NOW).allowed,false)});
test('unsupported FX fails',()=>{const c=config();c.currency='GBP';assert.equal(checkExperience('ebay-qbo',c,NOW).allowed,false)});
test('other writer ownership fails',()=>{const c=config();c.writerOwner='another-connector';assert.equal(checkExperience('ebay-qbo',c,NOW).allowed,false)});
test('future cutover fails',()=>{const c=config();c.cutoverAt='2026-11-08T00:00:00Z';assert.equal(checkExperience('ebay-qbo',c,NOW).allowed,false)});
test('multichannel needs two accepted constituent sources',()=>{const c=config('multichannel');c.channelConfigs=[config('shopify')];assert.equal(checkExperience('multichannel-qbo',c,NOW).allowed,false)});
test('multichannel can evaluate matching synthetic receipts',()=>{const c=config('multichannel');c.channelConfigs=[config('shopify'),config('paypal')];for(const e of Object.values(c.evidence))e.channelBindingFingerprint=channelBindingFingerprint(c);assert.equal(checkExperience('multichannel-qbo',c,NOW,()=>true).allowed,true)});
test('multichannel rejects company mismatch',()=>{const c=config('multichannel');c.channelConfigs=[config('shopify'),config('paypal')];c.channelConfigs[1].boundDestinationId='another-company';assert.equal(checkExperience('multichannel-qbo',c,NOW).allowed,false)});
test('multichannel requires ownership acceptance',()=>{const c=config('multichannel');c.channelConfigs=[config('shopify'),config('paypal')];delete c.evidence.cross_channel_ownership;assert.equal(checkExperience('multichannel-qbo',c,NOW).allowed,false)});
test('multichannel rejects duplicate sources',()=>{const c=config('multichannel');c.channelConfigs=[config('shopify'),config('shopify')];assert.equal(checkExperience('multichannel-qbo',c,NOW).allowed,false)});
test('unknown experience rejected',()=>assert.throws(()=>checkExperience('stripe-qbo')));
test('exact callback accepted',()=>assert.equal(validateCallback(callback,[callback]),callback));
for(const u of ['http://example.invalid/api/expansion/ebay/callback','https://attacker.invalid/api/expansion/ebay/callback','https://example.invalid/unregistered','https://user:pass@example.invalid/api/expansion/ebay/callback',callback+'?next=x',callback+'#fragment'])test('callback rejected '+u,()=>assert.throws(()=>validateCallback(u,[callback])));
test('begin creates PKCE S256 and hash-only state key',async()=>{const {store,b}=await started();assert.match(b.state,/^[A-Za-z0-9_-]{43}$/);assert.equal(b.codeChallengeMethod,'S256');assert.equal(store.map.has(b.state),false);assert.equal(store.map.size,1);assert.ok(!('verifier' in b));});
test('consent binding accepted once only',async()=>{const {store,b,arg}=await started();const r=await consumeConsent(arg,options(store));assert.equal(r.provider,'ebay');assert.equal(createHash('sha256').update(r.verifier).digest('base64url'),b.codeChallenge);await assert.rejects(()=>consumeConsent(arg,options(store)),/already used/)});
test('concurrent callback consumption only one succeeds',async()=>{const {store,arg}=await started();const r=await Promise.allSettled([consumeConsent(arg,options(store)),consumeConsent(arg,options(store))]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1)});
for(const [field,value] of [['provider','xero'],['environment','production'],['tenantId','other'],['sessionId','other']])test('consent rejects changed '+field,async()=>{const {store,arg}=await started();arg.context={...arg.context,[field]:value};await assert.rejects(()=>consumeConsent(arg,options(store)),/mismatch/);assert.equal(store.map.size,0)});
test('expired consent rejected at boundary',async()=>{const {store,arg}=await started();await assert.rejects(()=>consumeConsent(arg,{...options(store),now:NOW+600000}),/expired/)});
test('clock reversal rejected',async()=>{const {store,arg}=await started();await assert.rejects(()=>consumeConsent(arg,{...options(store),now:NOW-1}),/expired/)});
test('invalid clock rejected',async()=>{const {store,arg}=await started();await assert.rejects(()=>consumeConsent(arg,{...options(store),now:NaN}),/clock/)});
test('provider refusal consumes state without token result',async()=>{const {store,arg}=await started();await assert.rejects(()=>consumeConsent({...arg,providerError:'access_denied'},options(store)),/declined/);assert.equal(store.map.size,0)});
test('missing authorization code rejected',async()=>{const {store,arg}=await started();arg.authorizationCode='';await assert.rejects(()=>consumeConsent(arg,options(store)),/code/)});
test('oversized authorization code rejected',async()=>{const {store,arg}=await started();arg.authorizationCode='x'.repeat(4097);await assert.rejects(()=>consumeConsent(arg,options(store)),/code/)});
test('atomic store required',async()=>assert.rejects(()=>beginConsent(context,{...options(null)}),/store/));
test('oversized lifetime rejected',async()=>assert.rejects(()=>beginConsent(context,{...options(consentStore()),ttlMs:600001}),/lifetime/));
test('status summary never contains token fields',()=>assert.deepEqual(safeConnectionSummary({...context,accessToken:'synthetic',refreshToken:'synthetic',clientSecret:'synthetic',verifier:'synthetic'}),{provider:'ebay',environment:'sandbox',tenantId:'synthetic-tenant',accountLabel:'',status:'unconnected'}));
const req={provider:'ebay',environment:'sandbox',tenantId:'a',boundTenantId:'a',accountId:'synthetic-ebay',boundAccountId:'synthetic-ebay',url:'https://api.sandbox.ebay.com/sell/fulfillment/v1/order?limit=20'};
test('read-only request has redirect error guard',()=>assert.equal(validateReadRequest(req).redirect,'error'));
for(const method of ['POST','PUT','PATCH','DELETE'])test(method+' cannot pass read adapter',()=>assert.throws(()=>validateReadRequest({...req,method})));
test('wrong tenant blocked',()=>assert.throws(()=>validateReadRequest({...req,boundTenantId:'b'})));
test('production host blocked in sandbox',()=>assert.throws(()=>validateReadRequest({...req,url:'https://api.ebay.com/sell/fulfillment/v1/order'})));
test('host suffix spoof blocked',()=>assert.throws(()=>validateReadRequest({...req,url:'https://api.sandbox.ebay.com.evil.invalid/sell/fulfillment/v1/order'})));
test('token in URL blocked',()=>assert.throws(()=>validateReadRequest({...req,url:req.url+'&access_token=synthetic'})));
test('unsupported resource blocked',()=>assert.throws(()=>validateReadRequest({...req,url:'https://api.sandbox.ebay.com/sell/account/v1/payment_policy'})));
test('unverified finances transport blocked',()=>assert.throws(()=>validateReadRequest({...req,url:'https://api.sandbox.ebay.com/sell/finances/v1/transaction'})));
test('QBO company binding accepted',()=>assert.equal(validateReadRequest({provider:'qbo',environment:'sandbox',tenantId:'a',boundTenantId:'a',accountId:'123',boundAccountId:'123',url:'https://sandbox-quickbooks.api.intuit.com/v3/company/123/query?query=select%20*%20from%20Item'}).method,'GET'));
test('QBO other company blocked',()=>assert.throws(()=>validateReadRequest({provider:'qbo',environment:'sandbox',tenantId:'a',boundTenantId:'a',accountId:'123',boundAccountId:'123',url:'https://sandbox-quickbooks.api.intuit.com/v3/company/456/query'})));
test('exact fixed-point USD parsing',()=>assert.equal(parseUsd('100.01'),10001n));
for(const v of [1.01,'1.001','1e3','NaN','-1','+1','1,000',' 1'])test('unsupported money rejected '+v,()=>assert.throws(()=>parseUsd(v)));
test('429 bounded delay',()=>assert.equal(retryDelay({status:429,attempt:0,retryAfter:'10'}),10000));
test('auth failures not retried',()=>assert.equal(retryDelay({status:401,attempt:0}),null));
test('retry exhaustion stops',()=>assert.equal(retryDelay({status:503,attempt:4}),null));
test('excessive Retry-After stops rather than retrying early',()=>assert.equal(retryDelay({status:429,attempt:0,retryAfter:'120'}),null));
test('HTTP date retry supported',()=>assert.equal(retryDelay({status:429,attempt:0,retryAfter:'Sat, 07 Nov 2026 19:20:05 GMT',now:NOW}),5000));

test('different provider account blocked',()=>assert.throws(()=>validateReadRequest({...req,boundAccountId:'another-seller'})));
test('missing provider account blocked',()=>assert.throws(()=>validateReadRequest({...req,accountId:''})));

test('untrusted JSON cannot declare customer readiness',()=>{const c=config('ebay','qbo','production');assert.equal(checkExperience('ebay-qbo',c,NOW).customerReady,false)});
test('trusted verifier rejection fails closed',()=>{const c=config('ebay','qbo','production');assert.equal(checkExperience('ebay-qbo',c,NOW,()=>false).customerReady,false)});
test('trusted synthetic verifier only illustrates a future trusted storage contract',()=>{const c=config('ebay','qbo','production');assert.equal(checkExperience('ebay-qbo',c,NOW,()=>true).customerReady,true)});

for (const field of ['boundSourceId','boundDestinationId','mappingRevision']) test('acceptance expires on changed '+field,()=>{
  const c=config();c[field]='changed-binding';
  assert.equal(checkExperience('ebay-qbo',c,NOW,()=>true).allowed,false);
});
test('trusted verifier sees immutable account and mapping context',()=>{
  let seen;
  const c=config();checkExperience('ebay-qbo',c,NOW,(_,ctx)=>{seen=ctx;return true});
  assert.equal(seen.boundSourceId,c.boundSourceId);assert.equal(seen.boundDestinationId,c.boundDestinationId);assert.equal(seen.mappingRevision,c.mappingRevision);
});
test('verifier exceptions fail closed rather than opening readiness',()=>{
  assert.equal(checkExperience('ebay-qbo',config(),NOW,()=>{throw Error('unavailable')}).allowed,false);
});
test('multichannel acceptance expires when accepted channel membership changes',()=>{
  const c=config('multichannel');c.channelConfigs=[config('shopify'),config('paypal')];
  for(const e of Object.values(c.evidence))e.channelBindingFingerprint=channelBindingFingerprint(c);
  assert.equal(checkExperience('multichannel-qbo',c,NOW,()=>true).allowed,true);
  c.channelConfigs=[config('shopify'),config('etsy')];
  assert.equal(checkExperience('multichannel-qbo',c,NOW,()=>true).allowed,false);
});
test('consent snapshots context before awaiting atomic consumption',async()=>{
 const {store,arg}=await started();const originalTake=store.take;const mutable={...arg.context};store.take=async k=>{const result=await originalTake(k);mutable.tenantId='attacker';mutable.sessionId='changed';return result;};const result=await consumeConsent({...arg,context:mutable},options(store));assert.equal(result.tenantId,'synthetic-tenant');
});
test('consent rejects authorization config change and consumes state',async()=>{
 const store=consentStore();const b=await beginConsent(context,{...options(store),authorizationBinding:'a'.repeat(64)});await assert.rejects(()=>consumeConsent({state:b.state,context,callbackUrl:callback,authorizationCode:'SYNTHETIC-CODE'},{...options(store),authorizationBinding:'b'.repeat(64)}),/configuration changed/);assert.equal(store.map.size,0);
});
