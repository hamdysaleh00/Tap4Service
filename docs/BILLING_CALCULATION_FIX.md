# Tax, service charge and Split Bill fix

Verified locally on 17 November 2026. No deployment or live data changes.

## Cause and behavior

Restaurant settings store rates in integer basis points: 1400 means 14%.
Previously, opening a table copied these values into the session, and all later
bill calculations used that copy. Updating restaurant settings therefore left
existing open tables at the previous rates, often zero.

Unfinalized bills now use that restaurant's current tax and service rates.
Settings saves update its active OPEN and BILL_REQUESTED sessions and advance
their versions, invalidating stale finalization requests. Reads also calculate
correctly for existing sessions with stale saved rates, without requiring a
database migration or data rewrite. Finalization records both the actual rates
and monetary charges. Later settings updates do not change finalized bills.

A second defect in the dashboard discarded `finalBill` before calculating the
displayed bill. Its projection now retains the recorded snapshot for calculation
while preserving the existing billing permission checks.

Both charges apply independently to the item subtotal, including selected
modifiers at their recorded order prices. Integer piastres are rounded once per
charge on the combined table bill. There is no alternative calculation-method
field in the existing restaurant configuration.

| Component | Example |
| --- | ---: |
| Subtotal | 500.00 EGP |
| Service, 12% of subtotal | 60.00 EGP |
| Tax, 14% of subtotal | 70.00 EGP |
| Table total | 630.00 EGP |
| Guest selecting 200.00 EGP | 252.00 EGP |
| Guest selecting 300.00 EGP | 378.00 EGP |

The guest bill, bill requests, staff dashboard, draft/final printing and payment
validation all use the same server bill. The basket now additionally shows the
resulting combined table bill with the existing `BillTotals` component. Editing
an order replaces that order in the preview rather than counting it twice.
Settings help text and the new preview caption are available in English/Arabic.
No CSS, restaurant design or component layout was replaced.

## Split Bill

The existing calculator already apportions the actual bill's recorded tax,
service, discount and rounding amounts using deterministic largest remainders.
It now receives the corrected bill and effective rates from the server.

- Per-guest quantities cannot exceed the combined ordered quantity.
- Unassigned quantities and their charges remain visible in a remainder bucket.
- Guests plus unassigned amounts reconcile to every component of the table bill.
- Once all items are allocated, guest totals equal the table total exactly.
- Order edits, added items and changed live charges update calculations. Removed
  or reduced quantities are normalized against the current order.
- Finalized bills retain original charges even after settings/menu changes.
- Allocation is local to the open calculator. It creates no guest payment,
  server reservation or change to the restaurant's combined payment workflow.

## Files

- `lib/bill-pricing.mjs`: shared rates, charge calculation and basket preview.
- `lib/domain.mjs`: live/finalized billing, projections and settings changes.
- `lib/updates-repository.mjs`: legacy live-balance selection uses effective rates.
- `app/tab2serve.tsx`: existing totals component in basket; corrected settings copy.
- `lib/locales/ar.mjs`: Arabic strings for the new copy and payment safeguard.
- `tests/billing-rates.test.mjs`: focused pricing, projections, tenant isolation,
  settings validation, stale versions, preview and Split Bill regressions.
- `tests/billing-worker.integration.mjs`: built Worker/API checks on both backends.
- `tests/updates.test.mjs`: persistent live polling and final history on both backends.
- `tests/domain.test.mjs`, `tests/split-allocation.test.mjs`: align previous
  session-frozen expectations with the requested finalization boundary.

Earlier frontend asset fixes in this checkout were preserved.

## Validation

- TypeScript check: passed.
- Vinext/Vite production build: passed.
- Unit suite: 151/151 passed, including fractional percentages, quantity limits,
  multi-guest splits, discounts, rounding, unassigned items and live order edits.
- Built Worker integration cases: 16/16 passed across billing (both storage
  formats), normalized storage, authentication, tenant isolation, production
  behavior, live updates and independent restaurants.
- Billing logic/test lint: no errors; existing domain unused-variable warnings.
- Full-project lint: the existing 10 errors and 135 warnings remain. Existing UI
  lint failures were not changed as part of this billing fix.
- Local synthetic API fixture confirmed taxes and service in the returned bill.
- Fresh browser visual QA was unavailable because the Chrome window was minimized
  and the UI automation surface could not activate it. No visual pass is claimed.

Evidence: `outputs/billing-fix/` (local, ignored by Git).

To repeat checks, run `npm.cmd test`, `npm.cmd run typecheck`,
`npm.cmd run build`, then `node tests/billing-worker.integration.mjs`.
Worker tests create isolated synthetic D1 databases and do not use the normal
local Wrangler database or any hosted database.

Verification results: production build and type check passed; 151 unit tests,
16 Worker integration cases, and 2 development asset tests passed. Billing logic
lint has no errors. Full-project lint retains 10 existing errors and 135 warnings.
Logs are in the ignored `outputs/billing-fix/` directory.

A fresh browser visual check could not be completed because the available Chrome
window was minimized and the computer-use tool could not restore it. The billing
API and data calculations were verified using the built Worker and isolated D1
fixtures. The temporary synthetic preview was stopped after testing.

## Payment safeguard

A settings change that would reduce an unfinalized bill below payments already
recorded is rejected before changing any settings or sessions. Staff must resolve
that table using the existing workflow; this fix does not introduce refunds or
silently rewrite payments. Finalized bills remain payable at their recorded total.
