# Independent authentication — staged, not deployed

The independent implementation is present and tested locally. Live authentication has **not** been replaced. `TAP2SERVE_AUTH` remains unset, retaining the existing identity provider. An explicitly approved release must set `TAP2SERVE_AUTH=independent`; invalid values fail closed. Independent mode never trusts Sites identity headers, the local Sites cookie, Access JWTs, request-supplied user IDs, or client-supplied roles.

The hostname routing changes in this workspace remain in place. Authentication uses the same registered hostname/restaurant resolver. Sessions and activation/reset tokens are bound to their exact origin. A staff member signs in separately on each restaurant/admin hostname; there is no shared parent-domain cookie or implicit cross-tenant SSO.

## What changed

- Invitation-only staff accounts: no public registration or first-user administrator route.
- Stable identity IDs retained for existing members; source owner plus an explicitly provisioned Super Admin role is required for platform administration. Tenant roles continue to use the existing server-side memberships and permissions.
- Passwords use individually salted scrypt (`N=16384,r=8,p=5`, 32-byte output, versioned hash format). The parameter choice is one of [OWASP's published memory/parallelization alternatives](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Inputs support Unicode, require at least 15 characters on creation/change, and are capped at 1024 UTF-8 bytes without trimming or truncation.
- Super Admin activation requires TOTP enrollment. Every Super Admin login verifies an authenticator code. TOTP seeds use AES-256-GCM encryption with user-ID associated data and an external encryption secret; accepted counters are guarded atomically against replay. There is no email-only bypass for a lost authenticator.
- Random 256-bit opaque sessions are stored only as SHA-256 digests in D1. Login always creates a fresh token and revokes the browser's old token. Cookies are `__Host-t2s_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, with no `Domain`. Sessions have an eight-hour absolute lifetime and a thirty-minute idle timeout, with touches batched to at most once every five minutes per active session.
- Logout revokes the current server-side session. Password changes/resets revoke every session and outstanding action token. Disabling a login revokes all its sessions. Account version/active state is checked on each authenticated request. Membership/permission checks remain authoritative on every domain command.
- Protected staff writes require an exact registered Origin and a session-derived CSRF header. Staff permission changes, platform provisioning/subscriptions, invitations and account disable also require a login within the previous five minutes. Login/activation/recovery reject missing/foreign Origin and cross-site Fetch Metadata. Guest capability-based ordering remains anonymous and retains its existing protections.
- Rate limits use atomic D1 counters keyed by HMAC-pseudonymized email and trusted Cloudflare client IP: login 10/account and 30/IP per 15 minutes; recovery 3/account and 15/IP; invitations 20/actor and 60/IP; activation/info and password changes are bounded separately. Expired buckets do not impose permanent lockout. Apply edge abuse limits as well; application counters cannot prevent network-level denial of service.
- Password recovery responds generically. The production Worker schedules account lookup/email in `ExecutionContext.waitUntil`, keeping account existence/provider latency outside the response path. Unknown-account password checks perform the same scrypt operation as known accounts. Authentication events contain no passwords, raw session/action tokens, MFA seeds or mail-provider payloads.
- Activation/reset links have a one-hour lifetime, are stored as hashes, and are single-use under concurrency. Links place the token in the URL **fragment**, not the query string; the activation client removes it from the address bar and retains it only in memory. The holder must provide a new password, and an existing or newly enrolled authenticator code when required.
- New staff activation and recovery email delivery uses the server-side Resend API with configured credentials. No messages were sent during implementation or tests. Missing/failed delivery invalidates the newly issued token; provider responses are not returned to clients.

Cloudflare supports the required [Node crypto APIs in Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) with `nodejs_compat`. The built Worker integration tests exercise scrypt, AES-GCM, TOTP and D1 directly in Miniflare at this repository's compatibility date; no WebCrypto PBKDF2 iteration-limit workaround or custom password KDF was introduced.

## Tables and source

`db/auth-schema.ts` exports the Drizzle definitions. `db/staged/0002_auth.sql` is additive and outside the automatic migration journal:

| Table | Purpose |
| --- | --- |
| `auth_config` | Explicit readiness and auth schema version; never created by public traffic. |
| `auth_accounts` | Stable user ID, unique canonical email, display name, password hash, active/explicit Super Admin flags, credential version, verified-email timestamp and encrypted MFA state. |
| `auth_sessions` | Token digest, user/version/origin, absolute/idle/fresh-authentication timestamps. |
| `auth_action_tokens` | Hashed activation/reset tokens, origin, expiry, account version, single-use state and encrypted enrollment seed. |
| `auth_rate_buckets` | Fixed-window attempt counters with expiry indexes. |
| `auth_guards` | Transient CHECK assertions that make credential/token/MFA changes atomic in a D1 batch. |
| `auth_events` | Security audit metadata without credentials. |

Both legacy JSON and normalized storage adapters work with independent authentication. Independent requests cannot initialize a missing platform, including in local development. `platformOwner` is retained for compatibility but is insufficient by itself: independent accounts must also carry the server-loaded Super Admin role. A role flag alone is insufficient if the stable ID does not match the configured platform owner.

## Configuration — operator secrets, not source files

Do not set these in a tracked file, paste values into tickets, or supply passwords on command lines:

- `TAP2SERVE_AUTH=independent`: explicit cutover setting; leave unset until approval.
- `AUTH_RATE_LIMIT_SECRET`: at least 32 cryptographically random characters, configured as a Worker secret. A separate secret from all other uses.
- `AUTH_MFA_KEY`: 32 cryptographically random bytes encoded as base64, configured as a Worker secret. Back it up in the approved secret manager. Losing it prevents decrypting enrolled authenticators.
- `AUTH_MAIL_API_KEY`: Resend server credential, configured as a Worker secret.
- `AUTH_MAIL_FROM`: verified sending-domain address approved in the mail provider. Verify SPF/DKIM/DMARC and actual delivery on staging.
- Existing trusted routing roots and registered restaurant slugs define permitted origins. HTTPS is mandatory. Local HTTP requires **both** `AUTH_ALLOW_LOCAL_HTTP=true` and `TAP2SERVE_LOCAL_DEV=true`, and only loopback hosts qualify. Cookies still retain their Secure/host-only attributes. Prefer local HTTPS for browser acceptance.

Restrict the staging/production Worker CPU and concurrency budget appropriately. The selected KDF was tested in Workers, but benchmark it on the intended Cloudflare plan; an unrestricted public login endpoint on the free CPU budget is not an approved production configuration. Bound request bodies and rate limits run before password hashing.

## Explicit provisioning and identity migration

1. Back up the existing D1 database and record the deployed version, bindings, source revision/hash and rollback owner. Follow the [database migration runbook](D1_MIGRATION.md) if storage is also changing. Use separate disposable staging databases. Freeze writes and drain requests for a final identity migration snapshot; do not reuse a stale rehearsal export.
2. Export the original `app_state/main` row as UTF-8 JSON. Review the actual platform owner and every existing stable staff ID/email. If two legacy IDs use the same email, or an ID has conflicting emails, resolve the mapping explicitly before cutover; the preparation tool refuses ambiguity. Do not silently rebind an active identity by email.
3. Prepare a non-secret mapping file, for example:

   ```json
   {
     "storage": "legacy",
     "accounts": [
       {
         "userId": "EXACT_EXISTING_PLATFORM_OWNER_ID",
         "email": "verified-owner@example.com",
         "name": "Workspace owner",
         "superAdmin": true,
         "origin": "https://admin.tap2serve.com"
       }
     ]
   }
   ```

   List existing staff identities explicitly with `superAdmin:false` and their reviewed restaurant origin as appropriate. There must be exactly one initial Super Admin matching the source owner. Existing bound IDs are preserved. Additional unbound staff are activated later through Team & permissions and Account security. For a brand-new installation, first prepare an explicitly reviewed empty source state with a chosen owner ID and no restaurants; neither a public request nor this tool chooses that owner.
4. Run offline:

   ```sh
   node scripts/prepare-auth.mjs outputs/source.json reviewed-accounts.json outputs/private-auth-rehearsal-001
   ```

   It creates a new directory, copies the source unchanged, and generates `auth-schema.sql`, `auth-import.sql`, `auth-ready.sql`, `review.json` and **private** initial activation links. It does not connect to D1, execute SQL, switch a flag, assign a password, or deploy anything. Tokens are not printed. Files request mode 0600 and the directory 0700; Windows operators must also verify restrictive NTFS ACLs, because POSIX mode bits do not establish Windows ACL policy. Keep these artifacts encrypted and outside source control, including backups. Links expire after one hour.
5. In a **fresh staging auth store**, apply the reviewed schema/import using an explicit staging database ID/config. Use Wrangler's remote bulk-file transaction path or a single D1 batch; do not execute partial statements against a live auth store. Import refuses an existing auth configuration and checks the source owner/revision (or normalized source hash/readiness). On an interrupted/failed rehearsal, discard that disposable target and create a fresh one. Original platform data is never updated by the auth importer.
6. Review `auth_accounts` IDs/emails/roles and `auth_config.ready=0`, verify `PRAGMA foreign_key_check` and `PRAGMA quick_check`, and confirm the original application snapshot and membership counts. `quick_check` is the supported D1 check; full SQLite `integrity_check` is used only in offline SQLite tooling. Configure staging secrets and mail.
7. Approve applying `auth-ready.sql` to **staging only**, set independent mode on the isolated staging Worker, and deliver each private initial activation link only to its verified recipient through an approved private channel. Do not post links in public logs, screenshots or this conversation. Existing staff choose their own passwords; the Super Admin enrolls an authenticator. Verify account/role mapping, guest flows and bilingual application behavior. New login/account form copy is currently English.
8. Verify that spoofed Sites/Access headers and anonymous first-user initialization fail; ordinary users cannot use admin routes; restaurant A cannot read/mutate restaurant B; tenant-origin sessions cannot be replayed on another origin; disabled memberships and accounts lose access; reset links are one-use; login throttles apply; provider failures remain generic. Confirm invitation/reset delivery with real staging recipients.

Source compatibility: newly activated invitations verify control of the email address before `bindUser` may bind an unbound membership. Bound legacy IDs are never reassigned by a public request. The preparation tool grants only the reviewed initial Super Admin role; there is no HTTP role-grant endpoint or self-upgrade field.

For a completely new installation, use `node scripts/prepare-auth.mjs --new reviewed-accounts.json NEW-private-output-directory`. The mapping must still explicitly name exactly one Super Admin with a stable user ID and reviewed email/origin. This prepares an empty platform source, with no sample restaurants. For legacy storage it also emits a **manual** `new-workspace.sql` that refuses an existing `main` row. For normalized storage, first feed the generated source to the normalized migration tool and verify/approve that staging database before applying auth artifacts. No source, database or production configuration is replaced by the preparation command.

## Cutover and rollback — separate approval required

No live changes are authorized by this implementation. Before release: complete the staging checklist, actual data/mapping reconciliation, backup restore rehearsal, browser acceptance, KDF/load/edge abuse tests, mail verification and secret-management review. Preserve the existing identity provider/configuration for recovery. Obtain explicit approval to register/apply the staged auth migration, deploy the Worker and enable independent mode. Run the final source/revision/hash checks under a maintenance gate covering all old/new Worker versions; then enroll initial administrators before reopening staff access. Do not change the guest hosting audience automatically.

An upstream Sites owner/private access gate is separate from application authentication. For full runtime independence, the approved production ingress must expose the Worker/authentication routes without forcing ChatGPT sign-in first, either on the reviewed Cloudflare Worker routes or through an explicitly approved hosting access-policy change. Setting the application flag alone does not change that outer gate. No hosting audience, DNS, route or Access policy was modified here.

The default provider compatibility bridge remains so that the current live identity path is unchanged before approval. In independent mode it is never a fallback: missing configuration, unready schema, invalid sessions and failed authentication remain failures.

Before any independent accounts are used, rollback can retain the additive tables and restore the prior Worker/provider setting under maintenance. After invitations have bound new user IDs or new staff have been added, do **not** blindly switch providers: back up both auth and application data, freeze/drain traffic and reconcile each new independent ID with a verified prior-provider identity. Otherwise existing memberships can become inaccessible or be bound incorrectly. Do not delete auth tables, overwrite the old snapshot or discard new orders/payments to achieve rollback. Prefer repairing forward if identities have diverged.

Password reset preserves an enrolled authenticator; email possession alone cannot remove Super Admin MFA. Lost authenticators or lost encryption keys require the verified account owner and an authorized database/secret operator to execute a reviewed break-glass procedure under maintenance: back up the affected rows, revoke sessions/action tokens, increment the account version, invalidate credentials/MFA only for that exact ID, create a new short-lived activation token with a securely delivered private link, and retain the Super Admin role/owner mapping. Record the operator decision in the security audit. No public bypass or automatic MFA reset is included. Authenticator backup/recovery-code UX is not implemented; establish and rehearse this offline recovery process before production approval.

## Validation and operating limits

Local verification on 16 November 2026: **100 tests passed**, plus **4 authentication Worker**, **2 normalized-storage Worker**, and **2 hostname-routing Worker** integration tests. Typecheck, lint of the new authentication modules and the Vinext build passed. No production database, identity provider, mail delivery, hosting policy or deployment was changed. These results do not replace the production-data and operational acceptance gates below.

- `npm test`: password/KDF/TOTP vectors, encrypted seeds, cookie/hash behavior, session expiry/origin/revocation, rate/CSRF checks, permission and cross-tenant denial, MFA races, token/reset races, explicit provisioning, plus the existing app/database/routing tests.
- `npm run build` then `npm run test:auth-worker`: real built Vinext Worker with isolated Miniflare D1, including spoofed identity headers, credential/CSRF-protected tenant commands, cross-origin replay, MFA enrollment/login, explicit admin actions, default bootstrap denial, and independent authentication with normalized storage while the original JSON remains unchanged.
- Run typecheck and lint changed auth files. `npm run test:normalized-worker` separately verifies database compatibility.

Remaining operational work: actual production identity export/reconciliation, approved mail delivery and DNS, secret provisioning/backup and key-rotation procedure, real browser acceptance, Cloudflare plan/load/CPU measurements, edge bot/IP controls, maintenance/deployment approval and a verified offline MFA recovery runbook. Existing two-second polling and complete-tenant history reads retain the database runbook's scaling limits. A `scheduled` Worker handler removes expired sessions/action tokens/rate buckets in bounded batches of 1000 per table when independent mode is enabled. Configure its cron only after operational approval; no schedule is added automatically. Security audit events and all historical platform data are retained; an audit retention policy remains an operator decision. Account revocation applies at subsequent server authentication checks; drain in-flight requests for an immediate administrative cutover.
