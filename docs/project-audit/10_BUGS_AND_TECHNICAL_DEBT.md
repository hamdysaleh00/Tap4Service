# Bugs and technical debt

Priorities reflect release risk, not claims of live compromise. Existing defects
are recorded without application fixes. Security IDs cross-reference
[the security audit](07_SECURITY_AUDIT.md).

| ID / priority | Verified issue or gap | Affected source | Impact / recommended treatment |
| --- | --- | --- | --- |
| DEP-01 / P0 | Critical RSC advisory range includes installed and plugin-vendored 19.2.6 | package.json/lock; @vitejs/plugin-rsc vendor | Block public exposure; patch compatible framework/vendor graph and trace final bundle. No exploitability proof claimed. |
| DEP-02 / P1 | Other critical/high/moderate advisory entries; 25 affected packages total | Dependency graph; evidence summary | Triage runtime vs tooling/unused paths, patch/rebuild/test; do not blindly follow major/downgrade audit fixes. |
| SEC-01 / P1 | HEAD restaurant rendering bypasses GET read limiter | worker/index.ts | Confirmed resource/spend control gap; apply equivalent limiting and invert audit reproduction into a denial regression. |
| QA-01 / P1 | Repository lint fails with 10 errors, 135 warnings | design-editor, i18n, restaurant-designs/classic, tab2serve and warnings elsewhere | Fix hook-effect patterns/types/navigation deliberately; do not switch off rules globally to claim PASS. |
| QA-02 / P1 | Four UI suites cannot import Playwright | tests/*.ui.local.mjs; package manifest | Add reproducible isolated browser dependency/install/runner in a later change; currently no UI assertions pass. |
| QA-03 / P1 | No completed hydrated browser/mobile/RTL/device acceptance | Frontend and test setup | Backend/asset SSR tests do not prove cart interaction, printer layout or NFC operation. |
| DB-01 / P1 | Actual hosted storage/auth activation and preservation not verified | store adapters, staged SQL/migration tools | Do not infer a normalized cutover from files existing; use frozen actual export on hosted clone. |
| OPS-01 / P1 | Secrets/owner/MFA/mail/recovery/monitoring/backup not operationally proved | Config, auth-server, operations, backup | Real service acceptance and timed restore/key recovery needed before public traffic. |
| TLS-01 / P1 | Nested staging hosts exceed standard apex wildcard certificate scope | Staging route template | Choose/verify certificate or staging-zone plan before public staging, no automatic purchase. |
| UX-01 / P1 | Auth/account screens and API auth errors partly English-only | app/auth-form.tsx, account-tools.tsx, api/auth | Full bilingual claim is unsupported; translate and run visual RTL/auth journeys. |
| SCALE-01 / P1 before large rollout | Normalized mutations/initial/public reads reconstruct full tenant history | normalized-store.mjs load/mutate/publicRestaurant | Largest retained tenant can dominate CPU/reads; benchmark, then narrow read/write scope with parity tests. |
| SCALE-02 / P2 | Legacy global JSON state/CAS and 1.8M-character ceiling remain | lib/store.ts | Supported compatibility path, unsuitable for unbounded growth; strict hosted config must stay normalized. |
| DB-02 / P2 | Historical/audit retention/archive policy absent | Domain/audit/auth_events tables | Storage and privacy/recovery cost grows indefinitely; define policy that preserves financial obligations. |
| OPS-02 / P2 | Readiness excludes mail and enrolled-admin usability | lib/operations.mjs | Green readyz is not complete operational health; separate checks and real acceptance. |
| WEB-01 / P2 | CSP allows unsafe-inline scripts, broad HTTPS images | lib/observability.mjs/design/menu URLs | Defense-in-depth gap, no working XSS found; adopt compatible nonce/hash design and image policy. |
| PERF-01 / P2 | Public versioned assets receive no-store and invoke Worker | Worker/Vite/config/secureResponse | Higher repeated transfer/invocation overhead; optimize only clearly public immutable assets without caching guest/auth data. |
| OPS-03 / P2 | All-request logs and no implemented budget cap | Wrangler examples/observability | Review sampling/retention and new December pricing; CPU limit is not a dollar cap. |
| TOOL-01 / P2 | Legacy Drizzle journal vs staged normalized/auth migrations; generated config placeholder | drizzle/, db/staged, vite/hosting config | Operator confusion/incompatible IF NOT EXISTS upgrades possible; enforce exact approved config/schema in CI. |
| CODE-01 / P2 | Large compressed TSX/domain/store modules, any types and many warnings | app/tab2serve.tsx, app/i18n.tsx and modules | Harder review/testing/accessibility maintenance; refactor incrementally after security/behavior tests stabilize. |
| DOC-01 / P2 | Older Alpha docs contradict newer local calculator/security/update features | README/ALPHA_RELEASE/auth and deployment docs | Keep historical assessments dated; designate this audit/current feature inventory as authoritative for inspected source. |
| OPS-04 / P2 | Restore helper memory/128 MiB SQL cap, no reverse migration after writes | lib/backup.mjs/migration tools | Define supported backup size and alternate tested restore path; repair forward or reconcile new recovery DB. |
| PRODUCT-01 / P3 or scope decision | No cancellation/void/refund, payment gateway, fiscal/POS/subscription collection | No command/integration present | Product gap, not an accidental working feature; specify audit/history/accounting invariants before implementation. |
| PRODUCT-02 / P3 | No offline queue or push transport | Client poller/backend | Requires scoped design if demanded; do not complicate security/migration fixes concurrently. |

## Lint failure detail

The sanitized lint evidence lists every rule/file/line. Errors include
react-hooks/set-state-in-effect in design-editor/i18n/tab2serve,
@typescript-eslint/no-explicit-any in i18n/tab2serve, and a no-html-link-for-pages
error in restaurant-designs/classic. Warnings include unused imports/variables
and image optimization suggestions; generated/vendor/tooling intent must be
considered before mechanical cleanup. No autofix was run.

## Explicitly not classified as a confirmed production bug

The ad-hoc direct-Vite audit preview had missing development assets; production
asset tests passed and browser acceptance did not complete. Its result is a test
environment limitation pending a reproducible supported preview. Installed Next
advisories are not automatically reachable Next-server vulnerabilities when
Vinext shims replace the server. Absence of hosted credentials/DNS access is an
unknown, not evidence that those systems are misconfigured. Shared-table editing
and stable stand URLs are product security choices requiring explicit acceptance.
