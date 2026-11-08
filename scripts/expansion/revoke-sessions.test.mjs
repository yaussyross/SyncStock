import test from 'node:test';
import assert from 'node:assert/strict';
import { createRevokeSessionsRoute } from '../../src/lib/revoke-sessions.mjs';
const ORIGIN = 'https://example.invalid', PATH = '/api/auth/revoke-sessions';
const req = (patch = {}) => new Request(ORIGIN + PATH, {method:'POST',headers:{origin:ORIGIN},...patch});
function fixture(patch = {}) {
  const calls = [];
  const handler = createRevokeSessionsRoute({env:{APP_URL:ORIGIN},getSession:async()=>{calls.push('read');return{userId:'synthetic-user',authVersion:4};},revoke:async(...args)=>{calls.push(args);return true;},...patch});
  return {calls,handler};
}
async function redacted(response) {
  assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  const text=await response.text();assert.doesNotMatch(text,/PRIVATE|synthetic-user|authVersion|stack|password|token/i);return JSON.parse(text);
}
test('revocation calls exact server identity/version once and returns narrow scope',async()=>{
 const f=fixture();const r=await f.handler(req());assert.equal(r.status,200);assert.deepEqual(await redacted(r),{ok:true,scope:'first_party_sessions'});assert.deepEqual(f.calls,['read',['synthetic-user',4]]);
});
for(const app of [undefined,'','http://example.invalid','https://x:y@example.invalid','https://example.invalid/path','https://example.invalid/?x=1','https://example.invalid/#x','https://EXAMPLE.invalid'])test(`unsafe configured origin ${app}`,async()=>{
 const f=fixture({env:{APP_URL:app}});assert.equal((await f.handler(req())).status,503);assert.deepEqual(f.calls,[]);
});
for(const origin of [null,'null','https://evil.invalid',ORIGIN+'/','http://example.invalid',''])test(`strict Origin ${origin}`,async()=>{
 const f=fixture(),r=await f.handler(req({headers:origin===null?{}:{origin}}));assert.equal(r.status,403);await redacted(r);assert.deepEqual(f.calls,[]);
});
for(const site of ['cross-site','same-site','none',''])test(`reject Fetch Metadata ${site}`,async()=>{
 const f=fixture();assert.equal((await f.handler(req({headers:{origin:ORIGIN,'sec-fetch-site':site}}))).status,403);assert.deepEqual(f.calls,[]);
});
for(const url of [ORIGIN+PATH+'?userId=other',ORIGIN+'/other','https://evil.invalid'+PATH])test(`reject destination ${url}`,async()=>{
 const f=fixture();assert.equal((await f.handler(new Request(url,{method:'POST',headers:{origin:ORIGIN}}))).status,403);assert.deepEqual(f.calls,[]);
});
test('Host forwarding does not alter approved origin',async()=>{const f=fixture();assert.equal((await f.handler(req({headers:{origin:ORIGIN,host:'evil.invalid','x-forwarded-host':'evil.invalid','sec-fetch-site':'same-origin'}}))).status,200);});
for(const method of ['GET','PUT','DELETE'])test(`reject method ${method}`,async()=>{const f=fixture();assert.equal((await f.handler(req({method}))).status,405);assert.deepEqual(f.calls,[]);});
for(const body of ['{}','{"userId":"other","authVersion":0}','PRIVATE'])test(`no body contract ${body}`,async()=>{const f=fixture();assert.equal((await f.handler(req({body}))).status,400);assert.deepEqual(f.calls,[]);});
for(const length of ['1','-1','00','nonsense'])test(`no body length ${length}`,async()=>{const f=fixture();assert.equal((await f.handler(req({headers:{origin:ORIGIN,'content-length':length}}))).status,400);assert.deepEqual(f.calls,[]);});
test('missing signed web session never writes',async()=>{let wrote=false;const f=fixture({getSession:async()=>null,revoke:async()=>{wrote=true;return true;}});assert.equal((await f.handler(req())).status,401);assert.equal(wrote,false);});
for(const value of [-1,1.1,NaN,Infinity,2147483647,'0',null,undefined])test(`bad server version ${value}`,async()=>{let wrote=false;const f=fixture({getSession:async()=>({userId:'synthetic',authVersion:value}),revoke:async()=>{wrote=true;return true;}});assert.equal((await f.handler(req())).status,503);assert.equal(wrote,false);});
test('CAS loser does not clear or replace browser session',async()=>{const f=fixture({revoke:async()=>false});const r=await f.handler(req());assert.equal(r.status,409);assert.equal(r.headers.has('set-cookie'),false);await redacted(r);});
for(const verdict of [undefined,null,1,'true',{}])test(`only true reports mutation success ${verdict}`,async()=>{const f=fixture({revoke:async()=>verdict});assert.equal((await f.handler(req())).status,503);});
test('mutation failure is unknown, redacted, never retried',async()=>{let calls=0;const f=fixture({revoke:async()=>{calls++;throw Error('PRIVATE JWT DATABASE URL');}});const r=await f.handler(req());assert.equal(r.status,503);assert.deepEqual(await redacted(r),{error:'outcome_unknown'});assert.equal(calls,1);});
test('late authentication after deadline cannot start a mutation',async()=>{let resolve,writes=0;const f=fixture({deadlineMs:5,getSession:()=>new Promise(r=>resolve=r),revoke:async()=>{writes++;return true;}});const r=await f.handler(req());assert.equal(r.status,503);resolve({userId:'synthetic',authVersion:0});await new Promise(r=>setTimeout(r,10));assert.equal(writes,0);});
test('uncertain write times out with no retry or false completion',async()=>{let resolve,writes=0;const f=fixture({deadlineMs:5,revoke:()=>{writes++;return new Promise(r=>resolve=r);}});const r=await f.handler(req());assert.equal(r.status,503);assert.deepEqual(await redacted(r),{error:'outcome_unknown'});resolve(true);await new Promise(r=>setTimeout(r,10));assert.equal(writes,1);});
test('aborted request never starts write',async()=>{const control=new AbortController();control.abort();const f=fixture();assert.equal((await f.handler(req({signal:control.signal}))).status,503);assert.deepEqual(f.calls,['read']);});

test('zero-byte body stream from an HTTP adapter is accepted',async()=>{const f=fixture();const r=await f.handler(req({body:'',headers:{origin:ORIGIN,'content-length':'0'}}));assert.equal(r.status,200);assert.deepEqual(f.calls,['read',['synthetic-user',4]]);});
test('empty chunks ending in EOF are bounded and accepted',async()=>{const f=fixture();const body=new ReadableStream({start(c){c.enqueue(new Uint8Array());c.close();}});assert.equal((await f.handler(req({body,duplex:'half'}))).status,200);});
test('nonempty stream with false zero Content-Length is rejected before auth',async()=>{const f=fixture();assert.equal((await f.handler(req({body:'PRIVATE',headers:{origin:ORIGIN,'content-length':'0'}}))).status,400);assert.deepEqual(f.calls,[]);});
test('slow body deadline cancels without starting auth or a write',async()=>{let cancelled=false;const body=new ReadableStream({cancel(){cancelled=true;}}),f=fixture({bodyDeadlineMs:5});assert.equal((await f.handler(req({body,duplex:'half'}))).status,400);assert.deepEqual(f.calls,[]);assert.equal(cancelled,true);});
test('stream errors and excessive empty chunks cannot reach authentication',async()=>{
 for(const body of [new ReadableStream({start(c){c.error(Error('PRIVATE'));}}),new ReadableStream({pull(c){c.enqueue(new Uint8Array());}})]){const f=fixture();assert.equal((await f.handler(req({body,duplex:'half'}))).status,400);assert.deepEqual(f.calls,[]);}
});
