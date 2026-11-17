# Staging acceptance: Olive and Cedar

Prepared 17 November 2026. These are required **hosted staging** tests, not a
claim of hosted execution. Use only the isolated staging Worker/D1, controlled
test mailboxes and synthetic amounts. Never point this checklist at production.
The local strict-mode two-restaurant test is
`node tests/cloudflare-staging.integration.mjs`; it runs against disposable D1 in
workerd and requires a current production build.

## Setup and evidence

First obtain staging deployment/DNS/TLS approval from the
[deployment guide](CLOUDFLARE_DEPLOYMENT.md). Verify exact account and D1 ID.
Confirm no production DB binding, secret, sender, customer data or automatic
production deploy is present. TLS must cover the nested staging names.

| Fixture | Olive | Cedar |
| --- | --- | --- |
| Restaurant slug | `olive` | `cedar` |
| Origin | `https://olive.staging.tap2serve.com` | `https://cedar.staging.tap2serve.com` |
| Manager | Controlled Olive mailbox, only Olive membership | Different controlled Cedar mailbox, only Cedar membership |
| Kitchen role | Kitchen permissions, no billing/team/admin | Independent kitchen account with same restrictions |
| Cashier role | Orders/billing/session permissions, no team/admin | Independent cashier account with same restrictions |
| Menu | Test dish 100.00 EGP + modifier 10.00 | Different dish 150.00 EGP + modifier 20.00 |
| Table | Label 01, own permanent token | Same label 01, different permanent token |
| Tax/service | 14% / 12% | 0% / 10% |

Create the restaurants from the explicit Super Admin account, no public signup.
Admin origin is `https://admin.staging.tap2serve.com`. Enroll admin TOTP. Invite
each test identity on its exact restaurant origin and verify role assignments.
Use separate browser profiles for Olive manager, Cedar manager, Super Admin and
two anonymous guests per restaurant. Clear cookies between negative tests.

For each case below record PASS/FAIL, tester, time (Africa/Cairo), build hash,
Worker version, D1 ID, request IDs, redacted screenshots and relevant expected vs
actual totals. Never capture passwords, MFA seeds, cookies, activation fragments
or full table/session tokens in shared evidence. Any isolation, money or auth
failure blocks production. Re-run affected cases after fixes.

## Required cases

| ID | Test on both restaurants | Expected result |
| --- | --- | --- |
| H1 | Open platform, admin, both tenant hosts over HTTPS | Correct host/brand; valid certificate, no Sites login or Access challenge for public guest flows. |
| H2 | Unknown/reserved slug, nested invalid slug, forged Host/X-Forwarded-Host/x-tenant-id | 404 or authorized-scope rejection; no other venue appears. |
| A1 | Sign in without ChatGPT cookies; spoof Sites headers/local cookie and Access assertion | Independent credentials succeed; forged identity fails. No ChatGPT redirect/network identity dependency. |
| A2 | Copy Olive's cookie into a Cedar request; sign the same identity into Cedar without membership | Origin-bound cookie rejected; independently authenticated nonmember denied. |
| A3 | Remove CSRF, forge Origin, replay expired/disabled account session | Rejected, no write. Logout/password reset revokes previous cookies. |
| A4 | Super Admin activation/login without TOTP, replay TOTP, ordinary manager on admin | Denied. Explicit owner + Super Admin + TOTP required; no first-user ownership. |
| A5 | Invite and reset using actual approved test mail | Delivered only to correct recipient; links exact-origin, one hour and one-use; generic recovery response; failed mail exposes no token. |
| I1 | Submit foreign restaurant/table/menu/order/payment/session/design IDs from the other venue | 403/404, zero foreign rows or writes; no private fields in guest JSON. |
| I2 | Open dashboards side by side; create simultaneous orders/changes in both | Each updates only its own venue; no swapped late responses or shared revision contention. |
| Q1 | Download QR and copy NFC URL for each table | Correct HTTPS tenant origin and identical stable table URL; QR decodes on iOS and Android. |
| Q2 | Write URL as an NFC NDEF URI and tap real iOS/Android devices | Correct table opens without sign-in; no app installation. Physical NFC is not emulated by local tests. |
| Q3 | Reuse a stand next service; rotate token with authority on a disposable table | Token stable across normal sessions; rotation revokes old URL/capability and requires new QR/NFC content. |
| S1 | Scan before staff opens table, then open; two guests scan | Closed table cannot order; after opening both guests share current orders and bill. Duplicate concurrent staff open is rejected/idempotent. |
| O1 | Order items/modifiers/Arabic notes, change client-side price, send duplicate request key | Server prices/snapshots authoritative; duplicate identical request creates one order; conflicting payload gives 409. |
| O2 | Pending/Accepted edits; kitchen Preparing/Ready/Served transitions; stale version races | Allowed roles/status transitions only; preparing locks that order; fresh orders still possible while session OPEN. |
| B1 | Olive: two 100+10 items, tax 14%, service 12% | Subtotal 220.00, tax 30.80, service 26.40, total 277.20 EGP. Integer minor units agree in UI/API/receipt. |
| B2 | Cedar: two 150+20 items, tax 0%, service 10% | Subtotal 340.00, service 34.00, total 374.00 EGP. Olive's rates do not apply. |
| B3 | Request bill, attempt another order/edit, authorized reopen, then finalize with reviewed version/total | Bill request pauses writes; explicit reopen resumes; stale finalization rejected; finalized snapshot remains fixed. |
| B4 | Record cash on Olive/card on Cedar; retry same key; reuse key with changed amount; overpay | One payment for identical retry; conflict/overpay denied; due/receipt correct. Recorded card means physical card payment, no online gateway charge. |
| B5 | Draft print, final print, split calculator, close unpaid final bill | Draft does not finalize; final requires finalization; calculator never records payments; explicit close rejects unpaid balance. Test 80 mm printer separately. |
| S2 | Settle and close; open a new session; replay previous guest capability | New capability/session; historical financial data retained; old capability cannot read or order into new session. |
| L1 | English/Arabic on mobile guest, menu, cart, staff, kitchen, cashier, settings, bill and design screens | RTL/LTR, translated labels/errors, Arabic content/fallback, exact totals and language persistence; no clipped controls. |
| L2 | Login, activation, account security, reset/invite controls in Arabic | Known gap: auth/account controls contain English. Translate before claiming a fully bilingual service, or record explicit scope acceptance. |
| P1 | Block/reconnect network, background/foreground tab, expire login, inject delayed responses | One in-flight poll; hidden/offline pause; Retry-After/backoff; old responses discarded; authoritative resync; no automatic replay of mutations. |
| P2 | Simulate >=18 simultaneous orders per venue plus duplicate retries; >=30 concurrent password attempts | Correct exact order/payment totals; bounded 409 retries and 429 responses; KDF limits protect memory; no cross-tenant writes. |
| P3 | Expected busy-venue NAT load for 60 minutes and soak with representative retained history | Measure Workers CPU p50/p95/p99, latency, memory/limit errors, D1 rows read/written per route and size; tune native 1200/min read and 60/min write thresholds without weakening safety. |
| R1 | Health, readiness, cron cleanup, approved alert and external probe | 200 when ready, generic 503 when not; no token/URL/body in logs; real alert delivered. Simulate failure on disposable instance only. |
| R2 | Export/encrypt, restore into another empty D1, invalidate restored credentials, reconcile | All tenant counts/financial hashes match; staff sign in again, guests rescan; printed tokens stable; measured RPO/RTO recorded. Never restore over production to test. |

## Sign-off

Do not mark the deployment ready until an operator records both restaurant
results, actual mail/TLS/device/printer checks, capacity measurements, restore
evidence and unresolved defects. Suggested staging performance gates: p95
interactive API latency under 2 seconds, no CPU/memory limit errors, no persistent
409/429 storm and no financial discrepancy. These are proposed acceptance
thresholds, not measured service guarantees. Owner approval is needed to accept
limitations; it never substitutes for passing isolation and financial tests.
