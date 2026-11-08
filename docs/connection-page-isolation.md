# Connection setup document isolation

`/settings/connections` has its own root layout under `src/app/(connection-setup)`.
Ordinary pages retain the previous root layout, Shopify App Bridge, Google Fonts,
FeedbackLink, and URLs under `src/app/(standard)`. API routes did not move.
A shared root with conditional script removal is insufficient: JavaScript that
already executed survives client navigation. Next's multiple-root behavior is
intended to enforce a new document for Link/router transitions across this boundary.
Browser proof of that behavior remains outstanding in this environment.

The setup document is dynamic, with per-request CSP nonces forwarded to Next SSR,
self-only network/resource directives, no framing, no-referrer, and no-store.
The CSP permits inline styles for the current UI and development-only unsafe-eval;
production scripts do not allow unsafe-inline or unsafe-eval. This is resource
isolation, not a claim of comprehensive XSS prevention. Encoded setup aliases are
redirected to their canonical path under the same policy. Ordinary unknown routes
retain the branded 404; setup descendants have an isolated 404. The page has no
FeedbackLink. A persisted pageshow event discards restored account/connection
state and asks for a fresh status read.

Disconnect UI requires a scope choice and explicit confirmation. Local-only
removal does not claim provider access was revoked. Bound-Xero removal describes
only this organization connection, never the whole grant, other users' access,
or accounting records. Unknown remote results direct the user to Xero's
connected-app settings. Client timeout/network errors are uncertain outcomes,
not failures: no automatic retry, and status must be reloaded before further
account mutation or removal. No feature flags were enabled.

## Repeatable checks

From the repository root:

- `node --import tsx scripts/connection-page-isolation-smoke.ts`
- `node --import tsx scripts/launch-surface-smoke.ts`
- `node --import tsx scripts/qbo-reconnect-smoke.ts`
- `node --import tsx scripts/embedded-retry-smoke.ts`
- `node --import tsx scripts/embedded-sync-recovery-smoke.ts`
- `ENCRYPTION_KEY=synthetic-local-build-only-no-real-tokens npm run build`
- `node scripts/connection-page-isolation-http.mjs` (after production build)

The HTTP test starts a loopback-only server itself and checks production HTML,
nonces, resource absence/preservation, canonical aliases, and 404 boundaries. It
does not execute hydration or prove navigation behavior.

### Browser check (not executed successfully here)

Requires Node 20.11–24, repository npm dependencies, Playwright and a compatible
Chromium installation with process/socket permissions. Use a disposable local
checkout without production credentials or a live database. With Playwright on
the Node module search path and its Chromium installed:

`node scripts/run-connection-page-browser.mjs`

Alternatively set `PLAYWRIGHT_MODULE` to the absolute path of an installed
Playwright `index.mjs`, and optionally `CHROMIUM_PATH` to a Chromium executable.
The harness creates `src/app/(standard)/isolation-test-fixture/page.tsx`, runs the normal Prisma-generation/production build
with a bounded synthetic-only environment, starts `127.0.0.1:3187`, runs the browser test,
and removes the fixture source in `finally`. It refuses to overwrite an existing
fixture. If forcibly killed, remove that generated fixture manually. Rebuild
before using any `.next` outputs afterward: the harness build includes the
fixture even after its source is cleaned up. Do not deploy that build.

Build/server/browser child environments use an explicit bounded environment:
only OS/tooling paths are inherited, with synthetic session/encryption values,
loopback dummy database/Redis addresses, all expansion enablement flags false,
and telemetry off. The harness refuses checkouts containing `.env`, `.env.local`,
`.env.production`, or `.env.production.local`, since Next loads those itself.
The locally available Playwright package is version 1.57.0; no browser result
is claimed from its availability.

All external browser resource requests are intercepted/stubbed, and non-loopback
DNS resolution is blocked in the test browser (including ordinary preconnect hints). Connection APIs
use synthetic responses; no account authorization, provider calls, live changes,
or compliance validation occur. Coverage includes initial SSR/hydration, Next
Link and router.push, back/forward, exit to login/ordinary resources, explicit
removal scope, double-click locking, local/confirmed/unknown outcomes, and an
aborted request requiring status reconciliation with no automatic repeat.

Chromium launch in this environment failed before any page load with
`socket() failed: Operation not permitted (EPERM)`, including an escalation
attempt. These browser scenarios are **unrun**, not passed. The fixture was
removed from the deliverable. Back/forward-cache use depends on browser
eligibility; history navigation coverage must not be described as guaranteed
BFCache restoration without verifying that event in a permitted browser.


The separate `connection_browser` CI job installs pinned Playwright 1.57.0 from
its standard package registry and its official Chromium runtime, then runs this
same synthetic harness on an isolated runner. It exports no fixture build or
browser artifacts and changes no deployment configuration. CI execution is a
separate verification stage; adding the job is not evidence that it passed.
