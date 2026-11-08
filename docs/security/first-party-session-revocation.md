# First-party session revocation (draft)

This is a prerequisite for future MFA, not MFA enrollment, recovery or enforcement. It does not enable OAuth providers, change production data, or revoke Shopify App Bridge identity or provider OAuth grants.

## Proof and revocation model

- New login/signup cookies carry `sessionKind=web`; mobile login carries `sessionKind=mobile`. Both carry the persisted user's `authVersion`, an independently random JWT ID, issuer `syncstock`, HS256 signature, issued-at time, and expiry of at most 30 days.
- Verification requires integer issued-at/expiry times, issued-at no later than the current clock, nonexpired positive lifetime no longer than 30 days, and exact current persisted user/version. Account deletion fails closed. User IDs are limited to 191 characters without whitespace/control characters (existing Prisma CUIDs fit).
- Versions are integers in 0..2147483647. Revocation compares the authenticated user's ID and version and atomically increments once. Concurrent or replayed old requests cannot increment again. The maximum version fails closed rather than wrapping to zero. It requires an explicit operator remediation plan if ever reached.
- New web tokens cannot be used as mobile bearer tokens or mobile OAuth input, and new mobile tokens cannot be used as web cookies. The account-security helper reads only one unambiguous session cookie from a bounded raw header. It never falls back to a bearer or Shopify token.
- Database errors fail closed without raw JWT/error logging. The Prisma adapter bounds transaction acquisition to 1 second, lock waits to 1 second, individual statements to 1.5 seconds and the transaction to 2 seconds. An HTTP deadline does not cancel a write: timeout/transport errors can leave its outcome unknown and must not trigger automatic replay.

## Legacy and rollout compatibility

1. Review and apply the additive `20261108003000_first_party_session_revocation` migration before deploying this application. It initializes existing users to version 0. This migration is drafted only; it has not been applied to a real database here.
2. Tokens from the old issuer contain neither authVersion nor sessionKind. They are accepted only if BOTH fields are absent and the persisted user's version is exactly 0. Missing/null database versions, partial token fields, and invalid versions never receive this compatibility path. Legacy provenance is unknowable, so these initial-version proofs may still be used on either legacy first-party transport. The first successful revocation permanently invalidates them.
3. Update all web/mobile/expansion authorization instances together before exposing revocation. An old running instance or rollback to old JWT-only code can ignore the new version and defeat revocation. Do not reset/decrement authVersion, restore a stale user row without security reconciliation, or roll back to code that ignores it. Keep the column on rollback.
4. Login racing revocation may issue an already-stale token; it will fail subsequent validation and the user must log in again. Requests already authorized before revocation can finish: this is not cancellation of in-flight operations. Provider OAuth calls already in progress are not recalled, nor are provider grants disconnected by signing out.

## OAuth handoff closure

Mobile Shopify and QuickBooks starts now validate the current first-party mobile proof before issuing a 10-minute, separate-issuer signed handoff cookie. It binds user/version, mobile provenance, provider, state, and Shopify shop where applicable. Callbacks check its signature, bounded clock and current user/version before provider calls. Plain legacy `*_oauth_mobile_user` cookies are rejected; users must restart unfinished connections. Starting a new ordinary web flow clears any stale mobile handoff cookie.

The historical `mobile=1&token=...` input remains accepted for compatibility with the deferred mobile client, with an Authorization bearer header preferred. Query tokens expose credentials to URL history/access logs; stop using that input before any mobile launch and use a reviewed short-lived browser handoff design. No first-party session token is added to outgoing provider URLs. Ordinary web URLs remain unchanged.

Embedded QuickBooks starts now require a genuine Shopify App Bridge bearer token, not mixed first-party cookie authentication. Newly signed embedded state explicitly identifies that Shopify provenance. Old embedded states without this marker must restart because their origin cannot be safely inferred. The genuine Shopify-authenticated embedded flow stays independent of first-party revocation; Shopify install/session controls remain the authority for it.

## Offline checks

- `node --test scripts/security/first-party-session.test.mjs`: clocks/algorithms/issuer, shape/version boundaries, legacy migration, uniqueness, cookie ambiguity, synthetic concurrent CAS and handoff purpose binding.
- `node --import tsx scripts/security/mobile-oauth-session-smoke.ts`: real OAuth route handlers with a synthetic in-memory user stub; revoked inputs and callbacks, legacy cookie rejection, state mismatch and provenance rejection. No real DB or provider request.
- `node --import tsx scripts/shopify-id-token-smoke.ts`
- `node --import tsx scripts/qbo-reconnect-smoke.ts`
- `node --import tsx scripts/qbo-return-handle-smoke.ts`
- `npx prisma generate` and `npx tsc --noEmit`.

These checks are not a production migration, a complete account-security assessment, or evidence that MFA is enabled. The guarded POST endpoint, UI and disposable-database CAS coverage are part of this draft.


## User control and transport boundary

`POST /api/auth/revoke-sessions` accepts no body, identity, version or redirect
from the browser. A canonical HTTPS APP_URL, matching actual request origin and
Origin header, and non-cross-site Fetch Metadata are required. Spoofed forwarding
headers do not change the destination. Its bounded cookie-only session proof
identifies the server-side user/version; it never uses a mobile/Shopify fallback.
The signed-in `/dashboard/security` page names the exact scope and requires
explicit confirmation. Only a confirmed commit clears the current session cookie.
CAS conflict asks the user to sign in; timeout or transport failure is displayed
as unknown, never silently replayed. A later browser navigation aborts only the
client wait, not a write already admitted by the server.

The button does not change passwords or prevent a person with the password from
signing in again. It does not disconnect providers, cancel running jobs, or revoke
Shopify identity. Session lifetime remains up to 30 days. Individual-device session
inventory/revocation, password-change/reset/recovery, session security event audit,
MFA enrollment/verification/recovery, strong-auth assurance and SSO remain future
work. No claim of Xero security compliance is made.

## Additional acceptance checks

- `npm run test:expansion`: 909 local tests, including nine expansion revocation
  checks and 57 guarded endpoint boundary/deadline checks.
- `npm run test:session-security`: eight core groups, the synthetic real-handler
  mobile OAuth smoke test and actual Next request-context/session/POST-wrapper
  runtime probe. Both runtime checks block outbound network operations.
- `scripts/session-revocation-db-smoke.ts`: 12 staged real PostgreSQL groups with
  independent clients. It requires an explicit loopback disposable database URL,
  never a production/app URL, and cleans only the uniquely created synthetic users.
- The isolated Chromium job exercises the real panel in a temporary synthetic
  fixture: confirmation/unchecked state, double clicks, confirmed/stale/unknown
  outcomes, timeout and navigation without retry. Fixture source is removed by
  the harness and is not part of the application.

Real PostgreSQL and Chromium results require the exact commit's CI; local unit
passes do not claim either has run.


A transport regression uses Next's actual Node request adapter, which represents
an empty POST as a non-null stream. The endpoint accepts zero-byte EOF, rejects
all payload bytes (including a false Content-Length), and bounds empty-stream
reads to 16 chunks and 250 milliseconds before authentication. This additional
check is separate from the 2-second authentication/revocation deadline.
