# Tap2Serve normalized D1 storage — staged implementation

## Status and safety boundary

The target normalized model is now version 3, adding the per-restaurant
`website_design_json` configuration column after version 2's unique restaurant
slugs. See [the design system](RESTAURANT_DESIGN_SYSTEM.md) and
[multi-tenant routing](MULTI_TENANT_ROUTING.md) for design storage, slug
backfill and earlier clone compatibility. Missing legacy slugs are assigned
deterministically on the migration copy; existing IDs and original JSON bytes
remain unchanged. Rehearse on a fresh clone; CREATE IF NOT EXISTS does not upgrade
an existing earlier-version table.

The code and tests are prepared. **Production has not been queried, migrated, switched, or deployed.** No production snapshot was provided, so preservation of actual hosted data remains to be verified against an operator export.

`TAP2SERVE_STORAGE` is unset by default and continues to use `app_state`. The normalized adapter is selected only when an operator explicitly sets it to `normalized`. It also requires exactly one `migration_runs` record with `verified=1`. An uninitialized or unverified normalized database returns 503; it never creates demo data or falls back to a potentially stale JSON store. No code copies, deletes, or replaces the original `app_state` during migration.

The additive SQL lives in `db/staged/0001_normalized.sql`, deliberately **outside** the automatic `drizzle/` migration journal. Existing tracked migrations are unchanged. Do not run `db:generate`, publish, apply SQL remotely, or change bindings as part of preparation. After approval, the release owner must decide how to register the additive migration in the hosting migration system. `db/schema.ts` describes the proposed target and retains `app_state`.

## Inspection findings

- `lib/store.ts` currently loads `app_state/main`, parses the entire platform, and replaces its payload with an eight-attempt revision CAS. CAS avoids silent lost updates but causes unrelated restaurants to contend and has a 1.8-million-character application limit.
- Both API routes previously used that platform state for every request. No other application SQL accesses were found outside the store and Drizzle binding helper.
- `lib/domain.mjs` owns validation, permissions, billing calculations, idempotency, command dispatch and guest/staff views. The new adapter calls those same functions on a tenant projection instead of reimplementing business rules.
- The model includes categories/translations, menu modifiers, staff invitations/permissions, subscription/setup/support settings, permanent stand tokens, session capabilities/lifecycle/version history, order snapshots, physical payments, service requests, private feedback, tenant audit and platform audit.
- Retired diner/allocation/payment fields can still exist. They must survive. The migration retains unrecognized fields in per-entity `extra_json` and all original source bytes in an operator-controlled backup artifact. Existing lazy ACTIVE/CLOSED lifecycle conversion runs on a copy and is the only intentional semantic upgrade.

## Database structure

| Tables | Purpose and relationships |
| --- | --- |
| `users` | Stable authenticated identity IDs. Profile/email/name remain on membership records so historical tenant values are not conflated. |
| `restaurants` | Branding, rates, currency, support status and a tenant revision. `restaurant_id=id` is constrained. |
| `memberships`, `membership_permissions` | Tenant staff, active flags, nullable user binding for invitations, ordered permissions. |
| `menus`, `menu_categories`, `menu_items`, `menu_modifiers` | One existing menu per restaurant, ordered categories, item content/visibility/prices and modifier definitions. |
| `dining_tables` | Permanent token, tenant-unique label, zone, capacity, enabled/billable flags. |
| `sessions` | Tenant/table relationship, lifecycle, capability, version, rate snapshot and all finalization/release/reopen metadata. |
| `orders`, `order_items`, `order_item_modifiers` | Session orders, tenant sequence, idempotency key, immutable captured names/prices/modifier selections and notes. |
| `bills` | Frozen subtotal/service/tax/total for finalized sessions. Open bills are derived from snapshots, avoiding competing mutable totals. |
| `payments` | Historical physical payments, session, exact integer minor units, method, actor, idempotency key. Legacy methods/fields are retained; new commands still allow only cash/card. |
| `service_requests`, `feedback` | Session/table references, request workflow, private comments/ratings and deduplication keys. |
| `subscriptions`, `restaurant_setup` | Existing tenant subscription rates/status and onboarding checklist. No invented invoicing or gateway features. |
| `audit_events`, `platform_audit` | Tenant command events and original platform events, including original actors and optional tenant audit IDs. Platform audit event JSON is an immutable historical record. |
| `platform_config`, `migration_runs`, `commit_guards` | Owner/platform metadata, source revision/hash/model version/readiness, and transient atomic CAS assertions. |

Tenant entities have composite `(restaurant_id,id)` keys and composite foreign keys, preventing guessed foreign IDs from forming cross-tenant relationships. Foreign keys restrict deletion. Membership permissions reference the tenant membership. Historical order item/modifier IDs and audit actors are snapshots rather than mandatory live-menu/user references, because historical or removed definitions and actor display names must remain valid.

Indexes cover table tokens (globally unique), table labels, memberships by user/email, parent collections, order/session lookups, kitchen status queues, session statuses, feedback/payment idempotency, request queues and recent guest audit activity. A partial unique index permits one unreleased session per table, including FINALIZED sessions that still occupy it; another permits one outstanding request per session/kind. Orders have tenant-unique numbers and session-scoped request keys. Integer amounts, quantities, versions, booleans, current workflow states and JSON envelopes are constrained. A constraint mismatch aborts migration; the tool never cleans data silently.

`position` preserves array order. `present_json` preserves the difference between absent and explicitly null optional fields. `extra_json` contains only fields outside the mapped operational schema, including retired history. The small category translation map remains JSON to preserve keys that do not correspond to current categories. These are compatibility envelopes, not a replacement platform/tenant payload.

## Reads, writes and concurrency

- Routine commands locate the tenant by the supplied restaurant ID or an indexed enabled table token. They load only that tenant, validate with the existing domain code, and calculate changed rows.
- One atomic `DB.batch()` first inserts a CHECK-protected guard asserting the loaded restaurant revision, writes only changed rows plus audit events, increments that restaurant revision and removes the guard. A stale guard aborts the entire batch. Only that conflict is retried, up to eight times, re-running business validation on fresh state.
- Independent restaurants never share a write revision. Duplicate orders/payments/feedback use both existing domain checks and SQL unique keys. Versions on orders/sessions still reject stale reviewed actions after retry.
- Reads of a tenant use one batch for a consistent projection. Membership navigation reads indexed membership summaries; the platform screen aggregates table/subscription data in SQL, without loading orders, sessions or all tenant objects.
- Uses the existing Worker `env.DB` binding, prepared statements and D1 batch API; no Node database APIs enter the Worker bundle. Offline tooling/tests use Node's SQLite separately. If read replication is added later, preserve primary reads or an appropriate Sessions API bookmark; do not substitute independent replica reads in read/modify/write flows.
- A command exceeding 800 statements fails before writing. Financial commands are never split into independently committed batches. Each statement remains below D1's 100-bound-parameter limit with this schema.

Cloudflare documents [atomic rollback for D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [current query/parameter limits](https://developers.cloudflare.com/d1/platform/limits/) and [Sessions consistency](https://developers.cloudflare.com/d1/best-practices/read-replication/). No assumptions of interactive `BEGIN` transactions in Workers are made.

## Backup and offline rehearsal

Use Node 22.13+; Node 24 is recommended for `node:sqlite`. Artifacts contain private feedback, emails and active capabilities: keep them encrypted/access-controlled, outside source control. `outputs/` is ignored in this repository. Do not paste payloads into logs or tickets.

1. Identify the exact production database ID, binding and deployed Worker version. Arrange a maintenance window and a restore rehearsal on a **separate disposable database**. Obtain approval before any deployment or production mutation.
2. Take a complete SQL export and record its checksum, timestamp, database ID and current D1 Time Travel bookmark. Example operator commands (not executed by this change):

   ```sh
   npx wrangler d1 export PRODUCTION_DB --remote --output outputs/pre-cutover.sql
   npx wrangler d1 time-travel info PRODUCTION_DB
   npx wrangler d1 execute PRODUCTION_DB --remote --command "SELECT id,revision,payload FROM app_state WHERE id='main'" --json > outputs/source.json
   ```

   Use a UTF-8-safe redirect. PowerShell 5 redirection can produce UTF-16: explicitly write UTF-8 there or run from a UTF-8 shell. Keep the unmodified payload string. Verify that the full SQL backup restores on a throwaway database and its `app_state` revision/payload match. Time Travel availability/retention depends on database backend and plan; check the account, rather than assuming retention. See [Cloudflare backup documentation](https://developers.cloudflare.com/d1/reference/time-travel/).

3. Rehearse locally from the exported row, without any Cloudflare credentials:

   ```sh
   node scripts/normalized-migration.mjs prepare outputs/source.json outputs/rehearsal-001
   node scripts/normalized-migration.mjs verify outputs/source.json outputs/rehearsal-001/candidate.sqlite
   ```

   `prepare` requires a new directory. It preserves exact input bytes in `source.json`, creates a candidate SQLite database, emits additive `schema.sql`, resumable `import.sql`, `verification-queries.sql`, and a report with source revision/SHA-256, canonical upgraded state hash and all table counts. It does not mark the candidate ready. Duplicate tokens/labels/keys, orphans, invalid values and lossy reconstruction fail. Oversized SQL records fail safely for manual review; no truncation occurs.

4. Apply the additive schema and generated import to a **new staging D1 database only**, using an explicit reviewed config/database ID. Never point the importer at production or a running normalized database. Import statements insert absent rows and assert exact values; they do not update conflicting rows. The same source can be retried after an interrupted staging import. A changed source or activated target is rejected. On any partial import failure, retain the report/source and retry the same input or create another empty staging target. Do not disable foreign keys or remove constraints to force success.
5. While staging has no writers, export the ordered results of `verification-queries.sql`:

   ```powershell
   $verificationSql = Get-Content -LiteralPath outputs/rehearsal-001/verification-queries.sql -Raw -Encoding UTF8
   npx wrangler d1 execute STAGING_DB --remote --command $verificationSql --json | Out-File -FilePath outputs/staging-rows.json -Encoding utf8
   node scripts/normalized-migration.mjs verify-export outputs/source.json outputs/staging-rows.json outputs/staging-verification-001
   ```

   Use `--command` for the verification SELECT/PRAGMA statements: Wrangler's remote `--file` path uses bulk import and returns an import summary instead of query rows. The example above is PowerShell; on a POSIX shell pass the same SQL text as one `--command` argument and save JSON as UTF-8. This checks every expected row/value, reconstructed upgraded state, foreign keys and integrity. It emits a verification report and a **manual** `activation.sql`. Nothing executes that file automatically. Verification exports are valid only while the target remains frozen. If the CLI version returns a different JSON result envelope, stop and adapt/retest the parser; do not bypass verification.
6. Following staging verification, an operator can approve applying `activation.sql` to **staging**, then run a local or isolated staging Worker with that staging binding and `TAP2SERVE_STORAGE=normalized`. Run all workflow/HTTP/browser acceptance tests there, with no production traffic.

## Remaining cutover steps — separate approval required

If independent authentication has been activated on the legacy database before storage cutover, the JSON row is no longer a complete database backup. Preserve and transfer `users` plus all `auth_*` tables, including credential hashes, encrypted MFA state, token/session versions, readiness and security audit records, under the same write freeze. Verify every transferred auth row and foreign key on staging, retain the matching MFA encryption secret in the approved secret manager, and test actual sign-in before changing the binding. The JSON normalizer intentionally does not fabricate or reconstruct authentication credentials. Its source verification must finish before adding auth-only user rows to the target. A storage-only rehearsal is insufficient for a combined cutover; the full database export remains the recovery source.

1. Resolve validation failures against the real export, size/load limits below, and staging acceptance findings. Preserve the original export even if an explicitly reviewed correction is later necessary.
2. Implement/approve a maintenance response at the routing/edge layer covering all state and command routes, guests, staff and the old Worker version. Drain in-flight requests. This change intentionally does not deploy a maintenance gate. Do not rely on a browser banner or UI lock.
3. Under the write freeze, export a **fresh final** source row and full backup, record revision/hash/bookmark, rebuild into a new empty target, repeat all verification and confirm the source revision/hash has not changed. A rehearsal snapshot becomes stale as soon as legacy writes continue. There is no dual write or online catch-up implementation.
4. Restore rehearsal, release-owner review of schema registration, target binding, Worker version and rollback plan are mandatory operational gates. Retain the original legacy D1 database unchanged; a separate normalized database is strongly preferred so rollback evidence remains intact. The new target does not need `app_state` for normalized operation.
5. Obtain explicit approval to deploy, apply the reviewed readiness marker, bind the verified target and set `TAP2SERVE_STORAGE=normalized`. This code does none of those actions. Check readiness, staff access, guest tokens/capabilities, orders, translations, bill totals/payments, histories and counts before releasing traffic.
6. Monitor 409/503/507 rates, D1 rows read/written, batch sizes, tenant load and payment reconciliation. Retain the legacy database and backups according to a reviewed retention policy; do not drop `app_state` in this migration.

## Rollback without data loss

Before the first normalized write: keep maintenance enabled, switch to the previous Worker/binding and legacy setting, verify that the retained legacy revision/hash still match the freeze, then reopen traffic. No reverse copy is needed.

After any normalized write: **do not simply flip the setting back**. That would hide new orders, payments and history. Freeze and drain traffic again; back up/export the normalized target and its readiness/revisions, preserving the legacy backup separately. Prefer rolling the Worker code back while keeping the normalized repository if compatible, or repairing forward. To return to legacy storage, create and review a reverse migration using the same normalized reconstruction mapping, reconcile all new payments/finalized bills/IDs and tenant data, build a *new* legacy database, run the old Worker against that copy in staging, and obtain approval before switching. Reverse migration tooling and an online reconciliation service are not implemented here. Never overwrite the retained production `app_state` with the old rehearsal snapshot. A whole-database Time Travel restore also removes subsequent writes and requires an explicit reviewed recovery decision.

## Tests and unresolved risks

`npm test` includes SQLite migration/constraint/concurrency tests and a real local Miniflare D1 test. The latter verifies D1 atomic rollback, same-tenant CAS retries, cross-tenant updates, duplicate session opens/orders/payments, guard cleanup and foreign keys. The existing domain/lifecycle/i18n/calculator tests remain in place. Run `npm run typecheck`, `npm run build`, and lint changed files as well.

The first normalized adapter deliberately loads a complete **single restaurant** projection to preserve every existing command/view. It eliminates full-platform routine reads/writes and writes only changed rows, but per-tenant history/polling and in-memory diff cost still grow. Before a high-volume cutover, measure the largest tenant, then add bounded session/queue/history queries and UI pagination with parity tests. Tenant-level CAS serializes actions within one busy restaurant; moving to session/aggregate revisions requires a separate concurrency design covering menu prices, permissions, session lifecycle and financial invariants. Very large category/modifier changes can exceed the batch cap and need a separately designed maintenance workflow. These limitations make this a staged migration, not an unqualified claim of unlimited scale.

Run `npm run build` followed by `npm run test:normalized-worker` for isolated built Vinext Worker HTTP tests. They verify the default legacy path against a database with no normalized schema, then normalized readiness, API lifecycle, racing session opens, capability revocation, localized errors and CSRF using disposable Miniflare D1 databases. They inject trusted identity headers directly into that isolated runtime; no application authentication bypass is added.

Additional operational gaps: no actual hosted-data verification or production backup has been performed, no public maintenance gate or online backfill/catch-up, no post-write reverse migration, no hosted multi-region/replica/load test, and no normalized browser acceptance on an isolated hosted staging deployment yet. Existing physical billing is not gateway processing or platform subscription collection. Invalid legacy data is a review item, never permission to discard records.
