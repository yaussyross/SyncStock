import test from 'node:test';
import assert from 'node:assert/strict';
import { readXeroAccounts, readEbayOrders } from '../../src/lib/expansion/native-reads.mjs';
const binding = provider => ({ provider, environment: provider === 'xero' ? 'production' : 'sandbox', tenantId: 'fictional-tenant', accountId: 'fictional-account' });
const options = (provider, body) => ({ credential: { ...binding(provider), accessToken: 'FICTIONAL-ACCESS-TOKEN' }, fetchImpl: async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) });
const xero = () => ({ Status: 'OK', Accounts: [{ AccountID: 'account-1', Type: 'BANK', Status: 'ACTIVE', Code: '101', Name: 'Checking', CurrencyCode: 'USD', BankAccountNumber: 'OMIT-PRIVATE-BANK-NUMBER', Balance: 999, TaxType: 'NONE' }] });
const window = { createdFrom: '2026-11-01T00:00:00.000Z', createdTo: '2026-11-02T00:00:00.000Z', pageSize: 1 };
const ebay = () => ({ total: 1, offset: 0, limit: 1, orders: [{ orderId: 'order-1', orderPaymentStatus: 'PAID', orderFulfillmentStatus: 'NOT_STARTED', buyer: { email: 'omit@example.invalid' } }] });
test('native Xero read strips bank identifiers and never infers accounting roles', async () => {
  const result = await readXeroAccounts(binding('xero'), options('xero',xero()));
  assert.deepEqual(result.records, [{ id: 'account-1', type: 'BANK', status: 'ACTIVE', code: '101', name: 'Checking', currency: 'USD', taxType: 'NONE' }]);
  assert.equal(result.accountingMappingVerified,false); assert.equal(result.customerReady,false);
});
for (const variant of ['missing-array','duplicate','invalid-status','error']) test('native Xero rejects '+variant, async () => {
  const data=xero(); if(variant==='missing-array')delete data.Accounts;if(variant==='duplicate')data.Accounts.push({...data.Accounts[0]});if(variant==='invalid-status')data.Accounts[0].Status='UNKNOWN';if(variant==='error')data.ErrorNumber=10;
  await assert.rejects(()=>readXeroAccounts(binding('xero'),options('xero',data)));
});
test('native eBay read retains operational IDs but not buyer information', async()=>{
  const result=await readEbayOrders(binding('ebay'),{...window,...options('ebay',ebay())});
  assert.deepEqual(result.records,[{id:'order-1',paymentStatus:'PAID',fulfillmentStatus:'NOT_STARTED'}]);assert.equal(result.financialEvidence,false);
});
test('native eBay follows a verified unchanged pagination window',async()=>{
  let calls=0;const opts=options('ebay',{});opts.fetchImpl=async url=>{calls++;const next=new URL(url);next.searchParams.set('offset','1');return new Response(JSON.stringify({total:2,offset:calls-1,limit:1,orders:[{orderId:'order-'+calls}],...(calls===1?{next:next.href}:{})}),{headers:{'content-type':'application/json'}});};
  const result=await readEbayOrders(binding('ebay'),{...window,...opts});assert.equal(result.records.length,2);assert.equal(calls,2);
});
for(const variant of ['missing-next','changed-filter','duplicate-order','changed-total','missing-orders','wrong-offset','warning'])test('native eBay fails closed on '+variant,async()=>{
  let calls=0;const opts=options('ebay',{});opts.fetchImpl=async url=>{calls++;const next=new URL(url);next.searchParams.set('offset','1');if(variant==='changed-filter')next.searchParams.set('filter','other');const data={total:2,offset:calls-1,limit:1,orders:[{orderId:variant==='duplicate-order'?'order-1':'order-'+calls}],...(calls===1?{next:next.href}:{})};if(variant==='missing-next')delete data.next;if(variant==='changed-total'&&calls===2)data.total=1;if(variant==='missing-orders')data.orders=[];if(variant==='wrong-offset')data.offset=3;if(variant==='warning')data.warnings=[{message:'partial result'}];return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});};
  await assert.rejects(()=>readEbayOrders(binding('ebay'),{...window,...opts}));
});
test('native eBay zero orders is an explicit empty complete traversal',async()=>{
  const result=await readEbayOrders(binding('ebay'),{...window,...options('ebay',{total:0,offset:0,limit:1})});assert.equal(result.records.length,0);
});
test('native eBay refuses unbounded or invalid date windows',async()=>{
  await assert.rejects(()=>readEbayOrders(binding('ebay'),options('ebay',ebay())));
  await assert.rejects(()=>readEbayOrders(binding('ebay'),{...window,createdTo:'2026-02-31T00:00:00.000Z',...options('ebay',ebay())}));
});
