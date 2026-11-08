import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DATABASE_SECURITY_QUERY, inspectExpansionDatabaseSecurity} from '../../src/lib/expansion/database-security.mjs';
const migration=readFileSync(new URL('../../prisma/migrations/20261108001500_expansion_lifecycle_audit/migration.sql',import.meta.url),'utf8');
const adapter=readFileSync(new URL('../../src/lib/expansion/prisma-database-security.ts',import.meta.url),'utf8');

test('catalog inspection accepts only exactly one strict safe boolean',async()=>{
 for(const rows of [[],null,undefined,[{safe:false}],[{safe:1}],[{safe:'true'}],[{safe:true},{safe:true}],[{safe:true,role:'hidden'}]])assert.equal(await inspectExpansionDatabaseSecurity(async()=>rows),false);
 assert.equal(await inspectExpansionDatabaseSecurity(async()=>[{safe:true}]),true);
});
test('errors produce only a false verdict without exposing details',async()=>{assert.equal(await inspectExpansionDatabaseSecurity(async()=>{throw Error('SECRET_ROLE_HOST_ACL')}),false);});
test('each call performs a fresh single fixed query',async()=>{let calls=0;const query=async sql=>{calls++;assert.equal(sql,DATABASE_SECURITY_QUERY);return [{safe:calls===1}];};assert.equal(await inspectExpansionDatabaseSecurity(query),true);assert.equal(await inspectExpansionDatabaseSecurity(query),false);assert.equal(calls,2);});
test('all migration function bodies are fingerprinted exactly',()=>{const bodies=[...migration.matchAll(/CREATE FUNCTION public\.(\w+)\(\) RETURNS trigger\n(.*?) AS \$\$(.*?)\$\$;/gs)];assert.equal(bodies.length,4);for(const [,name,,body] of bodies){assert.ok(DATABASE_SECURITY_QUERY.includes(name));assert.ok(DATABASE_SECURITY_QUERY.includes(createHash('sha256').update(body).digest('hex')));}});
test('query never reads user rows or mutates objects and emits one boolean only',()=>{assert.doesNotMatch(DATABASE_SECURITY_QUERY,/\b(?:INSERT INTO|UPDATE public|DELETE FROM|CREATE ROLE|GRANT |ALTER |SET ROLE|FROM public\.)/i);assert.match(DATABASE_SECURITY_QUERY,/AS safe\s*$/);assert.doesNotMatch(DATABASE_SECURITY_QUERY,/ciphertext|accessToken|refreshToken|tenantId/);});
test('role, privilege and arbitrary definer risks fail conservatively',()=>{for(const token of ['CURRENT_USER = SESSION_USER','pg_auth_members','rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls','has_parameter_privilege','has_database_privilege','has_schema_privilege','has_table_privilege','has_any_column_privilege','has_sequence_privilege','has_function_privilege','p.prosecdef',"n.nspname<>'pg_catalog'"])assert.ok(DATABASE_SECURITY_QUERY.includes(token),token);});
test('exact source wiring and executable function metadata are pinned',()=>{for(const token of ['t.tgtype=e.kind',"t.tgenabled='O'",'t.tgqual IS NULL','t.tgnargs=0','t.tgconstraint=0','t.tgattr=',"ARRAY['search_path=pg_catalog']",'f.prosecdef<>f.definer','f.proowner<>','pg_catalog.sha256','pg_rewrite'])assert.ok(DATABASE_SECURITY_QUERY.includes(token),token);});
test('adapter bounds connection wait, statement and transaction time without logging',()=>{assert.match(adapter,/statement_timeout = 1000/);assert.match(adapter,/maxWait: 250, timeout: 1500/);assert.doesNotMatch(adapter,/console\.|logger|CREATE ROLE|GRANT /);assert.match(adapter,/catch \{ return false; \}/);});

// Ordinary process-wide tsx loader avoids tsImport namespace query-string
// resolution differences between Node 22 (CI) and newer local Node versions.
const runAdapterTest=source=>execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',[
 "import assert from 'node:assert/strict';",
 `import {createPrismaDatabaseSecurityGate} from ${JSON.stringify(new URL('../../src/lib/expansion/prisma-database-security.ts',import.meta.url).href)};`,
 `import {DATABASE_SECURITY_QUERY} from ${JSON.stringify(new URL('../../src/lib/expansion/database-security.mjs',import.meta.url).href)};`,
 source,
].join('\n')],{encoding:'utf8',timeout:10000});

test('Prisma adapter executes only timeout configuration and catalog SELECT',()=>runAdapterTest(String.raw`
 const calls=[];
 const db={$transaction:async(fn,options)=>{assert.deepEqual(options,{maxWait:250,timeout:1500});return fn({$executeRawUnsafe:async sql=>{calls.push(sql);},$queryRawUnsafe:async sql=>{calls.push(sql);return [{safe:true}];}});}};
 const gate=createPrismaDatabaseSecurityGate(db);
 assert.equal(await gate(),true);assert.equal(await gate(),true);
 assert.deepEqual(calls,['SET LOCAL statement_timeout = 1000',DATABASE_SECURITY_QUERY,'SET LOCAL statement_timeout = 1000',DATABASE_SECURITY_QUERY]);
`));
test('Prisma adapter sanitizes pool, statement and transaction timeout failures',()=>runAdapterTest(String.raw`
 for(const stage of ['pool','setting','statement','commit']){
  const fail=()=>{throw Error('SECRET_ROLE_HOST_ACL timeout');};
  const db={$transaction:async fn=>{if(stage==='pool')fail();const result=await fn({$executeRawUnsafe:async()=>{if(stage==='setting')fail();},$queryRawUnsafe:async()=>{if(stage==='statement')fail();return [{safe:true}];}});if(stage==='commit')fail();return result;}};
  assert.equal(await createPrismaDatabaseSecurityGate(db)(),false);
 }
`));
test('audit shape, defaults, sequence linkage and validated indexes are inspected',()=>{for(const token of ['expected_columns','a.attnotnull=e.required','pg_catalog.pg_get_expr','clock_timestamp()','pg_catalog.pg_depend',"d.deptype='a'",'seq.seqincrement=1','c.convalidated','i.indisvalid','i.indisready',"a.is_grantable",'acl.grantee NOT IN (SELECT oid FROM runtime)'])assert.ok(DATABASE_SECURITY_QUERY.includes(token),token);});

 test('explicit parameter ACL grants to runtime, Data API roles and PUBLIC are rejected',()=>{assert.match(DATABASE_SECURITY_QUERY,/pg_catalog\.pg_parameter_acl/);assert.match(DATABASE_SECURITY_QUERY,/pg_catalog\.aclexplode\(p\.paracl\)/);assert.match(DATABASE_SECURITY_QUERY,/a\.grantee=0 OR a\.grantee IN \(SELECT oid FROM exposed\)/);});

test('backend original authenticated identity must match effective role',()=>{assert.match(DATABASE_SECURITY_QUERY,/pg_catalog\.pg_stat_activity a JOIN runtime r ON r\.oid=a\.usesysid/);assert.match(DATABASE_SECURITY_QUERY,/a\.pid=pg_catalog\.pg_backend_pid\(\)\)=1/);});
