# Security audit

## Scope and methodology

Authorized non-destructive local source/config/schema/history review, bounded
synthetic workerd/D1 and HTTP tests, ESLint, npm audit/signatures and a redacted
heuristic secret scan. No public-service attacks, RCE exploit, destructive SQL,
high-volume exhaustion test, production secret access or real email was used.
Semgrep/CodeQL/gitleaks executables were not available; specialist SAST and secret
scanner runs are BLOCKED, not silently represented by ESLint.

Assessment references: [OWASP Top 10:2025](https://owasp.org/Top10/2025/),
[API Security Top 10:2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
and [ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/)
requirements concerning validation/encoding, authentication, sessions,
authorization, cryptography, resource limits and logging. This is a targeted
assessment, not complete ASVS level certification.

## Confirmed findings and dependency risks

### SEC-01 — Medium: public HEAD bypasses GET read limiting

**Affected:** worker/index.ts handleRequest limiter condition. It applies the
public limiter to /api/* and selected GETs; a HEAD restaurant page can still
resolve/load/render tenant state without that limiter. The outer wrapper only
removes the response body after work is performed.

**Evidence/reproduction:** run `node tests/project-audit.integration.mjs` after a
build. In a new strict local Miniflare fixture with PUBLIC_READ_LIMITER=1/minute,
GET / is 200, a second GET is 429, then three HEAD / requests are 200. No load
flood or external host is involved. Test PASS records current insecure behavior.

**Impact:** an unauthenticated caller may incur render/D1 CPU and spend despite
the intended public read budget. No confidentiality or authorization bypass was
demonstrated. **Remediation:** gate equivalent expensive GET/HEAD paths, define
cheap health/static exemptions explicitly and add a failing-before/fixed-after
security-control regression. Preserve HEAD semantics and monitor shared-NAT load.
Maps to API4 resource consumption / OWASP security misconfiguration.

### SEC-02 — Critical advisory exposure: RSC 19.2.6, including vendored copy

**Affected:** package.json/lockfile direct react-server-dom-webpack@19.2.6 and
@vitejs/plugin-rsc/dist/vendor/react-server-dom/package.json (also labeled
19.2.6). Plugin react/rsc.js imports that vendored server implementation. The
framework uses RSC, so a devDependency label alone does not establish runtime
exclusion.

**Evidence:** registry audit and installed version/import inspection. The reviewed
[React advisory GHSA-xqc2-xf4c-x3h3](https://github.com/advisories/GHSA-xqc2-xf4c-x3h3)
covers 19.2 versions before 19.2.9 and describes a conditional unauthenticated
RCE risk involving specific typed-array/attacker-controlled response conditions.
No exploit was run and those exact application conditions were not proven.

**Safe reproduction:** run `node tests/project-audit-runner.mjs registry` and
inspect package/lock plus the vendored package metadata; do not send exploit
payloads. **Impact:** potentially severe framework compromise if applicable;
treat as a public-release blocker while triaging actual bundle/decoder paths.
**Remediation:** upgrade a compatible React/RSC/framework/plugin set, including
vendored RSC, to patched versions; rebuilding only the direct dependency is not
sufficient evidence. Verify emitted chunks and rerun all integration/browser
cases. Do not run blind npm audit fix --force. Maps to OWASP A03 supply chain.

### SEC-03 — High/critical dependency inventory requires reachability triage

**Evidence:** successful registry query exits 1 with **25 affected package
entries: 2 critical, 10 high, 13 moderate** (not 25 unique flaws). next@16.3.4 is
the other critical entry. Its advisory list includes
[next/og ImageResponse](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) and other
image/cache/server-function conditions. The application runs Vinext, imports
shims, and has no authored next/og/image API; installed Next does not by itself
prove a reachable conventional Next-server vulnerability.

High entries include the pinned Vite, Vinext, Wrangler/Cloudflare plugin and
transitive image-size/sharp/undici/ws plus zod. Tooling vulnerabilities must be
distinguished from shipped code. For example the reviewed
[Vite Windows file-deny advisory](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)
depends on exposed dev-server/filesystem conditions; no secret-file probe was
performed and audit previews bound loopback. Full sanitized package/severity/
advisory/fix metadata is in evidence/dependency-audit-summary.json.

**Safe reproduction:** the registry phase of the audit runner; no upgrade or
exploit. **Impact:** runtime, developer-host or CI exposure depending on path.
**Remediation:** create a dependency remediation branch with compatibility and
bundle-reachability review, patched toolchain, scan repeat, signature verification
and regression tests. The registry's suggested Drizzle downgrade and major Zod
change are not approved recipes. Avoid exposing development servers. Maps to
OWASP A03/A02; do not advertise the project as secure because functional tests pass.

### SEC-04 — Medium hardening gap: inline script permitted by CSP

**Affected:** lib/observability.mjs secureResponse uses script-src 'self'
'unsafe-inline'. React escapes ordinary rendered values, design config rejects
executable content and no authored dangerouslySetInnerHTML/eval injection sink
was found in the active application. **No working XSS was demonstrated.**

**Safe reproduction:** inspect response-header assertions/secureResponse source.
**Impact:** CSP provides weaker mitigation if a future injection appears.
**Remediation:** implement/test framework-compatible nonces or hashes before
removing unsafe-inline; do not break RSC bootstrap by simply deleting it. Maintain
output encoding, safe asset URLs and private token headers. Defense in depth,
not a confirmed XSS vulnerability. Maps to ASVS encoding/browser security.

### SEC-05 — Medium accepted-design risk: stand URL grants current table access

**Affected:** domain locate()/guestView and app guest table URL/capability flow.
The permanent table token is bearer access to the shared table; a fresh scan can
retrieve current-session capability. Any table guest can view/edit eligible shared
orders. Closing rotates/revokes visit capabilities, but the stand URL survives.

**Evidence:** domain, lifecycle and token-rotation tests; no public token guessed.
**Safe reproduction:** two synthetic local guests use the same test stand URL;
both can access that table's current session. **Impact:** copied/photo-shared
stand links permit remote participation; session revocation is not presence
proof. **Remediation:** explicitly approve this threat model, protect token/log
privacy, retain rotation procedures and consider a scoped presence mechanism if
business requirements demand it. This is not a cross-restaurant IDOR finding.

### OPS-01 — Low/medium readiness scope gap

readiness() checks config/model/auth markers, not actual email delivery or an
enrolled usable Super Admin. Existing strict tests receive readyz=200 without
mail credentials. **Impact:** health can be green while invitations/recovery are
unavailable. **Safe reproduction:** inspect tests/production-worker.integration.mjs
fixture/readyz assertions and lib/operations.mjs. **Remediation:** document probe
scope; add non-mail-sending configuration checks and a separate controlled mail/
owner smoke test rather than sending email from every readiness request.

## Controls assessed

| Area | Verified implementation/evidence | Limit |
| --- | --- | --- |
| Password/MFA | scrypt N=16384,r=8,p=5, random salt; AES-GCM per-user MFA secrets; TOTP vectors, replay guards; two KDFs per isolate | Paid runtime CPU/memory and lost-key drill not verified; no automated keyring rotation/recovery-code UX. |
| Sessions | 256-bit opaque token; only digest in D1; Secure/HttpOnly/SameSite Lax host cookie; 8-hour absolute/30-minute idle expiry, version/active/origin checks | Revocation is checked on subsequent requests; drain in-flight work for an immediate freeze. |
| CSRF/CORS | Independent staff mutations require exact Origin/session CSRF, sensitive actions recent auth; guest capability model; no permissive CORS headers found | Compatibility/local identity is deliberately weaker; never publish local flags. |
| Tenant BOLA/IDOR | URL scope, active memberships, command permissions, composite FKs, private projections; parallel foreign-ID tests pass | No database row-level policy; shared table privacy is intentional; no live tenant test. |
| SQL injection | Prepared binding for values; dynamic table/column/view names come from internal maps/allowlists; literal migration SQL offline only | Not a complete external fuzz campaign. |
| XSS/output | React escaping, constrained design registry/colors/fonts/URLs, no arbitrary HTML/CSS upload | Unsafe-inline CSP and broad HTTPS image sources remain; visual/code dependency risks separate. |
| SSRF/redirect | Mail API fixed HTTPS URL; optional alert endpoint operator-owned HTTPS; no active generic URL fetch/upload endpoint; safe return/host destinations | Operator webhook and external image privacy need configuration review; no cloud-network probe performed. |
| Input/API | Byte/depth/key/UTF-8 bounds, opaque syntax, version/idempotency/quantity constraints, native+session/IP counters | Equivalent HEAD path unbounded; no complete schema validation for every staff field fuzzed. |
| Errors/logging | Generic unexpected errors, redacted structured route events, no-store/no-referrer/security headers and invocation logs disabled | Framework/dependency logging and provider dashboards need separate operational privacy review. |
| Backups | Encrypted/authenticated offline exports, source checks, credential-invalidating rehearsal and restore tests | Actual schedules, ACLs/key escrow and hosted recovery remain unknown. |

## Secret/dependency scan record

The heuristic scanner inspected worktree source and **306 unique reachable
historical blobs**. Its only pattern matches were a deliberately rejected
credential-bearing URL in tests/restaurant-design.test.mjs (worktree + one
historical blob). Manual review confirmed synthetic test credentials on an
example.test URL, not an account secret. No real credential was confirmed; this
limited pattern set cannot establish absence of arbitrary secrets/customer data.
The staged-file scan is repeated before commit. No sensitive exports/caches/
environment files are included. No history was rewritten to hide findings.

`npm audit signatures` passed: 671 registry package signatures and 228
attestations verified. This validates available provenance, not vulnerability
absence and not the safety of vendored code. Automated scans plus passing tests
are insufficient to declare the application secure.
