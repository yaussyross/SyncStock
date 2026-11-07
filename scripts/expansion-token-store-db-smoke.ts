import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createTokenStore } from '../src/lib/expansion/token-store.mjs';

async function main() {
  const url=process.env.SYNCSTOCK_EXPANSION_TEST_DATABASE_URL;
  assert.ok(url,'Explicit disposable local database required');
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'Never use an application or production database');
  process.env.ENCRYPTION_KEY='synthetic-token-store-ci-key-only';
  const {encrypt,decrypt}=await import('../src/lib/crypto');
  const one=new PrismaClient({datasources:{db:{url}}}),two=new PrismaClient({datasources:{db:{url}}});
  let clock=Date.now();
  const a=createTokenStore({client:one,encrypt,decrypt,clock:()=>clock}),b=createTokenStore({client:two,encrypt,decrypt,clock:()=>clock});
  const userIds:string[]=[];let groups=0;
  try {
    const owner=await one.user.create({data:{email:`token-store-${randomUUID()}@example.invalid`}}),other=await one.user.create({data:{email:`token-store-${randomUUID()}@example.invalid`}});
    userIds.push(owner.id,other.id);
    const grant=(patch:Record<string,unknown>={})=>({grantId:randomUUID(),provider:'xero',environment:'production',tenantId:owner.id,clientId:'synthetic-client',authorizationBinding:'a'.repeat(64),accessToken:`synthetic-access-${randomUUID()}`,refreshToken:`synthetic-refresh-${randomUUID()}`,tokenType:'Bearer',expiresAt:clock+1800000,refreshExpiresAt:clock+60*86400000,scopes:['accounting.settings.read','offline_access'],status:'account_binding_required',providerAccountId:null,customerReady:false,...patch});
    const firstGrant=grant(),first=await a.insertUnboundGrant(firstGrant),saved=await one.expansionOAuthGrant.findUniqueOrThrow({where:{id:first.connectionId}});
    assert.ok(saved.ciphertext?.startsWith('v2:'));assert.equal(saved.ciphertext?.includes(firstGrant.accessToken),false);assert.equal(saved.ciphertext?.includes(firstGrant.refreshToken),false);assert.equal((await b.insertUnboundGrant(firstGrant)).connectionId,first.connectionId);assert.equal(await one.expansionOAuthGrant.count({where:{id:first.connectionId}}),1);groups++;
    await assert.rejects(()=>b.insertUnboundGrant({...firstGrant,grantId:randomUUID()}),/could not be stored/);groups++;
    const claims=await Promise.allSettled(Array.from({length:20},(_,i)=>(i%2?a:b).claimRefresh(first)));
    assert.equal(claims.filter(x=>x.status==='fulfilled').length,1);
    for(const result of claims)if(result.status==='rejected')assert.equal(result.reason.code,'REFRESH_UNAVAILABLE');
    const won=claims.find(x=>x.status==='fulfilled');assert.ok(won&&won.status==='fulfilled');const claim=won.value;groups++;
    const rotated={...claim.credential,expectedVersion:claim.version,accessToken:`rotated-access-${randomUUID()}`,refreshToken:`rotated-refresh-${randomUUID()}`};
    const fresh=await b.commitRefresh(claim,rotated);assert.equal(fresh.version,2);assert.equal((await a.getSummary(first))?.status,'available');
    const next=await a.claimRefresh(fresh);assert.equal(next.credential.accessToken,rotated.accessToken);assert.equal(next.credential.refreshToken,rotated.refreshToken);await assert.rejects(()=>b.commitRefresh(claim,rotated),/no longer current/);await a.holdRefresh(next);groups++;
    await assert.rejects(()=>a.insertUnboundGrant({...firstGrant,grantId:randomUUID()}),/could not be stored/);await assert.rejects(()=>a.insertUnboundGrant(firstGrant),/could not be stored/);groups++;
    assert.equal(await b.getSummary({...first,tenantId:other.id}),null);await assert.rejects(()=>b.claimRefresh({...fresh,tenantId:other.id}));assert.equal(await b.revoke({...fresh,tenantId:other.id}),false);groups++;
    const revoke=await a.insertUnboundGrant(grant()),revoking=await b.claimRefresh(revoke);assert.equal(await a.revoke(revoke),true);assert.equal((await one.expansionOAuthGrant.findUniqueOrThrow({where:{id:revoke.connectionId}})).ciphertext,null);await assert.rejects(()=>b.commitRefresh(revoking,{...revoking.credential,expectedVersion:revoking.version,refreshToken:'rotated-after-revoke'}),/no longer current/);groups++;
    const held=await a.insertUnboundGrant(grant()),holding=await b.claimRefresh(held);await a.holdRefresh(holding);assert.equal((await b.getSummary(held))?.status,'held');await assert.rejects(()=>b.claimRefresh(held),/unavailable/);groups++;
    const stale=await a.insertUnboundGrant(grant()),staleClaim=await b.claimRefresh(stale);clock+=120000;assert.equal(await a.holdStaleRefreshes({limit:1}),1);assert.equal((await b.getSummary(stale))?.status,'held');await assert.rejects(()=>b.commitRefresh(staleClaim,{...staleClaim.credential,expectedVersion:staleClaim.version,refreshToken:'rotated-too-late'}),/no longer current/);groups++;
    const corrupted=await a.insertUnboundGrant(grant());await one.expansionOAuthGrant.update({where:{id:corrupted.connectionId},data:{clientId:'tampered-app'}});await assert.rejects(()=>b.claimRefresh(corrupted),/could not be verified/);groups++;
    const isolated=await a.insertUnboundGrant(grant({tenantId:other.id})),deleting=await a.insertUnboundGrant(grant()),late=await b.claimRefresh(deleting);await one.user.delete({where:{id:owner.id}});assert.equal(await two.expansionOAuthGrant.count({where:{tenantId:owner.id}}),0);assert.ok(await b.getSummary(isolated));await assert.rejects(()=>b.commitRefresh(late,{...late.credential,expectedVersion:late.version,refreshToken:'rotated-after-delete'}),/no longer current/);assert.equal(await two.expansionOAuthGrant.count({where:{id:deleting.connectionId}}),0);groups++;
    await assert.rejects(()=>a.insertUnboundGrant(grant({tenantId:'nonexistent-user'})));groups++;
    console.log(`Expansion token PostgreSQL checks passed: ${groups} groups, encrypted idempotent persistence, cross-client refresh CAS, tenant isolation, revoke and deletion.`);
  } finally {
    await one.user.deleteMany({where:{id:{in:userIds}}});await Promise.all([one.$disconnect(),two.$disconnect()]);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
