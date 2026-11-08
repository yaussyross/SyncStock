import {discoverProviderAccounts} from './provider-accounts.mjs';
/** Inputs are authenticated tenant/revision bindings, never browser credentials. */
export async function listConnectionAccounts(binding,{store,fetchImpl,clock,deadlineMs,maxResponseBytes}={}){
 const bound={tenantId:binding?.tenantId,connectionId:binding?.connectionId,version:binding?.version};
 const credential=await store.getAccessCredential(bound);
 const result=await discoverProviderAccounts(bound,{fetchImpl,clock,deadlineMs,maxResponseBytes,credential});
 return {connectionId:bound.connectionId,version:bound.version,provider:credential.provider,accounts:result.accounts,customerReady:false};
}
export async function bindConnectionAccount(binding,selectedAccountId,{store,fetchImpl,clock,deadlineMs,maxResponseBytes}={}){
 const bound={tenantId:binding?.tenantId,connectionId:binding?.connectionId,version:binding?.version};
 const credential=await store.getAccessCredential(bound);
 const result=await discoverProviderAccounts(bound,{fetchImpl,clock,deadlineMs,maxResponseBytes,credential});
 return store.bindVerifiedAccount(bound,selectedAccountId,result.proof);
}
