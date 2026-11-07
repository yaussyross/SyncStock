import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const validContext=c=>c && ['amazon','shopify','ebay','etsy','walmart','tiktok_shop','paypal','qbo','xero'].includes(c.provider) && ['sandbox','production'].includes(c.environment) && typeof c.tenantId==='string' && c.tenantId.length>0 && c.tenantId.length<=200 && typeof c.sessionId==='string' && c.sessionId.length>0 && c.sessionId.length<=512;
const fixedEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function validateCallback(url,allowedCallbacks){let u;try{u=new URL(url)}catch{throw new Error('Invalid callback URL')}if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||!allowedCallbacks.includes(u.href))throw new Error('Callback must be an exact permitted HTTPS callback without credentials, query or fragment');return u.href;}
/** Production uses createPrismaConsentStore: encrypted shared records, atomic consume. */
export async function beginConsent(context,{store,allowedCallbacks,callbackUrl,now=Date.now(),ttlMs=10*60*1000}){
 if(!validContext(context))throw new Error('Invalid consent binding');
 if(!Number.isFinite(now))throw new Error('Invalid clock');
 if(!store||typeof store.insert!=='function'||typeof store.take!=='function')throw new Error('Atomic consent store required');
 if(!Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>10*60*1000)throw new Error('Invalid consent lifetime');
 const callback=validateCallback(callbackUrl,allowedCallbacks);const state=randomBytes(32).toString('base64url');const verifier=randomBytes(48).toString('base64url');
 const record={provider:context.provider,environment:context.environment,tenantId:context.tenantId,sessionHash:sha(context.sessionId),callback,issuedAt:now,expiresAt:now+ttlMs,verifier};
 await store.insert(sha(state),record);
 return {state,codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256',callback,expiresAt:record.expiresAt};
}
/** Consumes state once even when binding is wrong. Provider token exchange is deliberately outside this module. */
export async function consumeConsent({state,context,callbackUrl,providerError=null,authorizationCode},{store,allowedCallbacks,now=Date.now()}){
 if(typeof state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state))throw new Error('Invalid consent state');
 if(!validContext(context))throw new Error('Invalid consent binding');
 if(!Number.isFinite(now))throw new Error('Invalid clock');
 const callback=validateCallback(callbackUrl,allowedCallbacks);
 const r=await store.take(sha(state));if(!r)throw new Error('Consent state missing or already used');
 if(!Number.isFinite(r.expiresAt)||now>=r.expiresAt||now<r.issuedAt)throw new Error('Consent state expired');
 if(r.provider!==context.provider||r.environment!==context.environment||r.tenantId!==context.tenantId||r.callback!==callback||!fixedEqual(r.sessionHash,sha(context.sessionId)))throw new Error('Consent binding mismatch');
 if(providerError)throw new Error('Provider consent declined');
 if(typeof authorizationCode!=='string'||!authorizationCode||authorizationCode.length>4096||/[\r\n\0]/.test(authorizationCode))throw new Error('Invalid authorization code');
 return {provider:r.provider,environment:r.environment,tenantId:r.tenantId,callback:r.callback,verifier:r.verifier,authorizationCode};
}
export function safeConnectionSummary(record){return {provider:record.provider,environment:record.environment,tenantId:record.tenantId,accountLabel:record.accountLabel||'',status:record.status||'unconnected'};}
