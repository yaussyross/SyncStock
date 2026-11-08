# Xero security readiness: evidence and unresolved controls

Checkpoint: November 7, 2026. This is an engineering assessment, not a compliance
attestation, adopted security policy, approved privacy notice, or permission to
enable Xero. Keep real OAuth disabled. A passing build does not satisfy the
operational requirements below.

## Verified implementation and deployment boundary

- Draft PR 80, commit `a4cb1e81aff5df9a77667ee9827e5f743e30e1d5`, passed 737 offline
  tests and 43 real PostgreSQL groups: consent 11, token storage 12, account
  binding 10 and shared rate limiting 10. Clean migration, schema comparison,
  privilege checks, regression tests, production build and HTTP checks passed.
  [Exact-head CI](https://github.com/yaussyross/SyncStock/actions/runs/42416441898).
- Its canonical preview is READY at
  `https://sync-stock-47sy1bhzg-raus2.vercel.app`. This is not a production grant
  or acceptance test. Production main remains at the separately reported
  `7b61a906` checkpoint; no expansion callback was deployed to production here.
- Read-only Vercel project/domain metadata identifies canonical project
  `prj_kOILxs8V1J6yRyLRvH5Swu9zE0IU` and verified production domain
  `sync-stock-six.vercel.app`. Source constructs the candidate callback as
  `https://sync-stock-six.vercel.app/api/expansion/oauth/xero/callback`, but the
  production callback is not enabled or verified. Do not substitute a preview
  domain for the production app registration without deliberate approval.
- Source permits only `accounting.settings.read offline_access`. The wired
  surface is consent, token persistence, organization discovery/selection and
  connection status. Native chart-of-accounts reading exists separately but is
  not called by these HTTP routes. No Xero transaction posting is enabled.
- Consent and token envelopes use AES-256-GCM. Organization and connection IDs,
  user/application IDs, timestamps and lifecycle metadata also occupy ordinary
  database columns. Do not claim every Xero field is application-encrypted.
- Local follow-up increment after a4cb1e81: callback redirects are aligned with Xero's documented 302 recommendation. The a4cb1e81 preview still uses 303; do not treat that deployment as evidence of this later change.
  Xero success and handled exchange/consent failures have an empty body and a
  fixed same-origin destination. eBay retains 303. Earlier configuration, auth,
  malformed-input and quota errors remain generic JSON, never HTML, and retain
  no-store/no-referrer/nosniff headers. This change does not redact ingress logs.

## Evidence required before any security attestation

| Control | Current evidence or gap | Concrete next step |
| --- | --- | --- |
| Credential custody | Encrypted token envelopes and tenant-bound access are tested. Actual secret provisioning, key access, rotation and recovery are unverified. | Identify accountable operator; review server secret storage and roles without exporting values; document rotation/revocation and backup controls. |
| Customer authentication | Expansion accepts the existing web session. Current reviewed signup/login is password-only; no MFA/SSO enforcement was found. | Implement and test minimum two-step authentication or a suitable SSO flow, including recovery, session revocation and an assurance requirement before Xero access. Password length alone does not meet this requirement. |
| Operational access | Project deployment protection reports SSO enabled for `all_except_custom_domains`. This does not prove operator MFA, least privilege, staff policies or database access control. | Review actual Vercel, database, worker and repository membership/roles, strong authentication and access-review/offboarding process. Record evidence and owner, not credentials. |
| Hosting isolation | Vercel documents isolation capabilities. Actual runtime/Fluid configuration, database/network isolation and Xero's interpretation of its shared-host rule remain unverified. | Obtain deployment-specific architecture evidence. If still ambiguous, seek authorized clarification from Xero; do not equate serverless with dedicated hardware or assume Vercel is categorically disallowed. |
| Transport/storage encryption | Code fixes provider origins to HTTPS and production cookies are Secure/HttpOnly. Actual TLS versions/ciphers, database TLS, disk/backups encryption and recovery controls were not verified. | Check the deployed browser/provider/database paths and hosting encryption evidence using non-secret metadata and authorized tests. |
| Query logging | Routes are silent; optional projection excludes raw inputs. Vercel documents request Search Params. The project-specific drain list was empty, but upstream runtime metadata remains a separate concern. | Complete [logging-safety.md](logging-safety.md): establish source-side exclusion, then authorized synthetic canaries across all collectors. Do not set the attestation flag based on unit tests or an empty drain list. |
| Edge protection | Shared authenticated quotas are tested. Active firewall metadata read returned 404; actual edge rules could not be verified. Authenticated quota does not protect the pre-authentication path. | Inspect correct project/environment firewall/rate controls. Treat the 404 as missing evidence, not proof no protections exist. |
| Audit and monitoring | Silent request handlers and the enum projection are diagnostics safeguards, not a durable audit trail. No suitable immutable Xero audit sink or threat-monitoring process was verified. | Design secure append-only audit events for actor, time, action and actual outcome without URL/code/token data; define access and retention, generally at least a year under Xero's standard. Approve/configure the sink and test monitoring before claiming compliance. |
| Browser resource isolation | Later draft code introduces a separate setup root without App Bridge/fonts/FeedbackLink, nonce CSP, encoded-alias handling and preserved ordinary layouts. Browser scenarios could not run locally. | Verify the isolated synthetic browser CI job, full-document navigation/history, hydration and disconnect UI before claiming the runtime boundary is proved. |
| Disconnect/deletion | Later draft adds explicit local-only removal or fresh-proof-bound Xero connection deletion, durable unknown outcomes and safe UI confirmation. No live provider acceptance has run. Cleanup helpers remain unscheduled and general account deletion is absent. | Verify the new PostgreSQL/browser suites and authorized provider acceptance. Define and test expiry cleanup, general deletion/export and backup retention. Do not promise immediate universal deletion or whole-grant revocation. |
| Privacy/terms and agreement | Public privacy source describes Shopify-to-QuickBooks only. Reviewed signup has no policy-version consent record. | Approve accurate Xero disclosures and terms, publish only after approval, and record the version/time/user agreement before use. The separate policy draft is not adopted. |
| Incident response | No adopted owner, response process or monitoring evidence was verified. | Assign primary/backup owner and monitored channel; approve a runbook, preserve evidence securely and conduct a tabletop exercise before attesting. |

## Data-flow and AI-use statement boundaries

Organization discovery receives Xero connection IDs, organization IDs/type and
names, and returns the selected list to the authenticated browser. Names are not
part of the persisted grant contract. The separate chart reader receives the
bounded full provider response before projecting account ID/type/status/code/
name/currency/tax type. Omitted bank numbers or balances may therefore have been
present in server memory even though they are not returned by the projection.

No AI SDK/model invocation or analytics pipeline was found in the traced Xero
implementation or declared dependencies. That source finding does not establish
historical data use, support/operator practices, external-script behavior or a
legal no-training assurance. Do not answer broader AI-data-use questions without
confirming the intended scope and these operational practices. This assessment
used source and synthetic tests, not real Xero records or credentials.

## Proposed incident-response preparation, not an adopted policy

1. Assign an accountable responder and backup with a monitored contact channel.
2. Define triage and authorized containment: disable affected access, preserve
   non-secret evidence, determine systems/data involved, and rotate/revoke
   credentials only under the applicable approval process.
3. Prepare a notice containing the incident description and containment/mitigation
   plan. Current Xero Developer Platform Terms clause 15 calls for immediate
   notice, no later than 24 hours after discovery, to `api@support.xero.com`.
   The older security-requirements page names `api@xero.com`; resolve this
   discrepancy before adopting the final contact procedure.
4. Define customer/regulatory notification review, investigation, recovery and
   post-incident corrective actions with appropriate professional advice.

No incident is asserted here. No notification has been sent or pre-authorized.
Defining an owner or draft runbook is not evidence the process is operating.

## Authoritative references checked November 7, 2026

- [Xero developer partner security requirements](https://developer.xero.com/partner/security-requirements-for-developer-partners)
- [Xero API consumer security standard](https://developer.xero.com/partner/security-standard-for-xero-api-consumers)
- [Xero Developer Platform Terms](https://developer.xero.com/xero-developer-platform-terms-conditions)
- [Vercel function runtimes](https://vercel.com/docs/functions/runtimes)
- [Vercel Secure Compute](https://vercel.com/docs/networking/secure-compute)
- [Vercel shared responsibility](https://vercel.com/docs/security/shared-responsibility)
- [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime)
- [Vercel log-drain reference](https://vercel.com/docs/drains/reference/logs)

Read the current requirements before adopting an attestation or agreement. This
document does not certify compliance or replace legal/security review.

## November 8 lifecycle journal draft

A staged migration now records atomic consent/grant database mutations with
minimized hashed references and bounded state/outcome fields. It includes
append-only guards and independent-client/privilege tests. See
[lifecycle-audit-draft.md](lifecycle-audit-draft.md) for exact coverage and limits.
This improves database evidence only: separately authenticated actor attribution,
non-owner production runtime roles, external immutable custody, approved retention
and erasure, monitoring and incident response remain unresolved. It must not be
used as a blanket Xero security attestation or permission to enable OAuth.

Previous isolation/disconnect increment at `086ff11` passed 795 offline tests,
50 PostgreSQL groups, full CI and actual Chromium interaction tests. Canonical
preview was READY. Browser back/forward checks did not prove BFCache eligibility.
Production remained at `7b61a906`; no new live connection was established.

## November 8 database-security gate draft

A new fail-closed catalog preflight is wired into every authenticated
expansion route before quota/store/provider work. It rejects unsafe runtime roles
and altered/missing audit protections without granting permissions or enabling
OAuth. See [database-security-preflight.md](database-security-preflight.md) for
its conservative acceptance policy and point-in-time limits. Operational role
provisioning, deployment verification and all other Xero controls remain required.
