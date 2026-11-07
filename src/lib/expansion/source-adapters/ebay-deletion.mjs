/** Unwired eBay deletion endpoint contract. No tokens generated, no fetches,
 * no records deleted. Real signature verification and durable outbox adapters
 * must be implemented/approved before deployment. Only immutable userId is kept.
 */
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {identifier,isoTime,fail,digest} from './normalize.mjs';
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
function endpointUrl(raw){
  let u;try{u=new URL(raw);}catch{fail('ENDPOINT','Invalid configured deletion endpoint.');}
  if(typeof raw!=='string'||raw!==raw.trim()||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||(u.hostname==='localhost'||u.hostname.endsWith('.localhost'))||!u.hostname.includes('.')||isIP(u.hostname)||u.hostname.startsWith('[')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal'))fail('ENDPOINT','Use a fixed public HTTPS endpoint without credentials, query, fragment or custom port.');
  return raw; // hash exactly the registered endpoint, not a request-derived host
}
export function deletionChallenge(challengeCode, verificationToken, endpoint){
  if(typeof challengeCode!=='string'||!/^[A-Za-z0-9_-]{1,512}$/.test(challengeCode))fail('CHALLENGE','Invalid challenge code.');
  if(typeof verificationToken!=='string'||!/^[A-Za-z0-9_-]{32,80}$/.test(verificationToken))fail('CONFIGURATION','A valid existing verification token is required.');
  return {challengeResponse:createHash('sha256').update(challengeCode+verificationToken+endpointUrl(endpoint),'utf8').digest('hex')};
}
export function parseVerifiedDeletion(rawBody){
  let body;try{body=JSON.parse(rawBody);}catch{fail('BODY','Invalid JSON notification.');}
  if(body?.metadata?.topic!=='MARKETPLACE_ACCOUNT_DELETION'||body.metadata.schemaVersion!=='1.0'||body.metadata.deprecated!==false)fail('SCHEMA','Unsupported eBay deletion notification schema.');
  const n=body.notification;
  identifier(n?.notificationId,'Notification ID');identifier(n?.data?.userId,'Immutable eBay user ID');
  const eventDate=isoTime(n.eventDate), publishDate=isoTime(n.publishDate);
  if(Date.parse(publishDate)<Date.parse(eventDate))fail('TIME_ORDER','Publish date cannot precede deletion event.');
  if(!Number.isSafeInteger(n.publishAttemptCount)||n.publishAttemptCount<1)fail('ATTEMPT','Invalid publish attempt count.');
  return Object.freeze({provider:'ebay',topic:'MARKETPLACE_ACCOUNT_DELETION',notificationId:n.notificationId,userId:n.data.userId,eventDate,
    semanticFingerprint:digest([n.notificationId,n.data.userId,eventDate]), status:'pending_deletion', deletionCompleted:false});
}
/** Dependencies are trusted server implementations, never values from a request.
 * verifySignature must verify exact raw bytes with an allowlisted eBay public key.
 * enqueueVerified must atomically return {state:'inserted'|'duplicate'|'conflict'};
 * conflict compares notification ID+semantic fingerprint, not changing retry data.
 * Success means durably queued, never that erasure has already happened.
 */
export function createDeletionHandlers({endpoint,verificationToken,verifySignature,enqueueVerified}={}){
  return {
    async GET(request){
      try{
        const u=new URL(request.url);const challenges=u.searchParams.getAll('challenge_code');
        if(challenges.length!==1)return response(400,{error:'invalid_challenge'});
        return response(200,deletionChallenge(challenges[0],verificationToken,endpoint));
      }catch(e){return response(e.code==='CHALLENGE'?400:503,{error:e.code==='CHALLENGE'?'invalid_challenge':'endpoint_not_configured'});}
    },
    async POST(request){
      if(typeof verifySignature!=='function'||typeof enqueueVerified!=='function')return response(503,{error:'compliance_adapters_unavailable'});
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return response(415,{error:'json_required'});
      const length=request.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>65536))return response(413,{error:'payload_too_large'});
      const signature=request.headers.get('x-ebay-signature');if(!signature||signature.length>8192)return response(412,{error:'signature_required'});
      let raw;
      // Bounded streaming prevents a missing/false Content-Length bypass.
      try{const reader=request.body?.getReader();if(!reader)return response(400,{error:'body_required'});const parts=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return response(413,{error:'payload_too_large'});}parts.push(value);}raw=Buffer.concat(parts);}
      catch{return response(400,{error:'invalid_body'});}
      try{if(await verifySignature({rawBody:raw,signature})!==true)return response(412,{error:'invalid_signature'});}
      catch{return response(503,{error:'signature_verification_unavailable'});}
      let event;try{event=parseVerifiedDeletion(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{return response(400,{error:'invalid_notification'});}
      try{const saved=await enqueueVerified(event);if(saved?.state==='conflict')return response(409,{error:'notification_conflict'});if(saved?.state!=='inserted'&&saved?.state!=='duplicate')return response(503,{error:'durable_receipt_unconfirmed'});return response(202,{status:saved.state==='duplicate'?'already_queued':'queued'});}
      catch{return response(503,{error:'durable_receipt_unavailable'});}
    },
  };
}
