# Tab2Serve Alpha Version — Initial Testing Release

Release: `0.2.0-alpha.1`. Intended for internal testing and restaurant workflow validation.

## Implemented behavior

- **Split Bill is a personal calculator.** Guests open it from the table bill, select quantities with plus/minus buttons and see an instant EGP subtotal, proportional original tax/service and total. Quantities are bounded by the actual order. It reads order price snapshots and calculates charge proportions with integer/BigInt arithmetic. Unavailable menu items already on an order keep their original prices. Removed or reduced order lines are clamped. Closing and reopening resets selections.
- **One combined restaurant bill.** Calculator selections make no API writes, reserve no items and require no guest account. Separate calculators remain independent. The earlier named-diner assignment and per-person payment UI/actions have been retired. Historical physical payment records remain counted toward the table balance. New payment records settle the outstanding combined table balance only.
- **Payments remain separate.** Existing methods are cash and card (Visa / Mastercard, paid in person). No additional methods were found, and no gateway or simulated online payment was added. No discount model exists in the current architecture; the calculator uses the actual stored item prices and configured table tax/service amounts.
- **English and Arabic.** Central message catalogs, parameter interpolation, Arabic plural rules, translated statuses/permissions, locale-aware amounts/times/dates, validation, notifications and API errors. English remains the default. A language switcher is available on guest/staff screens and dialogs. Language is stored per staff identity on the current browser; anonymous guests use a browser-local preference. Storage failures fall back safely to an in-memory preference.
- **RTL and content.** Arabic mirrors navigation, page structure and directional icons; forms, calculator, management pages and receipts support RTL. Mobile layouts were checked at 390px. Optional Arabic fields cover restaurant branding, categories, menu names/descriptions and add-ons. Original authored text is the fallback when a translation is absent. Arabic notes, feedback, staff names and content persist in the existing UTF-8 JSON/D1 model.

## Issues fixed during testing

- Language controls now wait for client initialization before accepting input.
- Malformed JSON and invalid command envelopes return localized HTTP 400 responses.
- Arabic menu-name search works in management, with accessible search labels.
- Closing a table while its calculator is open safely closes the dialog.
- Rejected order edits that would reduce the total below recorded payments restore the prior lines.

## Modified files

| Files | Purpose |
| --- | --- |
| `app/i18n.tsx`, `lib/i18n.mjs`, `lib/locales/en.mjs`, `lib/locales/ar.mjs` | Translation context, catalogs, preference, formatting, validation and content helpers |
| `app/page.tsx`, `app/layout.tsx` | Provider integration and Alpha metadata |
| `app/tab2serve.tsx`, `app/qr.tsx` | Localized workflows, language controls, Arabic content forms, single-table payment UI |
| `app/split-bill.tsx`, `lib/share-calculator.mjs` | Independent calculator and exact monetary proportions |
| `app/style.css` | RTL/LTR, mobile layout and calculator styling |
| `lib/domain.mjs`, `lib/store.ts` | Optional Arabic content fields, retirement of assignments/per-person payments, Alpha error text and edit safeguard |
| `app/api/state/route.ts`, `app/api/command/route.ts` | Language-aware errors and invalid command handling |
| `tests/calculator.test.mjs`, `tests/i18n.test.mjs`, `tests/api.integration.mjs`, `tests/ui.local.mjs`, `tests/alpha.ui.local.mjs` | Calculator, localization, Unicode, API concurrency and bilingual browser acceptance |
| `tests/split-bill.test.mjs` | Removed obsolete per-person payment tests; replaced with calculator tests |
| `package.json`, `package-lock.json`, `README.md`, `ALPHA_RELEASE.md` | Alpha version and operator/test documentation |

## Verification

- **35 unit/domain tests passed**, including the 550 EGP example, empty/single/multiple selections, quantity limits, taxes/service, integer rounding, unchanged orders, legacy payment compatibility, translation coverage and Unicode round trips.
- **Real local D1 API integration passed:** concurrent opening/orders/edits, idempotency, kitchen locks, revocation, staff/guest access boundaries, CSRF, payment safeguards, translated errors and malformed requests in both languages.
- **Full browser acceptance passed in English and Arabic:** opening a table, guest ordering/editing, two independent calculators, maximum quantities, reset on reopen, no calculator POST requests, unchanged order/payment state, kitchen transitions, staff calls, feedback, Arabic content editing, team management, settings, platform view, receipt preview, cash/card recording and closure.
- **Responsive and persistence checks passed:** guest and management layouts at 390px, desktop dashboard at 1440px, RTL/LTR, saved language after reload, independent guest language choices and session closure with an open calculator. Screenshots were reviewed.
- TypeScript check and production Worker build passed.

## Internal testing boundaries

The hosting audience remains owner-private. Other staff/testers must be granted hosting access before using their accounts or scanning table links. Outer hosting access and restaurant staff permissions are separate.

Physical printers/card terminals and real staff devices still require on-site validation. Browser receipt previews do not prove hardware printing. Existing two-second polling and bounded JSON/D1 storage remain; this release does not claim production-scale load certification, offline ordering, backups, a POS vendor connector or online payment processing. See `README.md` for the operator checklist and local test commands.

## Session lifecycle update

Bill requests now atomically enter BILL_REQUESTED and pause guest order creation/editing. Authorized staff can reopen ordering before explicitly finalizing a version-checked bill. Finalization freezes its pricing snapshot; draft printing and final printing are separate actions. Settled finalized sessions can release a TABLE_AVAILABLE table, or staff can open a new session on the same stand link after finalization while retaining any old balance. Old capabilities cannot access a replacement session. Historical bills/payments stay intact, and existing kitchen work can continue. English/Arabic status notices, recovery for stale financial reviews, previous-bill access, transition tests and real D1 concurrency tests accompany the change. Existing JSON state upgrades without a SQL schema rewrite.
