# Tab2Serve Restaurant Design Studio

One shared application serves every restaurant. Restaurant-local configuration extends
the existing presentation registry, guest slots and versioned publishing system.
No separate frontend, database migration, deployment or ordering implementation is
introduced by this feature.

## Templates and approved controls

Six presets are registered: Modern Cafe, Luxury Dining, Minimal, Fast Food,
Classic Restaurant (the compatible tap2serve-classic ID), and Contemporary Restaurant.
They share the existing Site, GuestShell, Hero and MenuCard implementations, with
different reviewed colors, typography, spacing, header and card treatments.
Selecting a template preserves the restaurant's branding and bilingual titles.
Suggested palettes can be applied independently of the current template.

The editor supports primary, secondary, background, surface, text, muted, accent
and button colors using a native picker and manual six-digit HEX fields. Every
valid HEX color is retained. Rendered text is checked separately against its actual
background/surface; if contrast is below 4.5:1, the renderer uses black or white.
Button and brand backgrounds always receive an accessible black/white foreground.
Opaque content surfaces keep text readable over the optional background image.

Branding uses existing HTTPS image URLs for logo, banner, background and up to six
gallery images, plus plain English/Arabic hero titles. File uploading and asset
storage are not included; images remain hosted at the supplied HTTPS source.
Reviewed local font stacks include system UI, Arial/Tahoma, Georgia/Times and
Traditional Arabic/Noto Naskh Arabic/serif fallbacks. No arbitrary font URLs, CSS,
HTML, scripts, module paths or implementation options can be supplied.

Visual choices are square/rounded/pill buttons; elevated/outlined/compact cards;
none/subtle/strong borders; compact/comfortable/spacious spacing; simple/brand/banner
headers; card/list menus; hero and gallery visibility. These enums are validated
on the server as well as the client. Unknown fields and executable content fail
closed. Existing schemaVersion 1 configurations receive additive defaults.

## Access and editing

Super Admin opens Manage design on a restaurant in the platform dashboard.
Restaurant owners/managers open Design Studio in their restaurant dashboard.
Active membership with design.manage authorizes the approved controls. Existing
permissions.manage administrators retain access for compatibility, without an
automatic permission migration. Team & permissions can grant design.manage
independently of other management rights.

GET /api/design?restaurant=<id> checks authentication, hostname scope and explicit
restaurant authorization before returning the private management document.
Tenant commands use design.save, design.publish, design.reset and design.revert;
Super Admin uses the retained platform.design.* namespace. Platform commands
remain forbidden on tenant origins. A membership in restaurant A never grants
access to restaurant B; tenant hosts reject mismatched IDs even for platform owners.
All writes use the existing authenticated/CSRF command pipeline.

## Draft, publish, reset and history

- Save draft validates and persists private visual settings only.
- Publish Design promotes the saved draft atomically. Unsaved/invalid changes
  disable publishing; saving a draft never changes public appearance.
- Reset to Default saves a private default draft, including a safe legacy logo.
  Publishing is still required to expose that reset publicly.
- Version History retains up to 20 prior published snapshots, with publication
  version, actor and timestamp. Draft saves do not create publication snapshots.
- Restore version immediately publishes the selected snapshot and replaces the
  draft; the outgoing publication is retained in history. Revert published design
  retains the existing one-step rollback, including compatibility with old records.

Every write requires expectedVersion. Concurrent/stale editors receive 409 and
can use Reload saved draft to review the saved state. No last-write-wins overwrite
is introduced. Each successful command records the actor/time and restaurant audit;
platform edits also retain platform audit records.

Per-restaurant websiteDesign extends version/draft/published/previous with history
and publishedVersion. Legacy mode uses the existing app_state CAS transaction.
Normalized mode uses restaurants.website_design_json and the existing atomic D1
revision guard. No operational order, billing, session or payment changes occur.
Public restaurant, guest and regular staff projections contain no private draft,
history or design-management metadata. The management API is the private read path.

## Live preview

Preview updates while editing, including unsaved valid changes. Incomplete HEX
fields show a validation message and retain the last valid preview. The editor
provides 390px mobile and 1100px desktop frames, Arabic RTL and English LTR, and
website/menu/product details/basket/orders/bill screens. Large desktop frames
scroll within the editor on smaller displays instead of resizing the guest layout.

/design-preview authorizes the user and restaurant on each request and requires
the current design version. It returns 404 for unauthorized users; a preview URL
is not a credential. Responses are private/no-store. The authenticated same-origin
parent sends validated visual configuration using postMessage; both sides check
message origin and source, and the child validates the full configuration again.
Drafts are never put into URLs, public state, browser storage or shared caches.

Preview uses the actual guest presentation and synthetic menu-derived examples,
inside an inert subtree. It has no table token/capability or operational polling,
and its mutation handler never calls an API. It cannot place orders or change a
real session. Existing production guest behavior remains in the shared application.

## Implementation map

| Files | Responsibility |
| --- | --- |
| lib/restaurant-designs/catalog.mjs | Six presets and suggested palettes |
| lib/restaurant-designs/config.mjs | Validation, contrast, defaults, history, publication |
| app/restaurant-designs/{types.ts,registry.tsx,presentation.tsx,design.css} | Approved shared visual presentation |
| app/design-editor.tsx | Controls, draft workflow and preview frame |
| app/design-preview/page.tsx, app/restaurant-designs/preview-client.tsx | Authorized private live preview |
| lib/domain.mjs, lib/store.ts, lib/normalized-store.mjs | Permission enforcement, tenant-scoped reads/writes |
| app/super-admin.tsx, app/tab2serve.tsx | Dashboard entry points and shared guest preview screens |
| lib/locales/ar.mjs | Arabic studio copy |

The static registry cannot import tenant-supplied code. Retired implementations
fall back to Classic with safe common branding. Extend future designs through
reviewed static application code and the shared guest slot contracts; do not
copy financial/session logic into themes.

## Future drag and drop

Drag and drop is deliberately outside this release. A future feature may change
component positions and reorder page sections using a versioned, validated layout
schema, explicit section IDs, keyboard-accessible reordering and the same tenant,
preview and publishing guards. It must preserve ordering/navigation/overlay slots
and must never introduce arbitrary HTML, CSS, code or cross-tenant references.

## Verification

Run npm test, npm run typecheck, npm run build, npm run test:tenant-worker,
npm run test:normalized-worker and npm run test:auth-worker. Tests use isolated
local databases and never deploy or contact live D1. The tenant Worker suite
renders all six themes in both languages on website, menu, details, basket,
orders and bill previews, and exercises manager save/publish/reset/history restore,
private draft projection, optimistic conflicts and cross-tenant rejection in both
legacy and normalized storage. Unit tests cover strict schemas, safe assets,
512 arbitrary palettes/AA foregrounds, permission revocation and history retention.

Interactive browser/device/keyboard verification remains a separate check when
browser access is available. Server HTML and CSS checks cannot certify pixel
layout, native color-picker interaction or postMessage hydration in a real browser.
