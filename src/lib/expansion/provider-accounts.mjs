/** Provider-origin identity evidence. Proofs are opaque process-local capabilities,
 * bound to the exact stored access token and revision; browser JSON cannot forge them.
 */
import { createHash } from 'node:crypto';
export class AccountDiscoveryError extends Error { constructor(code,message){super(message);this.name='AccountDiscoveryError';this.code=code;} }
/** @type {(code: string, message: string) => never} */
const fail=(code,message)=>{throw new AccountDiscoveryError(code,message)};
const proofs=new WeakMap();
const hash=value=>createHash('sha256').update(value).digest('hex');
const safe=(value,max=200)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\s\x00-\x1f\x7f]/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const label=(value,fallback)=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f\x7f]/.test(value)?value:fallback;
const timeout=()=>new AccountDiscoveryError('DISCOVERY_TIMEOUT','Provider identity read exceeded its deadline.');
function abortable(promise,signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(timeout());const abort=()=>reject(timeout());signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});}
function cancel(body){try{void body?.cancel().catch(()=>{});}catch{}}
async function json(response,signal,maxBytes){
 if(!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))fail('INVALID_IDENTITY','Provider identity response is not JSON.');
 const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes))fail('IDENTITY_LIMIT','Provider identity response exceeded its size limit.');
 if(!response.body)fail('INVALID_IDENTITY','Provider identity response is empty.');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const{done,value}=await abortable(reader.read(),signal);if(done)break;size+=value.byteLength;if(size>maxBytes)fail('IDENTITY_LIMIT','Provider identity response exceeded its size limit.');chunks.push(Buffer.from(value));}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{fail('INVALID_IDENTITY','Provider identity JSON is invalid.');}
 }finally{try{void reader.cancel().catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}
}
/** @param {any} binding
 * @param {{credential?: any, fetchImpl?: typeof fetch, clock?: () => number, deadlineMs?: number, maxResponseBytes?: number}} options
 */
export async function discoverProviderAccounts(binding,{credential,fetchImpl=globalThis.fetch,clock=Date.now,deadlineMs=10000,maxResponseBytes=65536}={}){
 if(!binding||!credential||['tenantId','connectionId','version'].some(k=>credential[k]!==binding[k])||!safe(binding.tenantId)||!safe(binding.connectionId)||!Number.isSafeInteger(binding.version)||binding.version<1||!safe(credential.accessToken,16384)||!safe(credential.clientId,512)||typeof credential.authorizationBinding!=='string'||!/^[a-f0-9]{64}$/.test(credential.authorizationBinding))fail('CREDENTIAL_BINDING','A trusted credential matching the exact connection revision is required.');
 if(typeof fetchImpl!=='function'||typeof clock!=='function'||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>30000||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1||maxResponseBytes>262144)fail('INVALID_LIMIT','Invalid identity transport configuration.');
 const now=clock();if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(credential.expiresAt)||credential.expiresAt<=now)fail('ACCESS_EXPIRED','A current access credential is required.');
 if(credential.provider==='ebay'&&credential.environment==='sandbox')fail('SANDBOX_IDENTITY_UNVERIFIABLE','eBay sandbox getUser returns mock data and cannot prove seller ownership.');
 let endpoint;
 if(credential.provider==='xero'&&credential.environment==='production'&&credential.scopes?.includes('accounting.settings.read'))endpoint='https://api.xero.com/connections';
 else if(credential.provider==='ebay'&&credential.environment==='production'&&credential.scopes?.includes('https://api.ebay.com/oauth/api_scope/commerce.identity.readonly'))endpoint='https://apiz.ebay.com/commerce/identity/v1/user/';
 else fail('IDENTITY_NOT_SUPPORTED','Provider, environment or identity scope is unsupported.');
 const evidence={tenantId:binding.tenantId,connectionId:binding.connectionId,version:binding.version,provider:credential.provider,environment:credential.environment,clientId:credential.clientId,authorizationBinding:credential.authorizationBinding,accessFingerprint:hash(credential.accessToken),expiresAt:credential.expiresAt,discoveredAt:now};
 const authorization=`Bearer ${credential.accessToken}`,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),deadlineMs);let response;
 try{
  const pending=Promise.resolve(fetchImpl(endpoint,{method:'GET',headers:{Authorization:authorization,Accept:'application/json'},redirect:'error',cache:'no-store',signal:controller.signal}));
  void pending.then(r=>{if(controller.signal.aborted)cancel(r?.body)},()=>{});
  response=await abortable(pending,controller.signal);
  if(response.redirected||(response.url&&response.url!==endpoint))fail('IDENTITY_REDIRECT','Provider identity redirects are forbidden.');
  if(response.status!==200)fail('IDENTITY_UNAVAILABLE','Provider did not authorize a valid account-identity response.');
  const body=await json(response,controller.signal,maxResponseBytes),end=clock();
  if(!Number.isSafeInteger(end)||end<now||end-now>=deadlineMs||end>=evidence.expiresAt||controller.signal.aborted)throw timeout();
  let accounts;
  if(evidence.provider==='xero'){
   if(!Array.isArray(body)||body.length>100)fail('INVALID_IDENTITY','Xero connections response is invalid or exceeds the account limit.');
   accounts=[];const seen=new Set();
   for(const item of body){
    if(!item||!uuid(item.id)||!uuid(item.tenantId)||!['ORGANISATION','PRACTICEMANAGER','PRACTICE'].includes(item.tenantType))fail('INVALID_IDENTITY','Xero returned an invalid connection identity.');
    if(item.tenantType!=='ORGANISATION')continue;
    const accountId=item.tenantId.toLowerCase();if(seen.has(accountId))fail('AMBIGUOUS_IDENTITY','Xero returned duplicate organization identities.');seen.add(accountId);
    accounts.push(Object.freeze({accountId,providerConnectionId:item.id.toLowerCase(),label:label(item.tenantName,'Xero organization')}));
   }
  }else{
   if(!body||Array.isArray(body)||!safe(body.userId,256)||body.errors||body.warnings)fail('INVALID_IDENTITY','eBay returned no unambiguous immutable user identity.');
   accounts=[Object.freeze({accountId:body.userId,providerConnectionId:null,label:'eBay account'})];
  }
  const proof=Object.freeze({});proofs.set(proof,Object.freeze({...evidence,accounts:Object.freeze(accounts)}));
  return Object.freeze({accounts:Object.freeze(accounts),proof});
 }catch(error){if(error instanceof AccountDiscoveryError)throw error;fail('IDENTITY_UNAVAILABLE','Provider identity read could not complete.');}
 finally{clearTimeout(timer);controller.abort();cancel(response?.body);}
}
/** Only the token store should consume a proof. It supplies metadata and the
 * current decrypted credential, not caller-selected identity claims.
 */
export function consumeAccountProof(proof,expected,selectedAccountId,now=Date.now()){
 const value=proof&&proofs.get(proof);
 if(!value||!Number.isSafeInteger(now)||now<value.discoveredAt||now-value.discoveredAt>60000||now>=value.expiresAt||['tenantId','connectionId','version','provider','environment','clientId','authorizationBinding'].some(k=>expected[k]!==value[k])||value.accessFingerprint!==hash(expected.accessToken))fail('ACCOUNT_PROOF_INVALID','Fresh provider identity evidence for this exact credential is required.');
 const account=value.accounts.find(a=>a.accountId===selectedAccountId);if(!account)fail('ACCOUNT_NOT_AUTHORIZED','Selected account is not in this grant.');
 proofs.delete(proof);
 return Object.freeze({accountId:account.accountId,providerConnectionId:account.providerConnectionId,verifiedAt:now});
}
