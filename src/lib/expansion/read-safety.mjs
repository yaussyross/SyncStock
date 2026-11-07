// Pure request validation; no fetch, no default credentials, no accounting transport.
const ORIGINS={ebay:{sandbox:'https://api.sandbox.ebay.com',production:'https://api.ebay.com'},qbo:{sandbox:'https://sandbox-quickbooks.api.intuit.com',production:'https://quickbooks.api.intuit.com'},xero:{production:'https://api.xero.com'}};
const PREFIX={ebay:['/sell/fulfillment/v1/order'],qbo:['/v3/company/'],xero:['/api.xro/2.0/']};
export function validateReadRequest({provider,environment,tenantId,boundTenantId,url,method='GET',accountId,boundAccountId}){
 if(!tenantId||tenantId!==boundTenantId)throw new Error('Tenant isolation violation');
 if(typeof accountId!=='string'||!accountId||accountId!==boundAccountId)throw new Error('Provider account isolation violation');
 if(method!=='GET')throw new Error('This adapter is read-only');
 const expected=ORIGINS[provider]?.[environment];if(!expected)throw new Error('Provider/environment is not accepted by this transport');
 const u=new URL(url);if(u.origin!==expected||u.username||u.password||u.hash)throw new Error('Untrusted provider URL');
 if(!PREFIX[provider].some(p=>u.pathname===p||u.pathname.startsWith(p.endsWith('/')?p:p+'/')))throw new Error('Provider resource is not accepted');
 if(provider==='qbo'&&(!/^\d+$/.test(accountId||'')||!u.pathname.startsWith(`/v3/company/${accountId}/`)))throw new Error('QuickBooks company mismatch');
 if([...u.searchParams.keys()].some(k=>/token|secret|password|authorization/i.test(k)))throw new Error('Credentials must not be in URLs');
 return {method:'GET',url:u.href,redirect:'error',tenantId,accountId,provider,environment};
}
export function parseUsd(value){if(typeof value!=='string'||!/^\d{1,12}(\.\d{1,2})?$/.test(value))throw new Error('Unsupported USD amount');const [a,b='']=value.split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));}
export function retryDelay({status,attempt,retryAfter,now=Date.now()}){if(!Number.isInteger(attempt)||attempt<0||attempt>=4||![429,500,502,503,504].includes(status))return null;let ms;if(typeof retryAfter==='string'&&/^\d+$/.test(retryAfter))ms=Number(retryAfter)*1000;else if(typeof retryAfter==='string'&&Number.isFinite(Date.parse(retryAfter)))ms=Date.parse(retryAfter)-now;else ms=1000*(2**attempt);if(!Number.isFinite(ms)||ms<0||ms>60000)return null;return Math.max(1000,ms);}
