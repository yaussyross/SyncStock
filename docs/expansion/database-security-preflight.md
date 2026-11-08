# Database security preflight (draft)

This is an additional fail-closed prerequisite for expansion OAuth routes. It does
not enable OAuth, create a database role, change grants, install credentials, run a
production migration, or attest Xero compliance.

## Request boundary

The existing default-off, configuration, exact-origin and authenticated-session
checks remain. After session authentication, every start/callback/status/accounts/
bind/disconnect request must receive a strict `true` database-security verdict
before spending quota, loading consent/grant rows or invoking a provider.

There is no success cache. Missing inspection, malformed results, exceptions,
unsafe catalog state and a two-second route deadline produce only the existing
`503 expansion_unavailable` response. Role names, hostnames, object definitions,
ACLs and database errors do not enter the HTTP response or application logs. A
late result cannot resume quota, storage or provider work for a rejected request.
The current-user existence read used for authentication precedes this check; the
preflight does not replace authentication or tenant authorization.

The adapter performs a bounded PostgreSQL catalog inspection through a transaction
with local statement timeout. It does not query application data. Local timeout
configuration is transaction-scoped; no durable setting, permission or data is
changed. Actual query and pool/transaction bounds are enforced separately from
the route deadline.

## Conservative acceptance policy

The intended runtime role must be separate from database/schema/migration owners,
without elevated role attributes, memberships or unsafe effective privileges.
The check considers current/session identity and the backend statistics identity,
PUBLIC/Data API exposure,
protected table/column/sequence/function permissions and ownership, schema creation,
replication/read-only state, and the exact expected lifecycle-audit protections.
It rejects explicit parameter ACL grants (including SET and ALTER SYSTEM),
curated server-file/large-object function privileges, callable external
untrusted-language routines and unknown non-catalog SECURITY DEFINER routines,
even if the latter's direct EXECUTE privilege was revoked: indirect invocation through other triggers
can still be dangerous. The four pinned audit helper functions are the only
reviewed exception. This does not attest arbitrary installed extensions.

Known audit function bodies are fingerprinted. Expected source and journal trigger
wiring, enablement, fixed search paths and function execution properties must
match. Missing objects or unexpected protections fail closed. Runtime roles must
not have source TRIGGER/TRUNCATE permissions or direct journal access. The gate
must never be bypassed with a configuration flag or cached prior success.

This intentionally rejects some legitimate hosted configurations. Do not relax
it or grant broad permissions merely to obtain a passing result. Establish an
approved least-privileged deployment design and verify the intended connection
identity before configuring credentials. No production role has been inspected,
provisioned or approved by this code increment.

## Boundaries

- This is a point-in-time check on a pooled connection, not a lock on all future
  catalog changes. Application connections must consistently use the intended
  runtime identity. The preflight cannot prevent a privileged operator changing
  grants or definitions immediately after inspection or replace pool isolation.
  Runtime connections must be freshly created with a role that was already
  least-privileged at login. Terminate/recreate connections after role demotion or
  security reconfiguration: current catalog state cannot attest historical
  authenticated-superuser capability retained by an existing backend.
- A database owner, superuser, host administrator or compromised database engine
  remains outside this protection. The check does not attest arbitrary installed
  extensions, filesystem/network isolation, TLS/backups, key custody or operational
  access policy. PostgreSQL built-in capabilities still depend on trustworthy
  software and administration.
- The inspection requires PostgreSQL 15 or newer catalog capabilities. Older or
  missing capabilities fail closed. Schema upgrades deliberately require a matching reviewed security manifest and
  tests. A missing database capability or unknown catalog behavior is a denial,
  not permission to skip inspection.
- These routes remain blocked by every other existing requirement. This gate does
  not supply MFA/SSO, independently authenticated audit actors, external immutable
  retention/monitoring, approved deletion/retention policy, provider grants or
  source-to-destination accounting acceptance.

## Verification

Route tests cover all six operations, disabled/unauthenticated requests, rejection
before quota/state/provider work, fresh evaluation on each request, pending-state
preservation and late success/rejection after timeout. Synthetic catalog/adapter
checks and an explicitly selected disposable loopback PostgreSQL suite test the
acceptance policy and deliberate privilege/definition tampering. Positive cases
use genuinely authenticated temporary runtime clients, not an owner session
impersonating a runtime role. Committed tampering happens in uniquely named
disposable database clones, which are removed along with temporary test roles. No test may use
production credentials or call a real provider. Require passing exact-head CI,
including migration/schema and existing lifecycle tests, before marking the draft
increment verified.
