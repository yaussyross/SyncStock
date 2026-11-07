import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createTokenStore } from '../src/lib/expansion/token-store.mjs';
import { discoverProviderAccounts } from '../src/lib/expansion/provider-accounts.mjs';
import { listConnectionAccounts, bindConnectionAccount } from '../src/lib/expansion/account-binding.mjs';
async function main(){
 const url=process.env.SYNCSTOCK_EXPANSION_TEST_DATABASE_URL;
 assert.ok(url,'Explicit disposable local database required');assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'Never use production databases');
 process.env.ENCRYPTION_KEY='synthetic-account-binding-ci-key';const{encrypt,decrypt}=await import('../src/lib/crypto');
 const one=new PrismaClient({datasources:{db:{url}}}),two=new PrismaClient({datasources:{db:{url}}});
 const a=createTokenStore({client:one,encrypt,decrypt}),b=createTokenStore({client:two,encrypt,decrypt});const users:string[]=[];let groups=0;
 try{
  const owner=await one.user.create({data:{email:`account-bind-${randomUUID()}@example.invalid`}}),other=await one.user.create({data:{email:`account-bind-${randomUUID()}@example.invalid`}});users.push(owner.id,other.id);
  const grant=(tenantId=owner.id)=>({grantId:randomUUID(),provider:'xero',environment:'production',tenantId,clientId:'synthetic-client',authorizationBinding:'a'.repeat(64),accessToken:`synthetic-access-${randomUUID()}`,refreshToken:`synthetic-refresh-${randomUUID()}`,tokenType:'Bearer',expiresAt:Date.now()+1800000,refreshExpiresAt:Date.now()+60*86400000,scopes:['accounting.settings.read','offline_access'],status:'account_binding_required',providerAccountId:null,customerReady:false});
  const org1=randomUUID(),org2=randomUUID(),providerConnection1=randomUUID(),providerConnection2=randomUUID();
  const data=[{id:providerConnection1,tenantId:org1,tenantType:'ORGANISATION',tenantName:'Synthetic org one'},{id:providerConnection2,tenantId:org2,tenantType:'ORGANISATION',tenantName:'Synthetic org two'}];
  const fetchImpl=async()=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  const first=await a.insertUnboundGrant(grant());const choices=await listConnectionAccounts(first,{store:a,fetchImpl});assert.equal(choices.accounts.length,2);assert.equal(choices.customerReady,false);groups++;
  const credential=await a.getAccessCredential(first),proof=await discoverProviderAccounts(first,{credential,fetchImpl});const bound=await b.bindVerifiedAccount(first,org2,proof.proof);assert.equal(bound.providerAccountId,org2);assert.equal(bound.version,2);assert.equal((await a.getAccessCredential(bound)).accountBinding?.providerConnectionId,providerConnection2);groups++;
  const duplicate=await a.insertUnboundGrant(grant(other.id));await assert.rejects(()=>bindConnectionAccount(duplicate,org2,{store:b,fetchImpl}));assert.equal((await b.getSummary(duplicate))?.accountStatus,'unbound');groups++;
  await assert.rejects(()=>bindConnectionAccount(duplicate,randomUUID(),{store:b,fetchImpl}),/not in this grant/);await assert.rejects(()=>b.bindVerifiedAccount(duplicate,org1,{}),/Fresh provider identity evidence/);groups++;
  const claimed=await a.claimRefresh(bound),replacement={...claimed.credential,expectedVersion:claimed.version,accountBinding:undefined,accessToken:`rotated-access-${randomUUID()}`,refreshToken:`rotated-refresh-${randomUUID()}`};const refreshed=await b.commitRefresh(claimed,replacement);assert.equal(refreshed.providerAccountId,org2);assert.equal((await a.getAccessCredential(refreshed)).accountBinding?.accountId,org2);groups++;
  const race=await a.insertUnboundGrant(grant()),raceCredential=await a.getAccessCredential(race);const racesData=[{id:randomUUID(),tenantId:randomUUID(),tenantType:'ORGANISATION'},{id:randomUUID(),tenantId:randomUUID(),tenantType:'ORGANISATION'}],raceFetch=async()=>new Response(JSON.stringify(racesData),{headers:{'content-type':'application/json'}});
  const p1=await discoverProviderAccounts(race,{credential:raceCredential,fetchImpl:raceFetch}),p2=await discoverProviderAccounts(race,{credential:raceCredential,fetchImpl:raceFetch});const races=await Promise.allSettled([a.bindVerifiedAccount(race,racesData[0].tenantId,p1.proof),b.bindVerifiedAccount(race,racesData[1].tenantId,p2.proof)]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);groups++;
  const revoking=await a.insertUnboundGrant(grant());await assert.rejects(()=>bindConnectionAccount(revoking,org1,{store:a,fetchImpl:async()=>{await b.revoke(revoking);return fetchImpl()}}),/Connection changed/);assert.equal((await a.getSummary(revoking))?.status,'revoked');groups++;
  const wrong={...refreshed,tenantId:other.id};await assert.rejects(()=>a.getAccessCredential(wrong));assert.equal(await a.getSummary(wrong),null);groups++;
  await one.expansionOAuthGrant.update({where:{id:refreshed.connectionId},data:{providerAccountId:randomUUID()}});await assert.rejects(()=>b.getSummary(refreshed),/could not be verified/);groups++;
  const deleting=await a.insertUnboundGrant(grant()),deleteCredential=await a.getAccessCredential(deleting),late=await discoverProviderAccounts(deleting,{credential:deleteCredential,fetchImpl});await one.user.delete({where:{id:owner.id}});assert.equal(await two.expansionOAuthGrant.count({where:{tenantId:owner.id}}),0);await assert.rejects(()=>b.bindVerifiedAccount(deleting,org1,late.proof),/Connection changed/);assert.ok(await b.getSummary(duplicate));groups++;
  console.log(`Expansion account-binding PostgreSQL checks passed: ${groups} groups, explicit provider account selection, encrypted binding, uniqueness, cross-client CAS and deletion.`);
 }finally{await one.user.deleteMany({where:{id:{in:users}}});await Promise.all([one.$disconnect(),two.$disconnect()]);}
}
main().catch(error=>{console.error(error);process.exitCode=1});
