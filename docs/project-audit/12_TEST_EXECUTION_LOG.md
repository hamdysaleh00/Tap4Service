# Test execution log

Audit date: 17 November 2026, Africa/Cairo. Node v26.13.1; existing npm lockfile
and installed toolchain. Full outputs remain in ignored outputs directories;
sanitized selected evidence is tracked under evidence/. Environment fixture
secrets are synthetic, and no credential values or table URLs are included here.

## Commands and actual outcomes

| Command / tool | Scope | Status | Actual result / detail | Files / next action |
| --- | --- | --- | --- | --- |
| git status --short; branch --show-current; log --all; branch -avv; remote -v | Working tree/history | PASS | Dirty main identified; 6 main commits/10 reachable, two local roots, non-shallow | Preserve original changes; chronological limits in report 02. |
| GitHub get_repo/search_branches | Repository identity | PASS | Existing public hamdysaleh00/tab2serve, default main, push access; advertised branch main | No new repository created. |
| git ls-remote --heads origin (sandbox) | Remote heads | BLOCKED initially | Network sandbox could not reach github.com:443 | Read-only retry outside sandbox passed. |
| git ls-remote --heads origin (approved retry) | Remote history | PASS | main=dc16595384a1bfe1baa5f63bd4096ac8a3bdf52f matched local before audit | Recheck before non-force push; receipt records final status. |
| node scripts/cloudflare-verify.mjs | Existing full local verification | PASS | All 11 steps exit 0; 140 unit + 14 Worker cases, type/build and both dry-runs | Runs outside filesystem sandbox for esbuild parent reads; no deploy/remote D1. |
| node node_modules/typescript/bin/tsc --noEmit (runner step) | TS types | PASS | Exit 0 | Does not replace ESLint. |
| node --test tests/*.test.mjs (runner enumerates files) | Existing unit/security/domain/D1 | PASS | 140 tests, 0 failed/skipped | Individual names below. |
| node scripts/run-framework.mjs build (runner step) | Vinext/Vite production | PASS | Exit 0; Worker chunks/browser assets emitted; nonfatal Node/lucide optimization warnings | Dependency upgrade still required. |
| node tests/normalized-worker.integration.mjs | Built legacy/normalized | PASS | 2 cases | Local isolated workerd/D1 only. |
| node tests/auth-worker.integration.mjs | Independent auth | PASS | 4 cases | Actual mail/provider not contacted. |
| node tests/tenant-worker.integration.mjs | Hosts/tenant designs | PASS | 2 cases | True TLS/DNS not established by synthetic HTTPS. |
| node tests/production-worker.integration.mjs | Strict configuration/concurrency/limiter | PASS | 3 cases | Includes 18 distinct concurrent orders and 8 duplicate retries. |
| node tests/updates-worker.integration.mjs | Polling/history | PASS | 2 cases | Legacy/normalized parity; not a browser test. |
| node tests/cloudflare-staging.integration.mjs | Strict two restaurants/assets | PASS | 1 case | No outbound identity call; scripts/CSS/favicon/HEAD and metadata tests. |
| Wrangler deploy --dry-run --config config/wrangler.staging.example.jsonc | Upload packaging | PASS | Exit 0, 67 additional modules, 26 assets; no upload/deployment | Placeholder D1 identity not validated remotely. |
| Wrangler deploy --dry-run --config config/wrangler.production.example.jsonc | Upload packaging | PASS | Exit 0, 1,086.09 KiB / 323.11 KiB gzip | No account/secret/route activation. |
| node tests/project-audit-runner.mjs checks | Lint + new local observations | MIXED | Captured separate statuses, see next rows | Runner itself records results even when checks fail. |
| node node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next --format json | Repository-wide static lint | FAIL | Exit 1; 10 errors, 135 warnings | Fix errors deliberately; sanitized file/rule/line evidence tracked. |
| node tests/project-audit.integration.mjs | New bounded audit tests | PASS as observations | 2 tests; confirmed HEAD bypass + measured 20 polling reads | HEAD reproduction is an unresolved security failure, not a passing control. |
| npm audit --json (first sandbox attempt) | Registry vulnerability lookup | BLOCKED initially | Empty network error detail; no valid vulnerability result | Approved registry retry completed; do not count initial attempt as clean. |
| node tests/project-audit-runner.mjs registry: npm audit --json | Registry vulnerability lookup | FAIL | Exit 1; 25 affected entries: 2 critical,10 high,13 moderate | Remediate/triage graph; no automatic fix run. |
| Same registry phase: npm audit signatures | Available supply-chain signatures | PASS | Exit 0; 671 signatures,228 attestations | Signature PASS does not cancel vulnerability findings. |
| node tests/project-audit-scan.mjs | Worktree/reachable history patterns | REVIEW completed | 306 historical blobs; two matches for same synthetic unsafe-URL test fixture, no real secret confirmed | Specialist scanner absent; staged scan repeated before commit. |
| gitleaks / semgrep / CodeQL | Specialist security tooling | BLOCKED / NOT RUN | Binaries/configured analysis unavailable | Install approved pinned tools in future CI; do not call ESLint equivalent SAST. |
| node tests/project-audit-schema.mjs | Empty in-memory actual DDL | PASS | 32 tables,267 columns,39 explicit indexes; dictionary/ER generated | No hosted database inspected; source DDL vs actual live schema distinction maintained. |
| Wrangler d1 execute DB --local --config outputs/project-audit/preview.wrangler.json --persist-to outputs/project-audit/preview-state --file drizzle/0000_misty_baron_zemo.sql | Disposable audit fixture | PASS | app_state schema created in isolated outputs path | Not normal .wrangler state; no remote flag. |
| Direct Vite preview --config outputs/project-audit/preview.vite.mjs | Ad-hoc HTTP harness, loopback5199 | PARTIAL | Health and API assertions pass; dev CSS/RSC asset URLs 404 in native smoke | Not a supported production-bundle browser acceptance result. |
| TEST_BASE_URL=http://127.0.0.1:5199 node tests/api.integration.mjs | Real local HTTP+D1 | PASS | Script completed all assertions | Runner supplies env in a cross-platform child process. |
| Same base, node tests/session-lifecycle.integration.mjs | HTTP lifecycle races | PASS | Script completed all assertions | Synthetic tenant/session/payment state only. |
| node tests/ui.local.mjs | Legacy browser calculator/mobile | BLOCKED | Exit1 ERR_MODULE_NOT_FOUND playwright before assertions | Also hardcodes5173; restore reproducible browser/port setup. |
| node tests/alpha.ui.local.mjs | Bilingual full UI | BLOCKED | Exit1 missing playwright before assertions | No English/Arabic browser PASS. |
| node tests/split-bill.ui.local.mjs | Browser split behavior | BLOCKED | Exit1 missing playwright before assertions | Unit calculator PASS is separate. |
| node tests/session-lifecycle.ui.local.mjs | Browser lifecycle | BLOCKED | Exit1 missing playwright before assertions | Backend lifecycle PASS is separate. |
| Wrangler dev --local --config dist/server/wrangler.json --persist-to outputs/project-audit/preview-state --ip127.0.0.1 --port5200 --var TAP2SERVE_LOCAL_DEV:true | Built local preview | PASS launch only | Ready on loopback; requires sandbox-read retry | UI journey not completed; no strict hosted-readiness claim from local-dev config. |
| CUA browser inventory/native Chrome | Frontend smoke | BLOCKED / INCOMPLETE | Browser host unavailable; native ad-hoc SSR observed, later minimized window prevented built preview observation | No browser suites, mobile/device, RTL layout or visual sign-off accepted. |
| Hosted DNS/TLS/mail/load/restore tests | Real infrastructure | NOT RUN | Explicit no-deploy/no-live-change scope, credentials/account not inspected | Approved staging phase after patches. |
| db:generate / schema generator / remote migrations / auth provisioning | Mutating preparation tools | NOT RUN intentionally | Would generate/change artifacts or require explicit data/identity input | Existing parity/migration/crypto/restore tests ran instead; no production mutations. |
| Git staged scan/commit/push/remote verification | Requested synchronization | Recorded at finalization | Exact post-audit status in synchronization receipt/final chat | No force push, branch deletion, history rewrite or secret export. |

## Existing individual test cases

Final document checks also passed: four audit-script syntax checks, 12 numbered
reports plus README present, all 20 relative Markdown links resolved, and staged
git diff --check clean after removing an extra generated trailing blank line.
The pre-commit staged scan found zero pattern matches and zero unsafe paths in
the 66-file payload; the redacted evidence was subsequently staged as well.

Generated from the actual unit/Worker output. Durations are harness wall time,
not Worker CPU measurements. Full assertions/source are in the named suite.

### unit

| Actual test name | Status | Wall duration |
| --- | --- | --- |
| verified Access signature supplies stable identity; multiple configured audiences supported | PASS | 83.9273 ms |
| expired, premature, wrong issuer/audience, malformed, unsigned and tampered identities fail closed | PASS | 50.436 ms |
| password hashes use random salts and the fixed memory-hard KDF; Unicode and bounds are enforced | PASS | 2342.4303 ms |
| TOTP matches the published RFC 6238 test vector | PASS | 5.7047 ms |
| authentication bodies are byte-bounded before buffering, with strict JSON media and UTF-8 validation | PASS | 32.3761 ms |
| login ignores identity headers, rotates opaque cookies, stores only digests and requires CSRF | PASS | 898.4886 ms |
| sessions expire, revoke on logout/account disable, and cannot be replayed on another origin | PASS | 1126.5306 ms |
| MFA is mandatory for Super Admin, TOTP counters are single use under concurrent login, and keys are encrypted | PASS | 1396.1804 ms |
| first normal user cannot become platform admin; source owner without explicit independent role is denied | PASS | 490.9215 ms |
| only an explicit recently authenticated Super Admin can disable another login | PASS | 452.5707 ms |
| invitation authorization uses stored membership; cross-tenant and guessed IDs are denied without issuing mail | PASS | 688.5944 ms |
| recovery is generic; one-use reset revokes all sessions and keeps MFA; mail failures leak no token | PASS | 683.0214 ms |
| email/IP attempts are atomically limited and sensitive changes require recent login | PASS | 421.9323 ms |
| password changes require the current credential, revoke all sessions, and block stale sessions | PASS | 1322.2723 ms |
| explicit offline provisioning retains identity IDs, rejects ambiguous owners and never contains a password or raw token in SQL | PASS | 3.0132 ms |
| new workspace preparation requires a named explicit owner and starts without sample tenants or public registration | PASS | 0.6842 ms |
| scheduled cleanup removes expired authentication material while retaining active sessions and all audit events | PASS | 443.2688 ms |
| offline backup CLI rehearses/prepares a recovery artifact that restores into an isolated real D1 database | PASS | 5654.5094 ms |
| legacy encrypted SQL backup restores schema/all data and prepares session-safe disaster recovery | PASS | 34.9104 ms |
| normalized encrypted SQL backup restores schema/all data and prepares session-safe disaster recovery | PASS | 208.2767 ms |
| wrong key, modified ciphertext/tag, wrong source identity, corrupt SQL and incomplete backups fail closed | PASS | 7.2137 ms |
| example: 1 burger, 1 pizza, 2 colas = 550 EGP | PASS | 2.9312 ms |
| single, empty, maximum and out-of-range selections | PASS | 0.8691 ms |
| actual charges are proportional with integer rounding | PASS | 0.5695 ms |
| removed and reduced order lines are clamped; price snapshots remain independent of menu availability | PASS | 1.4274 ms |
| calculators are independent and never mutate orders, bill or selections | PASS | 0.5137 ms |
| no per-person payment or assignment endpoints remain; legacy recorded amounts still count | PASS | 30.0462 ms |
| staff opens a table without a guest name; second active session rejected | PASS | 17.8635 ms |
| three anonymous browsers share one session and any guest can edit | PASS | 3.5338 ms |
| preparing locks only that order; later orders remain editable | PASS | 1.7177 ms |
| edit and kitchen transition use versions in either commit order | PASS | 1.1924 ms |
| multiple simultaneous edits reject a stale revision | PASS | 1.1681 ms |
| pending orders are visible to cashier and kitchen without acceptance | PASS | 1.6724 ms |
| order submission is idempotent | PASS | 0.8469 ms |
| combined bill sums all orders and duplicate bill requests collapse | PASS | 1.1493 ms |
| a bill request never requires feedback | PASS | 0.6296 ms |
| two guests submit private feedback; ordinary staff and guests never see it | PASS | 2.2269 ms |
| staff can print without any guest bill request | PASS | 0.6741 ms |
| payment needs exact current bill and close requires settlement | PASS | 1.1834 ms |
| new orders after payment create a new balance before closure | PASS | 0.7585 ms |
| closing revokes old capabilities and a new session has no old orders | PASS | 1.0487 ms |
| no session means browse only, with no historic orders | PASS | 1.2517 ms |
| unavailable items rejected on server; historical prices retained | PASS | 0.7701 ms |
| swapping item ID cannot reuse a cheaper historical price | PASS | 0.9 ms |
| tenant isolation blocks reads and guessed foreign mutations | PASS | 0.7679 ms |
| RBAC rejects menu edits and closing without permission | PASS | 0.5358 ms |
| staff invitations bind once to stable identity; disabled users lose access | PASS | 1.0282 ms |
| calls deduplicate; acknowledgments propagate to guests | PASS | 0.6536 ms |
| subscription calculation uses billable tables regardless of occupancy | PASS | 0.6671 ms |
| tax and service are integer amounts snapshotted per session | PASS | 0.7946 ms |
| menu changes, payments and sessions produce audit entries | PASS | 0.4949 ms |
| English is the fallback, language parsing is bounded and RTL language is supported | PASS | 1.8165 ms |
| Arabic plural rules and interpolation preserve parameter text | PASS | 1.6503 ms |
| every catalog interpolation matches its source; currency keeps exact two decimals | PASS | 59.5597 ms |
| all literal UI translation keys and server validation errors have Arabic translations | PASS | 17.9054 ms |
| bilingual names, descriptions, modifiers and category names preserve Arabic Unicode | PASS | 25.1218 ms |
| real local D1 batches isolate tenants, retry CAS conflicts and roll back failed writes | PASS | 4837.8939 ms |
| generated schema and Drizzle declarations match committed artifacts | PASS | 5.737 ms |
| migration preserves Unicode, retired fields, ids, raw app_state and financial history | PASS | 96.3603 ms |
| migration resumes identically; changed source and target tampering fail closed | PASS | 65.7911 ms |
| resumable SQL works twice without replacing data and rejects conflicting rows | PASS | 32.2592 ms |
| invalid relationships and duplicate tokens stop migration without repairing source | PASS | 26.191 ms |
| historical sold item snapshots survive even when the live menu definition no longer exists | PASS | 23.1216 ms |
| existing ACTIVE/CLOSED lifecycle conversion is deterministic and leaves original JSON intact | PASS | 24.6973 ms |
| unverified or incompatible staging database cannot serve traffic or bootstrap sample data | PASS | 21.7523 ms |
| SQL constraints prevent cross-tenant references, duplicate occupancy and invalid money | PASS | 24.1675 ms |
| staff and guest read contracts match existing domain views; staff RBAC is unchanged | PASS | 51.5759 ms |
| simultaneous actions in separate restaurants preserve both changes without platform reads/writes | PASS | 39.9046 ms |
| same-tenant concurrent updates retry with fresh state and persist both independent actions | PASS | 32.8628 ms |
| concurrent session opens and duplicate orders/payments obey occupancy and idempotency | PASS | 60.4252 ms |
| concurrent order edit/kitchen transition and bill/order races respect versions and final totals | PASS | 78.8969 ms |
| batch error rolls back revision, domain writes, audit and payment together | PASS | 25.3102 ms |
| invitations bind to one stable user under concurrency | PASS | 31.5655 ms |
| platform creation/update use normalized tables and preserve membership visibility | PASS | 28.1487 ms |
| normalized repository preserves settings, menu edits, staff roles, requests, printing and released bill history | PASS | 146.5263 ms |
| offline CLI retains source bytes, verifies D1 export and emits approval-only activation | PASS | 1924.8531 ms |
| hostname-scoped normalized reads and commands isolate staff, guests and platform ownership | PASS | 35.4411 ms |
| database uniquely claims concurrent slugs atomically and rejects reserved/invalid SQL slugs | PASS | 17.668 ms |
| normalized design drafts and publication persist per tenant with authorization and optimistic concurrency | PASS | 39.432 ms |
| a slow network never overlaps polls; interval starts after completion | PASS | 5.368 ms |
| mutation refresh invalidates an older response and coalesces repeated refresh requests | PASS | 1.5594 ms |
| a stopped tenant context cannot apply its response even if the transport ignores abort | PASS | 0.913 ms |
| retries back off exponentially, honor Retry-After, and reconnect immediately | PASS | 3.937 ms |
| inactive/offline polling pauses, aborts its request, and refreshes on return | PASS | 1.0143 ms |
| authentication and permanent table-link failures stop retries until an explicit refresh/reconnect | PASS | 0.6854 ms |
| hanging requests time out and abort before a retry starts | PASS | 0.9694 ms |
| new orders are detected by ID despite equal counts, status changes, historical pages and tenant switches | PASS | 0.4372 ms |
| a healthy visible hour produces 1,801 polls; a fully hidden hour produces no extra requests | PASS | 123.2882 ms |
| Retry-After accepts seconds and HTTP dates without negative delays | PASS | 0.8619 ms |
| draft save, publish and revert are independent, versioned and audited without changing operational state | PASS | 30.7131 ms |
| stale saves, stale publishes and empty reverts are rejected atomically | PASS | 2.1646 ms |
| all restaurant permissions and tenant-scoped platform ownership cannot change designs or legacy logo settings | PASS | 2.0089 ms |
| drafts, previous versions and audit metadata are absent from public and restaurant staff projections | PASS | 4.392 ms |
| strict configuration rejects executable content, unknown fields/options, unsafe assets, huge values and inaccessible colors | PASS | 2.4266 ms |
| missing or unavailable custom implementations and malformed published settings use a safe independent fallback | PASS | 1.9299 ms |
| design UI and validation messages have Arabic translations | PASS | 5.1937 ms |
| password derivations bound per-isolate memory and shed excess concurrent login work | PASS | 847.118 ms |
| streamed JSON is byte bounded and rejects malformed JSON, UTF-8, content types and prototype-shaped input | PASS | 57.1115 ms |
| guest token, capability and nested order inputs are bounded before repository work | PASS | 1.7122 ms |
| abuse limits hash IP/table keys, reject denied traffic and fail closed for missing/broken production bindings | PASS | 10.7589 ms |
| structured logs and error headers exclude URL, credentials, private fields and exception contents | PASS | 2.4955 ms |
| health monitoring emits generic alerts with no secrets; failed delivery is safely logged | PASS | 3.3363 ms |
| guest projections exclude private legacy fields; token rotation revokes the old table link and capability | PASS | 5.4918 ms |
| idempotent session opens survive later finalization, and payment key reuse cannot change amount or method | PASS | 2.1605 ms |
| OPEN -> BILL_REQUESTED -> OPEN -> FINALIZED -> TABLE_AVAILABLE preserves the permanent table token | PASS | 20.4922 ms |
| bill request immediately blocks both new orders and edits; request resolution and payment do not reopen ordering | PASS | 1.7565 ms |
| draft printing never finalizes; final printing requires explicit finalization and snapshots stay stable | PASS | 2.5302 ms |
| new session can replace an unpaid finalized session without losing orders, balances or kitchen work | PASS | 1.9594 ms |
| duplicate opens are blocked in OPEN/BILL_REQUESTED, closure requires explicit finalization even for empty bills | PASS | 1.0609 ms |
| authorization, missing sessions and cross-tenant guesses cannot bypass lifecycle guards | PASS | 0.9646 ms |
| stale finalization and reopening versions reject competing commits in either order | PASS | 1.7576 ms |
| identical finalization retries are idempotent; stale totals and unrelated revisions are rejected | PASS | 0.9384 ms |
| order idempotency remains safe across bill request/finalization without creating another order | PASS | 0.7471 ms |
| legacy ACTIVE/CLOSED records upgrade without changing permanent identifiers, history or delegated permissions | PASS | 1.3213 ms |
| final pricing snapshots remain private from kitchen/session readers without billing permission | PASS | 0.698 ms |
| three guests split the same line and preserve every tax/service piastre | PASS | 4.2598 ms |
| partial plan includes unassigned amounts, empty guests cost zero | PASS | 0.4954 ms |
| actual discount and signed rounding adjustments reconcile without negative shares | PASS | 0.9554 ms |
| group quantity limits, changes, removal, malformed selections and input immutability | PASS | 1.7818 ms |
| zero-priced and empty orders do not divide by zero or drop fixed charges | PASS | 0.6488 ms |
| large integer snapshots preserve fractional-cent proportions without per-piastre loops | PASS | 0.4613 ms |
| inconsistent, missing or unsafe bill snapshots are rejected | PASS | 0.9684 ms |
| restaurant session charges and modifier snapshots are reused; recorded payments do not alter shares | PASS | 29.2179 ms |
| many partial plans reconcile each component, including discounts and rounding | PASS | 50.418 ms |
| apex, www, admin and tenant hosts use exact label boundaries and normalized case | PASS | 2.8622 ms |
| local and staging roots are explicit; longest configured root wins | PASS | 0.9073 ms |
| reserved, noncanonical, malformed and overlong slugs cannot be registered | PASS | 14.1219 ms |
| legacy slugs are stable across rename and ordering; ambiguous state fails closed | PASS | 0.8976 ms |
| tenant projections reject foreign IDs, tokens, platform actions and foreign object IDs | PASS | 5.9187 ms |
| safe unknown-tenant response does not echo input or expose tenant information | PASS | 49.2169 ms |
| legacy: bootstrap returns operational state with exact bill totals; unchanged polls use the metadata fast path | PASS | 79.0261 ms |
| legacy: history pages retain all previous bills and old pending orders never age out | PASS | 171.4677 ms |
| legacy: tenant changes are isolated, guessed IDs and unauthorized platform snapshots are rejected | PASS | 9.4812 ms |
| legacy: guest reads only the current session, preserve bill snapshots and revoke previous capabilities | PASS | 44.1684 ms |
| legacy: feedback and resolved requests are paged on demand; permission changes invalidate cached access | PASS | 35.3062 ms |
| normalized: bootstrap returns operational state with exact bill totals; unchanged polls use the metadata fast path | PASS | 225.818 ms |
| normalized: history pages retain all previous bills and old pending orders never age out | PASS | 217.1327 ms |
| normalized: tenant changes are isolated, guessed IDs and unauthorized platform snapshots are rejected | PASS | 28.6834 ms |
| normalized: guest reads only the current session, preserve bill snapshots and revoke previous capabilities | PASS | 104.8812 ms |
| normalized: feedback and resolved requests are paged on demand; permission changes invalidate cached access | PASS | 49.7445 ms |

### normalized-worker

| Actual test name | Status | Wall duration |
| --- | --- | --- |
| built Vinext API defaults to the existing legacy database with no normalized schema | PASS | 774.1047 ms |
| built Vinext API supports normalized lifecycle, concurrency, validation and old-capability revocation | PASS | 2790.0878 ms |

### auth-worker

| Actual test name | Status | Wall duration |
| --- | --- | --- |
| built Worker independently authenticates without Sites headers and protects tenant commands, CSRF and logout | PASS | 1640.42 ms |
| built Worker explicitly provisions and activates Super Admin with encrypted MFA; no public user claims ownership | PASS | 1698.471 ms |
| built independent Worker never bootstraps platform state from the first signed-in public account | PASS | 1351.953 ms |
| independent authentication and normalized D1 work together without mutating the retained JSON source | PASS | 3158.3669 ms |

### tenant-worker

| Actual test name | Status | Wall duration |
| --- | --- | --- |
| built Worker legacy: hosts, public menus, guest lifecycle, dashboards, isolation and verified authentication | PASS | 1964.605 ms |
| built Worker normalized: hosts, public menus, guest lifecycle, dashboards, isolation and verified authentication | PASS | 5304.9438 ms |

### production-worker

| Actual test name | Status | Wall duration |
| --- | --- | --- |
| production health, security headers, authentication rejection and concurrent orders use the installed Vinext runtime | PASS | 4195.2118 ms |
| native rate-limit binding returns 429/Retry-After and no order is created after denial | PASS | 1722.5528 ms |
| uninitialized D1 and missing production bindings fail closed without leaking schema or query values | PASS | 783.4917 ms |

### updates-worker

| Actual test name | Status | Wall duration |
| --- | --- | --- |
| legacy built Worker: conditional snapshots, bounded history, independent tenant revisions and retained pending orders | PASS | 1127.0036 ms |
| normalized built Worker: conditional snapshots, bounded history, independent tenant revisions and retained pending orders | PASS | 11011.3687 ms |

### two-restaurants

| Actual test name | Status | Wall duration |
| --- | --- | --- |
| strict staging: two independent restaurants authenticate, order, bill and revoke sessions without Sites | PASS | 5380.7216 ms |

## Verified synchronization outcome

Local audit commit 986ea4c7a9235d12234dfc1e104983b367b6b082 was created after
a per-command author-identity correction. CLI push was BLOCKED by unavailable
HTTPS credentials/TTY. Connected GitHub upload then succeeded as
fdc4410d968c2469f0971ac8ed7dc12cb97d90a2 on codex/project-audit-2026-11-17.
Public Git fetch and exact tree/file comparison passed: both trees are
f5556ca0a94327bd6bc478f413c717576fcdb550. No force update, main overwrite or
production deployment occurred. See [the receipt](SYNCHRONIZATION.md) for file
inventory and finalization details.
