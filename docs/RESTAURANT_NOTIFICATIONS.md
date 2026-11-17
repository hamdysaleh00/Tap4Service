# Restaurant notifications and sound alerts

Implemented and tested locally on 17 November 2026. No deployment, remote D1
operation, DNS change, migration activation or other live infrastructure change
was performed.

## Workspace and integration scope

Work is isolated in `work/notifications-isolated` on
`codex/restaurant-notifications`, starting from `9b6783d`. The original checkout
contained other-session changes. Those files and the POS and Design Studio
worktrees were preserved; their changes were not imported.

The branch supports guest orders, guest edits before preparation, additional
orders, item additions/removals and quantity reductions, kitchen status changes,
waiter calls, request acknowledgment/resolution, bill requests, reopening,
finalization, recorded cash/card payments and table release. It has no cashier
order creation or whole-order cancellation command. Notifications cover the
implemented mutations; this change does not invent cancellation or POS billing
behavior. Quantity reductions/removals notify as **Items cancelled or removed**.

## Delivery and persistence

The existing completion-scheduled, approximately two-second foreground polling
transport remains in use. It allows one request in flight, uses private/no-store
responses and ETags, discards obsolete responses, aborts timed-out requests,
backs off failures, and resumes on online/focus/visibility events. Important
notifications are delivered on every restaurant workspace snapshot, independently
of the currently selected history/service/activity page.

Notification metadata is attached to the successful command's existing audit
event by `lib/notifications.mjs`. It commits with the business mutation through
the legacy JSON compare-and-swap or the normalized repository's guarded atomic
D1 batch. A rejected mutation creates no event. Existing idempotency keys and
request coalescing produce no additional notification for retries.

No SQL schema migration or new Cloudflare binding is required. Legacy events
live in `app_state`; normalized events use the existing `audit_events.extra_json`
field. Read receipts persist in that event, keyed by authenticated staff identity.
Reading on one device updates the same staff member's other devices, while
another staff member retains an independent unread state.

Snapshots include the recent 150 restaurant notification events plus **all unread
events**, followed by permission filtering. Unread events therefore survive a
disconnect longer than the recent-history window. Events remain in the audit
store after leaving the notification history. Older deployments' audit records
without notification metadata are not retrospectively synthesized into alerts.

Keeping polling fits this alpha's existing architecture and avoids introducing
connection coordination or a new deployment dependency. Cloudflare describes
[Durable Objects as the coordination point for multiple WebSocket connections](https://developers.cloudflare.com/workers/runtime-apis/websockets/).
The normalized commit continues to rely on
[D1's atomic batch behavior](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Staff experience and sound

The bell displays a numeric unread counter. Its history shows event descriptions,
table/order references, local timestamps, read status and actions. Unread events
also produce a persistent visible banner and an accessible live announcement.
Viewing an order opens that specific order. Historical order details load on
demand through the existing authorized `/api/state` endpoint. Reading a service
notification does not resolve a guest request; the existing service acknowledgment
and resolution controls retain their separate meaning.

**Enable Sound Alerts** must be clicked in each tab to unlock Web Audio. Order,
waiter, bill, payment and session categories use different synthetic tones;
item removal has a descending alert. A batch of arrivals plays one tone for its
latest event instead of overlapping many tones. Mute and the desired enabled
preference are remembered per restaurant and staff identity. A remembered enabled
preference still requires a gesture in a fresh tab/browser session.

Stable event IDs suppress duplicate visual announcements and sounds across
polls, workspace views, reconnections and reloads using optional browser storage.
Separate devices can each sound once. Storage failure falls back to in-memory
deduplication for that component's lifetime. Blocked or unavailable audio leaves
notifications visible and offers an explicit retry control. No remote audio,
media permission, CSP relaxation or audio codec is required. Labels support
English and Arabic RTL.

## Permissions and security

| Category | Required read permission (any listed) |
| --- | --- |
| Orders and item edits | `orders.read`, `kitchen.read`, `billing.read` |
| Waiter requests | `staff_calls.read` |
| Bill requests and payments | `billing.read` |
| Table/session lifecycle | `sessions.read`, `billing.read` |

Both snapshots and `notification.read` enforce these permissions. Reads require
an active restaurant membership and are scoped by the existing authenticated
tenant resolver. Guest/public projections contain no staff notifications or
receipts. Guessed foreign event IDs and mixed authorized/unauthorized read batches
fail without partially applying receipts. Read batches are bounded to 100 IDs;
the interface clearly shows the batch size when more remain unread.

Notification references come from the validated command's affected entities;
unrelated caller-supplied IDs cannot redirect an alert to another table/order.
Notification projections omit guest capabilities, request payloads, notes,
staff emails, payment amounts and other users' read receipts. Existing origin,
CSRF, body size, staff authentication, production header-spoofing defenses and
tenant routing remain active.

## Verification

| Check | Result |
| --- | --- |
| Notification unit/repository tests | **PASS** 8/8, legacy and normalized SQLite/D1 adapter |
| Complete `tests/*.test.mjs` suite | **PASS** 163/163, including actual local D1 backup restoration, language storage and local platform navigation |
| Notification built Worker/D1 integration | **PASS** 2/2, both storage modes |
| Existing built Worker regressions | **PASS** 15/15: updates, billing, tenant routing, independent authentication, normalized storage and production-mode security |
| Local lifecycle race integration | **PASS** against the isolated local D1 server |
| Two-device notification browser integration | **PASS** actual Chromium, explicit native audio unlock, dedupe, mute, fallback, offline recovery, order navigation, receipts, mobile and Arabic |
| Existing alpha browser acceptance | **PASS** English and Arabic: guest ordering/editing, kitchen, service, feedback, management, printing, payments, closure, Split Bill and charge calculations |
| Existing lifecycle browser acceptance | **PASS** English and Arabic: reopening, finalization, stale reviews, permanent QR, old balances, history and calculator cleanup |
| Existing design editor browser regression | **PASS** local authenticated save/preview/publish/revert/reopen; business records and notifications unchanged |
| TypeScript | **PASS** `npm.cmd run typecheck` |
| Build | **PASS** `npm.cmd run build`, Workers server bundle generated |
| New notification source/test lint | **PASS**, no errors or warnings |
| Full-project lint | **PASS** exit 0, no errors, 133 warnings; one documented local compatibility exemption for the existing workspace `Any` alias |
| Whitespace validation | **PASS** `git diff --check` |
| Hosted Cloudflare/physical-device audio | **NOT RUN**, local runtime/browser verification only |
| Other worktrees' POS/Design Studio changes | **NOT TESTED**, not integrated into this branch |

The original notification commit recorded a reproducible local backup-test
failure. Follow-up investigation fixed it by moving disposable D1 recovery files
to a short, uniquely created OS temp directory: the nested Windows worktree path
made workerd's SQLite filenames too long. The drill now restores and verifies
actual D1 data, rotated guest capabilities and revoked authentication records.
Cleanup remains constrained to the generated test directory. The generated
schema comparison now normalizes CRLF to LF before comparing exact contents, so
a fresh Windows checkout does not require rewriting schema artifacts. No schema
or production backup behavior changed.

Follow-up lint work replaces language hydration state effects with an external
browser preference store and typed localization context. Persisted preferences,
identity changes, cross-tab updates, blocked storage and server snapshots have
unit coverage. Browser readiness and table-token hydration also use stable server
snapshots; guest session closure resets transient UI before committing a stale
calculator/dialog. The existing design editor now applies results from the fetch
completion callback and ignores aborted reads. The site home link uses framework
navigation. The workspace's large pre-existing dynamic props/forms boundary still
uses `Any`, with a single inline lint exemption and an explicit explanation;
this is retained type debt, not a claim that all workspace wire contracts are
fully typed. Lint rules are not relaxed globally.

Expanded acceptance also exposed a pre-existing local platform-navigation race:
the next platform poll replaced the selected restaurant with `null`, unmounting
the navigation needed to return to Billing. Local platform snapshots now reload
the authorized restaurant and current permissions alongside platform summaries
and notifications. They do not reuse stale client permissions. Repository tests
cover both storage modes, unchanged polls, unrelated restaurant revisions and
unauthorized reads; built Worker and browser regressions cover navigation back.
Dedicated admin-host responses and tenant-host restrictions are unchanged.

The design editor browser test selects the existing SuperAdmin component using
the real local platform snapshot with a fixture routing label. All design API
calls and previews use the actual authenticated local backend. This exercises
the baseline editor on this branch, not the other worktree's Design Studio;
hostname authorization is verified separately in the Worker suites.

Browser testing also exposed the baseline development asset routing bug:
`run_worker_first: true` intercepted Vite's browser modules and styles with HTML
404 responses. `vite.config.ts` now lets Vite handle development requests first,
while emitted production configuration retains Worker-first routing. This is a
small prerequisite fix in this worktree, independent of the other session's
frontend work; no other-session files were copied or modified.

Run `npm test`, `npm run typecheck`, `npm run build`, and
`npm run test:notifications-worker`. For browser tests start an isolated local
preview, then run `node tests/notifications.ui.local.mjs`; `TEST_BASE_URL` defaults
to `http://127.0.0.1:5194`. Supply `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` when
Playwright or Chromium are provided outside project dependencies. Existing alpha
acceptance accepts the same environment variables. Test fixtures reject remote
base URLs. Machine-local logs and screenshots are under ignored `outputs/`.
The additional browser checks are `node tests/session-lifecycle.ui.local.mjs`
and `node tests/design-editor.ui.local.mjs` with the same local environment.

## Operational limits

- Hidden/offline tabs retain the existing paused polling behavior. Reopening a
  visible tab catches up; closed browsers do not receive push/background audio.
- Browser/OS settings can block or silence sound. Automated tests verify native
  oscillator scheduling, not physical speakers or a particular mobile device.
- Polling provides near-real-time delivery, not instantaneous push. Large unread
  backlogs increase changed-snapshot reads and response size. Unchanged polls
  retain the one-query repository fast path; authentication/routing have their
  existing additional costs. Measure full-history mutation costs and unread
  backlogs before expanding beyond this alpha's storage limits.
- The notification drawer retains recent read history; full audit persistence
  follows existing storage and backup policies. There is no new retention job.
- Cashier-created orders, whole-order cancellation and other branches' design
  tooling require separate integration and acceptance testing when available.
