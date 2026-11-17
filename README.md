# Tab2Serve Alpha Version — Initial Testing Release

The approved infrastructure is Cloudflare Registrar, Cloudflare DNS, Cloudflare
Workers for frontend assets and backend APIs, Cloudflare D1, Cloudflare-managed
HTTPS certificates and restaurant subdomains, with GitHub for source control.
Business email remains a separate decision. Hostinger, Vercel, Netlify or any
alternative hosting provider requires explicit approval.
See the [mandatory Cloudflare architecture audit](docs/CLOUDFLARE_ARCHITECTURE_AUDIT.md)
for verified compatibility, remaining blockers and the operating sequence.
The local candidate is compatible but **not ready for production operation**;
the audit performed no deployment, production migration or live infrastructure change.

See the [production security, recovery and readiness checklist](docs/PRODUCTION_READINESS.md).
For standalone Workers Paid + D1 deployment preparation, start with the
[deployment readiness report](docs/DEPLOYMENT_READINESS_REPORT.md) and
[step-by-step Cloudflare guide](docs/CLOUDFLARE_DEPLOYMENT.md). Separate staging
and production templates, a two-restaurant acceptance checklist and monthly
usage estimates are included. No cloud resources or DNS changes are applied.
The Alpha quickstart below describes the retained legacy Sites workflow;
standalone deployment uses the independent-authentication guide above.
This candidate fails closed outside local development until normalized D1,
independent authentication and both Cloudflare rate-limit bindings are configured.
No production configuration is applied automatically.

Restaurant appearance is managed exclusively by Tap2Serve Super Admin. The
[design system guide](docs/RESTAURANT_DESIGN_SYSTEM.md) covers the code registry,
branding configuration, private bilingual previews, publishing, rollback and
staged database compatibility. Restaurant owners retain operational controls.

Multi-tenant hostname routing is implemented locally for `tap2serve.com`,
`admin.tap2serve.com` and restaurant subdomains. See the
[routing and Cloudflare runbook](docs/MULTI_TENANT_ROUTING.md) for tenant security,
local/staging configuration, identity setup, wildcard DNS, Workers Routes and TLS.
The growing-tenant path requires the separately staged normalized D1 adapter;
the legacy storage default and live infrastructure have not been switched.

The normalized D1 refactor is staged and disabled by default. See [D1 migration guide](docs/D1_MIGRATION.md) for the schema, offline preparation, verification, backup, approval gates and rollback procedure. Production still uses the original JSON store until an explicitly approved cutover; the staged SQL is outside automatic deployment migrations.

Independent staff authentication is also staged. See [authentication rollout and recovery](docs/AUTHENTICATION.md). It supports invitation-based credentials, server-side sessions, CSRF protection and mandatory Super Admin MFA, while preserving existing staff IDs. Live authentication remains unchanged until an approved cutover.

A bilingual restaurant-first Alpha release for internal workflow validation built from the supplied Hospitality NFC / QR specification. Vinext + React, a Cloudflare Worker API, and durable Cloudflare D1 storage. All prices use integer piastres; currency is EGP.

## Run locally

Requires Node 24.12+ and npm (including the offline backup tests). From this folder:

```sh
npm ci
npm run db:generate # only after changing db/schema.ts
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_misty_baron_zemo.sql
npm run dev
```

Use the actual generated migration filename in `drizzle/` if it differs. Apply each migration once. Local development simulates Sites authentication at `/signin-with-chatgpt?return_to=/`; the local demo account is `seedy@sites.test`. Production uses the Sites authenticated identity and does not include a development login bypass.

The first authenticated administrator initializes a sample restaurant (Olive & Ember), six menu items, twelve tables and four sample sessions. The sample dataset is clearly for evaluation; use Platform admin to provision an empty real restaurant, then configure its menu, team and tables. There are no hardcoded passwords.

```sh
npm test
npm run typecheck
npm run build
```

## What works

- Responsive guest menu launched by a unique stable table link; generated downloadable QR code and copyable NFC URL.
- Staff-only table opening/closing, optional guest name, one active session per table.
- Anonymous shared guest sessions; all guests see and may edit Pending/Accepted orders. Previous session capabilities are revoked on close.
- Item quantities, modifiers, notes, pricing snapshots, server availability checks, idempotent order creation.
- Version checks on order edits and status transitions; the kitchen Preparing action locks only that order. New orders remain possible only in OPEN sessions. A bill request locks ordering and edits until authorized staff reopen ordering; recorded payment alone does not change session state.
- Cashier and kitchen queues with status actions and two-second polling. Reconnects reload authoritative state. New order arrivals show an in-app notification.
- Guest Split Bill calculator: independent, unsaved quantities from current order price snapshots. Integer-piastre calculation, proportional original tax/service, no reservations, guest bills, payment tracking or order mutations. Selection resets on reopen.
- English (default) and Arabic across guest and staff workflows, localized validation and API errors, RTL/LTR layout, locale formatting, translated permission labels and account/device-scoped language preferences. Optional Arabic restaurant, category, menu and modifier content falls back to original text.
- Combined table bill, deduplicated bill requests, browser-printable 80 mm receipt, combined-table cash/card payment recording and unsettled-session closure prevention.
- Deduplicated staff calls with acknowledgment/resolution; optional private feedback, restricted to explicitly authorized staff.
- Menu/category/option/availability/visibility management, restaurant branding, session-snapshotted tax/service settings.
- Staff registration by verified sign-in email; first sign-in binds the record to a stable identity. Individual server-enforced permissions, account deactivation and tenant isolation.
- Platform restaurant provisioning, subscription prices/status, billable table count, setup checklist and support status.
- Server audit records for session, order, menu, permissions, billing and service actions.

## Important Alpha boundaries

- The published Site is owner-private by default. This outer hosting access gate means guest URLs are only suitable for owner testing while private. The app's guest endpoints themselves require no guest account. Public anonymous scanning requires an explicit Site audience change after the owner has initialized the workspace and completed restaurant onboarding. Changing access is a separate operator decision; the app does not change hosting permissions.
- Staff authentication currently uses ChatGPT/Sites sign-in. Add each employee's sign-in email in Team & permissions; all employees must also be allowed through the Site's outer access gate while it is private.
- D1 persists the Alpha's state in a versioned JSON row. Conditional compare-and-swap commits serialize state changes and rerun authorization/version checks after contention. It is deliberately a small-installation architecture; a 1.8-million-character safety limit stops further writes before the configured Alpha capacity is exceeded. Migrate to normalized tenant-scoped tables, indexed event storage and backups/retention before scaling or long-term service. The UI exposes the latest 150 audit events; stored events are retained within that capacity.
- Sync uses polling every two seconds, not WebSockets/SSE. This is suitable for Alpha validation; benchmark and implement push transport for larger operations.
- Receipt printing uses the browser's print dialog. A physical thermal printer, paper sizing, driver and any required ESC/POS bridge must be tested on site. There is no automatic silent printing or fiscal/e-invoice integration.
- Tax and service default to zero. Both are calculated independently from the subtotal and snapshotted when a session opens. They are configuration fields, not a claim about applicable tax law. No discounts, voids, refunds or cancellation workflow are invented.
- No existing POS vendor connector is claimed. The Alpha release runs its own lightweight POS. No guest online payment, inventory, accounting, profit reporting, hotel workflow or customer registration is included.
- Stable stand links can be shared remotely. Active session capabilities, revocation, per-session write limits, duplicate suppression and bounded input validation are implemented; stronger presence assurance remains an operator decision. Add edge/IP rate limiting before public rollout at scale.
- Menu photographs are HTTPS Unsplash sample images; replace them with restaurant-owned assets before service. Images use external URLs; file upload/storage management is not part of this Alpha.
- No health monitoring, automated backups, subscription collection, offline ordering, automated payment processing or printer hardware integration is represented as implemented.

## Acceptance walkthrough

1. Sign in to the staff dashboard. Open an available table.
2. Open the table card; open its guest link in two browser sessions. Both see the same table session.
3. Place an order, then edit it from the second guest session.
4. In Kitchen display, start preparation. A stale guest edit is rejected; a new order still succeeds.
5. Call staff and request the bill from the guest view. Duplicate requests produce one outstanding request; feedback may be skipped.
6. Open Split Bill from the guest table bill in two browsers. Select independent quantities and verify the original order is unchanged. Close and reopen the calculator: it resets. In Billing, print a draft without finalizing, explicitly finalize the bill, print the final bill, record the outstanding cash/card payment, and make the table available.
7. Verify the old guest session no longer exposes orders; reopen the table and verify its new session is empty.
8. Add a staff account with kitchen permissions only and verify menu/payment/private feedback operations are denied. Provision another tenant and verify isolation.

## Deployment

`.openai/hosting.json` retains this Site's opaque project ID and `DB` binding. Sites applies the tracked schema migrations to hosted D1 before deploying the Worker. Local `.wrangler` state and hosted D1 are separate. Source, schema, tests and lockfile should be retained with every published version. Secrets and local runtime state are excluded from source control.

The first deployment remains a private Alpha until real staff identities, menu data, on-site printer checks, access policy, abuse controls, backup/retention, receipt settings and load expectations are verified.


## Alpha localization and calculator details

Language preference is stored locally per staff identity; guests use a browser-local preference without an account. English remains the default when no preference exists or storage is unavailable. Restaurant-authored translations use optional `nameAr`, `descriptionAr`, `taglineAr` and `categoryNames` fields. Original text remains the fallback. Arabic notes, feedback, team names and table labels round-trip through the existing JSON/D1 storage. Identifiers and API URL paths are unchanged. The obsolete `guest.join` and `guest.allocate` actions are retired.

The previous item-assignment and per-person payment interface has been replaced. Existing physical payment records remain counted toward the combined table balance; no history is deleted. New payment requests may only settle the outstanding table amount. Cash and card (Visa / Mastercard, paid in person) are the only methods. There is no gateway or simulated online payment. No discount model exists in this release; the calculator uses actual order price snapshots and actual table tax/service amounts.

Run `npm test`, `npm run typecheck`, `npm run build`, and (with local preview running) `node tests/api.integration.mjs`. Browser acceptance: `node tests/alpha.ui.local.mjs` with Playwright available, or set `PLAYWRIGHT_MODULE` to its module URL and `BROWSER_EXECUTABLE` to an installed Chromium browser. Fixtures refuse non-local URLs. Test state stays in local D1 and is not published.

## Table session lifecycle

Restaurant staff notifications now include a bell, unread history, read receipts,
order navigation and opt-in sound alerts over the existing reconnecting poller.
See [restaurant notifications](docs/RESTAURANT_NOTIFICATIONS.md) for event coverage,
permissions, testing results and operational limits. No migration or new binding
is required.

- `OPEN`: guests may place orders and edit Pending/Accepted orders.
- `BILL_REQUESTED`: a guest bill request atomically pauses new orders and edits. Resolving the request or recording payment does not unlock ordering. Staff with `sessions.open` can use `session.reopen` before finalization.
- `FINALIZED`: staff with the new `billing.finalize` permission explicitly confirm the reviewed bill. The server checks `expectedVersion` and `expectedTotal`, then preserves a final pricing snapshot and permanently locks order submissions/edits for that session.
- `TABLE_AVAILABLE` is the table state when no current session occupies it. `session.close` requires a finalized, settled bill; it releases the table while retaining the finalized session, orders, payments and pricing snapshot.

Draft printing is the default for `billing.print`; `mode: final` requires prior finalization. Printing never changes lifecycle state. Receipt previews use the command response snapshot, so later polling does not silently change an open preview. These remain operational receipts, not fiscal invoices.

After finalization, staff may open a new session on the same permanent QR/NFC link, even when the old bill is unpaid. The old session is released, its capability is revoked, and any outstanding balance remains in Current bills. Previous bills remain available in bill history. Payments explicitly reference their session and never spill into the next bill. Kitchen progress on existing orders may continue; it cannot change finalized pricing. Guests with an old capability cannot see or order into the new session and must scan/open the permanent table link afresh.

Existing JSON state upgrades lazily and is persisted by the next successful D1 compare-and-swap transaction. Legacy ACTIVE records become OPEN (or BILL_REQUESTED if a bill request is outstanding); CLOSED records become released FINALIZED history. Existing restaurant administrators with `permissions.manage` receive `billing.finalize`; other roles must be granted it explicitly. No QR identifiers, orders or payment records are replaced. No SQL schema migration is required.

Local lifecycle verification: `node tests/session-lifecycle.integration.mjs` checks real D1 races; `node tests/session-lifecycle.ui.local.mjs` checks English/Arabic guest and restaurant flows. Both require a local preview; browser tests use the same Playwright options described above.
