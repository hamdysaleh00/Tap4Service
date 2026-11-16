# Tap2Serve subdomain routing

This is a local implementation and operator runbook. No DNS records, certificates,
Workers routes, hosted databases, purchases or deployments were changed.

## Request behavior

| Host | Behavior |
| --- | --- |
| `tap2serve.com`, `www.tap2serve.com` | Public platform website; no restaurant API access |
| `admin.tap2serve.com` | Super Admin; every API read and write requires platform ownership |
| `<slug>.tap2serve.com` | Public restaurant menu; `/?table=<permanent-token>` opens guest ordering; `/dashboard` opens the staff UI |
| Unknown, reserved or nested restaurant hostname | Generic 404 without tenant information or reflected input |

`worker/index.ts` classifies the actual request URL, looks up the slug and installs
request-local context using `AsyncLocalStorage`. It never trusts `Host`,
`X-Forwarded-Host`, `X-Tenant-ID`, query parameters or body fields to choose a
tenant. API routes also resolve their request and explicitly pass the scope to
the repository. There is no mutable global current restaurant or module-level
tenant cache. HTML, RSC and API responses use `private, no-store`; do not add a
Cloudflare Cache Everything rule that overrides these headers. The asset binding
runs the Worker first, so an unknown hostname cannot bypass the router.

Tenant reads expose only that tenant's memberships and data. Platform ownership
and summaries are removed from tenant projections, including when the caller is
the platform owner. Membership, active status and individual permissions remain
mandatory for dashboard operations. Client restaurant IDs must match the resolved
tenant; a foreign table token is looked up within the tenant and returns 404.
Nested IDs (menu item, order, table, payment, session, team member) are still
validated by the domain and composite SQL foreign keys. The admin origin accepts
only platform operations, not guest or restaurant operations.

The apex accepts legacy **page** links `/?table=...` and redirects with 307 to the
token's restaurant subdomain. The redirect retains the permanent table token,
never a supplied destination or session capability. Optional
`TAP2SERVE_LEGACY_GUEST_HOSTS=old.example.test,old2.example.test` enables the same
guest-link-only bridge for exact old hostnames. Those hosts must separately route
to this Worker. All other bridge requests return 404; they cannot provide an
alternate staff/API origin. Existing QR/NFC table tokens and session lifecycle
are unchanged. New QR/NFC links are generated on the restaurant's own origin.

## Slugs and storage

Slugs are immutable, lowercase ASCII DNS labels, 1–63 characters, with letters,
digits and internal hyphens. Internationalized `xn--` labels, dots, underscores,
whitespace and system names are rejected. `RESERVED_SLUGS` in
`lib/tenant-routing.mjs` is shared with SQL generation; it includes `admin`,
`www`, `api`, `auth`, `assets`, `staging` and other operational names. Changing a
restaurant display name does not rename its host. The Super Admin provisioning
form accepts an explicit slug. Older internal callers can omit it and receive a
name plus restaurant-ID slug.

Existing JSON records without a slug receive a deterministic name/ID-derived
slug on read, persisted by the next successful normal CAS write. An invalid or
duplicate stored slug fails closed. No existing records are silently merged,
renamed or deleted. Preview a backup's assigned slugs before rollout.

The normalized schema now has a required `restaurants.slug` column, a global
unique index, and SQL checks for syntax/reserved names. Lookup uses the index.
Concurrent claims are resolved by the database: one succeeds, the other returns
409 and its transaction rolls back. Provisioning inserts database records into
one application and does not create a deployment, route or DNS record.

**Scale activation:** the default remains `TAP2SERVE_STORAGE=legacy` to preserve
the earlier migration boundary. That compatibility store retains its 1.8-million
character limit and is unsuitable for unlimited logical tenants. Use the staged
normalized adapter for a growing service: it has no application-wide tenant
count or platform JSON payload limit, and routine operations load one tenant.
Cloudflare resource limits and per-tenant command limits still apply; capacity
planning and eventual database sharding remain operational work.

The staged normalized model is now **version 3**, including the
[per-restaurant design configuration](RESTAURANT_DESIGN_SYSTEM.md) column after
version 2's slug support. Prepare a fresh disposable
clone using [the D1 migration guide](D1_MIGRATION.md), which assigns slugs on a
copy, checks uniqueness and verifies preservation. An older version-1 normalized
database is deliberately rejected. Do not apply the new CREATE IF NOT EXISTS
schema over a version-1 database and simply mark it verified: it will not add the
column. Rehearse a reviewed schema/data upgrade or regenerate a verified clone
from the preserved JSON source before any approved cutover. The automatic
`drizzle/` migration journal and live binding remain unchanged.

## Authentication at the wildcard edge

Keep the existing independent authentication integration when
`TAP2SERVE_AUTH=independent` is configured. Its API authentication and CSRF checks
run before the same hostname-scoped repository authorization. Follow that
integration's separate account, cookie, MFA and email setup instructions.

For the fallback identity adapter, a public Worker Route cannot trust the Sites
gateway's `oai-authenticated-*` headers directly. On production/staging hosts
`getChatGPTUser` instead verifies a Cloudflare Access RS256 token supplied by
`Cf-Access-Jwt-Assertion` or the `CF_Authorization` cookie. Configure:

```text
TAP2SERVE_ACCESS_ISSUER=https://YOUR-TEAM.cloudflareaccess.com
TAP2SERVE_ACCESS_AUDIENCE=STAFF-APPLICATION-AUD,ADMIN-APPLICATION-AUD
```

Only the configured team's HTTPS JWKS endpoint is fetched, without following
redirects. Signature, algorithm, key ID, issuer, audience, expiry, issued time,
not-before, stable subject and email are checked. Missing configuration, unknown
keys, malformed tokens and verification failures produce no staff identity.
Guest browsing/ordering remains anonymous and capability scoped. No shared
application session cookie or domain-wide custom cookie is introduced here.

If using Access, protect `admin.tap2serve.com/*` and restaurant `/dashboard*`
paths with appropriate Access applications and policies. Keep public menu/table
URLs and guest API paths outside an interactive Access gate. Dashboard sign-in
provides the Access cookie; public API paths verify it in the Worker themselves.
Configure the approved application AUD values for both destinations and verify
the selected cookie behavior in staging. Worker membership checks are still
required after Access sign-in. Do not use an Access bypass policy as staff
authentication. Configure the identity provider's MFA policy for administrators.
See [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

`/login` returns to the Access-protected dashboard and `/logout` uses the
Cloudflare-managed `/cdn-cgi/access/logout` endpoint when Access is configured.
The application's token verifier validates signatures and expiry; immediate
provider revocation on otherwise public API routes requires a separately
configured edge policy or revocation mechanism. Tenant membership/account
deactivation still denies restaurant access on every request. See
[Access session management](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).

Access subject IDs differ from Sites IDs. Before switching providers, reconcile
the existing platform owner and staff memberships with verified provider IDs in
an operator-reviewed migration. Never authorize the first arbitrary signed-in
visitor as Super Admin. Public production/admin/tenant hosts cannot bootstrap
the sample workspace; a platform must already be provisioned. Raw Sites demo
headers are accepted only with explicit local development enabled on localhost.

## Cloudflare DNS, Workers Routes and TLS

The following steps are **instructions for a future approved rollout**, not
actions performed by this change. Use one Worker for all production tenants.

1. Confirm `tap2serve.com` is an active Cloudflare zone. Preserve unrelated mail
   and existing service records. Prepare proxied records for the apex, `admin`,
   `www`, and `*`. For a Worker-only origin, a proxied A record pointing at the
   reserved placeholder `192.0.2.0` can be used. Existing real origins may instead
   retain their appropriate targets. A wildcard does not cover the apex, and
   explicit DNS records override wildcard synthesis. Verify these choices against
   existing zone records. See [wildcard DNS](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/)
   and [originless DNS placeholders](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/).
2. Attach these **Workers Routes** to the same Worker in the `tap2serve.com` zone:

   ```json
   {
     "workers_dev": false,
     "preview_urls": false,
     "routes": [
       { "pattern": "tap2serve.com/*", "zone_name": "tap2serve.com" },
       { "pattern": "*.tap2serve.com/*", "zone_name": "tap2serve.com" }
     ]
   }
   ```

   This is a routing fragment for an operator-managed Wrangler configuration,
   not a complete deploy configuration. Preserve the built entrypoint, asset
   binding (`run_worker_first: true`), compatibility flags and approved D1 binding.
   Routes require proxied DNS. Audit more-specific routes: the most specific
   match wins, so existing `admin`/`api` routes or exclusions may intercept
   requests. The router rejects nested/unknown labels even though edge wildcard
   matching can be broader. See [Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/).
3. **Do not use `custom_domain: true` for `*.tap2serve.com`.** Normal Worker
   Custom Domains require exact hostname matches and do not support wildcard
   hostnames. This design uses wildcard DNS plus a Workers Route. An exact
   Custom Domain may optionally serve the apex, but the wildcard route remains
   necessary. See [Custom Domain matching](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
4. On a full DNS setup, verify an active edge certificate covering
   `tap2serve.com` and `*.tap2serve.com` before sending traffic. Universal SSL
   normally covers the apex and first-level subdomains on full setups. Enable
   HTTPS redirects and use Full (strict) when an HTTPS origin is involved; do
   not downgrade to Flexible. Worker-only responses terminate at Cloudflare.
   Check CAA/DCV restrictions and actual certificate status. A deeper hostname
   such as `olive.staging.tap2serve.com` is not covered by the production wildcard;
   arrange coverage for `staging.tap2serve.com` and `*.staging.tap2serve.com` (or
   use a separate staging zone). This may require an existing Advanced/Custom
   certificate setup; no purchase is authorized here. See [Universal SSL](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/)
   and [advanced wildcard coverage](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/).

## Local development and staging

`npm run dev` enables `TAP2SERVE_LOCAL_DEV=true` only in the Vite serve
configuration. `npm start` also supplies it to its explicitly local Wrangler
preview. `localhost:5173` retains the existing demo dashboard/bootstrap;
`admin.localhost:5173` and `<slug>.localhost:5173` exercise hostname routing.
Browsers generally resolve `.localhost` to loopback; use local name resolution
entries when necessary. The local preview's existing Sites mock supplies staff
identity. Local curl calls may supply demo headers. Never set the local flag in
production. When invoking Wrangler locally yourself, set the same flag in an
ignored local Wrangler vars file or via `--var TAP2SERVE_LOCAL_DEV:true`; the
production build deliberately does not emit it.

For staging, use an isolated Worker and database, explicitly set
`TAP2SERVE_BASE_DOMAINS=staging.tap2serve.com`, and attach more-specific
`staging.tap2serve.com/*` and `*.staging.tap2serve.com/*` routes to that Worker.
The most specific configured root wins. Each tenant remains exactly one label
below its configured base. Configure staging TLS and authentication separately;
do not share production cookies, Access audiences or database bindings. Arbitrary
`workers.dev` and unknown preview hosts fail closed. Root domains are an explicit
allowlist; forwarded headers cannot extend it.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run test:tenant-worker
npm run test:normalized-worker
```

Unit/SQLite tests cover label parsing, reserved/unique slugs, deterministic
legacy upgrades, database constraints, concurrent slug claims, scope projection,
foreign IDs/tokens, staff permissions and Access JWT verification. Built-Worker
tests exercise both legacy and normalized D1 modes, real server-rendered pages,
API authorization, forged identity/forwarding headers, tenant dashboards,
anonymous guest orders and bill requests, QR redirects, provisioning, staging,
unknown subdomains and no-store headers. All D1 state is isolated and temporary;
Access public keys are served by an in-process test double. No test deploys or
mutates a hosted service. Staging DNS/TLS and the real identity-provider login
flow must be verified during the separately authorized rollout.
