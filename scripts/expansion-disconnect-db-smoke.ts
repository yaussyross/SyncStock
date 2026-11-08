import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {createTokenStore} from '../src/lib/expansion/token-store.mjs';
import {discoverProviderAccounts} from '../src/lib/expansion/provider-accounts.mjs';
import {bindConnectionAccount} from '../src/lib/expansion/account-binding.mjs';
import {disconnectConnection} from '../src/lib/expansion/disconnect-connection.mjs';
async function main(){
 const url=process.env.SYNCSTOCK_EXPANSION_TEST_DATABASE_URL;
 assert.ok(url,'Explicit disposable local database required');assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'Never use production databases');
 process.env.ENCRYPTION_KEY='synthetic-disconnect-ci-key';const{encrypt,decrypt}=await import('../src/lib/crypto');
 const one=new PrismaClient({datasources:{db:{url}}}),two=new PrismaClient({datasources:{db:{url}}});
 const a=createTokenStore({client:one,encrypt,decrypt}),b=createTokenStore({client:two,encrypt,decrypt}),users:string[]=[];let groups=0;
 try{
  const owner=await one.user.create({data:{email:`disconnect-${randomUUID()}@example.invalid`}});users.push(owner.id);
  const grant=()=>({grantId:randomUUID(),provider:'xero',environment:'production',tenantId:owner.id,clientId:'synthetic-client',authorizationBinding:'a'.repeat(64),accessToken:`synthetic-access-${randomUUID()}`,refreshToken:`synthetic-refresh-${randomUUID()}`,tokenType:'Bearer',expiresAt:Date.now()+1800000,refreshExpiresAt:Date.now()+60*86400000,scopes:['accounting.settings.read','offline_access'],status:'account_binding_required',providerAccountId:null,customerReady:false});
  const org=randomUUID(),connection=randomUUID(),read=()=>new Response(JSON.stringify([{id:connection,tenantId:org,tenantType:'ORGANISATION'}]),{headers:{'content-type':'application/json'}});
  const bound=await bindConnectionAccount(await a.insertUnboundGrant(grant()),org,{store:a,fetchImpl:async()=>read()});
  let writes=0;const fetchImpl=async(_:any,i:any)=>{if(i.method==='GET')return read();writes++;const row=await one.expansionOAuthGrant.findUniqueOrThrow({where:{id:bound.connectionId}});assert.equal(row.ciphertext,null);assert.equal(row.disconnectOutcome,'outcome_unknown');return new Response(null,{status:204});};
  const results=await Promise.allSettled(Array.from({length:10},(_,i)=>disconnectConnection(bound,'bound_organization',{store:i%2?a:b,fetchImpl})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes,1);groups++;
  const removed=await b.getSummary(bound);assert.equal(removed?.disconnectOutcome,'disconnected');assert.equal(removed?.version,3);await assert.rejects(()=>disconnectConnection(removed,'bound_organization',{store:a,fetchImpl}));assert.equal(writes,1);groups++;
  const unknownBound=await bindConnectionAccount(await a.insertUnboundGrant(grant()),org,{store:a,fetchImpl:async()=>read()});const unknown=await disconnectConnection(unknownBound,'bound_organization',{store:b,fetchImpl:async(_:any,i:any)=>{if(i.method==='GET')return read();throw Error('synthetic lost reply');}});assert.equal(unknown.disconnectOutcome,'outcome_unknown');assert.equal(await a.revoke(unknown),false);await assert.rejects(()=>disconnectConnection(unknown,'local_only',{store:a}));groups++;
  const row=await one.expansionOAuthGrant.findUniqueOrThrow({where:{id:unknown.connectionId}});assert.equal(row.ciphertext,null);assert.equal(row.disconnectAccountId,org);assert.equal(row.disconnectConnectionId,connection);assert.ok(row.disconnectAttemptHash);groups++;
  const local=await a.insertUnboundGrant(grant());const localResult=await disconnectConnection(local,'local_only',{store:b,fetchImpl:()=>{throw Error('no calls')}});assert.equal(localResult.disconnectOutcome,'local_only');assert.equal((await a.getSummary(local))?.status,'revoked');groups++;
  await assert.rejects(()=>one.expansionOAuthGrant.update({where:{id:local.connectionId},data:{disconnectOutcome:'made_up'}}));await assert.rejects(()=>one.expansionOAuthGrant.update({where:{id:local.connectionId},data:{ciphertext:'forbidden'}}));await assert.rejects(()=>one.expansionOAuthGrant.update({where:{id:local.connectionId},data:{disconnectOutcome:null}}));groups++;
  const late=await bindConnectionAccount(await a.insertUnboundGrant(grant()),org,{store:a,fetchImpl:async()=>read()}),credential=await a.getAccessCredential(late),proof=await discoverProviderAccounts(late,{credential,fetchImpl:async()=>read()}),claim=await a.beginDisconnect(late,'bound_organization',proof.proof);await assert.rejects(()=>b.completeDisconnect({...claim.binding,tenantId:'wrong-tenant'},claim.attemptToken));assert.equal((await a.getSummary(late))?.disconnectOutcome,'outcome_unknown');await one.user.delete({where:{id:owner.id}});await assert.rejects(()=>b.completeDisconnect(claim.binding,claim.attemptToken));assert.equal(await two.expansionOAuthGrant.count({where:{tenantId:owner.id}}),0);groups++;
  console.log(`Expansion disconnect PostgreSQL checks passed: ${groups} groups, durable destruction, narrow remote deletion, cross-client CAS, unknown outcome and constraints.`);
 }finally{await one.user.deleteMany({where:{id:{in:users}}});await Promise.all([one.$disconnect(),two.$disconnect()]);}
}
main().catch(()=>{console.error('Expansion disconnect PostgreSQL checks failed (details suppressed).');process.exitCode=1;});
