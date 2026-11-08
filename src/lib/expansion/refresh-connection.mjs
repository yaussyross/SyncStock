import { refreshProviderTokens } from './provider-oauth.mjs';
export class ConnectionRefreshError extends Error {
  constructor(code,message){super(message);this.name='ConnectionRefreshError';this.code=code;}
}
/** Trusted server orchestration only. No public route. The durable store owns the
 * exclusive claim and atomic encrypted replacement; no secret is returned here.
 */
export async function refreshStoredConnection(binding,{store,client,fetchImpl,deadlineMs,maxResponseBytes,clock}={}) {
  if(!store||['claimRefresh','commitRefresh','holdRefresh'].some(k=>typeof store[k]!=='function')) throw new ConnectionRefreshError('STORE_REQUIRED','A durable encrypted refresh store is required.');
  let claim;
  try{claim=await store.claimRefresh(binding);}catch{throw new ConnectionRefreshError('REFRESH_UNAVAILABLE','Connection is unavailable, changed or already refreshing.');}
  let replacement;
  try{replacement=await refreshProviderTokens(claim,{fetchImpl,deadlineMs,maxResponseBytes,clock,client,credential:claim.credential});}
  catch(error){
    const reason=error?.code==='RECONSENT_REQUIRED'?'RECONSENT_REQUIRED':error?.outcome==='not_sent'?'LOCAL_REJECTION':'OUTCOME_UNKNOWN';
    try{await store.holdRefresh(claim,reason);}catch{/* A durable in-flight claim remains non-reusable if the DB is unavailable. */}
    throw new ConnectionRefreshError(reason,'Connection refresh is held; reconcile or obtain fresh consent before retrying.');
  }
  try{return await store.commitRefresh(claim,replacement);}
  catch{
    try{await store.holdRefresh(claim,'PERSISTENCE_FAILED');}catch{/* Never release a claim after an uncertain token-storage outcome. */}
    throw new ConnectionRefreshError('PERSISTENCE_FAILED','Refresh storage outcome is uncertain; check the stored revision before any further attempt.');
  }
}
