/** Point-in-time conservative catalog preflight, not operational attestation.
 * No user rows, credentials, role names or source definitions leave PostgreSQL.
 * Reject all memberships rather than attempt to model version-specific SET ROLE
 * and ADMIN option escalation. Unknown non-catalog SECURITY DEFINER
 * routines are rejected, including indirect trigger entry points, not audited. A privileged concurrent actor can change
 * these facts after this snapshot; external custody/monitoring is still needed.
 * Backend identity prevents owner impersonation, but historical authenticated
 * superuser state is not fully represented by catalogs. Recycle connections
 * after any privilege changes; trusted native code/preloads remain out of scope.
 */
export const DATABASE_SECURITY_QUERY = `
WITH runtime AS (
 SELECT * FROM pg_catalog.pg_roles WHERE rolname = CURRENT_USER
), exposed AS (
 SELECT oid FROM runtime UNION SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated')
), objects AS (
 SELECT c.* FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('ExpansionOAuthConsent','ExpansionOAuthGrant','ExpansionLifecycleAudit','ExpansionLifecycleAudit_id_seq')
), expected_columns(name, kind, required, position) AS (VALUES
 ('id','bigint',true,1),
 ('recordedAt','timestamp(3) with time zone',true,2),
 ('entityKind','character varying(16)',true,3),
 ('operation','character varying(8)',true,4),
 ('tenantRef','character varying(64)',true,5),
 ('priorTenantRef','character varying(64)',false,6),
 ('subjectRef','character varying(64)',true,7),
 ('priorSubjectRef','character varying(64)',false,8),
 ('provider','character varying(8)',false,9),
 ('environment','character varying(16)',false,10),
 ('beforeVersion','integer',false,11),
 ('afterVersion','integer',false,12),
 ('beforeStatus','character varying(16)',false,13),
 ('afterStatus','character varying(16)',false,14),
 ('beforeBound','boolean',false,15),
 ('afterBound','boolean',false,16),
 ('beforeDisconnect','character varying(16)',false,17),
 ('afterDisconnect','character varying(16)',false,18)
), expected_functions(name, definer, digest) AS (VALUES
('expansion_audit_reject_mutation', false, 'c2ef97873fe7a873e93b5db78dc8ca2ff6f00e0cfcdc5255cdae4aa527f33603'),
('expansion_audit_require_trigger', false, '80d2ecf5655bd321fe7bbb288cd509bbcf134834da64d13c774af2c8ee959710'),
('expansion_audit_consent_change', true, '7dbf8ed291079db67ae318839186c679c957e46f80dd0a635e1facb960ba6e8d'),
('expansion_audit_grant_change', true, '5b5d9bdb48b48e7923dc0011440f6db80132bfbfe12b0c0d823445316870bce5')
), functions AS (
 SELECT p.*, e.definer, e.digest FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN expected_functions e ON e.name=p.proname
 WHERE n.nspname='public' AND p.pronargs=0
), expected_triggers(relname, name, function_name, kind) AS (VALUES
 ('ExpansionOAuthConsent','expansion_consent_audit','expansion_audit_consent_change',29),
 ('ExpansionOAuthGrant','expansion_grant_audit','expansion_audit_grant_change',29),
 ('ExpansionOAuthConsent','expansion_consent_no_truncate','expansion_audit_reject_mutation',34),
 ('ExpansionOAuthGrant','expansion_grant_no_truncate','expansion_audit_reject_mutation',34),
 ('ExpansionLifecycleAudit','expansion_audit_immutable','expansion_audit_reject_mutation',58),
 ('ExpansionLifecycleAudit','expansion_audit_internal_insert','expansion_audit_require_trigger',7)
)
SELECT COALESCE((
 CURRENT_USER = SESSION_USER
 AND (SELECT count(*) FROM pg_catalog.pg_stat_activity a JOIN runtime r ON r.oid=a.usesysid
      WHERE a.pid=pg_catalog.pg_backend_pid())=1
 AND (SELECT count(*) FROM runtime)=1
 AND NOT EXISTS (SELECT FROM pg_catalog.pg_roles r JOIN exposed e ON e.oid=r.oid WHERE r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
 AND NOT EXISTS (SELECT FROM pg_catalog.pg_auth_members m JOIN exposed r ON r.oid=m.member)
 AND pg_catalog.current_setting('is_superuser')='off'
 AND pg_catalog.current_setting('transaction_read_only')='off'
 AND pg_catalog.current_setting('default_transaction_read_only')='off'
 AND pg_catalog.current_setting('session_replication_role')='origin'
 AND NOT pg_catalog.pg_is_in_recovery()
 AND NOT EXISTS (SELECT FROM runtime r WHERE pg_catalog.has_parameter_privilege(r.oid,'session_replication_role','SET'))
 AND NOT EXISTS (SELECT FROM pg_catalog.pg_parameter_acl p CROSS JOIN LATERAL pg_catalog.aclexplode(p.paracl) a
   WHERE a.grantee=0 OR a.grantee IN (SELECT oid FROM exposed))
 AND NOT EXISTS (SELECT FROM pg_catalog.pg_database d JOIN exposed r ON
   d.datdba=r.oid OR pg_catalog.has_database_privilege(r.oid,d.oid,'CREATE') WHERE d.datname=pg_catalog.current_database())
 AND NOT EXISTS (SELECT FROM pg_catalog.pg_namespace n CROSS JOIN exposed r
   WHERE n.nspname NOT LIKE 'pg_temp_%' AND n.nspname NOT LIKE 'pg_toast_temp_%'
   AND (n.nspowner=r.oid OR pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE')))
 AND (SELECT count(*) FROM objects)=4
 AND NOT EXISTS (SELECT FROM objects WHERE
   (relname='ExpansionLifecycleAudit_id_seq' AND (relkind<>'S' OR relpersistence<>'p')) OR
   (relname<>'ExpansionLifecycleAudit_id_seq' AND (relkind<>'r' OR relpersistence<>'p' OR relrowsecurity OR relforcerowsecurity)))

 AND (SELECT count(*) FROM pg_catalog.pg_attribute a JOIN objects o ON o.oid=a.attrelid WHERE o.relname='ExpansionLifecycleAudit' AND a.attnum>0 AND NOT a.attisdropped)=18
 AND NOT EXISTS (SELECT FROM expected_columns e WHERE NOT EXISTS (
   SELECT FROM pg_catalog.pg_attribute a JOIN objects o ON o.oid=a.attrelid
   WHERE o.relname='ExpansionLifecycleAudit' AND a.attname=e.name AND a.attnum=e.position
   AND pg_catalog.format_type(a.atttypid,a.atttypmod)=e.kind AND a.attnotnull=e.required
   AND NOT a.attisdropped AND a.attidentity='' AND a.attgenerated=''))
 AND (SELECT count(*) FROM pg_catalog.pg_attrdef d JOIN objects o ON o.oid=d.adrelid WHERE o.relname='ExpansionLifecycleAudit')=2
 AND EXISTS (SELECT FROM pg_catalog.pg_attrdef d JOIN objects o ON o.oid=d.adrelid WHERE o.relname='ExpansionLifecycleAudit' AND d.adnum=2 AND pg_catalog.pg_get_expr(d.adbin,d.adrelid)='clock_timestamp()')
 AND EXISTS (SELECT FROM pg_catalog.pg_attrdef d JOIN objects o ON o.oid=d.adrelid WHERE o.relname='ExpansionLifecycleAudit' AND d.adnum=1 AND pg_catalog.pg_get_expr(d.adbin,d.adrelid) IN ('nextval(''public."ExpansionLifecycleAudit_id_seq"''::regclass)','nextval(''"ExpansionLifecycleAudit_id_seq"''::regclass)'))
 AND EXISTS (SELECT FROM pg_catalog.pg_depend d JOIN objects seq ON seq.oid=d.objid JOIN objects tab ON tab.oid=d.refobjid
   WHERE seq.relname='ExpansionLifecycleAudit_id_seq' AND tab.relname='ExpansionLifecycleAudit' AND seq.relowner=tab.relowner
   AND d.classid='pg_catalog.pg_class'::pg_catalog.regclass AND d.refclassid='pg_catalog.pg_class'::pg_catalog.regclass AND d.refobjsubid=1 AND d.deptype='a')
 AND EXISTS (SELECT FROM pg_catalog.pg_sequence seq JOIN objects o ON o.oid=seq.seqrelid WHERE o.relname='ExpansionLifecycleAudit_id_seq'
   AND seq.seqtypid='pg_catalog.int8'::pg_catalog.regtype AND seq.seqincrement=1 AND seq.seqmin=1 AND seq.seqstart=1 AND NOT seq.seqcycle)
 AND (SELECT count(*) FROM pg_catalog.pg_constraint c JOIN objects o ON o.oid=c.conrelid WHERE o.relname='ExpansionLifecycleAudit')=2
 AND EXISTS (SELECT FROM pg_catalog.pg_constraint c JOIN objects o ON o.oid=c.conrelid JOIN pg_catalog.pg_index i ON i.indexrelid=c.conindid
   WHERE o.relname='ExpansionLifecycleAudit' AND c.conname='ExpansionLifecycleAudit_pkey' AND c.contype='p' AND c.conkey=ARRAY[1]::smallint[]
   AND c.convalidated AND NOT c.condeferrable AND i.indisvalid AND i.indisready AND i.indisunique AND i.indisprimary)
 AND EXISTS (SELECT FROM pg_catalog.pg_constraint c JOIN objects o ON o.oid=c.conrelid WHERE o.relname='ExpansionLifecycleAudit'
   AND c.conname='ExpansionLifecycleAudit_shape_check' AND c.contype='c' AND c.convalidated AND NOT c.connoinherit
   AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_constraintdef(c.oid),'UTF8')),'hex')='01f65a0e782b2b44f8a13eabfcd62dfb32101a9221901a599aabf428a281ea0c'
   AND ARRAY(SELECT x FROM pg_catalog.unnest(c.conkey) x ORDER BY x)=ARRAY[3,4,5,6,7,8,9,10,13,14,17,18]::smallint[])
 AND (SELECT count(*) FROM pg_catalog.pg_index i JOIN objects o ON o.oid=i.indrelid JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
   WHERE o.relname='ExpansionLifecycleAudit' AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL AND
   ((c.relname='ExpansionLifecycleAudit_tenantRef_recordedAt_idx' AND i.indkey='5 2'::pg_catalog.int2vector)
    OR (c.relname='ExpansionLifecycleAudit_subjectRef_id_idx' AND i.indkey='7 1'::pg_catalog.int2vector)))=2
 AND NOT EXISTS (SELECT FROM objects o JOIN exposed r ON o.relowner=r.oid)
 AND NOT EXISTS (SELECT FROM objects o CROSS JOIN exposed r WHERE o.relkind='r' AND
   (pg_catalog.has_table_privilege(r.oid,o.oid,'TRIGGER,TRUNCATE,REFERENCES') OR
   (o.relname='ExpansionLifecycleAudit' AND (pg_catalog.has_table_privilege(r.oid,o.oid,'INSERT,UPDATE,DELETE,SELECT') OR pg_catalog.has_any_column_privilege(r.oid,o.oid,'INSERT,UPDATE,SELECT,REFERENCES'))) OR
   (r.oid NOT IN (SELECT oid FROM runtime) AND pg_catalog.has_table_privilege(r.oid,o.oid,'INSERT,UPDATE,DELETE,SELECT'))))
 AND NOT EXISTS (SELECT FROM objects o CROSS JOIN exposed r WHERE o.relkind='S' AND pg_catalog.has_sequence_privilege(r.oid,o.oid,'USAGE,SELECT,UPDATE'))
 AND NOT EXISTS (SELECT FROM objects o CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(o.relacl,pg_catalog.acldefault(CASE WHEN o.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,o.relowner))) a WHERE a.grantee=0 OR (a.grantee IN (SELECT oid FROM exposed) AND a.is_grantable))
 AND NOT EXISTS (SELECT FROM pg_catalog.pg_attribute a JOIN objects o ON a.attrelid=o.oid CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl WHERE acl.grantee=0 OR (acl.grantee IN (SELECT oid FROM exposed) AND (o.relname='ExpansionLifecycleAudit' OR acl.grantee NOT IN (SELECT oid FROM runtime) OR acl.is_grantable OR acl.privilege_type='REFERENCES')))
 AND (SELECT count(*) FROM functions)=4
 AND NOT EXISTS (SELECT FROM functions f WHERE
   f.prosecdef<>f.definer OR f.prokind<>'f' OR f.prorettype<>'pg_catalog.trigger'::pg_catalog.regtype
   OR f.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
   OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
   OR f.provolatile<>'v' OR f.proleakproof OR f.proparallel<>'u'
   OR f.proowner<>(SELECT relowner FROM objects WHERE relname='ExpansionLifecycleAudit')
   OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(f.prosrc,'UTF8')),'hex')<>f.digest)
 AND NOT EXISTS (SELECT FROM functions f CROSS JOIN exposed r WHERE pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE'))
 AND NOT EXISTS (SELECT FROM functions f CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(f.proacl,pg_catalog.acldefault('f',f.proowner))) a WHERE a.grantee=0)
 AND NOT EXISTS (SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE p.prosecdef AND n.nspname<>'pg_catalog' AND p.oid NOT IN (SELECT oid FROM functions))
 AND NOT EXISTS (SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang CROSS JOIN exposed r
   WHERE n.nspname<>'pg_catalog' AND NOT l.lanpltrusted AND pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE'))
 AND NOT EXISTS (SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace CROSS JOIN exposed r
   WHERE n.nspname='pg_catalog' AND p.proname IN ('lo_import','lo_export','pg_read_file','pg_read_binary_file','pg_ls_dir','pg_stat_file','pg_ls_logdir','pg_ls_waldir','pg_ls_tmpdir','pg_ls_archive_statusdir','pg_ls_logicalmapdir','pg_ls_logicalsnapdir','pg_ls_replslotdir','pg_logdir_ls','pg_file_write','pg_file_rename','pg_file_unlink')
   AND pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE'))
 AND (SELECT count(*) FROM pg_catalog.pg_trigger t JOIN objects o ON o.oid=t.tgrelid WHERE NOT t.tgisinternal)=6
 AND NOT EXISTS (SELECT FROM expected_triggers e WHERE NOT EXISTS (
   SELECT FROM pg_catalog.pg_trigger t JOIN objects o ON o.oid=t.tgrelid JOIN functions f ON f.oid=t.tgfoid
   WHERE o.relname=e.relname AND t.tgname=e.name AND f.proname=e.function_name
   AND t.tgtype=e.kind AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgqual IS NULL
   AND t.tgnargs=0 AND pg_catalog.octet_length(t.tgargs)=0 AND t.tgattr=''::pg_catalog.int2vector
   AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgconstraint=0
   AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL))
 AND NOT EXISTS (SELECT FROM pg_catalog.pg_rewrite w JOIN objects o ON o.oid=w.ev_class)
), false) AS safe
`;

export async function inspectExpansionDatabaseSecurity(query) {
  try {
    const rows = await query(DATABASE_SECURITY_QUERY);
    return Array.isArray(rows) && rows.length === 1 && rows[0]?.safe === true
      && Object.keys(rows[0]).length === 1;
  } catch { return false; }
}
