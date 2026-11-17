# Cashier POS and financial operations

Implemented in the isolated `codex/cashier-pos-finance` worktree. This is a local
implementation and verification record, not a production deployment or fiscal
certification. No hosted database, payment gateway or hosting configuration changes
are part of this work.

## Operation

- **Cashier POS** creates orders for enabled, permitted tables. It reuses an OPEN
  session, or creates a session with `sessions.open`. Products, quantities,
  modifiers, instructions and stored prices use the existing ordering functions.
  Existing unpaid Pending/Accepted orders can be edited; adding a new order remains
  possible after another order starts preparation.
- Select individual items, multiple items or all items to cancel, with a reason.
  Cancellation retains original lines and quantities, marks cancelled quantities,
  records the actor and notifies the staff/kitchen screens through existing
  polling. Prepared/ready/served items additionally require `billing.void` and
  `billing.approve_adjustment`. Cancelled unprepared, unpaid orders can be reopened.
  Adjusted orders are staff-managed; paid orders use refunds, never deletion.
  After any payment, both guest and cashier edits to existing orders are locked;
  additional items use a new order, preserving previously paid item history.
- **Discounts** support basis-point percentages and fixed piastre amounts, per
  item or combined bill. One active discount per item and one per bill are allowed;
  replacing/removing a discount retains its history. Item discounts apply first,
  then the bill discount; tax and service apply independently to the discounted
  subtotal. Fixed discounts are bounded by their eligible value. A cashier's
  `discountLimitBps` defaults to zero; higher discounts require the signed-in
  actor's `billing.approve_adjustment`. A client-provided approver ID has no effect.
- **Billing** retains explicit finalization, immutable original pricing, browser
  receipt printing and outstanding-balance checks. Cash/card portions can be
  recorded independently for mixed or partial settlement. The UI supplies the
  reviewed total and outstanding amount. Guest bills, basket previews and Split
  Bill share pricing and per-item discount allocations, including exact rounding.
- **Refunds** require manager adjustment and refund permissions, finalization,
  an original payment, a reason, a current bill version and an idempotency key.
  Full or partial amounts cannot exceed either the remaining original payment or
  remaining bill value. Cash refunds use the current actor's drawer; card refunds
  require confirmation that the refund actually occurred and a unique external
  reference. The app records the result; it does not initiate a card refund.
  Every refund creates a matching credit note, so it does not reopen the table's
  receivable. Original payments and finalized bills remain intact. Credit tax and
  service use cumulative proportional rounding, avoiding drift on partial refunds.
- **Unpaid credits / transaction voids** require manager void and adjustment
  permissions, a reason and a current finalized bill version. They reduce only
  the unpaid receivable. Paid amounts must use the original-payment refund flow.

Restricted operations are performed by an authorized manager using their own
authenticated session. There is no shared manager PIN or client-side approval
override. Normal signed-in authorization and independent-auth CSRF protections
remain in force on the command API.

## Accounts, shifts and handovers

Team management includes waiter, cashier, manager and owner permission presets,
custom permissions, an individual discount limit and assigned table IDs. An empty
table assignment permits all tables. Backend checks cover cashier actions,
existing session/billing actions and kitchen transitions; filtered staff views
also respect assignments. Restaurant membership and hostname tenant checks remain
the first boundary. Roles are presets; explicit server permissions authorize work.
Existing administrators gain the new POS permissions once; ordinary staff do not.

Cashier-role accounts require an open shift for collections/refunds. For backward
compatibility, existing unassigned-role accounts may retain the original payment
flow until the first shift opens. Opening that shift permanently enables shift
requirements restaurant-wide. New payments then identify the acting member and
shift. Historical payments with no shift remain visible as legacy transactions;
no historical identity, shift, float or drawer allocation is invented.

Shift opening records the float. Manager-supervised cash in/out records reasons
and identities; managers can act on a cashier's drawer. Card movements never enter
physical cash:

`Expected Cash = Opening Float + Cash Payments + Cash In − Cash Refunds − Cash Out`

Shift closing records counted cash, closing identity/time and overage/shortage.
Closed shifts reject further transactions. Payment counters are updated in the
same atomic transaction as payment records, allowing live drawer totals to remain
correct after older paid bills leave the polling window. Reports independently
read the complete payment ledger.

Handover starts only after closing/counting a shift. The outgoing cashier names
an active recipient and declares no more than the counted cash. One handover per
outgoing shift is allowed. The named recipient confirms their actual received
cash, a reason and timestamp; discrepancies remain recorded. Confirmation
atomically opens the recipient's new shift with received cash as its float.
Pending handovers prevent independently opening an incoming shift. Neither party
can confirm twice or confirm on the other's behalf.

## Reporting policy

`finance.report` is a read operation over complete tenant state, independent of
the dashboard's historical pagination. Dates default to the restaurant timezone
(`Africa/Cairo` when unset), with inclusive date, cashier and shift filters.

- Finalized sales are counted once, at finalization, and include tax/service.
  Cashier/shift sales attribution belongs to the finalizer.
- Collections use payment timestamps and the collecting cashier/shift. Collecting
  a historical bill does not count another sale.
- Refunds and credits use their own dates and acting cashier/shift. Original
  refunds and matching credit notes are separate transaction types; only credits
  reduce sales, so refunds are not deducted twice.
- Net sales means finalized bill totals less credit notes, including charges.
  Merchandise revenue excludes tax/service; gross and credited tax/service are
  also reported. A later-day return can produce negative net sales that day.
- Outstanding balance is the current **restaurant-wide, all-date** receivable,
  independent of the report period or cashier/shift filter.
- Daily/cashier/shift breakdowns, cash/card collections and refunds, shift cash
  discrepancies and referenced transaction history are available. Handover
  discrepancies are visible in the shift workspace.
- Records lacking original cashier/shift IDs are grouped as `legacy`, not
  attributed to a current employee.

These are operating reports, not statutory accounts, profit statements or fiscal
invoices. Service-charge accounting and tax treatment must be reviewed for the
restaurant's jurisdiction before production use.

## Persistence, compatibility and concurrency

**No SQL migration is required.** The legacy JSON model stores `restaurant.pos`;
the normalized adapter preserves it in the existing `restaurants.extra_json`.
Member policies, session discounts/finalizer identity, payment actor/shift IDs
and cancelled quantities use the existing model's retained extension fields.
Existing schema/model versions, database bindings and staged migration gates are
unchanged. Generated schema artifacts explicitly use LF through `.gitattributes`
so Windows checkouts satisfy the generator's byte-for-byte drift checks; the SQL
and declarations have no semantic change.

The POS object contains versioned shifts, cash movements, refunds, credits,
handovers, audit events and operation receipts. Both storage adapters execute the
same domain operations using their existing compare-and-swap transaction. D1
normalized changes, ledger append, audit entry, bill/order version and drawer
counter commit in one atomic batch. Conflicts reload and revalidate. Request keys
bind the full command payload and actor; different payload reuse is rejected.
Refund references, remaining eligibility, duplicate shifts and handovers are
rechecked after contention. Financial reports do not advance tenant revisions.

The existing Alpha storage limits still apply: POS history is retained, not
pruned. Before large or long-running deployments, move the growing POS ledger into
separately indexed tables with an approved, tested migration and retention plan.
No production migration or database cutover was performed here.

## Verification and remaining acceptance

- `npm test`: **163 passed**, including POS domain workflows, real D1 contention,
  tenant isolation, pricing/splits, backup restoration and existing regressions.
- `node tests/pos-worker.integration.mjs`: **2 passed**, built Worker command
  routing/auth/validation, guest synchronization, mixed payments, refunds,
  reports, shifts and handover boundaries in legacy and normalized D1.
- `node tests/billing-worker.integration.mjs`: **2 passed**, existing billed-rate
  propagation through real Worker/D1, including split allocations and settlement.
- `npm run test:tenant-worker`: **2 passed**, built tenant pages, guest lifecycle,
  authentication and cross-restaurant isolation in both storage modes. These
  checks caught and verified the fix for a client/server import-order cycle.
- The combined built Worker suite passed **13 tests**, including the suites above,
  independent authentication/CSRF/MFA, production fail-closed behavior and native
  rate limiting, all against disposable local D1.
- `npm run typecheck` and `npm run build`: passed.
- Focused ESLint for the new POS code, pricing, projections and new tests passed.
  Repository-wide lint still reports **10 pre-existing errors** in older components;
  the changed dashboard has the same three baseline errors. No POS lint errors
  are suppressed apart from its explicit legacy dynamic-projection type boundary.
- The backup restore fixture now uses a bounded short Windows temporary directory
  so workerd's SQLite paths stay below MAX_PATH; restored data is still isolated.

The browser access host was unavailable, so interactive desktop/mobile/RTL,
focus/keyboard and real printer acceptance remain unverified. A local Worker
preview was built; production preview does not accept the dev-server-only cookie
used by the old `api.integration.mjs` and `session-lifecycle.integration.mjs`
scripts. Those scripts returned 401 in that mode. The built Worker tests above
use the supported local test identity headers and passed. No production access
policy was weakened to run tests.

Card acquiring, real external refund execution, fiscal/e-invoice certification,
thermal-printer integration, sound/push notifications and production deployment
remain outside this implementation. No funds were moved and no messages were sent.
