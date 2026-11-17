# Design Studio validation - 17 November 2026

Implemented in a separate Git worktree on codex/restaurant-design-studio from
9b6783de08acc3bc207cfae3c9a5a119a14358d5. Existing changes in the shared checkout
were not modified, reset, staged or committed. No production deployment occurred.

| Check | Result |
| --- | --- |
| TypeScript: npm run typecheck | Passed |
| Cloudflare/Vinext: npm run build | Passed |
| Full unit suite: node --test tests/*.test.mjs | 154 passed |
| Focused design and normalized-storage tests | 33 passed |
| Built tenant Worker, legacy + normalized D1 | 2 integration scenarios passed |
| Built normalized/lifecycle Worker | 2 passed |
| Built independent-authentication Worker | 4 passed |
| Local production-runtime health/security/concurrency | 3 passed |
| git diff --check | Passed |
| Browser/device/keyboard interaction | Unavailable: browser access host disconnected |

The full suite initially encountered SQLITE_CANTOPEN in the unrelated D1 backup
restore drill under the long Windows worktree path. The unchanged drill passed
from a short-path source copy; running all 154 unit tests from that copy passed.
Generated schema line endings were normalized only for the local test run; no
schema/model migration is part of the change.

The tenant integration matrix covers six themes x two languages x six preview
screens x two storage modes (144 preview renders), plus draft privacy, branding,
colors, publication, private reset, selected-history restoration, stale versions,
permissions, anonymous rejection and cross-tenant host/ID rejection. Guest ordering,
authentication, billing and session lifecycle tests continue to pass.

Unit coverage includes 512 arbitrary color combinations and AA foreground
resolution, safe branding URLs, approved enum controls, template independence,
legacy configuration upgrades, history retention, membership revocation, ownership
boundaries and projection privacy.

Visual responsiveness, native picker interaction and hydrated live postMessage
updates require browser verification when browser access is restored. Server
rendering and static inspection do not establish those interactive results.

See [the implementation and file map](RESTAURANT_DESIGN_SYSTEM.md). Branding uses
HTTPS image URLs; uploading/hosting assets is outside this change. Drag and drop
is documented as a future validated section/component-layout feature.
