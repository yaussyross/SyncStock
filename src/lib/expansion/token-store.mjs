/** Server-only encrypted grant storage. Claims are durable and never automatically
 * reclaimed. "available" means refreshable, not account-verified or customer-ready.
 */
import { randomBytes, createHash } from 'node:crypto';
import {consumeAccountProof,consumeDisconnectProof} from './provider-accounts.mjs';
export class TokenStoreError extends Error {
  constructor(code, message) { super(message); this.name = 'TokenStoreError'; this.code = code; }
}
/** @type {(code: string, message: string) => never} */
const fail = (code, message) => { throw new TokenStoreError(code, message); };
const hash = value => createHash('sha256').update(value).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const safe = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\s\x00-\x1f\x7f]/.test(value);
const fingerprint = c => hash(JSON.stringify([c.provider,c.environment,c.clientId,c.refreshToken]));
const fields = ['provider','environment','tenantId','clientId','authorizationBinding'];
const scopes = { xero: ['accounting.settings.read','offline_access'], ebay: ['https://api.ebay.com/oauth/api_scope/commerce.identity.readonly','https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly'] };
const accountKey=(credential,account)=>hash(JSON.stringify([credential.provider,credential.environment,credential.clientId,account.accountId]));
const accountData=(value,provider)=>{
 if(value===undefined||value===null)return null;
 if(!safe(value.accountId,256)||!Number.isSafeInteger(value.verifiedAt)||value.verifiedAt<0||!(value.providerConnectionId===null||safe(value.providerConnectionId,200))||(provider==='xero'&&!value.providerConnectionId)||(provider==='ebay'&&value.providerConnectionId!==null))fail('INVALID_ACCOUNT_BINDING','Invalid provider-account binding.');
 return {accountId:value.accountId,providerConnectionId:value.providerConnectionId,verifiedAt:value.verifiedAt};
};
function binding(input) {
  if (!input || !safe(input.connectionId) || !safe(input.tenantId) || !Number.isSafeInteger(input.version) || input.version < 1 || input.version > 2147483647) fail('INVALID_BINDING', 'An exact tenant, connection and revision are required.');
  return { connectionId: input.connectionId, tenantId: input.tenantId, version: input.version };
}
function tokens(input) {
  if (!input || !scopes[input.provider] || !['production', ...(input.provider === 'ebay' ? ['sandbox'] : [])].includes(input.environment) || !safe(input.tenantId) || !safe(input.clientId,512) || !isHash(input.authorizationBinding) || !safe(input.accessToken,16384) || !safe(input.refreshToken,16384) || input.tokenType !== 'Bearer' || !Number.isSafeInteger(input.expiresAt) || input.expiresAt < 0 || !Number.isSafeInteger(input.refreshExpiresAt) || input.refreshExpiresAt < 0 || !Array.isArray(input.scopes) || !(input.scopes.join(' ')===scopes[input.provider].join(' ')||(input.provider==='ebay'&&input.scopes.join(' ')==='https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly'))) fail('INVALID_CREDENTIAL', 'Grant does not match the supported encrypted credential contract.');
  return { provider: input.provider, environment: input.environment, tenantId: input.tenantId, clientId: input.clientId, authorizationBinding: input.authorizationBinding, accessToken: input.accessToken, refreshToken: input.refreshToken, tokenType: 'Bearer', expiresAt: input.expiresAt, refreshExpiresAt: input.refreshExpiresAt, scopes: [...input.scopes], accountBinding:accountData(input.accountBinding,input.provider) };
}
const summary = row => Object.freeze({ connectionId: row.id, tenantId: row.tenantId, provider: row.provider, environment:row.environment,clientId:row.clientId,authorizationBinding:row.authorizationBinding,version: row.version, status: row.status, accountStatus:row.providerAccountId?'bound':'unbound',providerAccountId:row.providerAccountId??null,disconnectOutcome:row.disconnectOutcome??null,customerReady:false });
const key = b => ({ id: b.connectionId, tenantId: b.tenantId, version: b.version });
export function createTokenStore({ client, encrypt, decrypt, clock = Date.now }) {
  const table = client?.expansionOAuthGrant;
  if (!table || ['create','findFirst','findMany','updateMany'].some(method => typeof table[method] !== 'function') || typeof encrypt !== 'function' || typeof decrypt !== 'function' || typeof clock !== 'function') fail('STORE_CONFIGURATION', 'Shared grant storage and authenticated encryption are required.');
  const now = () => { const n=clock(); if (!Number.isSafeInteger(n)||n<0) fail('INVALID_CLOCK','Invalid grant-store clock.'); return n; };
  async function query(operation) { try { return await operation(); } catch { fail('STORE_UNAVAILABLE','Encrypted grant storage could not complete the operation.'); } }
  function seal(connectionId, version, credential, initialFingerprint=fingerprint(credential)) {
    let ciphertext;
    try { ciphertext=encrypt(JSON.stringify({ format:1, connectionId, version, initialFingerprint, credential })); } catch { fail('ENCRYPTION_FAILED','Grant could not be encrypted.'); }
    if (typeof ciphertext!=='string'||!ciphertext.startsWith('v2:')||ciphertext.length>131072||ciphertext.includes(credential.accessToken)||ciphertext.includes(credential.refreshToken)) fail('ENCRYPTION_FAILED','Authenticated encrypted grant storage is required.');
    return ciphertext;
  }
  function open(row) {
    try {
      const e=JSON.parse(decrypt(row.ciphertext)), credential=tokens(e.credential);
      if(e.format!==1||!isHash(e.initialFingerprint)||e.initialFingerprint!==row.initialGrantFingerprint||e.connectionId!==row.id||e.version!==row.version||fields.some(k=>credential[k]!==row[k])||fingerprint(credential)!==row.refreshFingerprint) throw Error();
      const account=credential.accountBinding;
      if(account ? row.providerAccountId!==account.accountId||row.providerConnectionId!==account.providerConnectionId||new Date(row.accountVerifiedAt).valueOf()!==account.verifiedAt||row.accountBindingKey!==accountKey(credential,account) : row.providerAccountId!=null||row.providerConnectionId!=null||row.accountVerifiedAt!=null||row.accountBindingKey!=null)throw Error();
      return credential;
    } catch { fail('STORED_BINDING_INVALID','Encrypted grant identity or revision could not be verified.'); }
  }
  function claimKey(input) {
    const b=binding(input);
    if(!safe(input.claimToken,100)||!/^[A-Za-z0-9_-]{43}$/.test(input.claimToken)) fail('INVALID_CLAIM','An exact refresh claim is required.');
    return { ...key(b),status:'refreshing',claimHash:hash(input.claimToken) };
  }
  return Object.freeze({
    async insertUnboundGrant(input) {
      const credential=tokens(input), current=now();
      if(typeof input.grantId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.grantId)||input.status!=='account_binding_required'||input.providerAccountId!==null||input.customerReady!==false||credential.accountBinding!==null||credential.expiresAt<=current||credential.refreshExpiresAt<=current) fail('INVALID_CREDENTIAL','A current unbound grant from the trusted exchange is required.');
      const id=input.grantId, ciphertext=seal(id,1,credential);
      const data={id,tenantId:credential.tenantId,provider:credential.provider,environment:credential.environment,clientId:credential.clientId,authorizationBinding:credential.authorizationBinding,version:1,status:'available',ciphertext,refreshFingerprint:fingerprint(credential),initialGrantFingerprint:fingerprint(credential),providerAccountId:null,providerConnectionId:null,accountVerifiedAt:null,accountBindingKey:null,claimHash:null,claimStartedAt:null,lastErrorCode:null,disconnectOutcome:null,disconnectAccountId:null,disconnectConnectionId:null,disconnectAttemptHash:null,disconnectStartedAt:null};
      try{return summary(await table.create({data}));}
      catch{
        // Retry persistence of the same exchange result safely, including when
        // the first INSERT committed but its response was lost. Never overwrite.
        const existing=await query(()=>table.findFirst({where:{id,tenantId:credential.tenantId}}));
        if(existing&&existing.version===1&&existing.status!=='revoked'){
          const stored=open(existing);
          if(JSON.stringify(stored)===JSON.stringify(credential))return summary(existing);
        }
        fail('GRANT_NOT_STORED','Grant could not be stored or already belongs to another connection.');
      }
    },
    async getSummary(input) {
      if(!input||!safe(input.connectionId)||!safe(input.tenantId)) fail('INVALID_BINDING','An exact tenant and connection are required.');
      const row=await query(()=>table.findFirst({where:{id:input.connectionId,tenantId:input.tenantId}}));
      if(row&&row.status!=='revoked')open(row);
      return row?summary(row):null;
    },
    async getAccessCredential(input) {
      const b=binding(input);
      const row=await query(()=>table.findFirst({where:{...key(b),status:'available',claimHash:null}}));
      if(!row)fail('CREDENTIAL_UNAVAILABLE','Connection is unavailable, changed, held or refreshing.');
      const credential=open(row),current=now();if(credential.expiresAt<=current)fail('ACCESS_EXPIRED','Refresh or reconnect before reading provider identity.');
      return Object.freeze({...credential,...b,scopes:Object.freeze([...credential.scopes]),accountBinding:credential.accountBinding?Object.freeze({...credential.accountBinding}):null});
    },
    async bindVerifiedAccount(input, selectedAccountId, proof) {
      const b=binding(input);
      if(b.version>=2147483646||!safe(selectedAccountId,256))fail('INVALID_ACCOUNT_BINDING','Invalid account selection or exhausted connection revision.');
      const row=await query(()=>table.findFirst({where:{...key(b),status:'available',claimHash:null}}));
      if(!row)fail('CREDENTIAL_UNAVAILABLE','Connection changed or cannot be bound.');
      const credential=open(row),current=now();
      const account=consumeAccountProof(proof,{...credential,...b},selectedAccountId,current);
      if(credential.accountBinding){
        if(credential.accountBinding.accountId!==account.accountId||credential.accountBinding.providerConnectionId!==account.providerConnectionId)fail('ACCOUNT_REBIND_REJECTED','Disconnect and obtain fresh consent to bind a different account.');
        return summary(row);
      }
      const next={...credential,accountBinding:account},version=b.version+1,ciphertext=seal(b.connectionId,version,next,row.initialGrantFingerprint);
      const data={ciphertext,version,providerAccountId:account.accountId,providerConnectionId:account.providerConnectionId,accountVerifiedAt:new Date(account.verifiedAt),accountBindingKey:accountKey(credential,account)};
      const updated=await query(()=>table.updateMany({where:{...key(b),status:'available',claimHash:null,ciphertext:row.ciphertext},data}));
      if(updated.count!==1)fail('STALE_BINDING','Connection changed while account ownership was being verified.');
      return summary({...row,...data});
    },
    async claimRefresh(input) {
      const b=binding(input), current=now();
      if(b.version>=2147483646) fail('RECONSENT_REQUIRED','Connection revision is exhausted; revoke and reconnect.');
      const row=await query(()=>table.findFirst({where:{...key(b),status:'available',claimHash:null}}));
      if(!row) fail('REFRESH_UNAVAILABLE','Connection is unavailable, held, changed or already refreshing.');
      const credential=open(row);
      if(credential.refreshExpiresAt<=current) fail('RECONSENT_REQUIRED','Stored refresh credential has expired.');
      const claimToken=randomBytes(32).toString('base64url'), where={...key(b),status:'available',claimHash:null,ciphertext:row.ciphertext};
      const changed=await query(()=>table.updateMany({where,data:{status:'refreshing',claimHash:hash(claimToken),claimStartedAt:new Date(current),lastErrorCode:null}}));
      if(changed.count!==1) fail('REFRESH_UNAVAILABLE','Another worker acquired or changed this connection.');
      return Object.freeze({...b,claimToken,credential:Object.freeze({...credential,...b,scopes:Object.freeze([...credential.scopes])})});
    },
    async commitRefresh(input, replacement) {
      const where=claimKey(input), b=binding(input), next=tokens(replacement), current=now();
      if(b.version>=2147483646) fail('RECONSENT_REQUIRED','Connection revision is exhausted; revoke and reconnect.');
      if(replacement.connectionId!==b.connectionId||replacement.tenantId!==b.tenantId||replacement.expectedVersion!==b.version||replacement.version!==b.version||next.expiresAt<=current||next.refreshExpiresAt<=current) fail('REPLACEMENT_REJECTED','Replacement token pair does not match the held refresh claim.');
      const row=await query(()=>table.findFirst({where}));
      if(!row) fail('STALE_CLAIM','Refresh claim is no longer current.');
      const prior=open(row);
      if(next.accountBinding!==null&&JSON.stringify(next.accountBinding)!==JSON.stringify(prior.accountBinding))fail('REPLACEMENT_REJECTED','Refresh cannot change the provider-account binding.');
      next.accountBinding=prior.accountBinding;
      if(fields.some(k=>prior[k]!==next[k])||prior.scopes.join(' ')!==next.scopes.join(' ')||(row.provider==='ebay'&&(next.refreshToken!==prior.refreshToken||next.refreshExpiresAt>prior.refreshExpiresAt))||(row.provider==='xero'&&next.refreshToken===prior.refreshToken)) fail('REPLACEMENT_REJECTED','Replacement changed the bound grant or invalidated refresh rotation.');
      const version=b.version+1, ciphertext=seal(b.connectionId,version,next,row.initialGrantFingerprint);
      // One atomic compare-and-swap stores the entire encrypted pair. A crash or
      // unknown DB outcome never releases the old claim for another refresh.
      const updated=await query(()=>table.updateMany({where:{...where,ciphertext:row.ciphertext},data:{ciphertext,refreshFingerprint:fingerprint(next),version,status:'available',claimHash:null,claimStartedAt:null,lastErrorCode:null}}));
      if(updated.count!==1) fail('STALE_CLAIM','Refresh was revoked or changed before storage.');
      return summary({...row,version,status:'available'});
    },
    async holdRefresh(input, reason='OUTCOME_UNKNOWN') {
      const where=claimKey(input);
      if(!['OUTCOME_UNKNOWN','RECONSENT_REQUIRED','LOCAL_REJECTION','PERSISTENCE_FAILED'].includes(reason)) fail('INVALID_HOLD','A supported safe hold reason is required.');
      const result=await query(()=>table.updateMany({where,data:{status:'held',claimHash:null,claimStartedAt:null,lastErrorCode:reason}}));
      return result.count===1;
    },
    // Destruction is the durable, one-way claim. No provider write is allowed
    // until this CAS succeeds unambiguously; a lost response cannot be retried.
    async beginDisconnect(input, mode, proof) {
      const b=binding(input);
      if(b.version>=2147483647)fail('DISCONNECT_UNAVAILABLE','Connection revision is exhausted.');
      if(!['local_only','bound_organization'].includes(mode))fail('INVALID_DISCONNECT','An explicit disconnect mode is required.');
      const row=await query(()=>table.findFirst({where:key(b)}));
      if(!row||row.status==='revoked'||row.disconnectOutcome!=null)fail('DISCONNECT_UNAVAILABLE','Connection changed or already disconnected.');
      const credential=open(row),current=now();let freshness=null;
      if(credential.provider!=='xero'||credential.environment!=='production')fail('DISCONNECT_UNAVAILABLE','Only Xero disconnect is supported.');
      if(mode==='bound_organization'){
        if(row.status!=='available'||row.claimHash!==null||credential.expiresAt<=current||!credential.accountBinding)fail('DISCONNECT_UNAVAILABLE','A current bound connection is required.');
        freshness=consumeDisconnectProof(proof,{...credential,...b},credential.accountBinding.accountId,current);
        if(freshness.account.providerConnectionId!==credential.accountBinding.providerConnectionId)fail('DISCONNECT_UNAVAILABLE','Provider connection identity changed.');
      }
      const attemptToken=randomBytes(32).toString('base64url');
      const data={ciphertext:null,providerAccountId:null,providerConnectionId:null,accountVerifiedAt:null,accountBindingKey:null,status:'revoked',version:b.version+1,claimHash:null,claimStartedAt:null,lastErrorCode:'REVOKED',
        disconnectOutcome:mode==='local_only'?'local_only':'outcome_unknown',disconnectAccountId:credential.accountBinding?.accountId??null,disconnectConnectionId:credential.accountBinding?.providerConnectionId??null,disconnectAttemptHash:hash(attemptToken),disconnectStartedAt:new Date(current)};
      const changed=await query(()=>table.updateMany({where:{...key(b),status:row.status,ciphertext:row.ciphertext,claimHash:row.claimHash},data}));
      if(changed.count!==1)fail('DISCONNECT_UNAVAILABLE','Connection changed before credential destruction.');
      const checkedAt=now(),notBefore=freshness?.discoveredAt??current,notAfter=freshness?Math.min(freshness.expiresAt,freshness.discoveredAt+60000):current;
      return Object.freeze({binding:Object.freeze({...b,version:data.version}),attemptToken,credential:mode==='bound_organization'?Object.freeze({...credential,...b}):null,notBefore,notAfter,checkedAt,remoteReady:mode==='bound_organization'&&checkedAt>=current&&checkedAt>=notBefore&&checkedAt<notAfter,summary:summary({...row,...data})});
    },
    async completeDisconnect(input, attemptToken) {
      const b=binding(input);
      if(!safe(attemptToken,100)||!/^[A-Za-z0-9_-]{43}$/.test(attemptToken))fail('INVALID_CLAIM','An exact disconnect claim is required.');
      const changed=await query(()=>table.updateMany({where:{...key(b),status:'revoked',disconnectOutcome:'outcome_unknown',disconnectAttemptHash:hash(attemptToken)},data:{disconnectOutcome:'disconnected'}}));
      if(changed.count!==1)fail('DISCONNECT_UNAVAILABLE','Disconnect outcome could not be recorded.');
    },
    async revoke(input) {
      const b=binding(input);
      if(b.version>=2147483647)fail('INVALID_BINDING','Connection revision is exhausted.');
      const result=await query(()=>table.updateMany({where:{...key(b),disconnectOutcome:null},data:{ciphertext:null,providerAccountId:null,providerConnectionId:null,accountVerifiedAt:null,accountBindingKey:null,status:'revoked',version:b.version+1,claimHash:null,claimStartedAt:null,lastErrorCode:'REVOKED'}}));
      return result.count===1;
    },
    async holdStaleRefreshes({maxAgeMs=120000,limit=100}={}) {
      if(!Number.isSafeInteger(maxAgeMs)||maxAgeMs<120000||maxAgeMs>86400000||!Number.isInteger(limit)||limit<1||limit>1000) fail('INVALID_LIMIT','Invalid stale-claim sweep limits.');
      const cutoff=new Date(now()-maxAgeMs);
      const rows=await query(()=>table.findMany({where:{status:'refreshing',claimStartedAt:{lte:cutoff}},orderBy:[{claimStartedAt:'asc'},{id:'asc'}],take:limit,select:{id:true,tenantId:true,version:true,claimHash:true}}));
      let count=0;
      for(const row of rows){const result=await query(()=>table.updateMany({where:{id:row.id,tenantId:row.tenantId,version:row.version,status:'refreshing',claimHash:row.claimHash,claimStartedAt:{lte:cutoff}},data:{status:'held',claimHash:null,claimStartedAt:null,lastErrorCode:'OUTCOME_UNKNOWN'}}));count+=result.count;}
      return count;
    },
  });
}
