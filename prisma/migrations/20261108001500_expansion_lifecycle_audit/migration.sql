-- Draft only. An atomic, minimized database lifecycle journal, NOT an external
-- immutable audit sink or proof of user intent. No live settings are changed.
BEGIN;
CREATE TABLE public."ExpansionLifecycleAudit" (
  "id" BIGSERIAL NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  "entityKind" VARCHAR(16) NOT NULL,
  "operation" VARCHAR(8) NOT NULL,
  "tenantRef" VARCHAR(64) NOT NULL,
  "priorTenantRef" VARCHAR(64),
  "subjectRef" VARCHAR(64) NOT NULL,
  "priorSubjectRef" VARCHAR(64),
  "provider" VARCHAR(8),
  "environment" VARCHAR(16),
  "beforeVersion" INTEGER,
  "afterVersion" INTEGER,
  "beforeStatus" VARCHAR(16),
  "afterStatus" VARCHAR(16),
  "beforeBound" BOOLEAN,
  "afterBound" BOOLEAN,
  "beforeDisconnect" VARCHAR(16),
  "afterDisconnect" VARCHAR(16),
  CONSTRAINT "ExpansionLifecycleAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpansionLifecycleAudit_shape_check" CHECK (
    "entityKind" IN ('consent', 'grant') AND "operation" IN ('INSERT', 'UPDATE', 'DELETE')
    AND "tenantRef" ~ '^[a-f0-9]{64}$' AND "subjectRef" ~ '^[a-f0-9]{64}$'
    AND ("priorTenantRef" IS NULL OR "priorTenantRef" ~ '^[a-f0-9]{64}$')
    AND ("priorSubjectRef" IS NULL OR "priorSubjectRef" ~ '^[a-f0-9]{64}$')
    AND ("provider" IS NULL OR "provider" IN ('xero', 'ebay', 'other'))
    AND ("environment" IS NULL OR "environment" IN ('production', 'sandbox', 'other'))
    AND ("beforeStatus" IS NULL OR "beforeStatus" IN ('available', 'refreshing', 'held', 'revoked', 'other'))
    AND ("afterStatus" IS NULL OR "afterStatus" IN ('available', 'refreshing', 'held', 'revoked', 'other'))
    AND ("beforeDisconnect" IS NULL OR "beforeDisconnect" IN ('local_only', 'outcome_unknown', 'disconnected', 'other'))
    AND ("afterDisconnect" IS NULL OR "afterDisconnect" IN ('local_only', 'outcome_unknown', 'disconnected', 'other'))
  )
);
CREATE INDEX "ExpansionLifecycleAudit_tenantRef_recordedAt_idx" ON public."ExpansionLifecycleAudit"("tenantRef", "recordedAt");
CREATE INDEX "ExpansionLifecycleAudit_subjectRef_id_idx" ON public."ExpansionLifecycleAudit"("subjectRef", "id");
-- Deliberately no foreign key or cascade: deletion must not silently erase its
-- own evidence. Hash references are pseudonymous, not anonymous. Retention,
-- export, authorized erasure and operator access need an approved rollout plan.
REVOKE ALL ON TABLE public."ExpansionLifecycleAudit" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public."ExpansionLifecycleAudit_id_seq" FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.expansion_audit_reject_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Expansion lifecycle audit is append-only' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER expansion_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON public."ExpansionLifecycleAudit" FOR EACH STATEMENT EXECUTE FUNCTION public.expansion_audit_reject_mutation();
-- Defense in depth even for the migration owner. Runtime roles must separately
-- lack INSERT and DDL privileges; trigger depth alone is not an ACL boundary.
CREATE FUNCTION public.expansion_audit_require_trigger() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Expansion lifecycle audit requires a source trigger' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER expansion_audit_internal_insert BEFORE INSERT ON public."ExpansionLifecycleAudit"
FOR EACH ROW EXECUTE FUNCTION public.expansion_audit_require_trigger();

CREATE FUNCTION public.expansion_audit_consent_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  item public."ExpansionOAuthConsent";
BEGIN
  IF TG_RELID <> 'public."ExpansionOAuthConsent"'::regclass OR TG_LEVEL <> 'ROW' OR TG_WHEN <> 'AFTER' OR TG_OP NOT IN ('INSERT','UPDATE','DELETE') THEN
    RAISE EXCEPTION 'Invalid lifecycle audit source' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN item := OLD; ELSE item := NEW; END IF;
  INSERT INTO public."ExpansionLifecycleAudit" ("entityKind","operation","tenantRef","priorTenantRef","subjectRef","priorSubjectRef")
  VALUES ('consent', TG_OP,
    encode(sha256(convert_to('syncstock:audit:v1:tenant:' || item."tenantId", 'UTF8')), 'hex'),
    CASE WHEN TG_OP <> 'INSERT' THEN encode(sha256(convert_to('syncstock:audit:v1:tenant:' || OLD."tenantId", 'UTF8')), 'hex') END,
    encode(sha256(convert_to('syncstock:audit:v1:consent:' || item."stateHash", 'UTF8')), 'hex'),
    CASE WHEN TG_OP <> 'INSERT' THEN encode(sha256(convert_to('syncstock:audit:v1:consent:' || OLD."stateHash", 'UTF8')), 'hex') END);
  RETURN NULL;
END;
$$;
CREATE TRIGGER expansion_consent_audit AFTER INSERT OR UPDATE OR DELETE ON public."ExpansionOAuthConsent"
FOR EACH ROW EXECUTE FUNCTION public.expansion_audit_consent_change();

CREATE FUNCTION public.expansion_audit_grant_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  item public."ExpansionOAuthGrant";
BEGIN
  IF TG_RELID <> 'public."ExpansionOAuthGrant"'::regclass OR TG_LEVEL <> 'ROW' OR TG_WHEN <> 'AFTER' OR TG_OP NOT IN ('INSERT','UPDATE','DELETE') THEN
    RAISE EXCEPTION 'Invalid lifecycle audit source' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN item := OLD; ELSE item := NEW; END IF;
  INSERT INTO public."ExpansionLifecycleAudit" (
    "entityKind","operation","tenantRef","priorTenantRef","subjectRef","priorSubjectRef","provider","environment",
    "beforeVersion","afterVersion","beforeStatus","afterStatus","beforeBound","afterBound","beforeDisconnect","afterDisconnect"
  ) VALUES (
    'grant', TG_OP,
    encode(sha256(convert_to('syncstock:audit:v1:tenant:' || item."tenantId", 'UTF8')), 'hex'),
    CASE WHEN TG_OP <> 'INSERT' THEN encode(sha256(convert_to('syncstock:audit:v1:tenant:' || OLD."tenantId", 'UTF8')), 'hex') END,
    encode(sha256(convert_to('syncstock:audit:v1:grant:' || item."id", 'UTF8')), 'hex'),
    CASE WHEN TG_OP <> 'INSERT' THEN encode(sha256(convert_to('syncstock:audit:v1:grant:' || OLD."id", 'UTF8')), 'hex') END,
    CASE WHEN item."provider" IN ('xero','ebay') THEN item."provider" ELSE 'other' END,
    CASE WHEN item."environment" IN ('production','sandbox') THEN item."environment" ELSE 'other' END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD."version" END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW."version" END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL WHEN OLD."status" IN ('available','refreshing','held','revoked') THEN OLD."status" ELSE 'other' END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL WHEN NEW."status" IN ('available','refreshing','held','revoked') THEN NEW."status" ELSE 'other' END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD."providerAccountId" IS NOT NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW."providerAccountId" IS NOT NULL END,
    CASE WHEN TG_OP = 'INSERT' OR OLD."disconnectOutcome" IS NULL THEN NULL WHEN OLD."disconnectOutcome" IN ('local_only','outcome_unknown','disconnected') THEN OLD."disconnectOutcome" ELSE 'other' END,
    CASE WHEN TG_OP = 'DELETE' OR NEW."disconnectOutcome" IS NULL THEN NULL WHEN NEW."disconnectOutcome" IN ('local_only','outcome_unknown','disconnected') THEN NEW."disconnectOutcome" ELSE 'other' END
  );
  RETURN NULL;
END;
$$;
CREATE TRIGGER expansion_grant_audit AFTER INSERT OR UPDATE OR DELETE ON public."ExpansionOAuthGrant"
FOR EACH ROW EXECUTE FUNCTION public.expansion_audit_grant_change();
-- TRUNCATE does not fire row DELETE triggers, so forbid this unaudited shortcut.
CREATE TRIGGER expansion_consent_no_truncate BEFORE TRUNCATE ON public."ExpansionOAuthConsent"
FOR EACH STATEMENT EXECUTE FUNCTION public.expansion_audit_reject_mutation();
CREATE TRIGGER expansion_grant_no_truncate BEFORE TRUNCATE ON public."ExpansionOAuthGrant"
FOR EACH STATEMENT EXECUTE FUNCTION public.expansion_audit_reject_mutation();
REVOKE ALL ON FUNCTION public.expansion_audit_reject_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expansion_audit_require_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expansion_audit_consent_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expansion_audit_grant_change() FROM PUBLIC, anon, authenticated;
COMMIT;
