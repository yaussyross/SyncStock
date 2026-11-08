# Draft Xero connection removal

This is default-off engineering evidence, not live enablement or a claim of Xero compliance. No real provider grants were used. The additive migration must be reviewed and applied only through the normal authorized deployment process.

## Contract

POST `/api/expansion/connections/{id}/disconnect` requires an authenticated tenant session, exact same-origin CSRF Origin, JSON `{ "version": 2, "mode": "local_only" }` or mode `bound_organization`, and the existing explicitly enabled/configured expansion route guard. A shared five-per-five-minute tenant quota applies. Unknown fields, stale revisions and repeated terminal requests fail closed.

- `local_only`: destroys this stored credential pair, including held/expired/refreshing credentials. It makes no provider calls. It does not disconnect Xero. Old app fingerprints do not prevent a tenant from deleting their own local credentials; current route configuration is still required.
- `bound_organization`: requires a current available access token, immutable bound Xero organisation and connection ID, and fresh provider discovery proving that exact pair. Only that connection ID is deleted. Unbound grants cannot implicitly select an organisation, even if discovery would return one.

The returned and status-read connection summary has `disconnectOutcome`:
- `null`: no disconnect attempt recorded.
- `local_only`: local credentials removed, no provider removal attempted.
- `disconnected`: Xero returned the documented exact 204 for deleting this connection. Other Xero user connections to the same organisation, other organisations, and the underlying token grant are not claimed revoked. Accounting records are not deleted.
- `outcome_unknown`: local credentials removed, provider removal unconfirmed. Do not retry automatically or reconnect simply to retry. Review the Xero connected-app settings and reconcile manually.

All completed local removals have status `revoked` (legacy local credential lifecycle terminology), unbound account fields and an incremented revision. Terminal revision 2147483647 is readable but cannot mutate further. A known response may be lost while its outcome persistence succeeds; a later status read can reveal the committed result without another provider request.

## Durable ordering and limitations

An exact revision/ciphertext/status/refresh-claim CAS destroys local credentials and records `outcome_unknown` plus the original account/connection IDs, attempt hash and timestamp **before** attempting DELETE. Failure or uncertainty committing that CAS prevents the provider call. No durable copy of credentials is kept for retry. Original discovery time and token expiry are preserved internally: proof freshness is checked using store time after the awaited row read and again after the destructive CAS, then immediately before DELETE. Consumption never restarts the sixty-second proof lifetime. Clock rollback, expired tokens or stale proof after destruction preserve unknown outcome and do not call the provider. Credential reads and account binding likewise sample time after their awaited database reads. The single attempt's opaque claim can record only `disconnected`; it cannot recreate a deleted row. Timeout, redirects, malformed status, every non-204 (including 404), process crashes and unknown persistence outcomes remain conservatively unknown. There is no recovery worker or automatic retry. Terminal metadata is retained until normal account deletion for reconciliation; it contains no tokens.

A crash between durable destruction and the provider call intentionally leaves unknown outcome even if no DELETE occurred. Fresh discovery failures leave credentials intact and make no destructive request. Existing in-flight provider reads/refreshes cannot be recalled; local destruction prevents their later refresh commit. Removing the local encrypted credential does not invalidate tokens at Xero or revoke copies held outside this record. The remote helper never uses grant-wide `/connect/revocation`.

## Official references

- https://developer.xero.com/documentation/guides/oauth2/tenants/ — DELETE connection ID obtained from GET /connections, not tenant ID; 204 success; tokens remain valid.
- https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/master/xero-identity.yaml — DELETE 204 and 404 contract; no additional normal user-grant scopes.
- https://developer.xero.com/documentation/guides/oauth2/auth-flow/ — refresh-token revocation removes all that user's app connections, so it is intentionally not used here.
- https://developer.xero.com/documentation/best-practices/managing-connections/connections/ — connection/tenant lifecycle context.

## Evidence

Dedicated offline tests cover narrow URL and multi-organisation safety, fresh identity mismatches, explicit local-only removal, concurrency, refresh fencing, stale revisions, cross-tenant isolation, claim/finish DB ambiguity, timeout/redirect/non-204 results, deletion races, terminal revisions, delayed database reads/writes, clock rollback and original proof lifetime. Route tests cover session/CSRF/default-off/budget/request validation and response redaction. The dedicated PostgreSQL smoke has seven groups covering real cross-client CAS, destruction-before-call, terminal outcomes and database constraints. It is staged in CI and has not been run locally because this workspace has no disposable PostgreSQL service. No production schema was changed.
