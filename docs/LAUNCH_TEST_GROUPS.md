# Launch test groups

SyncStock uses three launch test groups before public release. They are automated regression groups backed by the TEST development store and existing provider sandboxes; they are not claims of human usability testing.

## Group A — Accounting safety

Run:

```
npm run test:group:accounting
```

Covers reconciliation, duplicate/quota/security behavior, and billing event ordering/concurrency.

## Group B — Embedded merchant onboarding

Run:

```
npm run test:group:embedded
```

Covers Shopify App Pricing catalog mapping, embedded ID-token validation, Shopify API error normalization, and mapping-removal regression.

## Group C — Public conversion and launch surfaces

Run:

```
npm run test:group:public
```

Checks required legal/support/docs/auth surfaces, prevents stale beta copy from returning, verifies conversion messaging, and performs a production build.

## Full launch suite

```
npm run test:launch-groups
```

## Live acceptance still required

Automated test groups do not replace the live TEST-store acceptance sequence:

1. Open SyncStock from Shopify Admin using the verified app handle `syncstock-productionn`.
2. Confirm QuickBooks sandbox is connected.
3. Confirm at least one product mapping is saved.
4. Select the no-charge development-store Solo plan only if Shopify shows $0 due.
5. Create/pay the mapped test order.
6. Confirm recent activity shows a successful reconciled sync and the QuickBooks record total matches.
7. Re-deliver/retry the same event and confirm no duplicate receipt is created.

No paid service upgrades or ad spend are authorized before October 5, 2026.
