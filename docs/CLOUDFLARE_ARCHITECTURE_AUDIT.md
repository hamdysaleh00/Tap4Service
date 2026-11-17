# Tab2Serve mandatory Cloudflare architecture audit

Audit date: 17 November 2026, Africa/Cairo. Scope: the local working tree based
on commit `dc16595384a1bfe1baa5f63bd4096ac8a3bdf52f`, including pre-existing
uncommitted changes. This is a source/configuration audit with local runtime
verification; it does not certify the state of a Cloudflare account or live site.

**Verdict: the frontend, APIs and normalized database are compatible with
Cloudflare Workers and D1 in local tests. Tab2Serve is NOT yet ready to operate
entirely on the approved Cloudflare infrastructure in production.** Registrar,
account/resource identities, DNS/TLS, schema/data activation, email selection,
hosted acceptance and operational recovery requirements remain unresolved.

No deployment, production-data migration, live infrastructure change, resource
purchase or email delivery was performed. This audit changed documentation only;
verification regenerated ignored local builds, logs and synthetic test databases.

## Approved architecture

| Responsibility | Mandatory target | Audit result |
| --- | --- | --- |
| Domain registration | Cloudflare Registrar | Not established by source files; operator must verify registration or complete an authorized registration/transfer. Cloudflare DNS alone does not satisfy this requirement. |
| Authoritative DNS | Cloudflare DNS | Templates and runbook prepared; zone ownership, delegation and actual records unverified. |
| Frontend and backend | Cloudflare Workers, including Workers Static Assets | Builds and runs locally; no alternative hosting provider is required. |
| Primary database | Cloudflare D1 | SQLite-compatible schema, prepared queries and atomic batches pass local D1 tests. Separate staging/production databases required. |
| HTTPS | Cloudflare-managed certificates | First-level production names fit Universal SSL; nested staging names require additional managed certificate coverage or another owned staging zone. |
| Restaurant routing | Restaurant-specific Cloudflare subdomains | Wildcard Worker Routes plus server-enforced tenant scope implemented and locally tested. |
| Source control | GitHub | Local `origin` has host `github.com`; remote branch protection, synchronization and release automation were not inspected. |
| Business email | To be determined separately | No mailbox provider selected by this audit. Existing transactional-mail code calls Resend; that is an unresolved provider dependency, not an approval. |

Hostinger, Vercel, Netlify and other hosting providers are outside the approved
architecture and require explicit approval. The retained Sites development and
legacy-auth workflow is not the standalone production operating procedure.
Repository hostnames are **`tap2serve.com`**, while the requested product name is
Tab2Serve. Confirm ownership and the intended spelling before provisioning;
changing the canonical domain requires coordinated routing/config/auth/QR tests.

## Required compatibility checks

| Check | Findings and evidence | Remaining requirement |
| --- | --- | --- |
| 1. Frontend/backend Workers compatibility | `vite.config.ts` uses Vinext, Cloudflare's Vite plugin and the custom `worker/index.ts`. React pages/API handlers compile to `dist/server/index.js` with ES-module chunks and `dist/client` assets. Request-time bindings use `cloudflare:workers`; AsyncLocalStorage and crypto use `nodejs_compat`. Local built-Worker suites pass. | Pin and validate this beta framework through hosted browser acceptance and measured resource limits. Do not deploy an ordinary Next.js Node server. |
| 2. D1 schema/queries | `db/staged/0001_normalized.sql`, `0002_auth.sql`, `0003_polling_indexes.sql`; SQLite JSON functions, constraints, tenant indexes and composite foreign keys. Runtime uses prepared statements and `DB.batch()`. Revision guard failures roll back the complete mutation; retry tests preserve order/payment idempotency. | Apply only the reviewed schema to the correct environment; validate real-data reconstruction and query/resource limits. |
| 3. Migrations/bindings/code changes | Production requires normalized model v3, independent auth, DB, ASSETS and both native rate-limit bindings. Existing legacy JSON storage/auth remain available for old workflows, but strict production rejects them. | Complete explicit migration and identity activation. Older normalized schemas need an upgrade migration; `CREATE TABLE IF NOT EXISTS` cannot upgrade them. No application code was changed by this audit. |
| 4. Wildcard/TLS/isolation | Exact hostname boundaries, reserved labels, unknown-slug rejection, tenant-ID enforcement, active membership/permissions, foreign token denials and tenant-scoped relations pass locally. Admin scope is separate. | Verify actual wildcard DNS/routes/certificates, overlapping routes, public guest access and two-restaurant isolation on hosted staging. |
| 5. Auth/sessions/updates/APIs/assets | D1 password/session auth, Super Admin TOTP, CSRF/origin checks, hashed session/action tokens, current-session guest capabilities, API input limits and explicit static-asset delivery pass built-runtime tests. Polling uses ETags, 304 responses, backoff and reconnect refresh. | Test email, mobile browsers, hydration/CSP, QR/NFC and printers; benchmark polling and KDF under representative hosted load. |
| 6. Wrangler/deployment | Separate example configs package successfully with dry-run. ES-module discovery, ASSETS, DB, native limiters, cron, strict vars, no workers.dev/previews, private application logs and provisional CPU budget are present. | Replace placeholder IDs, add reviewed account identity and secrets, review exact routes/namespaces and measure CPU before publishing. |
| 7. Operating procedure | Ordered procedure below and command-level [deployment guide](CLOUDFLARE_DEPLOYMENT.md); migration, authentication, acceptance and backup runbooks linked there. | Registrar steps below supplement the prior guide; future remote operations remain outside this audit. |
| 8. Blockers/solutions | Release-gate table below distinguishes unprovisioned configuration, migration work and hosted verification. | Resolve every applicable gate before claiming production readiness. |

### Runtime qualifications

The pinned candidate is Vinext `1.0.0-beta.5`, Vite `8.0.13`, Cloudflare Vite
plugin `1.37.1`, Wrangler `4.92.0`, compatibility date `2026-05-15` and
`nodejs_compat`. Node `>=24.12.0` is a **build/offline tooling** requirement;
the deployed request runtime is workerd. Backup/migration helpers use local
`node:sqlite`/filesystem APIs and are not a deployed database or Worker service.
Cloudflare documents Vinext as beta and recommends compatibility review before
production adoption. The installed scanner supports both used Next import
families and all five detected libraries; its 92% summary includes one CommonJS
finding solely in ignored `.sites-runtime/npm/package` tooling, outside the
application import graph. Build/runtime tests provide stronger evidence for the
features actually used. [Cloudflare Next.js/Vinext guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)

The normalized adapter loads an entire restaurant history for mutations and some
initial reads. Indexed/paged update polling improves read traffic, but does not
make mutation cost independent of historical growth. Commands cap atomic batches
at 800 statements and retry revision conflicts eight times; capacity failures
must be handled, not split into partially committed financial mutations. The
legacy 1.8-million-character JSON guard is not a UTF-8 byte guarantee for D1's
2 MB row limit. Strict production requires normalized storage. Validate payload,
statement, parameter, query, memory and per-database limits against realistic
Arabic/history data. D1 supports transactional batches and limits bound parameters
to 100 per statement. [D1 batch semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

Session cookies are host-only `__Host-t2s_session`, Secure, HttpOnly and
SameSite=Lax, with server-enforced exact origin, eight-hour absolute and
30-minute idle expiry. Staff sign in separately on restaurant/admin origins;
there is no cross-subdomain SSO requirement implemented. Rate-limit and MFA
secrets are required; production readiness does **not** check mail credentials
or actual delivery. A 200 `/readyz` therefore cannot certify invitation/recovery
availability. Auth cleanup runs through a five-minute cron. Password hashing
uses supported `node:crypto` scrypt with at most two derivations per isolate;
hosted CPU/memory measurements are still required. [Workers crypto support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)

Updates are approximately two-second polling, not WebSockets/SSE or an instant
push guarantee. There is no push-server hosting blocker. If push becomes a
product requirement, design a tenant-authorized Cloudflare implementation and
test it separately. Current static files pass GET/HEAD, missing-file and metadata
denial tests via ASSETS after tenant checks. All responses currently receive
`private, no-store`, including chunks; that is a performance opportunity for
review, not a cross-tenant cache shortcut. New public asset paths must be tested
through the custom entry. [Worker-first assets](https://developers.cloudflare.com/workers/static-assets/binding/)

## Remaining release gates and solutions

| Gate | Required resolution / evidence |
| --- | --- |
| Registrar compliance and canonical domain | Confirm the actual domain is registered with Cloudflare Registrar in the intended account. If elsewhere, check transfer eligibility and complete an authorized transfer; if a new domain is needed, register through Cloudflare. Record renewal/ownership status. An unsupported TLD, transfer lock or inability to transfer blocks full architectural compliance. Do not silently substitute another registrar. |
| Real Cloudflare resources | Verify account, zone, Workers Paid status, distinct staging/production DB IDs, and existing data. Replace all-zero IDs in operator-owned config copies; keep examples non-deployable. Audit limiter namespace collisions. No account/plan/resource state was established in this audit. |
| DNS and TLS | Verify proxied apex/wildcard records and Worker Routes. Production uses `tap2serve.com/*` and `*.tap2serve.com/*`; preserve more-specific staging routes and exclusions for unrelated hosts. `*.tap2serve.com` certificates do not cover `olive.staging.tap2serve.com` or `admin.staging.tap2serve.com`. Use Cloudflare-managed deeper coverage or an owned staging zone with suitable Universal SSL. |
| Model/schema/data | For a new installation, prepare explicit empty-owner source; for existing data, freeze all writers and export the authoritative source. Rehearse normalized conversion, row/value/hash reconstruction, foreign keys and financial totals on a clone. Activate only verified model v3. Author a reviewed schema upgrade if an older normalized database exists. |
| Authentication and email | Provision origin-specific accounts with preserved IDs, separate secrets and Super Admin MFA/recovery. Select transactional email separately from business mailboxes. Either explicitly select the existing Resend integration or replace `sendEmail` in `lib/auth-server.ts` with the selected service and verify delivery/failure/recovery. Resend is not necessary for Workers/D1 hosting, but the current code depends on it for self-service onboarding/recovery. |
| External asset dependency | Demo menu photos use Unsplash. For a literal all-Cloudflare asset requirement, replace them with licensed restaurant assets delivered through Workers Static Assets and verify the serving paths. Additional storage such as R2 is optional and would need a reviewed binding/workflow; there is no implemented upload manager. |
| Hosted functional and load evidence | Complete [two-restaurant acceptance](STAGING_ACCEPTANCE.md), cross-tenant negatives, mobile scanning, hydration/CSP and physical printing. Measure KDF, peak orders, polling behind shared NAT, full-history mutation growth and paid-plan limits; tune the provisional 1,000 ms CPU cap and traffic limits from evidence. |
| Recovery and monitoring | Configure external HTTPS readiness probes, cron/alert delivery, retention, usage alerts and encrypted backups. Perform a timed restore with credential invalidation and verify recovery objectives. Local restore tests do not prove hosted backup operation. |
| Reproducible GitHub release | Commit/review the tested working tree, confirm synchronization and branch/release protection, archive exact build/config/lockfile hashes and previous compatible version. No `.github` workflow is present; manual release is possible. Any future automation must have environment-specific credentials and protected production promotion. |

Cloudflare requires an active zone and proxied DNS for Routes; more-specific
routes take precedence. Workers Custom Domains require exact host matching and
do not provide wildcard matching, which explains the wildcard Routes templates.
Unknown hosts still fail closed in the application. Local HTTPS simulation does
not prove a certificate handshake. [Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/),
[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[Universal SSL coverage](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/)

## Exact operating sequence after the audit

These steps describe future operator work. They do not authorize live actions.
Use [the deployment guide](CLOUDFLARE_DEPLOYMENT.md) for complete commands,
per-environment filenames, activation ordering and rollback procedures.

1. **Establish registrar compliance first.** Verify domain spelling, account
   ownership, current registrar, expiration, TLD support and transfer locks.
   For transfer, follow Cloudflare's eligibility checklist, preserve the complete
   zone and mail records, coordinate DNSSEC/DS changes, establish an active
   Cloudflare DNS zone, unlock at the old registrar, obtain its authorization
   code privately, initiate the approved transfer and verify completion in
   Cloudflare Registrar. Registration/transfer/payment/nameserver changes are
   outside this audit. If ineligible, record the blocker and wait for resolution.
   [Cloudflare transfer procedure](https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/)
2. **Preserve and verify the source.** Use Node 24.12+, `npm.cmd ci` on Windows,
   then `node scripts/cloudflare-verify.mjs`. Review all results, not only build
   success. Run the pinned `node node_modules/vinext/dist/cli.js check`; review
   any findings against the deployed graph. Keep a reviewed GitHub release.
3. **Prepare configuration.** Copy both `config/wrangler.*.example.jsonc` files
   to ignored `*.local.jsonc` files. Review account ID, distinct DB identities,
   routes, namespace IDs, assets/chunk paths and compatibility pins. Keep
   `TAP2SERVE_PRODUCTION=true`, `TAP2SERVE_STORAGE=normalized`,
   `TAP2SERVE_AUTH=independent`; never enable local-development/HTTP bypasses.
4. **Provision only under separate authorization.** Create/verify Workers Paid
   resources and separate D1 databases; configure DB, ASSETS,
   PUBLIC_READ_LIMITER and GUEST_WRITE_LIMITER. Set per-environment
   AUTH_RATE_LIMIT_SECRET, AUTH_MFA_KEY and selected-mail configuration securely.
   Keep MFA/backup keys escrowed; simple MFA-key replacement breaks decryption.
5. **Prepare and verify staging data.** Follow deployment-guide section 7:
   `prepare-auth.mjs`, `normalized-migration.mjs prepare/verify`, staged migrations
   0001/0002/0003, source import, exported-row verification, then reviewed model
   activation, auth import and auth-ready activation. Use `--new` only for a
   confirmed empty workspace. A Worker deployment does not apply D1 migrations.
6. **Establish staging DNS/TLS, then deploy staging only when authorized.**
   Preserve mail and unrelated hosts; verify deep certificates before tests.
   Dry-run the reviewed local config using the pinned Wrangler and `--dry-run`.
   Publish only after the staging release is authorized. Do not deploy the
   generated `dist/server/wrangler.json`, which contains development placeholders.
7. **Run hosted acceptance and operational drills.** Activate the owner/MFA,
   create two restaurants with separate managers, verify all APIs and isolation,
   delivery/recovery, guest access, browser assets, updates and real devices.
   Confirm `/healthz`, `/readyz`, cron, independent external probes, alerts,
   backups/restore, capacity and resource budgets.
8. **Prepare production and stop at the release decision.** Repeat preparation
   with production IDs/origins/secrets and current source. Freeze/drain all old
   writers for existing-data cutover; maintenance mode alone does not stop every
   writer. Record hashes, D1 bookmark/export, previous Worker version and exact
   DNS/route/binding changes. Obtain authorization for the concrete production
   release before migration/activation/deployment. After release, verify health,
   tenant separation and bill totals while monitoring errors and usage.
9. **Operate with tested recovery.** Monitor errors, latency, D1 reads/writes,
   storage, limiter denials and auth/email failures. Schedule encrypted exports
   and retention/restore drills. Worker rollback does not undo schema/data/DNS;
   after new writes use compatible code rollback or repair forward. Never return
   to stale legacy data. Use [the recovery runbook](PRODUCTION_READINESS.md).

## Verification performed for this audit

Fresh execution on Node `v26.13.1`: all 11 steps in
`node scripts/cloudflare-verify.mjs` passed after rerunning the two packaging
steps with `--packaging-only`. Initial dry-runs failed on a Windows sandbox
parent-directory read; the authorized local-only retry passed. No command used
remote D1 or performed an upload/deployment. The final record is
[results.json](../outputs/cloudflare-verification/results.json).

| Verification | Result |
| --- | --- |
| TypeScript | Pass |
| Unit/domain/security/schema/local-D1/backup tests | 140 passed, 0 failed |
| Vinext production build | Pass |
| Built normalized/auth/tenant/production/updates/two-restaurant integrations | 14 passed, 0 failed |
| Staging and production Wrangler upload dry-runs | Both pass; placeholders are not real resource validation |
| Pinned Vinext scanner | Exit 0; 11 supported, 0 partial, one local npm-tooling finding, as explained above |

Logs are in ignored `outputs/cloudflare-verification/`; archive them with the
reviewed release if durable evidence is needed. No interactive browser, live
account, registrar, public DNS/TLS, hosted D1, email or production load test was
performed. Existing report statements about live service behavior are not
independently established by this local audit.

**Final readiness decision: conditionally compatible with the Cloudflare-only
target, ready for a separately authorized staging rehearsal, not ready for
production operation.** The architecture does not require an alternative hosting
provider. Resolve registrar compliance, real resource/configuration identities,
TLS, verified schema/data/auth activation, email/asset dependencies, hosted
acceptance and operational recovery before declaring the target fully achieved.
