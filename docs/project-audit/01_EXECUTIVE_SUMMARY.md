# Executive summary

## Decision and scope

**Tab2Serve is a functional engineering Alpha, not an approved production
restaurant platform.** The local backend candidate has substantial functional,
tenant-isolation and recovery tests. Public deployment remains blocked by
security/dependency and operational acceptance work. This is not a declaration
that a current public service was penetrated or even runs this exact source.

Inspected: all authored app/API/Worker/domain/storage/auth/configuration modules,
SQL and migration tooling, test inventory, dependency manifests, supplied
documentation, available Git history and configured repository metadata. The
vendored UI/helper libraries were inventoried and linted, not independently
re-audited line by line. No hosted D1, registrar, DNS, mail account, paid Workers
account, or production dataset was inspected.

## What exists

React 19 App Router UI, Vinext beta + Vite, a custom Cloudflare Worker, and D1.
Guests use a permanent QR/NFC table URL and a revocable current-session capability.
Staff use permissions checked on every command. Independent password/session/TOTP
authentication is implemented, while Sites/Access compatibility is retained for
other explicitly configured modes. Two-second completion-scheduled polling
delivers dashboard changes; there are no WebSockets.

Both database architectures remain implemented: legacy `app_state/main` holds
the entire platform as JSON, while the normalized v3 adapter uses relational
tenant tables. Strict hosted configuration requires normalized storage and
independent auth; default source/local behavior still supports legacy storage.
The combined implemented schemas contain 32 tables, 267 columns and 39 explicit
indexes. Actual hosted schema/data/cutover state is unknown.

Complete within verified backend scope: menus/categories/modifiers, table/session
lifecycle, anonymous shared orders and versioned edits, kitchen transitions,
combined bill request/finalization, integer tax/service calculations, cash/card
recording, duplicate suppression, permissions, tenant hostname isolation,
Super Admin provisioning/design publication, conditional updates, bounded history
pages and encrypted offline recovery tooling. The split calculator supports
multiple people within one unsaved browser plan; it does not allocate real payments.

Missing or partial: cancellation/void/refund workflow, online payment processing,
subscription collection, POS/fiscal integration, silent printing, offline order
queueing, push transport, full authentication/account localization, hosted backup
automation and proven device/browser acceptance. QR/NFC URL generation exists;
physical tags, scanners and printers have not been verified.

## Actual results

| Area | Result |
| --- | --- |
| TypeScript, Vinext build, both upload dry-runs | PASS; dry-runs published nothing |
| Existing unit/domain/security/SQLite/D1 suite | 140 passed, zero failed |
| Existing built-Worker integrations | 14 cases passed across six suites |
| Existing local HTTP API/lifecycle scripts | Both PASS using disposable local D1 |
| New audit observations | 2 PASS: HEAD bypass reproduced; bounded polling measured |
| Whole-repository ESLint | FAIL: 10 errors, 135 warnings |
| npm dependency audit | FAIL: 25 affected package entries: 2 critical, 10 high, 13 moderate |
| Package signatures | PASS: 671 registry signatures, 228 attestations verified |
| Four Playwright UI scripts | BLOCKED at import: package not installed; no UI assertions ran |
| Browser access | Browser host unavailable; native smoke incomplete, not an acceptance PASS |
| Secret scan | 306 reachable historical blobs and worktree scanned heuristically; only a synthetic unsafe-URL fixture matched; no real credential confirmed |

Package counts are not unique exploit counts. Critical advisories affect
`react-server-dom-webpack@19.2.6` and `next@16.3.4`. The RSC plugin also vendors a
package labeled 19.2.6, so changing only the direct dependency may be insufficient.
Applicability depends on bundled paths and advisory conditions; no RCE payload
was executed. See [the security report](07_SECURITY_AUDIT.md).

## Main risks

The confirmed application gap is public HEAD rendering bypassing the GET
rate limiter. Scaling risks include full-restaurant history loading/diffing for
mutations, legacy global CAS, indefinite retained history and polling costs.
Migration, identity reconciliation, mail delivery, secrets/key recovery, real
TLS/DNS and a timed hosted restore remain unverified. Readiness checks do not
prove email delivery or the presence of a usable enrolled administrator.

## Top 10 priorities, in implementation order

1. Keep public rollout on hold; triage critical runtime and vendored RSC advisories.
2. Upgrade a compatible React/RSC/Vinext/Vite/Workers toolchain; rebuild and retest.
3. Close and regress the HEAD rate-limit bypass and review remaining cheap paths.
4. Restore a reproducible browser test environment and fix all blocking lint errors.
5. Complete two-restaurant mobile/RTL/auth/device acceptance and auth localization.
6. Prove source-preserving normalized/auth migration on a hosted disposable clone.
7. Provision/rehearse owner MFA, recovery keys, approved sending service and mail DNS.
8. Measure largest-tenant mutation cost/NAT traffic and set a supported load envelope.
9. Perform a timed restore/reconciliation drill; configure monitoring/retention/budgets.
10. Review the immutable release/config/DNS diff and obtain explicit cutover approval.

Complexity, dependencies and acceptance criteria appear in
[the action plan](11_RECOMMENDED_ACTION_PLAN.md). No fixes to production code were
made as part of the audit. Existing working-tree changes are included in the
requested synchronization after review; their inclusion is not deployment approval.
