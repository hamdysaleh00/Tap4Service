# Deployment and infrastructure readiness

## Verdict

**NO-GO for public production, and do not expose the unpatched candidate as a
public staging service.** Local build/upload packaging is valid; current
dependency advisories, the HEAD limiter gap and operational/browser gates remain.
Nothing was deployed or purchased, no live DNS/registration/mail was modified,
and no hosted database was accessed. Earlier deployment-preparation documents
remain historical preparation artifacts; this audit adds security blockers.

## Compatibility and configuration matrix

| Target | Verified locally | Still unknown / required |
| --- | --- | --- |
| Hostinger domain registration | Runtime is registrar-independent; tap2serve.com configured in routing | Ownership, registration status/renewal/lock and actual registrar account not inspected. |
| Cloudflare DNS | Apex/wildcard Worker Route examples and registered-host tests | Actual active zone/delegation/DNSSEC/CAA, existing records and overlaps not inspected. |
| Workers Paid | Build + workerd compatibility and both dry-runs PASS; nodejs_compat, date 2026-05-15 | Plan/account/token IDs, paid CPU/memory, quotas and final deployment not verified. |
| D1 | SQL/Drizzle definitions and isolated SQLite/D1 tests PASS | Actual staging/prod IDs, schema version, real source counts/identity mapping and migration status unknown. |
| Restaurant wildcard hosts | Host scope/slug/foreign object denials PASS | Proxied DNS and route precedence need live review; unrelated web subdomains must be excluded intentionally. |
| HTTPS | Strict runtime HTTPS/config guards and headers tested via synthetic URLs | Public certificate/hostname renewal and true network TLS not tested by Miniflare. |
| Hostinger Business Email | Compatible as mailbox/domain service, separate from Workers | hPanel plan/mailboxes/DNS/delivery not inspected; app has no Hostinger SMTP transport. |
| App invitations/recovery | Resend HTTPS sender code and mocked tests implemented | Actual approved Resend key/from/DNS/delivery and independent environment separation unverified. |
| Secrets | Inventory, strict guard, ignore patterns and synthetic crypto tests | Real secret provisioning/ACLs/escrow/rotation/lost-MFA drill absent from evidence. |
| Migrations | Staged v3 schema/auth/poll indexes, offline verification and readiness gates | Hosted frozen-source rehearsal and manual activation still needed; no automatic safe down migration. |
| Backups/rollback | Encrypted recovery helper and local D1 restore tests PASS | Actual export schedule/offsite destination/retention, timed hosted restore, RPO/RTO and owner not verified. |
| Monitoring | Liveness/readiness, structured logs, optional alerts and cron handler implemented | Cron/alert receiver/external uptime probe/budget notification provisioning not verified. |
| Staging/production | Separate Worker/config/db-name/limiter proposals | All-zero example D1 IDs must be replaced with distinct verified IDs; no cloud resources were created. |

## Hostinger + Cloudflare DNS/mail plan

The separate project note `docs/CLOUDFLARE_ARCHITECTURE_AUDIT.md` specifies a
Cloudflare-Registrar-only target, while this audit request explicitly asks for
Hostinger registration/email readiness. The compatibility assessment below is
not authorization to replace that target or purchase/transfer anything. Resolve
the registrar/provider decision with the owner before provisioning; both notes
are preserved as existing project work.

Hostinger may retain domain registration and Business Email while Cloudflare
provides authoritative DNS and Workers serves HTTP. Domain registration does not
require Hostinger web hosting for this architecture. With Cloudflare nameservers,
the email MX/SPF/DKIM/DMARC records must be maintained in the Cloudflare zone using
the **actual values from the account's hPanel**, preserving existing service.
Hostinger/Titan/other mail plans can differ; do not blindly copy generic records.
See [Hostinger's manual external-DNS email setup](https://www.hostinger.com/support/8671319-set-up-a-domain-for-hostinger-email-manually/)
and [Cloudflare setup guidance](https://www.hostinger.com/support/4741545-how-to-use-cloudflare-in-hostinger/).

Keep mail/DKIM hosts DNS-only where proxying is not supported; MX is not web
proxy traffic. Combine authorized senders within one SPF policy rather than
creating competing SPF TXT records, and set DKIM/DMARC for both the mailbox and
approved transactional sender as applicable. Preserve unrelated verification
records. Registrar DNSSEC/DS transitions require a reviewed plan to avoid breaking
the whole domain. No account-specific record values or DNS changes were attempted.

The app currently sends through fixed `https://api.resend.com/emails`; buying
Hostinger Business Email alone does not configure that API. Either approve a
Resend sender for the application or implement/test another transport later.
There is no implicit SMTP integration in this candidate.

## Domain/TLS specifics

Production examples use tap2serve.com/* and *.tap2serve.com/* Worker Routes,
workers_dev=false and preview_urls=false. Staging has more specific
staging.tap2serve.com/* and *.staging.tap2serve.com/* routes to its own Worker.
They must remain more specific after activating the production wildcard.

Universal SSL on a full Cloudflare zone covers apex/first-level hostnames, not
olive.staging.tap2serve.com or admin.staging.tap2serve.com. Existing suitable
certificate coverage, an approved alternative staging zone or separately reviewed
exact Custom Domains is needed. Paid certificate purchase is not authorized.
Custom Domains are exact host matches, not arbitrary wildcard tenant onboarding.
See [Universal SSL limits](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/)
and [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Review Full (strict), minimum TLS, HTTPS redirects, CAA and HSTS scope without
disrupting other subdomains. Never put anonymous guest menus/APIs behind a Sites
or interactive Access login. Keep private HTML/auth/table responses out of edge
Cache Everything rules. Proposed documentation-only DNS placeholder addresses
are acceptable only for fully Worker-handled paths after approval; they are not
real fallback origins.

## Release acceptance order

1. Remediate critical/vendored dependencies and HEAD limiting, then repeat checks.
2. Restore reproducible UI testing and perform two-restaurant acceptance.
3. Review exact account/zone/DB IDs and approve any necessary paid resources.
4. Rehearse normalized/auth migration and credential-safe recovery on a hosted
   isolated target, preserving all actual source data and IDs.
5. Provision secrets/owner/MFA/mail; verify domains/TLS/guest reachability.
6. Measure expected hosted load, deploy monitoring and prove alert/restore drills.
7. Record immutable artifact/config/schema/bookmark, owner and compatible rollback.
8. Obtain explicit approval before production deployment, DNS cutover, data
   activation or any destructive restore. GitHub synchronization is source
   publication only and does not authorize any of these operations.

The [step-by-step preparation guide](../CLOUDFLARE_DEPLOYMENT.md),
[staging matrix](../STAGING_ACCEPTANCE.md) and [migration runbook](../D1_MIGRATION.md)
provide operator details; execute them only after the new security blockers and
account-specific decisions are resolved.
