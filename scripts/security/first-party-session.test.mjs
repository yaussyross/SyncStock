import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { signFirstPartySession, verifyFirstPartySession, sessionMatchesUser, revokeFirstPartySessions,
  firstPartyTokenFromCookieHeader, MAX_AUTH_VERSION, SESSION_MAX_AGE_SECONDS, signMobileOAuthHandoff, verifyMobileOAuthHandoff } from '../../src/lib/first-party-session.mjs';
const secret = 'synthetic-offline-session-test-secret-only';
const now = 1800000000;
const user = { id: 'synthetic-user', authVersion: 0 };
const legacy = (overrides = {}, options = {}) => jwt.sign({userId: user.id, iat: now, exp: now + 600, ...overrides}, secret, {issuer: 'syncstock', ...options});
const read = token => verifyFirstPartySession(token, secret, now);

test('issued web and mobile proofs bind exact user and persisted version', () => {
  for (const kind of ['web', 'mobile']) {
    const claims = read(signFirstPartySession(user.id, 0, kind, secret, now));
    assert.equal(claims.sessionKind, kind);
    assert(sessionMatchesUser(claims, user));
    for (const other of [null, {id:'other',authVersion:0}, {...user,authVersion:1}, {...user,authVersion:undefined}]) assert(!sessionMatchesUser(claims, other));
  }
});
test('legacy is only both absent and only version zero, never restored by a missing DB field', () => {
  const claims = read(legacy());
  assert.equal(claims.sessionKind, 'legacy');
  assert(sessionMatchesUser(claims, user));
  assert(!sessionMatchesUser(claims, {...user, authVersion:1}));
  assert(!sessionMatchesUser(claims, {id:user.id}));
  for (const partial of [{authVersion:0}, {sessionKind:'web'}, {authVersion:null,sessionKind:null}]) assert.throws(() => read(legacy(partial)));
});
test('invalid claims, clocks, versions, issuer and algorithms fail closed', () => {
  for (const override of [
    {userId:''}, {userId:3}, {userId:' a'}, {userId:'x'.repeat(192)},
    {iat: now+1}, {iat: now-SESSION_MAX_AGE_SECONDS-1}, {iat: 1.5}, {exp:now}, {exp:now-1},
    {exp:now+SESSION_MAX_AGE_SECONDS+1}, {exp:now+0.5}, {exp:undefined},
    ...[-1, 0.5, '0', MAX_AUTH_VERSION+1, Number.MAX_SAFE_INTEGER].map(authVersion=>({authVersion,sessionKind:'web'})),
    {authVersion:0,sessionKind:'shopify'},
  ]) assert.throws(() => read(legacy(override)), JSON.stringify(override));
  assert.throws(() => read(legacy({}, {issuer:'other'})));
  assert.throws(() => read(legacy({}, {algorithm:'HS512'})));
  assert.throws(() => read(jwt.sign({userId:user.id,exp:now+60},secret,{issuer:'syncstock',noTimestamp:true})));
  assert.throws(() => verifyFirstPartySession(legacy(), 'wrong-secret', now));
  assert.throws(() => read('x'.repeat(8193)));
  assert.throws(() => signFirstPartySession(user.id, -1, 'web', secret, now));
});
test('CAS revocation admits one concurrent winner, kills old and legacy proofs, permits fresh login', async () => {
  let version = 0;
  const store = { updateMany: async ({where,data}) => {
    if (where.id !== user.id || where.authVersion !== version) return {count:0};
    version += data.authVersion.increment; return {count:1};
  }};
  assert.deepEqual(await Promise.all([revokeFirstPartySessions(store,user.id,0),revokeFirstPartySessions(store,user.id,0)]),[true,false]);
  assert(!sessionMatchesUser(read(legacy()), {...user,authVersion:version}));
  assert(!sessionMatchesUser(read(signFirstPartySession(user.id,0,'mobile',secret,now)), {...user,authVersion:version}));
  assert(sessionMatchesUser(read(signFirstPartySession(user.id,version,'web',secret,now)), {...user,authVersion:version}));
  for (const bad of [-1,MAX_AUTH_VERSION,undefined,'0']) assert.equal(await revokeFirstPartySessions({updateMany(){throw Error('must not touch store');}},user.id,bad),false);
  await assert.rejects(revokeFirstPartySessions({updateMany(){throw Error('offline');}},user.id,1));
});
test('mobile OAuth handoffs are purpose, provider, state, shop, version and time bound', () => {
  const state = 'a'.repeat(32), shop='synthetic.myshopify.com';
  const token=signMobileOAuthHandoff({userId:user.id,authVersion:0},'shopify',state,shop,secret,now);
  const claims=verifyMobileOAuthHandoff(token,'shopify',state,shop,secret,now);
  assert(sessionMatchesUser(claims,user));
  assert(!sessionMatchesUser(claims,{...user,authVersion:1}));
  for (const args of [['qbo',state,null],['shopify','b'.repeat(32),shop],['shopify',state,'other.myshopify.com']]) assert.throws(()=>verifyMobileOAuthHandoff(token,...args,secret,now));
  assert.throws(()=>verifyMobileOAuthHandoff(token,'shopify',state,shop,secret,now+600));
  assert.throws(()=>verifyMobileOAuthHandoff(user.id,'shopify',state,shop,secret,now));
  assert.throws(()=>read(token));
  assert.throws(()=>verifyMobileOAuthHandoff(legacy(),'shopify',state,shop,secret,now));
});
test('all issuers and OAuth handoffs use revocation-aware wiring; embedded is Shopify-only', () => {
  for(const name of ['login','signup','mobile-login']) {
    const src=readFileSync(`src/app/api/auth/${name}/route.ts`,'utf8');
    assert.match(src, /createSessionToken\(user.id, user.authVersion,/);
  }
  for(const provider of ['qbo','shopify']) {
    const start=readFileSync(`src/app/api/auth/${provider}/route.ts`,'utf8');
    assert.match(start,/getMobileSessionIdentity\(mobileToken\)/);
    assert.match(start,/createMobileOAuthHandoff\(mobileIdentity,/);
    assert.doesNotMatch(start,/jwt.verify/);
    const callback=readFileSync(`src/app/api/auth/${provider}/callback/route.ts`,'utf8');
    assert.match(callback,/userFromMobileOAuthHandoff\(mobileUserId!/);
    assert.doesNotMatch(callback,/where: \{ id: mobileUserId/);
  }
  const embedded=readFileSync('src/app/api/shopify/embedded/qbo-start/route.ts','utf8');
  assert.match(embedded,/await getCurrentShopifyUser\(\)/);
  assert.match(embedded,/authSource: "shopify"/);
  const callback=readFileSync('src/app/api/auth/qbo/callback/route.ts','utf8');
  assert.match(callback,/payload.authSource !== "shopify"/);
  const session=readFileSync('src/lib/session.ts','utf8');
  const web=session.slice(session.indexOf('export async function getCurrentFirstPartyWebSession'), session.indexOf('export async function revokeAllFirstPartySessions'));
  assert.doesNotMatch(web,/userFromShopify|bearer/i);
  assert.match(web,/firstPartyTokenFromCookieHeader/);
  assert.match(web,/userFromSyncStockToken\(token, "web"\)/);
});

test('ambiguous, oversized and malformed cookie headers fail closed', () => {
  const token=signFirstPartySession(user.id,0,'web',secret,now);
  assert.equal(firstPartyTokenFromCookieHeader(`other=1; session=${token}; ignored=2`),token);
  for(const value of [null, '', `session=${token}; session=${token}`, `session=${token}; session=`, `session=${token}; session`, `session=${token}; session =bad`, `session=${token}\n`, 'session='+encodeURIComponent('bad/token'), 'x'.repeat(16385)]) assert.equal(firstPartyTokenFromCookieHeader(value),null);
});
test('issuance is unique per login and malformed clocks or identifier controls are rejected', () => {
  assert.notEqual(signFirstPartySession(user.id,0,'web',secret,now),signFirstPartySession(user.id,0,'web',secret,now));
  for (const clock of [-1, 1.5, Infinity, NaN]) {
    assert.throws(()=>signFirstPartySession(user.id,0,'web',secret,clock));
    assert.throws(()=>verifyFirstPartySession(legacy(),secret,clock));
  }
  for(const id of ['a b','a\tb','a\x00b','a\x7fb']) assert.throws(()=>read(legacy({userId:id})));
});
