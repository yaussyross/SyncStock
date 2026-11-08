/** Only explicitly selected disposable loopback PostgreSQL; no provider work.
 * Every case clones the migrated synthetic test DB into a uniquely named DB,
 * authenticates a real temporary LOGIN client, commits the tamper, checks, and
 * drops only its own clone/roles. The input database is never modified.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {inspectExpansionDatabaseSecurity} from '../src/lib/expansion/database-security.mjs';
import {createPrismaDatabaseSecurityGate} from '../src/lib/expansion/prisma-database-security';

let activeCase=0;
let activeStage='precondition';
const stages=new Set(['precondition','create_database','create_runtime','create_parent','grant_fixture','authenticate','assertion','tamper','inspect','runtime_disconnect','drop_owned','public_parameter_cleanup','admin_disconnect','drop_database','drop_runtime','drop_parent','control_disconnect']);
const safeCode=(error:any)=>['ERR_ASSERTION','P1000','P1001','P1002','P1003','P1010','P1017','P2010','P2024','P2028','CLEANUP_FAILED'].includes(error?.code)?error.code:'FAILURE';
async function main() {
 const url=process.env.SYNCSTOCK_EXPANSION_TEST_DATABASE_URL;
 assert.ok(url,'Explicit disposable loopback database required');
 const original=new URL(url);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(original.hostname),'Never use a production database');
 const source=decodeURIComponent(original.pathname.slice(1));
 assert.ok(source && !['postgres','template0','template1'].includes(source),'Use a migrated disposable application test database');
 const identifier=(value:string)=>'"'+value.replaceAll('"','""')+'"';
 const connection=(name:string,username?:string,password?:string)=>{
  const parsed=new URL(url);parsed.pathname='/'+name;parsed.searchParams.set('connection_limit','1');
  if(username){parsed.username=username;parsed.password=password!;}
  return new PrismaClient({datasources:{db:{url:parsed.toString()}}});
 };
 const control=connection('postgres');
 const suffix=randomUUID().replaceAll('-','');
 const role=`security_runtime_${suffix}`, elevated=`security_parent_${suffix}`;
 let groups=0,caseNumber=0;
 // These names are generated internally, never supplied by external input.
 const run=async(action:(admin:PrismaClient,runtime:PrismaClient,trackPublicGrant:()=>void)=>Promise<void>)=>{
  const name=`security_case_${suffix}_${++caseNumber}`,password=randomUUID()+randomUUID();
  activeCase=caseNumber;
  let created=false,roleCreated=false,elevatedCreated=false;
  const admin=connection(name),runtime=connection(name,role,password);
  let publicGrantInstalled=false;
  let failure:{stage:string,code:string}|null=null;
  try {
   activeStage='create_database';
   await control.$executeRawUnsafe(`CREATE DATABASE ${identifier(name)} TEMPLATE ${identifier(source)}`);created=true;
   activeStage='create_runtime';
   await control.$executeRawUnsafe(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);roleCreated=true;
   activeStage='create_parent';
   await control.$executeRawUnsafe(`CREATE ROLE "${elevated}" NOLOGIN`);elevatedCreated=true;
   activeStage='grant_fixture';
   await admin.$executeRawUnsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
   await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
   await admin.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON public."ExpansionOAuthConsent", public."ExpansionOAuthGrant" TO "${role}"`);
   // Establish original authentication before mutations, including NOLOGIN and
   // role attribute tests. No SET SESSION AUTHORIZATION is used for acceptance.
   activeStage='authenticate';await runtime.$connect();
   activeStage='assertion';await action(admin,runtime,()=>{publicGrantInstalled=true;});groups++;
  } catch(error) {
   failure={stage:activeStage,code:safeCode(error)};
  } finally {
   // Attempt every cleanup independently; never let one failure skip the rest.
   let cleanupFailed=false;
   const cleanup=async(stage:string,fn:()=>Promise<unknown>)=>{
    try {await fn();} catch(error) {
     cleanupFailed=true;
     console.error(`Synthetic cleanup failure: case=${activeCase} stage=${stage} code=${safeCode(error)}`);
    }
   };
   await cleanup('runtime_disconnect',()=>runtime.$disconnect());
   if(created && roleCreated)await cleanup('drop_owned',()=>admin.$executeRawUnsafe(`DROP OWNED BY "${role}" CASCADE`));
   // Only this explicit case installed the grant; precondition proved absent.
   // If its transaction rolled back, the read avoids a redundant global write.
   if(publicGrantInstalled)await cleanup('public_parameter_cleanup',async()=>{
    const grants=await control.$queryRawUnsafe<{present:boolean}[]>(`SELECT EXISTS (SELECT FROM pg_catalog.pg_parameter_acl p CROSS JOIN LATERAL pg_catalog.aclexplode(p.paracl) a WHERE p.parname='session_preload_libraries' AND a.grantee=0 AND a.privilege_type='SET') AS present`);
    if(grants[0]?.present)await control.$executeRawUnsafe('REVOKE SET ON PARAMETER session_preload_libraries FROM PUBLIC');
   });
   await cleanup('admin_disconnect',()=>admin.$disconnect());
   // No FORCE or unrelated backend termination, even when disconnect failed.
   if(created)await cleanup('drop_database',()=>control.$executeRawUnsafe(`DROP DATABASE ${identifier(name)}`));
   if(roleCreated)await cleanup('drop_runtime',()=>control.$executeRawUnsafe(`DROP ROLE "${role}"`));
   if(elevatedCreated)await cleanup('drop_parent',()=>control.$executeRawUnsafe(`DROP ROLE "${elevated}"`));
   if(cleanupFailed && !failure)failure={stage:'drop_database',code:'CLEANUP_FAILED'};
  }
  if(failure)throw failure;
 };
 try {
  const publicParameters=await control.$queryRawUnsafe<{count:bigint}[]>(`SELECT count(*) FROM pg_catalog.pg_parameter_acl p CROSS JOIN LATERAL pg_catalog.aclexplode(p.paracl) a WHERE a.grantee=0`);
  assert.equal(publicParameters[0].count,0n,'Use a clean disposable PostgreSQL cluster without PUBLIC parameter grants');
  await run(async(admin,runtime)=>{
   // Temporary draft-CI bootstrap, only a known code-owned constraint digest.
   const fingerprint=await admin.$queryRawUnsafe<{digest:string}[]>(`SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_constraintdef(c.oid),'UTF8')),'hex') AS digest FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname='ExpansionLifecycleAudit' AND c.conname='ExpansionLifecycleAudit_shape_check'`);
   assert.match(fingerprint[0]?.digest,/^[0-9a-f]{64}$/);
   console.log('Known audit CHECK definition fingerprint:',fingerprint[0].digest);
   assert.equal(await createPrismaDatabaseSecurityGate(runtime)(),true);
   assert.equal(await createPrismaDatabaseSecurityGate(runtime)(),true);
   assert.equal(await createPrismaDatabaseSecurityGate(admin)(),false);
   // Owner impersonation previously hid authenticated-superuser RESET rights.
   await admin.$transaction(async tx=>{
    await tx.$executeRawUnsafe(`SET LOCAL SESSION AUTHORIZATION "${role}"`);
    const identity=await tx.$queryRawUnsafe<{same:boolean;originalMatches:boolean}[]>(`SELECT CURRENT_USER=SESSION_USER AS same, EXISTS (SELECT FROM pg_catalog.pg_stat_activity a JOIN pg_catalog.pg_roles r ON r.oid=a.usesysid WHERE a.pid=pg_catalog.pg_backend_pid() AND r.rolname=CURRENT_USER) AS "originalMatches"`);
    assert.deepEqual(identity,[{same:true,originalMatches:false}]);
    assert.equal(await inspectExpansionDatabaseSecurity((sql:string)=>tx.$queryRawUnsafe(sql)),false);
    await tx.$executeRawUnsafe('RESET SESSION AUTHORIZATION');
    const reset=await tx.$queryRawUnsafe<{owner:boolean}[]>(`SELECT rolsuper AS owner FROM pg_catalog.pg_roles WHERE rolname=CURRENT_USER`);
    assert.equal(reset[0].owner,true,'RESET restores the original owner/superuser');
   });
  });
  const bad=async(sql:string|string[])=>run(async(admin,runtime,trackPublicGrant)=>{
   // Commit changes so the separately authenticated backend observes them.
   activeStage='tamper';
   await admin.$transaction(async tx=>{
    for(const statement of Array.isArray(sql)?sql:[sql]){
     await tx.$executeRawUnsafe(statement);
     if(statement==='GRANT SET ON PARAMETER session_preload_libraries TO PUBLIC')trackPublicGrant();
    }
   });
   activeStage='inspect';assert.equal(await createPrismaDatabaseSecurityGate(runtime)(),false);
  });
   for(const sql of [
    `ALTER ROLE "${role}" SUPERUSER`, `ALTER ROLE "${role}" CREATEDB`, `ALTER ROLE "${role}" CREATEROLE`,
    `ALTER ROLE "${role}" REPLICATION`, `ALTER ROLE "${role}" BYPASSRLS`,
    `GRANT "${elevated}" TO "${role}"`, `GRANT "${elevated}" TO "${role}" WITH ADMIN OPTION`,
    `GRANT INSERT ON public."ExpansionLifecycleAudit" TO "${role}"`,
    `GRANT UPDATE ("operation") ON public."ExpansionLifecycleAudit" TO "${role}"`,
    `GRANT SELECT ON public."ExpansionLifecycleAudit" TO PUBLIC`,
    `GRANT INSERT ON public."ExpansionLifecycleAudit" TO authenticated`,
    `GRANT SELECT ON public."ExpansionOAuthGrant" TO anon`,
    `GRANT SELECT ("ciphertext") ON public."ExpansionOAuthGrant" TO anon`,
    `GRANT UPDATE ("ciphertext") ON public."ExpansionOAuthGrant" TO authenticated`,
    `GRANT SELECT ("ciphertext") ON public."ExpansionOAuthGrant" TO PUBLIC`,
    `GRANT UPDATE ON public."ExpansionOAuthGrant" TO "${role}" WITH GRANT OPTION`,
    `GRANT UPDATE ("ciphertext") ON public."ExpansionOAuthGrant" TO "${role}" WITH GRANT OPTION`,
    `GRANT SELECT ON public."ExpansionOAuthGrant" TO PUBLIC`,
    `GRANT USAGE ON SEQUENCE public."ExpansionLifecycleAudit_id_seq" TO "${role}"`,
    `GRANT UPDATE ON SEQUENCE public."ExpansionLifecycleAudit_id_seq" TO authenticated`,
    `GRANT EXECUTE ON FUNCTION public.expansion_audit_consent_change() TO "${role}"`,
    `GRANT EXECUTE ON FUNCTION public.expansion_audit_reject_mutation() TO PUBLIC`,
    `GRANT TRIGGER ON public."ExpansionOAuthGrant" TO "${role}"`,
    `GRANT REFERENCES ("id") ON public."ExpansionOAuthGrant" TO "${role}"`,
    `GRANT TRUNCATE ON public."ExpansionOAuthConsent" TO "${role}"`,
    `GRANT CREATE ON SCHEMA public TO "${role}"`,
    `ALTER SCHEMA public OWNER TO "${role}"`,
    `ALTER TABLE public."ExpansionOAuthGrant" OWNER TO "${role}"`,
    `ALTER TABLE public."ExpansionLifecycleAudit" OWNER TO "${role}"`,
    `ALTER TABLE public."ExpansionLifecycleAudit" ALTER COLUMN "recordedAt" SET DEFAULT '2020-01-01'::timestamptz`,
    `ALTER TABLE public."ExpansionLifecycleAudit" ALTER COLUMN "id" DROP DEFAULT`,
    `ALTER TABLE public."ExpansionLifecycleAudit" ALTER COLUMN "tenantRef" DROP NOT NULL`,
    `ALTER TABLE public."ExpansionLifecycleAudit" DROP CONSTRAINT "ExpansionLifecycleAudit_pkey"`,
    `ALTER TABLE public."ExpansionLifecycleAudit" DROP CONSTRAINT "ExpansionLifecycleAudit_shape_check"`,
    `ALTER SEQUENCE public."ExpansionLifecycleAudit_id_seq" OWNED BY NONE`,
    `ALTER SEQUENCE public."ExpansionLifecycleAudit_id_seq" INCREMENT BY 2`,
    `DROP INDEX public."ExpansionLifecycleAudit_subjectRef_id_idx"`,
    `ALTER FUNCTION public.expansion_audit_consent_change() OWNER TO "${role}"`,
    `ALTER TABLE public."ExpansionOAuthConsent" DISABLE TRIGGER expansion_consent_audit`,
    `ALTER TABLE public."ExpansionOAuthGrant" ENABLE REPLICA TRIGGER expansion_grant_audit`,
    `ALTER TABLE public."ExpansionOAuthGrant" ENABLE ALWAYS TRIGGER expansion_grant_audit`,
    `DROP TRIGGER expansion_audit_internal_insert ON public."ExpansionLifecycleAudit"`,
    `ALTER FUNCTION public.expansion_audit_consent_change() SECURITY INVOKER`,
    `ALTER FUNCTION public.expansion_audit_grant_change() SET search_path=public`,
    `CREATE OR REPLACE FUNCTION public.expansion_audit_reject_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RETURN NULL; END; $$`,
    `CREATE FUNCTION public.security_escape_${suffix}() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT NULL::void $$`,
    `ALTER TABLE public."ExpansionOAuthConsent" RENAME TO security_hidden_consent`,
    `ALTER TABLE public."ExpansionLifecycleAudit" RENAME TO security_hidden_audit`,
    `ALTER SEQUENCE public."ExpansionLifecycleAudit_id_seq" RENAME TO security_hidden_sequence`,
    `GRANT SET ON PARAMETER session_replication_role TO "${role}"`,
    `GRANT ALTER SYSTEM ON PARAMETER shared_preload_libraries TO "${role}"`,
    `GRANT SET ON PARAMETER session_preload_libraries TO "${role}"`,
    `GRANT SET ON PARAMETER session_preload_libraries TO PUBLIC`,
    `GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) TO "${role}"`,
    `GRANT EXECUTE ON FUNCTION pg_catalog.lo_import(text) TO "${role}"`,
    `GRANT EXECUTE ON FUNCTION pg_catalog.lo_export(oid,text) TO PUBLIC`,
   ])await bad(sql);
   await bad([
    'DROP TRIGGER expansion_consent_audit ON public."ExpansionOAuthConsent"',
    'CREATE TRIGGER expansion_consent_audit AFTER INSERT OR UPDATE OR DELETE ON public."ExpansionOAuthConsent" FOR EACH ROW EXECUTE FUNCTION public.expansion_audit_grant_change()',
   ]);
   await bad([
    `CREATE FUNCTION public.security_indirect_${suffix}() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END; $$`,
    `REVOKE ALL ON FUNCTION public.security_indirect_${suffix}() FROM PUBLIC`,
   ]);
   await bad('ALTER FUNCTION public.expansion_audit_grant_change() RENAME TO security_hidden_function');
   // Inert alias is created only to test ACL inspection; never invoked.
   await bad(`CREATE FUNCTION public.security_internal_${suffix}(bigint) RETURNS bigint LANGUAGE internal AS 'int8inc'`);

  await bad([`ALTER ROLE "${role}" NOINHERIT`,`GRANT "${elevated}" TO "${role}"`]);
  await run(async(admin,runtime)=>{
   await runtime.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    assert.equal(await inspectExpansionDatabaseSecurity((sql:string)=>tx.$queryRawUnsafe(sql)),false);
   });
   await runtime.$executeRawUnsafe('SET default_transaction_read_only=on');
   assert.equal(await createPrismaDatabaseSecurityGate(runtime)(),false);
  });
  await run(async(admin,runtime)=>{
   await admin.$executeRawUnsafe(`GRANT SET ON PARAMETER session_replication_role TO "${role}"`);
   await runtime.$executeRawUnsafe('SET session_replication_role=replica');
   assert.equal(await createPrismaDatabaseSecurityGate(runtime)(),false);
  });
  await run(async(admin,runtime)=>{
   await admin.$transaction(async tx=>{
    await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
    assert.equal(await inspectExpansionDatabaseSecurity((sql:string)=>tx.$queryRawUnsafe(sql)),false);
   });
  });
  const failed=createPrismaDatabaseSecurityGate({$transaction:async()=>{throw Error('SECRET_HOST_ROLE');}} as any);
  assert.equal(await failed(),false);groups++;
 } finally {
  try {await control.$disconnect();} catch(error) {
   console.error(`Synthetic cleanup failure: case=${activeCase} stage=control_disconnect code=${safeCode(error)}`);
   process.exitCode=1;
  }
 }
 console.log(`Expansion database security: ${groups} checks passed`);
}
main().catch(error=>{const stage=stages.has(error?.stage)?error.stage:activeStage;console.error(`Expansion database security smoke failed: case=${activeCase} stage=${stage} code=${safeCode(error)}`);process.exitCode=1;});
