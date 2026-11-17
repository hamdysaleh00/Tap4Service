# Project history and progress

## Evidence boundary

Before the audit commit, `main` had **6 commits**, and **10 commits** were
reachable across all local branches. The repository is not shallow. Two unrelated
root histories exist: current `main` starts at `15d7258`; the preserved
`codex/local-history-before-github-sync` branch retains root `987b93c` and ends
at `58ffdc3`. Neither branch was deleted or history rewritten by this audit.
Remote advertised `main` matched local `dc16595` before synchronization.

The earliest available snapshot already contains an application. Its first
design discussion, initial scaffold creation, earlier tests and actual dates
when individual features were first written are unavailable. Commit messages
describe snapshots/imports, not a complete development diary. The following is
a chronology of **available evidence**, not invented feature-creation dates.

## Chronological timeline (Africa/Cairo, 16 November 2026)

| Time | Commit / history | Verified content/change |
| --- | --- | --- |
| 17:20:06 | `987b93c`, preserved root | Hospitality MVP 0.1.0; React/Vinext/Vite/Worker/D1, Sites identity, complete-platform app_state JSON + revision CAS. Guest/menu/table/kitchen/bill flows and server-side diner/share allocation code already present. `package.json`, `lib/store.ts`, `lib/domain.mjs`. |
| 18:03:57 | `e11b95d` | Alpha 0.2.0-alpha.1, English/Arabic catalogs/provider, localized API errors and UI tests. Guest/server share-allocation workflow simplified into a browser calculator; old split-bill test removed, calculator tests added. Domain/store/UI changes visible in diff. |
| 23:41:27 | `ac2e6ff` | Snapshot adds normalized model/schema/migration tooling, independent auth tables/KDF/MFA/sessions, hostname scope, Super Admin restaurant designs/private previews and expanded concurrency/security tests. Retains legacy adapters. No evidence this commit migrated a hosted DB. |
| 23:42:54 | `15d7258`, current-main root | New root records .gitignore only. This is a separate history, not a chronological ancestor of the preserved source snapshots. Reason for reinitialization is not recorded. |
| 23:46:01 | `3cf0e99` | Current-main source import: 194 files, including normalized/auth/routing/design/test code and dependencies. This shows import completeness, not 194 files being authored at that instant. |
| 23:47:47 | `58ffdc3`, preserved branch | Operational guards, bounded request validation, public projections, polling/repository, observability, abuse controls and Worker changes. Parallel snapshot to later main changes. |
| 23:48:46 | `8e006f6`, main | Operational safeguards imported onto current history; includes updates repository, input bounds, limiter/header/readiness logic and polling. |
| 23:50:31 | `845c53b` | Adds updates API, encrypted backup helper/CLI, operational tests and store refinements. |
| 23:51:28 | `86f6d4f` | Abuse/backup refinements, Arabic text and expanded backup tests. |
| 23:52:28 | `dc16595` | Dashboard source snapshot: polling/state/UI additions, 57 insertions/10 deletions in app/tab2serve.tsx. Base of audited working tree. |
| 17 November, working tree before audit | Uncommitted | Further polling, index/schema, KDF-concurrency, logging/store, test/dependency-lock and deployment-preparation changes. These were present at audit start and were preserved. Their exact authorship/timing cannot be reconstructed from commit history alone. |
| This audit | Audit commit | Adds isolated audit scripts/tests and reports, runs checks, records findings and synchronizes reviewed source. Does not repair application code or activate hosted infrastructure. |

## Architectural progression and changed product scope

The legacy design reads/parses every restaurant and rewrites one JSON payload
behind an eight-attempt platform revision CAS. The normalized adapter moves
operational entities into tenant-keyed relational tables, preserves unknown/retired
fields in compatibility envelopes, and uses per-restaurant CAS plus atomic D1
batches. It is implemented but explicit migration/readiness activation is required.

Authentication evolved from Sites-provided identity to a selectable independent
credential provider with host-bound sessions, CSRF and mandatory initial Super
Admin MFA. Existing provider support was not deleted. Domain routing makes the
hostname authoritative rather than accepting a client-selected restaurant alone.

Earlier persisted diner allocations/per-person settlement logic is no longer a
guest payment feature. Current `app/split-bill.tsx` and
`lib/share-calculator.mjs` implement a local multi-person plan with exact component
rounding and unassigned remainder. It is unsaved and does not mutate a bill or
record payment. Older data can remain in migration compatibility envelopes.

## Current development status and debt

Source implementation is ahead of operational proof. Deployment templates,
tests and runbooks do not prove a live migration, certificate, mail sender,
backup schedule or paid-plan load test. Alpha/package/page naming and older
README descriptions persist alongside newer functionality. Whole-repository lint
fails, the RSC/toolchain is vulnerable/outdated according to current advisories,
browser dependencies are absent, and multiple migration systems/default modes
create operator confusion. The isolated old history remains local; it was not
silently grafted onto or force-pushed over remote main.
