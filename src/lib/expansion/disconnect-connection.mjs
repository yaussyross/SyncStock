/** Narrow Xero organisation removal, never whole-grant revocation.
 * Official contract: DELETE /connections/{id}, Bearer token, exact 204 success.
 * https://developer.xero.com/documentation/guides/oauth2/tenants/
 * https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/master/xero-identity.yaml
 * A successful DELETE does NOT invalidate tokens or disconnect other tenants.
 */
import { discoverProviderAccounts } from './provider-accounts.mjs';
import { TokenStoreError } from './token-store.mjs';
/** @param {any} binding
 * @param {string} mode
 * @param {{store:any,fetchImpl?:typeof fetch,clock?:()=>number,deadlineMs?:number}} options
 */
export async function disconnectConnection(binding, mode, {store,fetchImpl=globalThis.fetch,clock=Date.now,deadlineMs=10000}) {
  if(!store||typeof fetchImpl!=='function'||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>30000||!['local_only','bound_organization'].includes(mode))throw new TokenStoreError('INVALID_DISCONNECT','Invalid disconnect configuration.');
  let proof;
  if(mode==='bound_organization'){
    const credential=await store.getAccessCredential(binding);
    if(credential.provider!=='xero'||!credential.accountBinding)throw new TokenStoreError('DISCONNECT_UNAVAILABLE','A bound Xero organisation is required.');
    ({proof}=await discoverProviderAccounts(binding,{credential,fetchImpl,clock,deadlineMs}));
  }
  const claim=await store.beginDisconnect(binding,mode,proof);
  if(mode==='local_only')return claim.summary;
  const authorizedNow=clock();
  if(!claim.remoteReady||!Number.isSafeInteger(authorizedNow)||authorizedNow<claim.checkedAt||authorizedNow<claim.notBefore||authorizedNow>=claim.notAfter)return claim.summary;
  const credential=claim.credential,endpoint=`https://api.xero.com/connections/${encodeURIComponent(credential.accountBinding.providerConnectionId)}`;
  const controller=new AbortController();let timer,response;
  const cancel=r=>{try{void r?.body?.cancel().catch(()=>{});}catch{}};
  try{
    // Never retry, follow redirects, refresh, or expose response/error bodies.
    const pending=Promise.resolve().then(()=>{
      const at=clock();
      if(!Number.isSafeInteger(at)||at<authorizedNow||at>=claim.notAfter)throw Error();
      return fetchImpl(endpoint,{method:'DELETE',headers:{Authorization:`Bearer ${credential.accessToken}`},redirect:'error',cache:'no-store',signal:controller.signal});
    });
    void pending.then(r=>{if(controller.signal.aborted)cancel(r);},()=>{});
    response=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error());},deadlineMs);})]);
    if(response.status!==204||response.redirected||(response.url&&response.url!==endpoint)||controller.signal.aborted)return claim.summary;
    await store.completeDisconnect(claim.binding,claim.attemptToken);
    return Object.freeze({...claim.summary,disconnectOutcome:'disconnected'});
  }catch{
    // Includes unknown persistence outcome after success. Status can reconcile
    // a committed result; no path authorizes a second provider DELETE.
    return claim.summary;
  }finally{clearTimeout(timer);controller.abort();cancel(response);}
}
