# Tap2Serve: Cloudflare deployment guide

Prepared 17 November 2026 for `tap2serve.com`. This guide is a local preparation
artifact. No deployment, remote database, DNS change, email, purchase or account
upgrade was performed. Commands under an **approval gate** are instructions for a
future operator, not permission to run them now.

Read [the readiness report](DEPLOYMENT_READINESS_REPORT.md) first. A green build
does not mean the hosted service is approved to accept orders.

The [mandatory architecture audit](CLOUDFLARE_ARCHITECTURE_AUDIT.md) adds the
required Cloudflare Registrar verification/transfer sequence and records the
latest local verification. Cloudflare Registrar, DNS, Workers, D1 and managed TLS
are mandatory; another hosting provider requires explicit approval. The Resend
instructions below describe the existing transactional-mail implementation, not
an approved email-provider selection. Select transactional email separately from
business mailboxes before configuring or using it.

## 1. Understand what you are deploying

React 19 App Router screens and API routes are compiled by Vinext/Vite into an
ES module Worker (`dist/server/index.js` plus JavaScript chunks) and browser
assets (`dist/client`). `worker/index.ts` handles tenant routing, security
headers, limits, health probes and scheduled auth cleanup before invoking
Vinext. There is no Node server to rent and no Cloudflare Pages deployment.

| Environment | Worker | D1 database | Address |
| --- | --- | --- | --- |
| Staging, test data only | `tap2serve-staging` | `tap2serve-staging`, unique ID | `staging.tap2serve.com`, `admin.staging.tap2serve.com`, `olive.staging.tap2serve.com`, `cedar.staging.tap2serve.com` |
| Production, real data | `tap2serve-production` | `tap2serve-production`, different unique ID | `tap2serve.com`, `admin.tap2serve.com`, `<restaurant>.tap2serve.com` |

These are proposed names, not created resources. Both environments use strict
production security. They must have different D1 IDs, limiter namespaces, runtime
secrets, mail credentials, accounts and activation links. Separate Cloudflare
accounts offer stronger administrative separation if already available.
Restaurants share one normalized D1 per environment, with tenant keys, composite
foreign keys and server authorization; they do not each receive their own D1.

Independent staff authentication uses D1 credentials, host-only cookies and
Super Admin TOTP. Resend is used for invitations/password recovery. Guests scan
without a ChatGPT account. No Sites hosting gate, Sites service binding or Access
identity assertion is needed. Existing Sites compatibility code remains in the
bundle but is bypassed by `TAP2SERVE_AUTH=independent`; strict mode fails closed if
that configuration is absent. `.openai/hosting.json` is retained for the existing
development workflow and is not your standalone deployment configuration.

## 2. Verify locally, without touching Cloudflare

Install Node 24.12+ and npm. Open PowerShell in this repository. Use `npm.cmd`
on Windows if PowerShell blocks `npm.ps1`; no execution-policy change is needed.

```powershell
node --version
npm.cmd ci
node scripts/cloudflare-verify.mjs
```

`npm ci` installs the lockfile versions; it does not upgrade them. The verification
script runs typechecking, tests, build, local workerd/D1 integrations and **dry-run**
upload packaging for both example configs. Results/logs are saved under ignored
`outputs/cloudflare-verification/`. It never uses `--remote`, creates databases,
uploads versions, changes DNS or deploys. The build emits a Sites placeholder DB
config; **do not deploy `dist/server/wrangler.json` directly**.

On this restricted Windows workstation esbuild's packaging probe needs read
access to parent directories that the sandbox denies. Run the dry-run in an
approved local terminal if that specific access error occurs; do not disable
checks or replace `--dry-run` with a deployment. `node scripts/cloudflare-verify.mjs
--packaging-only` reruns just both local packaging checks and merges their results
into the previous report. It still cannot publish anything.

Pinned candidate: Vinext `1.0.0-beta.5`, Vite `8.0.13`, Cloudflare Vite plugin
`1.37.1`, Wrangler `4.92.0`; compatibility date `2026-05-15`, `nodejs_compat`.
Keep these pins through staging. Do not run a current Vinext init/deploy wizard:
new upstream versions may select a different integration and can deploy.

## 3. Prepare operator configuration

```powershell
Copy-Item config/wrangler.staging.example.jsonc config/wrangler.staging.local.jsonc
Copy-Item config/wrangler.production.example.jsonc config/wrangler.production.local.jsonc
```

The local copies are Git-ignored. Leave the example files as templates. Insert
your reviewed `account_id` into each local config. Once databases exist, replace
each all-zero `database_id` with its actual ID. Confirm names and IDs directly in
the dashboard; never derive one from a name. Staging and production IDs must
differ. The rate-limit namespace numbers are proposals: check account-wide use
before approval and change them if already allocated to another application.

The configs use `no_bundle`, additional ES modules and explicit assets to upload
the existing Vite output without rebundling it. Paths resolve relative to
`config/`. They include both native limiters, private logs, a five-minute cron and
a provisional 1,000 ms CPU ceiling. Benchmark password hashing and peak traffic
on paid staging before accepting that ceiling. It is a per-invocation limit,
not a monthly spending cap. Logs currently sample all requests; see usage costs.

Keep all of these in each environment:

| Worker variable | Value |
| --- | --- |
| `TAP2SERVE_PRODUCTION` | `true` (also on staging) |
| `TAP2SERVE_STORAGE` | `normalized` |
| `TAP2SERVE_AUTH` | `independent` |
| `TAP2SERVE_BASE_DOMAINS` | Staging: `staging.tap2serve.com`; production: omit |
| `AUTH_MAIL_FROM` | Approved verified sender, set before mail tests |
| `TAP2SERVE_MAINTENANCE` | Omit normally; `true` blocks POST writes except logout |

Never set `TAP2SERVE_LOCAL_DEV` or `AUTH_ALLOW_LOCAL_HTTP` in either hosted
environment. Leave legacy bridge hosts and Access issuer/audience unset for a
new standalone installation. Custom customer domains are not implemented by this
hostname scheme. Do not broaden `TAP2SERVE_BASE_DOMAINS` to unowned domains.

## 4. Approval gate: account, plan and empty databases

**STOP: obtain explicit approval for the identified account/plan, any paid
subscription, database creation and staging publication before proceeding.**
Workers Paid is an account subscription, separate from a paid DNS-zone plan.
No zone upgrade is automatically needed for first-level production hostnames.

The following are future operator commands, using the repository's installed
Wrangler. `--import ./scripts/sites-env.mjs` keeps tool logs/state checkout-local.
Interactive `login` is optional if your existing CI supplies a scoped API token.

```powershell
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js login
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js whoami
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 create tap2serve-staging
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 create tap2serve-production
```

Copy each returned D1 ID to the corresponding local config. Do not delete or
rename an existing production database to free these names. If either name
already exists, verify ownership/data and stop to review the migration path.
Use account-restricted Workers Scripts Edit and D1 Edit permissions; the final
route operator also needs Workers Routes Edit on this zone (and zone read as
required). Use a separate, temporary DNS Edit credential for DNS work. Never
grant account-wide Global API Key access to CI. Verify current token permissions
in the dashboard and keep production credentials in a protected release context.

## 5. Approval gate: DNS and certificates

**STOP: DNS, nameserver, DNSSEC, certificate and mail-record changes need separate
explicit approval.** Export the current zone first, identify existing websites,
mail hosts and Worker routes, and preserve MX/TXT/SPF/DKIM/DMARC records.

1. Confirm ownership of `tap2serve.com`, its Cloudflare account and active zone.
   If nameservers are elsewhere, review the complete zone import and registrar
   DNSSEC/DS transition before changing delegation. A bad DS transition breaks
   all resolution. Nothing here changes registrar settings.
2. This template uses **Worker Routes** because arbitrary wildcard tenants are
   required. Custom Domains are simpler for exact Worker origins but do not
   support a wildcard hostname. Do not set `custom_domain:true` on `*` patterns.
3. After the corresponding Worker is ready, the reviewed Worker-only DNS proposal
   is below. `192.0.2.1` is a documentation-only non-origin address: use this only
   for hosts whose complete request path is handled by the Worker. Never replace
   a real origin record blindly. With Routes, removing the Worker route leaves no
   working application origin; restore the previous reviewed DNS/route together.

| Type | Name within zone | Target | Proxy |
| --- | --- | --- | --- |
| A | `@` | `192.0.2.1` | Proxied |
| A | `*` | `192.0.2.1` | Proxied |
| A | `staging` | `192.0.2.1` | Proxied |
| A | `*.staging` | `192.0.2.1` | Proxied |

Explicit `www`/`admin` records may be added if needed; existing explicit records
override wildcard DNS synthesis. Production routes are `tap2serve.com/*` and
`*.tap2serve.com/*`. Staging's more specific routes are `staging.tap2serve.com/*`
and `*.staging.tap2serve.com/*` and must remain attached to the staging Worker
after production wildcard activation. Audit all overlapping routes: the most
specific wins. Unknown/reserved tenant slugs fail closed in the application.
The production wildcard can otherwise capture unrelated web subdomains such as
mail/support; inventory them and approve explicit route exclusions or exact
tenant routes before activation. Do not redirect every subdomain to the apex.

4. In SSL/TLS, confirm an **Active** certificate for the apex and
   `*.tap2serve.com`. Universal SSL on a full setup zone covers these first-level
   names. It **does not cover** `admin.staging.tap2serve.com` or the staging
   restaurants. Before staging, provide already-authorized certificate coverage
   for `*.staging.tap2serve.com` (and `staging.tap2serve.com`), or use another
   owned staging zone with its own Universal SSL and update roots/routes/tests.
   Advanced Certificate Manager is an optional paid solution: do not buy it
   without approval. Workers Paid alone does not grant that certificate.
5. Use Full (strict), TLS 1.2 minimum, TLS 1.3 and HTTPS-only URLs. Full (strict)
   controls any origin connection; this app normally terminates at the Worker.
   Do not use Flexible. Approve Always Use HTTPS at the appropriate zone/host
   scope, testing its effect on other services. The app rejects HTTP in strict
   mode and emits HSTS on HTTPS; defer HSTS preload/includeSubDomains until every
   affected subdomain has valid TLS. Check CAA permits the selected CA.
6. Review any Access policies, redirects, cache rules and WAF challenges. Guests
   must reach menus/ordering without ChatGPT or an interactive Access login.
   Bypass edge caching for personalized HTML, `/api/*`, table URLs and auth;
   respect application `no-store`. Never apply Cache Everything to guest data.

See [Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/),
[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[wildcard DNS](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/)
and [Universal SSL limits](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/).

## 6. Configure secrets securely

Use your existing password manager to generate separate staging/production
values. `AUTH_RATE_LIMIT_SECRET` needs at least 32 random characters;
`AUTH_MFA_KEY` needs exactly 32 random bytes encoded in standard base64 (44
characters ending in `=`). Keep the MFA key backed up: it decrypts TOTP seeds.
Do not rotate it by simply replacing the secret; the current app has no automatic
reencryption/keyring migration. Retain old keys for encrypted backups, and rehearse
an approved key migration or account reenrollment first. Rate-secret rotation
resets rate-bucket continuity; perform it under controlled abuse monitoring.

`AUTH_MAIL_API_KEY` is a restricted Resend sending key. Verify sender-domain
SPF/DKIM and an approved DMARC policy, then set `AUTH_MAIL_FROM`. Use a separate
test sender/key and controlled inboxes on staging. Check actual activation/reset
delivery, expiry and failure handling. Do not send real customer mail in tests.
Keep optional `OPS_ALERT_WEBHOOK_URL`/`OPS_ALERT_TOKEN` secret too.

**After deployment authorization**, set Worker secrets in the Cloudflare
dashboard or via interactive prompts, one environment at a time:

```powershell
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js secret put AUTH_RATE_LIMIT_SECRET --config config/wrangler.staging.local.jsonc
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js secret put AUTH_MFA_KEY --config config/wrangler.staging.local.jsonc
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js secret put AUTH_MAIL_API_KEY --config config/wrangler.staging.local.jsonc
```

Secret writes can create/update a Worker deployment; they belong inside the
approved release window. Use the production config only for separately approved
production operations. Never put secrets in tracked vars, command arguments,
screenshots, client code, `VITE_*`/`NEXT_PUBLIC_*` variables or chat. Local secrets
belong in ignored `.dev.vars` files with restrictive NTFS ACLs; prefer prompts
and the secret manager. Do not persist actual secrets in the example file.
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` are operator/CI credentials, never
Worker bindings. `TAP2SERVE_BACKUP_KEY` is a separate offline encryption key,
not `AUTH_MFA_KEY` and not a Worker variable. See
[Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## 7. Prepare schema and data on staging

**STOP: remote schema/data/activation changes need approval for the exact D1 ID.**
There are two paths. Never seed sample data into a live database.

**New empty installation:** create a private `outputs/staging-accounts.json`
containing a deliberately chosen stable owner ID, the verified operator email,
`superAdmin:true` and exact activation origin `https://admin.staging.tap2serve.com`:

```json
{"storage":"normalized","accounts":[{"userId":"CHOSEN-STABLE-OWNER-ID","email":"VERIFIED-OPERATOR-EMAIL","name":"Platform owner","superAdmin":true,"origin":"https://admin.staging.tap2serve.com"}]}
```

Do not use the placeholder email literally. `outputs/` is ignored but not
encrypted; restrict its NTFS ACLs and encrypt it. Run these offline commands
immediately before the approved rehearsal (activation links last one hour):

```powershell
node scripts/prepare-auth.mjs --new outputs/staging-accounts.json outputs/staging-auth-001
node scripts/normalized-migration.mjs prepare outputs/staging-auth-001/source.json outputs/staging-model-001
node scripts/normalized-migration.mjs verify outputs/staging-auth-001/source.json outputs/staging-model-001/candidate.sqlite
```

This creates an empty platform, no restaurants or demo orders. The owner ID must
be explicitly reviewed; there is no public first-user bootstrap.

**Existing installation:** obtain an approved full SQL export and unchanged
`app_state/main` JSON export under a write freeze. Preserve all identities,
orders, payments, token URLs and unknown legacy fields. Follow
[D1_MIGRATION.md](D1_MIGRATION.md) and [AUTHENTICATION.md](AUTHENTICATION.md).
Never use `--new` for that source. Existing normalized v1/v2 tables need a reviewed
upgrade on a clone: `CREATE TABLE IF NOT EXISTS` is not an upgrade to model v3.
If independent auth already exists, transfer/verify all `users`/`auth_*` rows and
the matching MFA key; do not generate replacement credentials.

For a **confirmed empty staging database**, apply schema migrations in order:

```powershell
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 migrations list DB --remote --config config/wrangler.staging.local.jsonc
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote --config config/wrangler.staging.local.jsonc
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --remote --config config/wrangler.staging.local.jsonc --file outputs/staging-model-001/import.sql
```

`migrations_dir` is explicitly `db/staged`: 0001 normalized v3, 0002 auth, 0003
additive polling indexes. Do not use the legacy `drizzle/` journal for this path.
Deploying the Worker does not apply D1 migrations or mark the database ready.
For a previously initialized database, review its schema/journal before any
migrations apply; IF NOT EXISTS can hide an incompatible older definition.

While the target has no writers, export all verification SELECT results:

```powershell
$verificationSql = Get-Content outputs/staging-model-001/verification-queries.sql -Raw -Encoding UTF8
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --remote --config config/wrangler.staging.local.jsonc --command $verificationSql --json | Out-File outputs/staging-rows.json -Encoding utf8
node scripts/normalized-migration.mjs verify-export outputs/staging-auth-001/source.json outputs/staging-rows.json outputs/staging-verification-001
```

Stop on a nonzero exit, unexpected JSON envelope, row/hash mismatch, foreign-key
failure or quick_check failure. `--command` is intentional: remote bulk `--file`
returns an import summary, not SELECT result rows. Under an explicit reviewed
staging activation decision, apply these files in order with `d1 execute DB
--remote --config config/wrangler.staging.local.jsonc --file FILE`:

1. `outputs/staging-verification-001/activation.sql` (verified model marker).
2. `outputs/staging-auth-001/auth-import.sql` (checks source and empty auth).
3. Check account IDs/roles, `PRAGMA foreign_key_check`, `PRAGMA quick_check`, and
   untouched source/financial counts. Then `outputs/staging-auth-001/auth-ready.sql`.

Use the transactional remote bulk import path for auth-import; on an interrupted
auth rehearsal create a fresh disposable target rather than repair it blindly.
Never manually bypass a readiness guard. Initial private activation links stay
in `private-activation-links.json`; deliver only to verified recipients through
an approved private channel. Regenerate artifacts on a fresh target if expired.
Production account origins/links must be generated separately for production.

## 8. Approval gate: deploy staging and prove the workflows

First inspect a dry-run of the **reviewed local config**:

```powershell
npm.cmd run build
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js deploy --dry-run --config config/wrangler.staging.local.jsonc --outdir outputs/staging-upload-review
```

Verify the Worker name, account ID, staging D1 ID, chunk list, assets, strict
variables, no Sites connector binding, both limiters and intended routes. After
explicit authorization for staging deployment and its routes/cron, the operator
may run the same deploy command **without** `--dry-run`/`--outdir`. This publishes
and attaches routes; do not run it now. Keep workers.dev and previews disabled.
Coordinate secrets, schema and TLS before allowing test traffic.

Activate the explicit owner, enroll TOTP, sign in on the staging admin origin,
and create **Olive** (`olive`) and **Cedar** (`cedar`) through Platform admin.
Use separate manager identities/mailboxes and memberships, different menus,
table tokens, prices and tax/service test settings. Complete every case in
[STAGING_ACCEPTANCE.md](STAGING_ACCEPTANCE.md). Record evidence and resolve failures.

Check `/healthz` and `/readyz` on the staging platform origin: both should return
200, with readiness 503 under deliberately missing configuration on a disposable
test instance. An external HTTPS probe is needed to detect DNS/TLS/Worker failure;
cron alone cannot. Confirm approved alerts arrive and the cron performs cleanup.

## 9. Prepare the production release, then stop for approval

Repeat verification, migration/backup rehearsal and provisioning with production
config/IDs/origins and a fresh approved source. For an existing system, freeze
all writers including the old Worker, drain in-flight requests and capture a
fresh final source/hash/bookmark. The application maintenance POST gate alone
does not stop old deployments, external writers or background cleanup; pause or
isolate these for a consistent snapshot. There is no dual-write/catch-up service.

Record the tested commit, lockfile, Node/tool versions, immutable build archive
and SHA-256, exact config, DB/model version, secret-manager references, D1
bookmark, prior Worker version, route/DNS diff, release/rollback owner and
maintenance window. The workspace initially contains uncommitted work: commit
and archive only the reviewed final state through your normal release process.
Use the same verified build for promotion, rerunning staging if code changes.

Produce a production dry-run with the production local config. Confirm it cannot
bind to staging. Do not enable production CI auto-deploy, push to a Sites
auto-publish source, run a framework deploy wizard or apply production migrations
as a shortcut. **STOP for explicit approval of the concrete release, target D1,
schema activation, routes/DNS and traffic cutover.** After approval, the operator
deploys with the production config, checks health/auth/isolated tenant smoke
tests, then opens traffic and monitors errors, bill totals and resource usage.

## 10. Migration rollback and recovery

Worker rollback does not roll back D1 data, schema, DNS, routes, secrets or cron.
Before any change record a Time Travel bookmark and encrypted SQL export, and
restore that export to a **new isolated D1** with the matching Worker. Paid D1
provides up to 30 days of Time Travel on its production backend; verify the
actual database. See [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

| Failure point | Approved recovery action |
| --- | --- |
| Before first new write | Keep maintenance; revert to recorded compatible Worker/binding and verify the preserved source revision/hash before reopening. |
| After new orders/payments | Freeze/drain; export current data. Prefer a compatible code rollback against the same normalized DB or repair forward. Never switch to a stale legacy DB. |
| Bad additive schema | Keep data; repair forward with reviewed SQL. No automatic down migrations exist. Do not drop new columns/tables to make old code work. |
| Corruption/disaster | Restore an encrypted export to a new isolated DB, verify counts/hashes/financial balances, revoke restored auth/reset sessions, rotate active guest capabilities, then approve a binding switch. |
| Time Travel restore | Requires incident approval: it overwrites in place and discards all later writes. Reconcile orders/payments first and invalidate resurrected credentials before traffic. |

Read [the backup runbook](PRODUCTION_READINESS.md#backup-and-restore-runbook) for
`ops:backup seal`, `rehearse`, `prepare-recovery` and `unseal`. A fresh export is
private data; encrypt it and preserve its separately escrowed key. The helper
has a 128 MiB SQL cap; use a separately tested workflow for larger exports.
Rehearse restoration and credential invalidation monthly. Example planning
targets are RPO <= 5 minutes and RTO <= 60 minutes, subject to a timed hosted
drill and owner approval; neither is demonstrated or guaranteed here.

For an approved code rollback, use the dashboard's recorded version or
`wrangler rollback APPROVED_VERSION_ID --config config/wrangler.production.local.jsonc`.
Check schema compatibility first, restore routing/cron separately if needed and
retain current secrets. A return to Sites auth after identities diverge needs
explicit identity reconciliation; a storage rollback after new normalized
writes needs a reverse migration that is not implemented. A rollback must never
silently lose an order, payment, staff identity or new restaurant.
