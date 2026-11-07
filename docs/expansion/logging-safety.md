# Expansion OAuth logging safety

## Local change and scope

The expansion HTTP routes currently emit no application request or exception
logs. Keep that default. `src/lib/expansion/safe-logging.mjs` is an optional pure
projection for a future, reviewed diagnostic integration; no route imports it.
This increment does not enable logging, replace console methods, wrap global
loggers, alter existing Shopify/QuickBooks logs, change Next configuration, or
configure a log service. It does not close the infrastructure rollout gate.

`projectExpansionLogEvent(input)` returns only the following fields. Every field
has a closed output vocabulary; no arbitrary string, object or numeric metric is
retained. `serializeExpansionLogEvent(input)` produces that record as JSON.

| Field | Accepted input | Invalid/missing input |
| --- | --- | --- |
| `event` | Always the code-owned `expansion.http` | Input ignored |
| `action` | `start`, `callback`, `status`, `accounts`, `bind` | `unknown` |
| `provider` | `xero`, `ebay` | `unknown` |
| `environment` | `production`, `sandbox` | `unknown` |
| `status` | Numeric `200`, `303`, `400`, `401`, `403`, `404`, `405`, `409`, `429`, `503` | `null` |
| `reason` | `none`, `not_found`, `sign_in_required`, `forbidden`, `invalid_request`, `method_not_allowed`, `connection_changed`, `try_again_later`, `expansion_unavailable` | `unspecified` |

Callers must construct these fields from server-owned facts, not request query or
provider payload fields. The projection limits disclosure, not the truth of a
caller's claim. A callback redirect is not proof of a successful authorization:
both success and handled failure return 303. Do not infer authorization outcome
from the HTTP status or use diagnostic records as accounting/audit evidence.

All other fields are discarded, including raw URL/path/query/fragment, arbitrary
route segments, authorization/redirect URLs, code/state/PKCE values, client
credentials, access/refresh/ID tokens, session cookies or hashes, all request and
response headers, bodies, request/tenant/connection/account IDs, and full errors,
stacks, causes and provider descriptions. Prisma query events, SQL parameters,
Redis commands/errors and third-party HTTP debug objects must not be logged.
There is no key-denylist, URL masking regex or recursive object sanitizer whose
missed spelling could preserve a secret under an innocent key.

Only own data properties are considered. Accessors, inherited fields, nested
objects, cycles, `toJSON`, custom inspection and string-coercion hooks are not
used. Output is a fresh frozen null-prototype record. Throwing descriptor traps
produce fallback values, never error text. This is not isolation from malicious
JavaScript: an input Proxy can execute its own descriptor trap; compromised
process-wide built-ins or an unsafe downstream sink remain outside the contract.

If a future caller needs an application diagnostic event, pass only the projected
JSON to a reviewed sink. Never append an Error/request as a second log argument,
spread raw context back into the event, add unreviewed fields, or attach automatic
request/error/trace enrichment. Projection cannot remove data a sink appends
later. No sink is installed by this change.

## Application logs are not platform access logs

Official documentation checked November 7, 2026:

- [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime) documents Search
  Params among request details, separately from application log messages.
- [Vercel Log Drains reference](https://vercel.com/docs/drains/reference/logs)
  describes `proxy.path` as including query parameters; the `log/path` drain
  filter uses that value. Drain selection/filtering is not evidence that the
  originating platform never stored the unfiltered request.
- [Next.js logging configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/logging)
  says incoming-request suppression affects development, not production builds.
  The installed Next 15.5.28 implementation also logs the incoming request URL in
  its development request logger. Fetch URL truncation is not secret redaction.

An application callback runs after the request has reached upstream components.
Its no-store/no-referrer response, fixed redirect, quiet catch block or safe log
projection cannot retroactively remove a URL collected at ingress. Middleware
rewrites, downstream drain transformations and dashboard masking likewise do not
prove pre-storage protection. Do not claim `logging: false` or
`logging.incomingRequests` in `next.config.js` solves Vercel production metadata
collection. No Next configuration proposal has been applied.

## Required infrastructure evidence before enabling real OAuth

Keep `EXPANSION_OAUTH_ENABLED` off until an authorized operator completes all of
the following for the exact deployment, domain and every enabled environment.
This is a prerequisite for real grants, not something local unit tests can prove.
The separate deployment attestation `EXPANSION_QUERY_LOG_POLICY_VERIFIED=true`
must not be set merely because application tests pass. It records an operator's
completed review; it neither performs redaction nor proves platform settings.
Do not inherit that assertion into a preview/new domain without reviewing its
collection path and evidence. No attestation value was configured here.

1. **Inventory the full collection path.** Identify CDN/proxy/access logs,
   platform runtime request metadata, edge/middleware/firewall logs, tracing/APM,
   HTTP instrumentation, error reporting, analytics, every drain/collector and
   each destination/archive. Include callback success and malformed, denied,
   rate-limited, redirected and route-not-found requests. Merely switching the
   handler off does not suppress upstream collection of a submitted URL.
2. **Establish source-side protection.** Obtain a documented, provider-supported
   control or written provider confirmation for this project that discards the
   sensitive request data before log/trace persistence or export at each hop.
   At minimum exclude complete query strings (including unknown parameter names)
   from callback metadata, plus cookies, auth headers, bodies and error payloads.
   For the expansion surface use static route labels rather than raw path
   segments, URLs, referrers or locations. A downstream transformation is only
   defense in depth; it does not satisfy the upstream requirement. If this
   cannot be established, leave real OAuth disabled and review an approved
   ingress/hosting design instead of assuming a Vercel setting exists.
3. **Verify with synthetic canaries only, under separate authorization.** Exercise
   both providers' callback paths and other expansion routes using unique fake
   values in code, state, unknown/nested/encoded query parameters, path segments,
   headers/cookies and error-like inputs. Include error/404/429/redirect paths.
   Do not send real codes, tokens, sessions, client secrets or credentials, call
   providers, or create real grants for this test. Check logs at every controlled
   source and destination, including encoded variants, after the full ingestion
   delay. Use a safe positive-control event to prove collection is working and
   distinguish filtering from sampling, missing permissions or a dead drain.
   Absence in a sampled/dashboard search alone does not prove absence at storage;
   retain the authoritative source-side configuration/provider evidence too.
4. **Record approval evidence.** Record project/deployment/environment, collection
   hops and owners, controls, dates, synthetic test coverage and results, provider
   confirmation links where needed, retention/access settings, and the approving
   operator. Do not include raw sensitive payloads in the evidence. Repeat the
   review after logger, platform, route, instrumentation, drain or domain changes.

Do not enable provider scopes, migrations, callbacks, logging integrations or
third-party exports as a side effect of this checklist. No production settings
were inspected or changed, and no remote canary test was run for this increment.
Any necessary configuration, new data-sharing destination or infrastructure
change needs its own authorization. Historical logs are not inspected or purged
by this utility; discovered exposure requires a separately approved response.

## Local verification

Run `node --test scripts/expansion/safe-logging.test.mjs` or the existing
`npm run test:expansion`, which already includes this file through its glob.
The focused suite covers both providers' known metadata, raw OAuth secrets,
authentication headers/cookies, URL/query/path/error injection, encoded values,
unexpected types, recursive/deep structures, getters/serialization hooks,
prototype fields, throwing/revoked proxies, immutability, bounded JSON output,
and preservation of unrelated console methods/output in a separate process.

All inputs are synthetic. These tests establish the helper's output contract;
they do not verify a running application's log pipeline, platform collection,
customer readiness, a live provider grant or any infrastructure configuration.
