# Tap2Serve deployment readiness report

For the mandatory provider policy, Cloudflare Registrar requirement and fresh
verification of this working tree, see the
[Cloudflare architecture audit](CLOUDFLARE_ARCHITECTURE_AUDIT.md).

Assessment date: 17 November 2026 (Africa/Cairo). Target: Cloudflare Workers Paid,
D1, `tap2serve.com` and restaurant subdomains.

**Decision: ready for an approved staging rehearsal; not approved for public
production traffic.** Infrastructure identities, real source-data preservation,
hosted load/TLS/mail/device tests and operational sign-off remain open. This is
an assessment of the local candidate, not a Cloudflare account audit.

No Worker was deployed, no remote D1 database was created/read/migrated, no live
DNS or nameservers changed, no production data overwritten, no email sent and no
service purchased. Deployment templates deliberately retain placeholder IDs.

## Deliverables and requirement coverage

| Requirement | Result/evidence |
| --- | --- |
| 1. Architecture and configuration | React App Router + Vinext/Vite -> ES module Worker and client assets. Custom Worker wraps routing/auth/security/cron. Normalized model v3, one D1 per environment; tenant revisions/composite foreign keys. No Node server or Pages deployment required. |
| 2. Production build | Vinext build and TypeScript pass on installed Node `v26.13.1`. Lockfile retains Vinext beta.5/Vite 8.0.13/plugin 1.37.1/Wrangler 4.92.0. Nonfatal Node loader deprecation and lucide export-optimization warnings remain. |
| 3. Worker configuration | Separate [production](../config/wrangler.production.example.jsonc) and [staging](../config/wrangler.staging.example.jsonc) examples include module rules, assets binding, nodejs_compat, strict vars, rate limiters, cron, private logs and a provisional CPU ceiling. Upload dry-runs validate packaging; account acceptance is still unverified. |
| 4. Separate D1 databases | Distinct proposed names `tap2serve-staging` and `tap2serve-production`; ID placeholders, same binding name DB within separate Workers. Creation/ID-verification steps prepared; resources were not created. |
| 5. Secrets | [Configuration inventory](../config/runtime-secrets.example.txt) and guide cover independent auth, MFA encryption, mail, alerts, offline backup key, scoped CI/operator tokens, per-environment separation and recovery/rotation limits. No real secrets generated or saved by this preparation. |
| 6. Domain and wildcard routing | Apex + wildcard Worker Routes prepared. More specific staging routes prevent production wildcard capture. Hostname/slug allowlisting fails closed; reserved labels and foreign IDs rejected. Live route conflicts have not been inspected. |
| 7. SSL and DNS | Proposed proxied records, active zone/delegation/DNSSEC checks, Full (strict), TLS and CAA/mail steps documented. Deep staging hostnames require certificate coverage beyond the apex Universal SSL wildcard. No DNS/TLS state asserted. |
| 8. Migrations and rollback | Explicit db/staged migrations directory and empty-vs-existing database paths; frozen source export, hash/row/FK verification and manual readiness activation. Code rollback separated from schema/data recovery; no destructive down migration or stale-data fallback. |
| 9. Sites-independent authentication | D1 passwords, sessions, CSRF and Super Admin TOTP work in built workerd. Strict-mode two-venue test uses no Sites headers/cookies, Access identity, connector or outbound authentication request; forged Sites identities rejected. Old compatibility code is retained but not selected in production. |
| 10. Functional checks | Tenant isolation, orders/idempotency, cash/card recording, final bill snapshots, lifecycle/capability revocation and polling checked automatically. QR library/stable origin-specific URL generation inspected; physical QR/NFC/printer checks pending. Core English/Arabic translation tests pass; auth/account screens still include English-only copy. |
| 11. Two restaurants | New strict-production staging integration covers Olive/Cedar with distinct managers, menus, tables, orders, payments, cookies and cross-tenant denials. [Hosted acceptance plan](STAGING_ACCEPTANCE.md) covers both venues and negative/device/load/recovery cases. |
| 12. Monthly usage | [Estimate and formulas](CLOUDFLARE_USAGE.md): two venues plus light staging ~13.412M requests, 67.06M CPU-ms, 402.36M D1 rows read, 7.30M rows written, 0.40 GB; about $6.76/month Workers compute+D1 under stated assumptions. Costs are not measured. |
| 13. Beginner guide | [Step-by-step guide](CLOUDFLARE_DEPLOYMENT.md) covers prerequisites, safe local checks, approval gates, account/DB creation, secrets, DNS/TLS, migrations, staging, production hold and rollback. |

## Changes made during this preparation

- Added staging configuration; completed production template names, D1 migration
  path and additional ES-module discovery.
- Added the `ASSETS` binding to Vite and both configs. A built-Worker test found
  that browser CSS/chunks returned 404 with the existing custom entry under
  `run_worker_first`. Added an explicit GET/HEAD asset path after tenant/config
  checks, retaining outer headers and refusing metadata/API fallbacks. Rendered
  login page scripts/CSS, favicon, HEAD, missing asset and hidden metadata are
  covered by the new runtime test.
- Corrected the backup D1 test's Windows `--import` argument to a file URL; the
  previously failing local restore drill passes. Backup logic/data formats are
  unchanged by that test-harness fix.
- Added a local-only verification runner, a strict two-restaurant runtime test,
  ignored operator config copies and documentation. Existing uncommitted
  application/schema/security work was preserved. Base commit is `dc16595` plus
  the reviewed working tree; it is not yet an immutable release commit.

## Verification record

The final local check, `node scripts/cloudflare-verify.mjs`, passed all 11 steps.
It records exact
exit statuses and full logs in ignored `outputs/cloudflare-verification/`:

| Check | Passed evidence |
| --- | --- |
| TypeScript | `typecheck.log`, exit 0 |
| Unit/domain/D1/security/translation/backup tests | `unit.log`, 140 passed, 0 failed |
| Vinext/Vite build | `build.log`, exit 0, Worker + browser assets emitted |
| Normalized Worker integration | `normalized-worker.log`, 2 passed |
| Independent authentication Worker integration | `auth-worker.log`, 4 passed |
| Hostname/tenant Worker integration | `tenant-worker.log`, 2 passed |
| Strict production Worker integration | `production-worker.log`, 3 passed; includes 18 simultaneous distinct orders and 8 duplicate retries |
| Update/polling Worker integration | `updates-worker.log`, 2 passed |
| Strict two-restaurant + browser asset integration | `two-restaurants.log`, 1 passed |
| Staging + production upload packaging | `staging-dry-run.log`, `production-dry-run.log`, exit 0; no deployment |

That is 140 tests plus 14 built-runtime integration cases. These are local
workerd/D1 tests; Miniflare dispatches HTTPS URLs without proving real public TLS.
Both dry-runs report 67 additional ES modules, 26 browser asset files and a
Worker upload of 1,086.09 KiB (323.11 KiB gzip). The
[machine-readable verification record](../outputs/cloudflare-verification/results.json)
contains the actual exit statuses and run timestamp.
The upload templates package the same built modules/assets; remote D1 IDs,
secrets, account permissions and DNS are not validated by `--dry-run`.

On this workstation, restricted Windows sandbox permissions prevent esbuild from
reading parent directories during Wrangler's packaging probe. The local-only
runner was allowed outside that filesystem sandbox for final packaging; no
network deployment or remote database operation was added. Earlier failures and
the assets 404 were corrected and rechecked. Consult the final `results.json`,
not an older interrupted log, when reproducing the assessment.

## Remaining release gates

1. Identify/approve the real account, Workers Paid subscription status, zone,
   staging/prod DB IDs and any existing deployment/data. Fill and review local
   configs. All-zero IDs are not deployable production identities.
2. Confirm production zone records/overlapping routes and deep staging TLS
   coverage. Inventory unrelated web subdomains captured by the wildcard;
   preserve staging's more specific routes and existing mail services.
3. Provision/escrow independent secrets and explicit owner identity. Activate
   Super Admin MFA, actual test-mail invitations/recovery, and rehearse lost-MFA
   recovery. No public bootstrap or automatic MFA-key migration exists.
4. For existing data, obtain a final frozen export and prove lossless migration
   on a separate hosted clone. Verify auth identities/keys as well as business
   records. Full SQL backup and credential-invalidating restore drill required.
5. Run both restaurants through hosted acceptance, mobile QR/NFC scans, browser
   hydration/CSP, RTL/LTR and physical printing. No interactive browser/device
   acceptance was performed in this preparation. Translate auth/account screens
   before claiming full bilingual coverage, or approve the documented scope.
6. Benchmark paid staging KDF/CPU/memory, full-tenant mutation/history growth,
   NAT traffic and peak ordering. Two-second polling is retained; D1 is a shared
   database per environment with finite storage/throughput, not unlimited scale.
7. Configure approved cron/alerts/external readiness checks, retention, budget
   notifications and timed recovery targets. Validate monitoring delivery. The
   usage estimate excludes mail, certificates, monitoring, backups and tax;
   logging pricing changes on 1 December 2026 and must be rechecked at launch.
8. Commit/archive the final tested source and build, record hashes/previous
   release/bookmark, verify rollback compatibility and obtain explicit production
   deployment + DNS + database activation approval before any cutover.

## Product limits affecting the launch claim

Card/cash entries record physical payments; there is no guest online payment
gateway, refund workflow, subscription collection or fiscal/e-invoice
integration. Split bill is a local calculation, not payment allocation. Physical
NFC uses a programmed URL, not an embedded hardware integration. Receipts use the
browser print dialog. Credentials are origin-bound: staff sign in separately on
each restaurant/admin hostname. Stand tokens are bearer URLs and do not prove
physical presence. Core interfaces are bilingual; auth/account controls and some
platform/Alpha branding remain launch polish work. These capabilities must not
be advertised beyond their verified scope.

## Approval boundary

Preparation is complete locally. **Production remains NO-GO.** The next proposed
phase is approved staging resource provisioning and hosted acceptance, after the
account/DB identity and TLS decisions above are reviewed. No paid purchase,
production deployment, live DNS change, production migration/activation,
destructive restore or data overwrite is authorized by this report.
