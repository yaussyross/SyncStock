import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {createTokenStore} from '../src/lib/expansion/token-store.mjs';
import {bindConnectionAccount} from '../src/lib/expansion/account-binding.mjs';
import {disconnectConnection} from '../src/lib/expansion/disconnect-connection.mjs';
const sqlError=(state:string,fragment:string)=>(error:any)=>error?.code==='P2010'&&error?.meta?.code===state&&String(error?.meta?.message||error?.message).includes(fragment);
async function blockedStatement(tx:any,sql:string,state:string,fragment:string,...values:any[]){
  await tx.$executeRawUnsafe('SAVEPOINT audit_expected_failure');
  try{await assert.rejects(()=>tx.$executeRawUnsafe(sql,...values),sqlError(state,fragment));}
  finally{await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT audit_expected_failure');await tx.$executeRawUnsafe('RELEASE SAVEPOINT audit_expected_failure');}
}
const ref=(kind:string,value:string)=>createHash('sha256').update(`syncstock:audit:v1:${kind}:${value}`).digest('hex');
async function main(){
  const url=process.env.SYNCSTOCK_EXPANSION_TEST_DATABASE_URL;
  assert.ok(url,'Explicit disposable local database required');
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'Never use a production database');
  process.env.ENCRYPTION_KEY='synthetic-audit-test-only-encryption-key';
  const{encrypt,decrypt}=await import('../src/lib/crypto');
  const one=new PrismaClient({datasources:{db:{url}}}),two=new PrismaClient({datasources:{db:{url}}});
  const a=createTokenStore({client:one,encrypt,decrypt}),b=createTokenStore({client:two,encrypt,decrypt});
  const users:string[]=[],role=`audit_test_${randomUUID().replaceAll('-','')}`;let roleCreated=false,groups=0;
  const events=(kind:string,id:string)=>one.expansionLifecycleAudit.findMany({where:{subjectRef:ref(kind,id)},orderBy:{id:'asc'}});
  try{
    const owner=await one.user.create({data:{email:`audit-${randomUUID()}@example.invalid`}});
    const other=await one.user.create({data:{email:`audit-${randomUUID()}@example.invalid`}});users.push(owner.id,other.id);
    const consent=(tenantId=owner.id)=>({stateHash:createHash('sha256').update(randomUUID()).digest('hex'),tenantId,ciphertext:`DO-NOT-LOG-CONSENT-${randomUUID()}`,expiresAt:new Date(Date.now()+60000)});
    const grant=()=>({grantId:randomUUID(),provider:'xero',environment:'production',tenantId:owner.id,clientId:`DO-NOT-LOG-CLIENT-${randomUUID()}`,authorizationBinding:'a'.repeat(64),accessToken:`DO-NOT-LOG-ACCESS-${randomUUID()}`,refreshToken:`DO-NOT-LOG-REFRESH-${randomUUID()}`,tokenType:'Bearer',expiresAt:Date.now()+1800000,refreshExpiresAt:Date.now()+60*86400000,scopes:['accounting.settings.read','offline_access'],status:'account_binding_required',providerAccountId:null,customerReady:false});
    const pending=consent();await one.expansionOAuthConsent.create({data:pending});
    await two.expansionOAuthConsent.update({where:{stateHash:pending.stateHash},data:{expiresAt:new Date(Date.now()+30000)}});
    await one.expansionOAuthConsent.delete({where:{stateHash:pending.stateHash}});
    const ce=await events('consent',pending.stateHash);assert.deepEqual(ce.map(x=>x.operation),['INSERT','UPDATE','DELETE']);assert.equal(ce[0].tenantRef,ref('tenant',owner.id));assert.equal(ce[0].priorTenantRef,null);assert.equal(ce[2].priorTenantRef,ce[2].tenantRef);assert.ok(ce.every(x=>x.provider===null&&x.afterStatus===null));groups++;

    const raw=grant(),first=await a.insertUnboundGrant(raw),claim=await a.claimRefresh(first);
    const rotated=await b.commitRefresh(claim,{...claim.credential,expectedVersion:claim.version,accessToken:`DO-NOT-LOG-ROTATED-${randomUUID()}`,refreshToken:`DO-NOT-LOG-ROTATED-${randomUUID()}`});
    const claimAgain=await b.claimRefresh(rotated);await a.holdRefresh(claimAgain);await a.revoke(rotated);
    const ge=await events('grant',first.connectionId);assert.deepEqual(ge.map(x=>x.afterStatus),['available','refreshing','available','refreshing','held','revoked']);assert.deepEqual(ge.map(x=>x.afterVersion),[1,1,2,2,2,3]);assert.ok(ge.every(x=>x.provider==='xero'&&x.environment==='production'));groups++;

    const racing=await a.insertUnboundGrant(grant());
    const races=await Promise.allSettled(Array.from({length:16},(_,i)=>(i%2?a:b).claimRefresh(racing)));
    assert.equal(races.filter(x=>x.status==='fulfilled').length,1);assert.equal((await events('grant',racing.connectionId)).length,2,'Losing CAS attempts must not create success events');groups++;

    const rolledBack=consent();await assert.rejects(()=>one.$transaction(async tx=>{await tx.expansionOAuthConsent.create({data:rolledBack});throw Error('rollback');}));
    assert.equal(await one.expansionOAuthConsent.count({where:{stateHash:rolledBack.stateHash}}),0);assert.equal((await events('consent',rolledBack.stateHash)).length,0);
    const duplicate=consent();await one.expansionOAuthConsent.create({data:duplicate});await assert.rejects(()=>two.expansionOAuthConsent.create({data:duplicate}));assert.equal((await events('consent',duplicate.stateHash)).length,1);groups++;

    const local=await a.insertUnboundGrant(grant());await disconnectConnection(local,'local_only',{store:a,fetchImpl:()=>{throw Error('No provider request allowed');}});
    assert.deepEqual((await events('grant',local.connectionId)).map(x=>x.afterDisconnect),[null,'local_only']);
    const org=randomUUID(),connection=randomUUID(),providerRead=()=>new Response(JSON.stringify([{id:connection,tenantId:org,tenantType:'ORGANISATION'}]),{headers:{'content-type':'application/json'}});
    const bound=await bindConnectionAccount(await a.insertUnboundGrant(grant()),org,{store:a,fetchImpl:async()=>providerRead()});
    let deletes=0;await disconnectConnection(bound,'bound_organization',{store:a,fetchImpl:async(_:unknown,init:any)=>{if(init.method==='GET')return providerRead();deletes++;return new Response(null,{status:204});}});
    const de=await events('grant',bound.connectionId);assert.equal(deletes,1);assert.deepEqual(de.map(x=>x.afterDisconnect),[null,null,'outcome_unknown','disconnected']);assert.deepEqual(de.map(x=>x.afterBound),[false,true,false,false]);groups++;

    const journal=await one.expansionLifecycleAudit.findMany({where:{tenantRef:ref('tenant',owner.id)}});
    const serialized=JSON.stringify(journal,(_,value)=>typeof value==='bigint'?String(value):value);
    for(const forbidden of [owner.id,owner.email,pending.stateHash,pending.ciphertext,raw.clientId,raw.accessToken,raw.refreshToken,org,connection,raw.authorizationBinding,claim.claimToken])assert.equal(serialized.includes(forbidden),false,'Journal must exclude raw identity/secret canaries');
    assert.ok(journal.every(x=>x.recordedAt instanceof Date&&x.id>0n));groups++;

    const damaged=await a.insertUnboundGrant(grant());
    await one.expansionOAuthGrant.update({where:{id:damaged.connectionId},data:{provider:'DO-NOT-LOG-PROVIDER',environment:'DO-NOT-LOG-ENV',status:'DO-NOT-LOG-STATUS',lastErrorCode:'DO-NOT-LOG-ERROR'}});
    const damagedEvent=(await events('grant',damaged.connectionId)).at(-1)!;assert.equal(damagedEvent.provider,'other');assert.equal(damagedEvent.environment,'other');assert.equal(damagedEvent.afterStatus,'other');groups++;

    const reassigned=consent();await one.expansionOAuthConsent.create({data:reassigned});
    await one.expansionOAuthConsent.update({where:{stateHash:reassigned.stateHash},data:{tenantId:other.id,stateHash:'e'.repeat(64)}});
    const transfer=(await events('consent','e'.repeat(64))).at(-1)!;assert.equal(transfer.priorTenantRef,ref('tenant',owner.id));assert.equal(transfer.tenantRef,ref('tenant',other.id));assert.equal(transfer.priorSubjectRef,ref('consent',reassigned.stateHash));
    const reassignedGrant=await a.insertUnboundGrant(grant()),newGrantId=randomUUID();await one.expansionOAuthGrant.update({where:{id:reassignedGrant.connectionId},data:{id:newGrantId,tenantId:other.id}});const grantTransfer=(await events('grant',newGrantId)).at(-1)!;assert.equal(grantTransfer.priorTenantRef,ref('tenant',owner.id));assert.equal(grantTransfer.tenantRef,ref('tenant',other.id));assert.equal(grantTransfer.priorSubjectRef,ref('grant',reassignedGrant.connectionId));groups++;

    // Disposable NOLOGIN role: prove protections without relying on owner rights.
    assert.match(role,/^audit_test_[a-f0-9]{32}$/);
    await one.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);roleCreated=true;
    await one.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await one.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON public."ExpansionOAuthConsent",public."ExpansionOAuthGrant" TO "${role}"`);
    const runtimeConsent=consent();await one.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);await tx.expansionOAuthConsent.create({data:runtimeConsent});await tx.expansionOAuthConsent.delete({where:{stateHash:runtimeConsent.stateHash}});});
    assert.equal((await events('consent',runtimeConsent.stateHash)).length,2);
    const runtimeGrant=await one.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);const store=createTokenStore({client:tx,encrypt,decrypt});const created=await store.insertUnboundGrant(grant()),held=await store.claimRefresh(created);await store.holdRefresh(held);await store.revoke(created);return created;});assert.deepEqual((await events('grant',runtimeGrant.connectionId)).map(x=>x.afterStatus),['available','refreshing','held','revoked']);
    const acl=await one.$queryRawUnsafe<any[]>(`SELECT has_table_privilege($1::name,'public."ExpansionLifecycleAudit"','INSERT') AS "canInsert", has_sequence_privilege($1::name,'public."ExpansionLifecycleAudit_id_seq"','USAGE') AS "canUseSequence", has_table_privilege($1::name,'public."ExpansionOAuthConsent"','TRIGGER') AS "canCreateTrigger"`,role);assert.deepEqual(acl,[{canInsert:false,canUseSequence:false,canCreateTrigger:false}]);
    for(const name of ['expansion_audit_reject_mutation','expansion_audit_require_trigger','expansion_audit_consent_change','expansion_audit_grant_change']){const acl=await one.$queryRawUnsafe<any[]>("SELECT has_function_privilege($1::name,$2::text,'EXECUTE') AS allowed",role,`public.${name}()`);assert.equal(acl[0].allowed,false);}
    const directInsert=`INSERT INTO public."ExpansionLifecycleAudit" ("entityKind","operation","tenantRef","subjectRef") VALUES ('consent','INSERT','${'a'.repeat(64)}','${'b'.repeat(64)}')`;
    for(const sql of ['SELECT * FROM public."ExpansionLifecycleAudit"',directInsert,'UPDATE public."ExpansionLifecycleAudit" SET "operation"=\'DELETE\' WHERE false','DELETE FROM public."ExpansionLifecycleAudit" WHERE false','TRUNCATE public."ExpansionLifecycleAudit"']){
      await one.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);await blockedStatement(tx,sql,'42501','permission denied');});
    }groups++;

    // Even owner accidental data changes are denied; a privileged DBA can still
    // disable/drop triggers, which this journal does not claim to prevent.
    for(const sql of [directInsert,'UPDATE public."ExpansionLifecycleAudit" SET "operation"=\'DELETE\' WHERE false','DELETE FROM public."ExpansionLifecycleAudit" WHERE false','TRUNCATE public."ExpansionLifecycleAudit"','TRUNCATE public."ExpansionOAuthConsent"','TRUNCATE public."ExpansionOAuthGrant"'])await assert.rejects(()=>one.$executeRawUnsafe(sql),sqlError('42501',sql===directInsert?'requires a source trigger':'append-only'));groups++;

    const shadow=consent();await one.$transaction(async tx=>{
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "ExpansionLifecycleAudit" (LIKE public."ExpansionLifecycleAudit" INCLUDING ALL) ON COMMIT DROP');
      await tx.$executeRawUnsafe('SET LOCAL search_path = pg_temp, public');
      await tx.expansionOAuthConsent.create({data:shadow});
      const temp=await tx.$queryRawUnsafe<[{count:bigint}]>('SELECT count(*) FROM pg_temp."ExpansionLifecycleAudit"');assert.equal(temp[0].count,0n);
    });assert.equal((await events('consent',shadow.stateHash)).length,1);
    await one.$transaction(async tx=>{await tx.$executeRawUnsafe('CREATE TEMP TABLE audit_wrong_source (value INTEGER) ON COMMIT DROP');await tx.$executeRawUnsafe('CREATE TRIGGER wrong_source AFTER INSERT ON audit_wrong_source FOR EACH ROW EXECUTE FUNCTION public.expansion_audit_consent_change()');await blockedStatement(tx,'INSERT INTO audit_wrong_source VALUES (1)','42501','Invalid lifecycle audit source');});
    await one.$transaction(async tx=>{
      await tx.$executeRawUnsafe('CREATE TEMP TABLE audit_spoof_source (value INTEGER) ON COMMIT DROP');
      await tx.$executeRawUnsafe(`GRANT INSERT ON audit_spoof_source TO "${role}"`);
      await tx.$executeRawUnsafe(`CREATE FUNCTION public.audit_test_spoof() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${directInsert}; RETURN NEW; END; $$`);
      await tx.$executeRawUnsafe('CREATE TRIGGER spoof_source AFTER INSERT ON audit_spoof_source FOR EACH ROW EXECUTE FUNCTION public.audit_test_spoof()');
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);await blockedStatement(tx,'INSERT INTO audit_spoof_source VALUES (1)','42501','permission denied for table ExpansionLifecycleAudit');
      await tx.$executeRawUnsafe('RESET ROLE');await tx.$executeRawUnsafe('DROP FUNCTION public.audit_test_spoof() CASCADE');
    });groups++;

    const blocked=consent();await one.$transaction(async tx=>{
      await tx.$executeRawUnsafe("CREATE FUNCTION public.audit_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END; $$");
      await tx.$executeRawUnsafe('CREATE TRIGGER audit_test_failure BEFORE INSERT ON public."ExpansionLifecycleAudit" FOR EACH ROW EXECUTE FUNCTION public.audit_test_failure()');
      await blockedStatement(tx,'INSERT INTO public."ExpansionOAuthConsent" ("stateHash","tenantId","ciphertext","expiresAt") VALUES ($1,$2,$3,$4)','P0001','Synthetic audit failure',blocked.stateHash,blocked.tenantId,blocked.ciphertext,blocked.expiresAt);
      await tx.$executeRawUnsafe('DROP FUNCTION public.audit_test_failure() CASCADE');
    });assert.equal(await one.expansionOAuthConsent.count({where:{stateHash:blocked.stateHash}}),0);assert.equal((await events('consent',blocked.stateHash)).length,0);groups++;

    const cascade=consent();await one.expansionOAuthConsent.create({data:cascade});const toDelete=await a.insertUnboundGrant(grant());
    const otherCount=await one.expansionLifecycleAudit.count({where:{tenantRef:ref('tenant',other.id)}});
    await one.user.delete({where:{id:owner.id}});
    assert.equal((await events('consent',cascade.stateHash)).at(-1)?.operation,'DELETE');assert.equal((await events('grant',toDelete.connectionId)).at(-1)?.operation,'DELETE');
    assert.equal(await one.expansionLifecycleAudit.count({where:{tenantRef:ref('tenant',other.id)}}),otherCount);
    assert.equal(await one.expansionOAuthGrant.count({where:{tenantId:owner.id}}),0);assert.ok(await one.expansionLifecycleAudit.count({where:{tenantRef:ref('tenant',owner.id)}})>0);groups++;
    console.log(`Expansion lifecycle audit PostgreSQL checks passed: ${groups} groups, atomic journal, cross-client CAS, minimized fields, append-only runtime protections and retained deletion evidence.`);
  }finally{
    await one.user.deleteMany({where:{id:{in:users}}});
    if(roleCreated){await one.$executeRawUnsafe(`DROP OWNED BY "${role}"`);await one.$executeRawUnsafe(`DROP ROLE "${role}"`);}
    await Promise.all([one.$disconnect(),two.$disconnect()]);
  }
}
main().catch(error=>{console.error('Expansion lifecycle audit PostgreSQL checks failed:',error instanceof Error?error.message:'unknown error');process.exitCode=1;});
