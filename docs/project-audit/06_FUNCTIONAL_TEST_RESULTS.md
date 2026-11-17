# Functional test results and frontend acceptance

## Executed backend checks

The audit ran tests against newly created synthetic local state only. No real
orders or production restaurant commands were submitted. The exact commands,
exit statuses and individual test names are in [the execution log](12_TEST_EXECUTION_LOG.md).

| Scope | Actual outcome | Coverage |
| --- | --- | --- |
| tests/*.test.mjs | 140 PASS, 0 FAIL | Domain, integer calculator/split rounding, auth/CSRF/TOTP/expiry, database preservation/constraints/concurrency, polling state machine, design/routing, i18n, encrypted recovery and local D1 restore. |
| normalized-worker.integration.mjs | 2 PASS | Built legacy default and normalized lifecycle/concurrency/revocation with D1. |
| auth-worker.integration.mjs | 4 PASS | Independent login/CSRF/logout, explicit MFA activation, no first-user bootstrap, normalized+independent parity without changing retained JSON. |
| tenant-worker.integration.mjs | 2 PASS | Legacy and normalized hosts, public menus, drafts, foreign ID denials, origin isolation and registered staging roots. |
| production-worker.integration.mjs | 3 PASS | Strict readiness/headers/spoofed auth denial, 18 concurrent distinct orders + 8 duplicate retries, native rate-limit denial and missing bindings/schema fail-closed. |
| updates-worker.integration.mjs | 2 PASS | Legacy/normalized conditional snapshots, bounded history, tenant revision independence and retained pending work. |
| cloudflare-staging.integration.mjs | 1 PASS | Strict two-restaurant manager isolation, orders/bills/cash/card/retry/revocation, no outbound identity dependency and rendered browser asset GET/HEAD/metadata denial. |
| api.integration.mjs | PASS, script assertions completed | Local HTTP app + disposable D1: racing opens/orders/edits, modifier price, bill/call duplicate suppression, physical payment, old capabilities, CSRF and bilingual invalid JSON/token errors. |
| session-lifecycle.integration.mjs | PASS, script assertions completed | HTTP/D1 request/order/finalize/reopen races, repeated finalization/payment, new table visit with retained old balance and snapshot printing. |
| project-audit.integration.mjs | 2 observations PASS | Reproduced unresolved HEAD limiter bypass; 20 bounded local polling samples recorded. The first is a vulnerability finding, not a security-control success. |

Do not add the two script-based HTTP suites to an assertion-level count: they
emit one PASS after many assertions rather than numbered test cases. The report
therefore distinguishes **140 existing unit cases + 14 existing Worker cases +
2 new audit cases + 2 completed HTTP scripts**. A build/test pass does not prove
mail delivery, visual UX, hardware behavior, critical dependency safety or a live
database migration.

## Requested edge cases

| Requested behavior | Evidence/result |
| --- | --- |
| Cart quantity, modifier and tax/service math | Domain/calculator/split tests PASS; browser cart controls blocked. Integer piastres, original charge snapshots and largest-remainder allocation preserved. |
| Split bill and rounding | PASS for complete/partial plans, zero/large values, malformed snapshots, disappearing/reduced lines, discounts/rounding metadata and input immutability. Calculator does not settle a payment. |
| Duplicate order/payment submission | PASS for same key/data; conflicting reuse rejected. Finalization/opening retries and races tested. |
| Cancellation | NOT IMPLEMENTED: unknown cancellation commands rejected; no order cancellation/void/refund workflow to pass. |
| Session locking/finalization/new visit | PASS on domain, normalized D1, built Worker and local HTTP; stale capability cannot affect a new session. |
| Dashboard update consistency | Poller/updates API PASS; stale-response isolation/backoff/hidden-pause tests PASS. Fully hydrated visual dashboard not accepted. |
| Concurrent guests/restaurants | PASS on bounded fixtures, including strict two-venue separation and atomic CAS. Not a sustained regional-load benchmark. |
| Configuration and permission changes | Domain/normalized/tenant/design tests PASS. New rates apply to new sessions; published design separated from private drafts. |
| Invalid JSON/UTF-8/prototype keys/foreign IDs | Existing security and HTTP tests PASS for tested payload bounds and rejection paths. Not a full fuzz campaign. |
| Persistence across requests | D1 HTTP and integration reads retain committed state; cookies/session versions are server-validated. Page-refresh/browser storage behavior not fully accepted. |
| Network interruption/error recovery | Injected poller transport/clock tests PASS; real network/device reconnect UI scenarios NOT RUN. |

## Frontend, accessibility and compatibility

Source contains desktop/mobile CSS breakpoints, flexible grids and guest cards,
mobile sidebar navigation, language selection, Arabic content fallback and
direction changes. Dialogs have aria-modal/name, Escape and Tab handling, focus
restore; status/messages use live regions and forms have labels/validation.
These are **implemented mechanisms**, not a WCAG/screen-reader certification.

The four existing browser scripts (`ui.local`, `alpha.ui.local`,
`split-bill.ui.local`, `session-lifecycle.ui.local`) were all attempted and stopped
with ERR_MODULE_NOT_FOUND for playwright **before UI assertions executed**.
Playwright/browser dependencies were not installed or source manifests changed
during this audit. One legacy UI script also hardcodes port 5173; the audit HTTP
fixture used 5199, so a reproducible runner must make ports consistent.

The CUA browser-access host reported unavailable. Native Chrome displayed local
SSR from an ad-hoc Vite preview, but that harness served development CSS/RSC
entry URLs as 404 and stayed unhydrated. This is a failed audit-preview setup,
not proof that the production bundle has the same defect: the built-Worker
asset integration passes. A separate built Wrangler preview was started on
loopback with disposable D1; the selected native window was then minimized and
could not be observed through the available interface. No completed hydrated
browser journey, mobile viewport, Arabic RTL screenshot or visual sign-off is
claimed. The existing live tab was not used for test mutations.

Still NOT RUN: 320/360/390/768/1440 viewport matrix, iOS Safari/Android Chrome,
keyboard-only full journeys, screen-reader names/announcements, measured contrast,
RTL overflow/print layout, sound behavior, mobile QR/NFC scan/tap, printer output,
actual mail activation/recovery and durable page-refresh UX. Core translation
catalog tests pass, but auth/account screens and errors remain partly English.

## Failure handling

Whole-project lint fails (10 errors, 135 warnings) and dependency audit fails
(25 affected entries). They remain honest failures; no automated fix, dependency
upgrade or business-behavior change was applied. Reproducible browser tooling,
patched dependencies and hosted/device acceptance are prerequisites for approval.
