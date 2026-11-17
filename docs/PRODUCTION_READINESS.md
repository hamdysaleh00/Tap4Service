# Tap2Serve production security and reliability

This release candidate was prepared and tested locally. **Nothing has been
deployed, no hosted D1 data has been read or changed, and no live DNS, alert,
schedule or backup policy has been configured.** This is a conditional readiness
assessment, not a claim that the hosted service is ready to accept public orders.

## Audit findings and changes

| Area | Finding and result |
| --- | --- |
| Tenant isolation | Hostname scope, active membership and command permissions are enforced server-side. Tenant scopes remove platform ownership. Tests reject foreign restaurant IDs, table tokens, objects, guessed design/admin routes and forged identity headers. |
| Guest privacy | Added explicit menu/order/line/modifier public projections. Unknown migration fields, internal retry payloads, supplier/internal-cost data and staff notes cannot leak through guest/state/update endpoints. Draft designs, private feedback, team data, payments and audit records stay out of guest projections. Shared table orders/notes remain intentionally visible to guests at that table. |
| Abuse | Added native Workers limit bindings before database routing and per-IP/per-table checks for guest mutations. Missing/failed bindings fail closed in production. Existing atomic per-session guest-write limit, bounded feedback and deduplicated service calls remain. |
| Input handling | Command/auth JSON streams are limited by bytes before buffering. Strict media type/UTF-8, bounded nesting, forbidden prototype keys, token/capability syntax, order quantities, modifier lists and notes are checked before domain mutations. Existing server pricing and permissions remain authoritative. |
| Duplicate actions | Same order/payment identifiers replay the original result; conflicting payload/amount/method reuse returns 409. Staff session opens now carry an idempotency key, including delayed retries after closure. Finalization/closure, D1 CAS, occupancy/financial constraints and transaction rollback remain enforced. |
| Tokens | Printed table tokens have high entropy and are bearer access to a shared table, not proof of physical presence. New polling sends session capabilities in `X-Guest-Session` rather than query strings. Authorized `table.rotate_token` revokes a compromised stand URL and the active capability; reprinting is required. |
| Authentication | Production mode requires the existing independent provider, verified account/session state, MFA configuration and normalized storage. Cookies are host-only `__Host-` cookies with Secure/HttpOnly/SameSite=Lax. Origin/CSRF and recent-auth checks protect sensitive staff/platform actions. Password KDF parameters are unchanged; concurrent KDFs are capped at two per isolate to bound memory. |
| Logging | Added one structured completion event with generated request ID, fixed route name, method, status, duration and severity. It has no URL/query, headers, body, email, IP, tenant slug, tokens, exception message, SQL or stack. Automatic invocation logs are disabled in source build configuration because URLs can contain QR tokens. |
| Headers | All Worker responses, including failures/redirects/health/304s, receive no-store, no-referrer, nosniff, restrictive permissions, frame restrictions, CSP and request ID. HTTPS responses receive HSTS without prematurely asserting coverage of every subdomain. |
| Health/monitoring | `/healthz` is generic Worker liveness; `/readyz` verifies production configuration and primary D1 platform/model/auth readiness without returning details. Scheduled monitoring logs health and can send a minimal failed-readiness webhook. Cleanup failures are safely logged. |
| Recovery | Added authenticated/encrypted offline SQL backup sealing, source/schema/data checksum verification, isolated restore rehearsals and preparation of a recovery copy with restored login/reset credentials revoked and live guest capabilities rotated. Financial/table/history data are retained. |

## Runtime and production configuration

The installed candidate uses `vinext@1.0.0-beta.5`, Vite 8.0.13, Wrangler 4.92.0,
Workers compatibility date `2026-05-15`, and `nodejs_compat`. The new production
integration suite runs the **built** Worker in workerd with D1 and native rate
limit bindings, rather than testing only domain functions. It exercises:

- Binding access through `cloudflare:workers`, API handlers and response headers.
- Tenant request isolation, independent authentication rejection and guest APIs.
- Primary readiness queries, D1 batch/CAS behavior and bounded concurrent writes.
- Public rendering/private design previews and Arabic RTL through the existing
  tenant suite; cookie/CSRF/MFA/KDF behavior through the auth suite.
- Native limiter denials, missing configuration/schema and generic error bodies.

The concurrent test submits 18 distinct orders in parallel and eight duplicate
retries, then verifies exact order count/IDs and bill totals. It retries surfaced
409 conflicts with a finite budget; it never treats a failed response as an
accepted order. Separate suites cover simultaneous payments, one-table occupancy,
order-edit/kitchen races, finalization and atomic batch rollback. These local
results establish functional compatibility for the used features; they are not
a distributed edge load test or a CPU/memory/latency SLA.

`vinext check` reports one unsupported item from vendored local npm tooling
under `.sites-runtime/npm`, namely CommonJS `__dirname`/`__filename`. Those files
are outside the Worker import graph. Its other discovered application features
are supported. The build and real workerd tests pass. Vinext itself still warns
that it has compatibility gaps and is not battle-tested for every workload;
therefore pin this version and repeat build/integration/canary tests before any
framework upgrade. See [the upstream runtime assessment](https://github.com/cloudflare/vinext#readme).

`config/wrangler.production.example.jsonc` is a review template, not an applied
configuration. Preserve the existing Sites/Vinext build integration. Use an
operator-controlled Workers config to attach the already-built entrypoint,
verified D1 database, wildcard **Routes**, assets, limits and cron. No wildcard
Worker Custom Domain is assumed. See [the routing runbook](MULTI_TENANT_ROUTING.md).

Outside explicitly enabled local development, production protections are on by
default. The guard rejects traffic until normalized D1, independent auth,
rate-limit bindings and auth secrets are present. Set `TAP2SERVE_PRODUCTION=true`
explicitly in production. `false` is a fixture/staging escape hatch and is not a
production setting. `TAP2SERVE_LOCAL_DEV` and `AUTH_ALLOW_LOCAL_HTTP` must not be
enabled in production. The legacy JSON store remains usable locally, with its
existing capacity limit; it is not an approved public-production backend.

Local tooling/tests now require Node **24.12+** for the defensive SQLite backup
rehearsal API. This is separate from the Workers runtime compatibility date.
Do not enable read replication or change consistency semantics without re-running
the concurrency/authorization tests and reviewing primary-read requirements.

## Rate limits and guest presence

Start with the template's coarse 1200 requests/minute/IP and guest-write
60/minute/IP plus 60/minute/table keys, then tune from venue traffic. The coarse
IP key spans hostnames, so random restaurant labels cannot reset it. Public API
and page traffic is limited before D1 tenant lookup; guest writes are also
limited after byte-bounded parsing. The default session audit cap is 45 guest
mutations/minute and is enforced in the database transaction. Clients receive
429 with `Retry-After: 60` and must back off; never replay payments automatically.

Workers limiter counts are **approximate and local to a Cloudflare location**,
not a strict worldwide quota. They are an abuse/cost layer, not financial
correctness or authorization. Shared venue NATs can cause legitimate clients to
share an IP allowance. Tune thresholds after a staging venue load test; keep
the per-session database guard and atomic idempotency. See
[binding behavior and locality](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

A guest with a copied stand URL can obtain the current shared-table capability
while staff have the table open. That is the current product trust model. A QR
or NFC scan does not prove presence. Never publish table tokens in analytics,
monitor URLs or support logs. In an incident, an authorized recently signed-in
staff manager can invoke `table.rotate_token` for that table, then print/write
the replacement QR/NFC URL; the command revokes the previous URL and capability.
Ordinary `table.save` does not accept a client-chosen token. Closing/replacing a
session continues to revoke its capability. Legacy `session` query parameters
are still accepted for compatibility, but new clients use the header.

## Monitoring and alert activation

Application events use `event=http_request`, fixed `route`, numeric `status`,
`duration_ms`, and `request_id`. Correlate a guest/staff error using the response
`X-Request-ID`; do not ask users to paste cookies, tokens, URLs or request bodies.
Keep logs private with a short operational retention policy. Infrastructure
access logs, WAF logs, browser/network traces and vendor framework diagnostics
have separate privacy controls; disabling invocation logs does not sanitize those
systems automatically. Audit them before public rollout.

The cron handler runs readiness monitoring and bounded auth cleanup. If
`OPS_ALERT_WEBHOOK_URL` is configured as an HTTPS secret, readiness failure sends
only `{event: "tap2serve_readiness_failed", timestamp}` to that endpoint.
`OPS_ALERT_TOKEN` optionally authorizes the webhook. Redirects are not followed,
delivery is bounded to five seconds, and failures log no destination/token/body.
An alert can repeat on every five-minute failing check; no extra queue, database,
or incident platform is required. Configure/suppress alerts for planned
maintenance. This code is prepared; no notification has been sent to a real
recipient and no schedule or destination has been configured.

Use Workers Logs and existing Cloudflare metrics for request/error/CPU trends
and D1 metrics for read/write/query/storage growth. Where available, configure a
built-in Workers Issues automation for generic 5xx/error occurrences to your
chosen email/webhook recipient, after reviewing captured context for secrets.
Our caught errors emit `console.error` with the safe structured event, so do not
monitor only unhandled exceptions. See [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/),
[metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)
and [Issues automations](https://developers.cloudflare.com/workers/observability/issues/).

Initial thresholds to review with the on-call owner: readiness failure for two
consecutive checks, application 5xx above 1% with at least 20 requests over five
minutes, a sustained 429/409 increase, p95 latency above two seconds, any Worker
CPU/memory limit errors, and rising D1 storage/rows-read per request. These are
starting thresholds, not promised service levels. Configure an external HTTPS
probe of `/readyz` if an existing uptime service is available: an internal cron
cannot detect its own missing deployment, DNS failure or disabled schedule.

## Backup and restore runbook

D1 Time Travel and encrypted SQL exports serve different recovery needs. Time
Travel is automatic, with retention depending on plan/storage; confirm the actual
database's history/bookmark and restore availability rather than assuming it.
See [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
and [import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

Before a separately approved production operation, identify the exact account,
database ID, Worker release/source artifact, normalized model version, D1
bookmark, restoration owner and tested maintenance procedure. Keep the separate
backup encryption key, `AUTH_MFA_KEY` and other runtime secrets in the team's
existing secret manager with recovery access. D1 SQL alone cannot recover keys,
external images/R2 assets, DNS or Worker configuration.

Example **operator-only** capture steps (not executed here):

```sh
# After approved write freeze / maintenance and verification of the DB identity:
npx wrangler d1 time-travel info PRODUCTION_DB
npx wrangler d1 export PRODUCTION_DB --remote --output outputs/snapshot.sql
# TAP2SERVE_BACKUP_KEY is a distinct random 32-byte base64 secret, supplied via env.
npm run ops:backup -- seal --input outputs/snapshot.sql --output outputs/snapshot.t2sbackup --source-id DATABASE_ID --storage normalized
npm run ops:backup -- rehearse --input outputs/snapshot.t2sbackup --source-id DATABASE_ID --report outputs/restore-report.json
```

The local helper has no Cloudflare credentials/network code. It restores into a
fresh in-memory SQLite database with extensions, ATTACH, virtual tables and unsafe
PRAGMA operations denied. It validates integrity/foreign keys and compares schema
and every application table's count/content hash. AES-256-GCM authenticates and
encrypts the SQL, manifest, source identity and timestamp; tampering, a wrong key
or wrong database identity fails. Output files use exclusive creation so an
existing backup cannot be silently overwritten. SQL input is capped at 128 MiB
and rehearsed in memory; larger databases require a separately tested streaming
or native D1 restore workflow. Keep plaintext exports encrypted/access-controlled
and remove temporary SQL according to your retention policy. On Windows,
`mode: 0600` is not a substitute for checking NTFS permissions.

Disaster recovery rehearsal/preparation:

```sh
npm run ops:backup -- prepare-recovery --input outputs/snapshot.t2sbackup --source-id DATABASE_ID --output outputs/recovery.t2sbackup --report outputs/recovery-report.json
# Writes sensitive plaintext explicitly, only when an operator needs to import it:
npm run ops:backup -- unseal --input outputs/recovery.t2sbackup --source-id DATABASE_ID --output outputs/recovery.sql
# Approved operator imports into a NEW, isolated staging/restore D1 database:
npx wrangler d1 execute RESTORE_DB --remote --file outputs/recovery.sql
```

Before any production binding switch, verify the restored clone's ID/schema,
`PRAGMA quick_check`, `PRAGMA foreign_key_check`, tenant permissions, menu data,
bill/payment totals and active-session behavior with the matching Worker build.
`prepare-recovery` deletes restored login/reset/invitation sessions and rotates
active guest capabilities without changing printed table tokens or financial
history. This prevents the snapshot from resurrecting previously revoked bearer
credentials. Staff must sign in again and guests rescan. Keep the retained
`app_state` migration source quarantined/read-only; normalized recovery does not
rewrite it and it must not become a live fallback database.

For Time Travel, use the documented restore command with a reviewed bookmark
only during an approved incident/maintenance window. Record the pre-restore
bookmark and recovery release. A raw Time Travel restore also resurrects old
credentials: apply/rehearse the same credential invalidation before serving it.
Do not restore over the live database merely to test a backup. Define recovery
point/time objectives with the owner (for example a daily encrypted export plus
Time Travel and a monthly restore drill); the code cannot promise an RPO/RTO
without an actual scheduled export and timed hosted-clone rehearsal.

## Production-readiness checklist

Locally completed:

- [x] Tenant/API authorization and public-data projections audited and tested.
- [x] Streaming input bounds, edge binding integration and denial behavior tested.
- [x] Session/order/payment retry/race/rollback tests and concurrent orders pass.
- [x] Secret-safe application logs, headers, liveness/readiness and alert transport tested.
- [x] Encrypted backup restore/invalidation rehearsals pass for legacy and normalized data.
- [x] Installed Vinext beta production build and required workerd features tested.

Required before public production activation:

- [ ] Approve/rehearse the staged normalized and auth schemas on a disposable hosted clone; retain verified original backups. Never mark an old schema ready without migrating it.
- [ ] Provision the explicit Super Admin, verify email delivery/MFA, invited staff permissions, HTTPS host-only cookies, logout/deactivation and recovery-key access.
- [ ] Set production mode/normalized/independent auth, attach both rate limiters and approved secrets, and remove local/bypass flags. Confirm missing bindings fail closed.
- [ ] Verify wildcard Routes/DNS/TLS and guest anonymity through the actual hosting/Access audience gate. Do not put guest APIs behind an interactive staff login.
- [ ] Verify browser hydration, English/Arabic RTL/LTR, QR/NFC scans, mobile ordering, receipt printing and CSP behavior on real devices. No interactive browser QA was available in this session.
- [ ] Measure KDF/CPU/memory, D1 contention, shared-NAT rate thresholds and latency on staging at expected venue concurrency; review the CPU budget and beta-runtime canary/rollback plan.
- [ ] Activate the cron, existing monitoring/Issues alert recipient and external readiness probe; confirm test alerts are received. Review log privacy/retention and planned-maintenance suppression.
- [ ] Perform a hosted D1 restore drill with checksums, financial reconciliation and credential invalidation; record measured RPO/RTO and retention/key escrow.
- [ ] Record the release artifact, DB/model version, on-call owner and maintenance/write-freeze procedure; deploy only after separate authorization.
