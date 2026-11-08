# Expansion lifecycle journal (draft only)

This increment records committed database changes to expansion consent and grant
rows. It is not a complete Xero security audit, immutable external archive,
monitoring service, approved retention policy or permission to enable OAuth.
Production and real provider access remain unchanged.

## What the migration does

- `ExpansionOAuthConsent` and `ExpansionOAuthGrant` row triggers insert a journal
  entry in the same transaction as every insert, update or delete. Rolled-back
  operations leave no journal entry. A failed journal insert fails the source
  mutation. CAS losers that update zero rows produce no success record.
- Entries contain a generated sequence ID and database clock time, entity kind,
  SQL operation, domain-separated SHA-256 references to internal tenant/row IDs,
  and bounded grant state/version/binding/disconnect fields. Reassignment retains
  both prior and current hashed references. Unknown source strings become a fixed
  `other` marker, never arbitrary text.
- Credentials, ciphertext, OAuth state/code/verifier, session IDs, application IDs,
  provider organization/connection identifiers, names, emails, URLs and error
  text are excluded. No browser route or API for reading the journal is added.
- Source triggers use a fixed `pg_catalog` search path, schema-qualified tables,
  and exact relation/timing checks. They are the normal writer. Audit-table and
  sequence access and helper execution are revoked from PUBLIC and the Supabase
  Data API roles. A non-owner runtime role needs no journal access to mutate
  authorized source rows through these triggers.
- The journal rejects ordinary direct insert, update, delete and truncate.
  Source-table truncate is rejected because it would bypass row-delete events.
  Source deletion cascades leave evidence in the journal, which has no foreign
  key back to the deleted user or credential row.
- The migration is transactional. It does not backfill earlier activity or
  connect providers. Source changes before deployment remain outside its scope.

## Important limits before rollout

1. **Privilege isolation is operational work.** The migration owner or a DBA can
   alter/disable triggers, use replication privileges, alter tables, or destroy
   the database. The application must use a separate non-owner role without
   DDL, TRIGGER, TRUNCATE, journal writes, role escalation or replication bypass.
   Production roles have not been verified or changed. Trigger-depth checking
   alone is not a permissions boundary. This is not WORM storage.
2. **These are database facts, not proven user intent.** A `DELETE` event cannot
   distinguish consent consumption, expiry cleanup or account deletion. State
   transitions describe stored outcomes, not successful remote operations beyond
   the existing disconnect coordinator's evidence. The journal does not identify
   a separately authenticated initiating actor. Request rejection, login attempts,
   reads and provider-call attempts are not recorded by these row triggers.
3. **Hashed references remain personal/pseudonymous data.** They are unkeyed,
   domain-separated hashes of high-entropy internal identifiers. Known IDs can
   be correlated. Do not call them anonymous. Rows persist after account deletion
   to avoid erasing the deletion evidence. No retention duration or erasure policy
   has been adopted; the unbounded journal must not be enabled without an approved
   retention/export/deletion approach and capacity/alerting plan. No automatic
   pruning is installed, and production deletion promises must account for this.
4. **Ordering is not proof of commit order.** Sequence gaps are normal after
   rollback; concurrent sequence IDs and timestamps are not a global commit order
   or a tamper-evident cryptographic chain. Use versions for source transitions.
5. **External custody and monitoring remain missing.** Approve and configure an
   independently controlled append-only archive, retention/access controls,
   integrity verification, incident alerts, ownership and response procedures.
   Do not send actual journal data to an external destination without approval.
6. **Availability and integrity must be tested in the intended deployment.** An
   unavailable/full journal blocks connection mutations by design. Failure while
   saving a provider refresh must remain held/unknown under the existing refresh
   coordinator; no retries or fallback logging are added here. Validate privileges,
   backup/restore, load, clock behavior and failure handling before rollout.

## Verification

The static suite checks schema projection, fixed search paths/source relations,
permissions, append-only guards and absence of arbitrary payload fields. The
PostgreSQL suite uses only an explicitly selected disposable loopback database,
synthetic users/grants and mocked provider responses. It tests:

- Consent insert/update/delete and grant refresh/hold/revoke state changes.
- Independent-client refresh contention with no phantom success events.
- Rollback and uniqueness failures; audit-insert failure aborting source changes.
- Local and narrow organization disconnect outcomes and binding state.
- Absence of raw secret/identity canaries and normalization of unknown text.
- Tenant reassignment, runtime-role protections and owner accidental-mutation guards.
- Search-path shadowing, wrong-source triggers and deletion-cascade evidence.

Database tests must pass on the published exact head before claiming verification.
These checks do not simulate a privileged DBA compromise or establish Xero compliance.
