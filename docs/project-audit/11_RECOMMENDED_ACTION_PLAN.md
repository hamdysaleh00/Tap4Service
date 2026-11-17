# Recommended action plan

This plan is not implemented by the audit. Complexity is a relative engineering
estimate (S=bounded change, M=several coordinated modules, L=cross-system work),
not an approved cost/schedule. Dependencies prevent framework, storage and UX
changes from obscuring one another's regressions.

| Order / priority | Action | Depends on | Complexity | Components | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| 1 / P0 | Hold public rollout and triage critical direct/vendored RSC plus installed Next advisories | None | M | Dependency graph, bundle, release policy | Every critical entry has a supported patch or documented, reviewed reachability disposition; no unreviewed public staging exposure. |
| 2 / P0 | Upgrade compatible React/RSC/plugin/Vinext/Vite/Workers graph including vendored code | 1 | L | package/lock, framework plugin/build | Patched installed and vendored versions verified; clean applicable critical/high audit or explicit reviewed exceptions; type/build + 140 unit/14 Worker cases + HTTP suites pass, signatures verified. No blind major force-fix. |
| 3 / P1 | Apply read abuse controls consistently to HEAD and other expensive paths | 2; test can be designed earlier | S–M | worker/index.ts, limiter tests | After configured read-budget denial, equivalent HEAD returns 429 before render/D1 work; GET/HEAD health/static semantics preserved; strict missing-bindings fail closed. |
| 4 / P1 | Restore lint and reproducible browser harness/ports | 2 | M | TSX/hooks, manifest/test tooling, CI | Full lint exit 0; browser tools installed from pinned dependencies; suites run against isolated D1 with no real orders; failures visible in CI, not suppressed. |
| 5 / P1 | Complete auth localization and two-venue browser/device acceptance | 3,4 | M | auth/account/i18n, UI/CSS/QR/receipt | English/Arabic guest/staff/admin journeys, 320–1440px, keyboard/screen reader, refresh/reconnect, actual QR/NFC and 80mm printing evidence; no isolation/money defect. |
| 6 / P1 | Freeze migration design and prove actual data/identity preservation | Stable patched behavior; owner export approval | L | normalized/auth staged SQL, tooling, operator docs | Exact source bytes/IDs/counts/financial hashes preserved on hosted clone; correct model/auth schema markers; prior snapshots retained; no stale fallback. |
| 7 / P1 | Verify secrets, explicit owner/MFA, transactional email and recovery | 5,6; approved account | M | Auth/Resend, secret manager, Hostinger/Cloudflare DNS | Correct per-env keys/origins, real controlled mail delivery, logout/reset/disable revocation and rehearsed lost-MFA/key recovery; no credentials in source/logs. |
| 8 / P1 | Choose TLS/routing/account/DB identities and obtain scoped resource approval | 1–7 readiness; ownership verified | M | Zone, Worker configs, D1, registrar/mail | Distinct real staging/prod DB IDs; nested-host certificates; correct wildcard precedence/exclusions; mail unaffected; no public guest login gate. |
| 9 / P1 | Measure largest-tenant/NAT/peak capacity; narrow reads if required | 2–8 staged setup | L | normalized-store/updates/query indexes | Agreed load envelope; per-route p95/CPU/rows/memory/409/429 data; no lost/duplicate money/orders; no CPU limit errors; bounded history/command workload. |
| 10 / P1 | Rehearse hosted encrypted recovery and configure monitoring | 6–9 | M–L | Backup/scheduler/alerts/operations | Restore new DB, reconcile money/tenant counts, invalidate restored credentials, measure approved RPO/RTO; alert/cron/external probe/budget receipt evidence. |
| 11 / P1 | Create immutable release and approve cutover/rollback | All P0/P1 gates | M | Release process/config/DNS/schema | Reviewed artifact hash/commit/config/schema/bookmark/owner; compatible prior release; explicit approval before production deployment/DNS/data activation. |
| 12 / P2 | Define retention/archive, larger-backup support and migration journal guardrails | 6,9,10 | L | DB/history/backup/CI | Retention policy preserves financial evidence; large restore supported; generated-vs-live schema checks fail incompatible config; no destructive cleanup without approval. |
| 13 / P2 | CSP nonces/hashes, scoped public-asset caching and telemetry budgets | Stable UI from 4,5 | M | Headers/framework/bootstrap/assets/logs | Hydration works with tighter CSP; only public immutable assets cached; private responses remain no-store; measured cost/retention meets owner budget. |
| 14 / P2 | Incremental UI/domain typing/refactor and doc consolidation | Existing parity/UX evidence | M–L | TSX/domain/storage/docs | Smaller typed modules; unchanged contracts/money/isolation; historical docs labeled; no global lint disable. |
| 15 / P3 | Define cancellation/refund/online payment/fiscal/subscription requirements | Product/accounting scope agreement; 11 stable pilot | L | Domain/schema/providers/UI | Explicit money/audit/idempotency/webhook/reconciliation/authorization specs and tests before implementation. |
| 16 / P3 | Evaluate push/offline capabilities and database partitioning | Measured need from 9 and product demand | L | Transport/state/database architecture | Benefits justified by traces; offline conflicts/security specified; no speculative simultaneous platform rewrite. |

## Implementation sequencing rules

Patch framework/security first, keeping business behavior stable. Re-establish
browser regression evidence before large TSX refactors. Rehearse storage/auth
cutover on a frozen actual export before any production binding switch; avoid
combining a new payment integration, schema rewrite and identity migration in
one release. Preserve every existing order/payment and identity through rollback.

Source synchronization can proceed with documented findings because it does not
approve deployment. Future code fixes belong in separate reviewable commits/PRs
with updated audits. No purchase, remote migration, live DNS or production release
is authorized merely by this recommendation list.
