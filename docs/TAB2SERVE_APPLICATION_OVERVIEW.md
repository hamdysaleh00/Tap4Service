# Tab2Serve — Application and Physical Product Overview

Source-based overview, 17 November 2026. This document describes the inspected
checkout; it is not a production-readiness certification. No tests, database
operations or deployments were performed for this documentation task. Current
source takes precedence over older README descriptions, particularly for billing.

> **Subsequent POS implementation:** the cashier, discount/refund/void, shift,
> handover and reporting capabilities described below as planned have since been
> implemented on `codex/cashier-pos-finance`. See [cashier POS and financial
> operations](CASHIER_POS_FINANCE.md) for behavior, verification, compatibility
> and remaining acceptance. This overview retains the earlier source baseline.

## 1. Executive Overview

Tab2Serve is a bilingual restaurant and café ordering and operations application.
Guests open a table-specific digital menu, customize dishes, submit shared table
orders, follow progress and view their combined bill. Staff manage table sessions,
orders, kitchen progress, service requests and in-person payment records.

The broader product concept combines this software with customized, branded
table stands containing a QR code and an NFC tag. The software generates table
links and QR codes; manufacture, installation and physical NFC performance are
not established by the repository. The current release is an Alpha with a longer-term
vision for complete POS, cashier and shift management.

## 2. Problem & Solution

Tab2Serve addresses fragmented menu access, repeated manual order taking, limited
visibility into kitchen progress, and difficulty coordinating table bills and
service requests. Its existing software connects guests and staff around one
table session and authoritative order/bill records.

The intended end-to-end offering adds restaurant-specific physical stands as the
entry point. A stand opens a restaurant/table URL; the application manages the
digital workflow. Reduced manual work and smoother service are intended benefits,
not measured savings or guarantees.

## 3. Target Customers

Restaurants, cafés, casual dining venues and other table-service hospitality or
food-service establishments needing digital menus and shared table ordering.
Owners and managers operate the workspace; kitchen and service staff receive
permission-specific views; guests use their own phones. Hotel property management,
delivery logistics and ingredient-level inventory are outside the current scope.

## 4. Guest Experience

1. **Access:** scan a table QR code or, once a tag has been provisioned, tap an NFC
   stand. The URL identifies the restaurant and enabled table. QR generation and
   URL routing exist; NFC tag writing and physical reading require separate setup.
2. **Browse:** read categories, dish descriptions, images and prices in English
   or Arabic. Browsing is available before a staff member opens the table.
3. **Choose:** select quantities and priced modifiers, add instructions, and review
   the basket and resulting combined table bill. There is no online payment checkout.
4. **Order:** an OPEN session permits submission. All guests sharing its capability
   see the same table orders; Pending/Accepted orders can be edited before preparation.
5. **Follow service:** observe kitchen/order status, call staff and request the
   bill. Requesting the bill pauses ordering until authorized staff reopen it.
6. **Review and settle:** view subtotal, service and tax; use the local Split Bill
   calculator; pay the restaurant in person. Optional feedback is private.

The intended smart stand makes this interaction part of the restaurant's branded
table experience. Anonymous guest APIs do not by themselves guarantee public
access through a private Sites hosting gate.

## 5. Restaurant Experience

Staff open and release tables, monitor orders, move work through the kitchen queue,
handle guest requests, inspect bill history, explicitly finalize bills and record
the outstanding combined amount as cash or card. Printing opens a browser receipt;
it does not process a payment or automatically drive a thermal printer.

Authorized managers maintain menus, categories, modifiers, availability, visibility,
tables, staff permissions, bilingual content and tax/service rates. Restaurant
appearance is controlled by Tap2Serve Super Admin through a versioned design
configuration, preview, publish and revert workflow. Owners do not receive unrestricted
design controls. The current design registry contains one implementation.

The platform administrator can provision restaurants, configure subscription
amounts/status and billable-table counts, and track setup/support status. These
records do not constitute automated subscription collection or a complete POS.

## 6. Physical Product — Customized NFC & QR Smart Table Stands

**Proposed deliverable:** a compact, custom-made stand for each table, carrying a
unique QR code, embedded NFC tag and visible table identifier, with the restaurant's
logo and visual identity. Acrylic, wood and other suitable finishes are material
options for design evaluation, not verified available product variants. The stand
should suit its venue's interior and hospitality setting rather than resemble a
generic printed QR label.

Both QR and NFC should open the same stable table URL. Table identity is separate
from a visit's revocable session capability, allowing successive guests to use the
same stand while previous sessions lose access. Token rotation exists; any changed
permanent URL requires updating the QR artwork and NFC tag.

Physical production still needs material selection, artwork approval, QR readability,
tag placement and phone compatibility checks, durability assessment, provisioning,
installation and replacement procedures. No manufacturing orders, installed units,
supplier agreements or field-performance evidence were verified. Intended benefits
include consistent branding, a tangible software-service package and a cohesive
connection between the dining space and digital ordering.

## 7. Complete Feature Inventory

**A — Implemented:** present in inspected source, without implying deployment or
fresh runtime validation. **B — Partially Implemented:** code/support exists but
completion, rollout or hardware validation remains. **C — Planned:** requested
product direction without an implemented end-to-end workflow. **D — Not Verifiable:**
external status lacks evidence. Each numbered row is one inventory group.

| ID | Status | Feature and evidence/boundary |
| --- | --- | --- |
| A01 | A | Digital menu, categories, images and authored bilingual item content — `app/tab2serve.tsx`, `lib/public-projection.mjs`. |
| A02 | A | Unique table URLs, generated QR image/download and copyable NFC URL — `app/qr.tsx`, `app/tab2serve.tsx`. |
| A03 | A | Basket, quantities, modifiers, notes and table bill preview — `app/tab2serve.tsx`, `lib/bill-pricing.mjs`. |
| A04 | A | Anonymous shared guest session with revocable capability — `lib/domain.mjs`. |
| A05 | A | OPEN, BILL_REQUESTED, FINALIZED lifecycle, reopening and settled-table release — `lib/domain.mjs`. |
| A06 | A | Guest order creation/editing, price snapshots, availability checks, versions and duplicate suppression — `lib/domain.mjs`. |
| A07 | A | Order queue and kitchen status transitions; preparation locks edits — `app/tab2serve.tsx`, `lib/domain.mjs`. |
| A08 | A | Combined bills, request deduplication, finalization and historical snapshots — `lib/domain.mjs`. |
| A09 | A | Restaurant tax/service settings and effective bill calculations — `lib/bill-pricing.mjs`, `lib/domain.mjs`. |
| A10 | A | Multi-guest local Split Bill, quantity limits, unassigned items and exact rounding — `app/split-bill.tsx`, `lib/share-calculator.mjs`. |
| A11 | A | Combined cash/card recording, balance checks and payment idempotency — `lib/domain.mjs`; no gateway. |
| A12 | A | Staff calls, acknowledgment/resolution and bill requests — `lib/domain.mjs`, `app/tab2serve.tsx`. |
| A13 | A | Optional private guest feedback with permission-controlled access — `lib/domain.mjs`. |
| A14 | A | Menu/category/modifier editing and availability/visibility controls — `lib/domain.mjs`, `app/tab2serve.tsx`. |
| A15 | A | Table configuration and permanent-link token rotation — `lib/domain.mjs`. |
| A16 | A | Restaurant identity, bilingual welcome content and receipt rates — `app/tab2serve.tsx`, `lib/domain.mjs`. |
| A17 | A | Individual staff records, identity binding, deactivation and server-enforced permissions — `lib/domain.mjs`, `app/auth.ts`. |
| A18 | A | Staff activity/audit records and activity view — `lib/domain.mjs`, `lib/updates-repository.mjs`. |
| A19 | A | Multiple restaurant workspaces and tenant/hostname scoping — `lib/tenant-routing.mjs`, `lib/store.ts`. |
| A20 | A | Platform provisioning, subscription configuration and onboarding/support records — `app/super-admin.tsx`, `lib/domain.mjs`. |
| A21 | A | Super Admin branding/design configuration, private preview, publication and rollback — `app/design-editor.tsx`, `lib/restaurant-designs/config.mjs`; one registered design. |
| A22 | A | English/Arabic, RTL/LTR, money/error localization and device/identity language preference — `app/i18n.tsx`, `lib/i18n.mjs`, `lib/locales/`. |
| A23 | A | Responsive guest/staff layouts and receipt print CSS — `app/style.css`, `app/restaurant-designs/design.css`; device coverage not certified. |
| A24 | A | Approximately two-second polling, reconnect handling and in-app new-order notices — `app/tab2serve.tsx`, `lib/polling.mjs`; no sound/push claim. |
| A25 | A | State, mutation, polling, design and authentication API routes — `app/api/`; deployment/configuration controls availability. |
| B01 | B | Independent credential authentication: invitation/reset email, server sessions, CSRF and Super Admin MFA code exist; operator provisioning/cutover and real mail checks remain — `lib/auth-service.mjs`, `lib/auth-server.ts`, `docs/AUTHENTICATION.md`. |
| B02 | B | Normalized D1 adapter/schema and migration tools exist; legacy JSON is the unset/default storage mode — `lib/normalized-store.mjs`, `lib/store.ts`, `db/staged/`. |
| B03 | B | Browser-printable receipt exists; physical printer setup, reliable sizing and any silent-print bridge remain unverified — `app/tab2serve.tsx`, `app/style.css`. |
| B04 | B | Backup/restore and monitoring support exists; scheduled operation, alerts and recovery in hosted infrastructure need activation/rehearsal — `scripts/backup-restore.mjs`, `worker/index.ts`, `docs/PRODUCTION_READINESS.md`. |
| B05 | B | NFC software destination is available; tag encoding, stand integration and physical device acceptance are incomplete. |
| C01 | C | Manual cashier-created orders synchronized with guest orders. Current order submission is guest-capability based. |
| C02 | C | Dedicated cashier editing, discounts, refunds and voids with permissions and financial history. |
| C03 | C | Shift opening/closing, cash movements, reconciliation and confirmed cashier handover. |
| C04 | C | Dedicated sales, payment, cashier-performance and shift reports; existing bills/payments/audits are foundations. |
| C05 | C | Sound alerts and scalable real-time push; current notifications use polling. |
| C06 | C | Custom stand manufacture, deployment and ongoing physical-service fulfillment. |
| C07 | C | Automated commercial subscription collection; current subscription fields are administrative records. |
| D01 | D | Actual registrar ownership, live DNS/routes, deployed Workers/D1 resources and production TLS state. |
| D02 | D | Stands already manufactured, installed or successfully used on particular NFC devices. |
| D03 | D | Actual customers/adoption, operational savings, live reliability and independently established performance at scale. |

**Inventory totals: 25 implemented, 5 partially implemented, 7 planned, 3 not
verifiable — 40 groups.** Sub-capabilities are explained within their groups and
the roadmap; totals are not a count of every button or individual requirement.

## 8. Implemented vs Planned Features

The current product supports guest-originated ordering and a restaurant operations
dashboard with lightweight cashier functions. Cash/card recording, bill management,
staff permissions and activity history already exist. A full cashier POS, shifts,
cash drawers/reconciliation, discounts/refunds/voids and dedicated management
reporting remain product requirements.

Split Bill is a calculator only: selections are local, unsaved and do not reserve
items across devices. Quantities are limited within the current plan. Allocation
uses the actual original bill amounts, including supported discount/rounding
inputs; this does **not** imply a restaurant discount workflow exists. Unassigned
items retain their share of charges until allocated. Fully allocated guest shares
sum exactly to the table bill; no separate guest payments are created.

Online payments, fiscal/e-invoice integration, external POS/accounting connectors,
offline ordering and asset-upload management are not implemented offerings or
confirmed commitments. Full ingredient inventory is explicitly outside scope.

## 9. POS & Cashier Management Roadmap

| Area | Existing foundation | Remaining product requirements |
| --- | --- | --- |
| Cashier POS | Staff bill views, finalize/print, guest editable orders | Cashier manual order creation and controlled cashier editing; synchronization with guest orders. |
| Bill adjustments | Subtotal, tax/service, immutable final snapshot | Discounts, voids and refunds with authorization, reasons and auditable financial treatment. |
| Payment and receipts | Combined cash/card records, balances, browser receipts | Production hardware acceptance and integration appropriate to the venue; no automatic acquiring implied. |
| Staff | Individual identities, configurable permissions, deactivation and logs | Cashier-specific operational flows and reporting over existing permissions/accounts. |
| Shifts | No implemented shift ledger | Open/close shifts, opening balance, cash in/out, expected versus actual cash, shortages/overages. |
| Handover | No implemented handover workflow | Cash handover between cashiers, recipient confirmation and discrepancy tracking. |
| Reporting | Bill/payment/audit records and bill history | Sales, payment, cashier-performance and shift reports; structured transaction history and reconciliation. |
| Operations | Shared authoritative records, polling, notices and tenant isolation | Sound alerts, scalable push and full guest/cashier workflow synchronization. |

These are roadmap requirements, without delivery dates or completed-product claims.

## 10. Business Value Proposition

**Owners:** existing central views of orders, sessions and bills provide an
operational foundation. Restaurant-specific configuration and future POS/reporting
could improve oversight and reduce repetitive work; financial improvements have
not been measured.

**Staff:** current queues, kitchen states and guest requests give shared visibility;
permissions and audit records support responsibility. Shift control and cash
accountability are expected benefits of the roadmap, not existing guarantees.

**Guests:** current capabilities include phone-accessible menus, customization,
table ordering, progress and bill visibility, and item-based Split Bill calculation.
Convenience depends on connectivity and the restaurant's service process.

**Positioning:** the intended differentiator is a coordinated software platform
and customized physical smart stands matching each venue. The stand is a tangible,
branded access point supporting a cohesive guest experience. This is a product
position, without competitor rankings, proven conversion lifts or cost-saving claims.
Commercial pricing and physical materials need agreement; admin pricing fields
alone do not establish a published tariff.

## 11. Technical Architecture

| Layer | Inspected implementation and status |
| --- | --- |
| Frontend | React 19, TypeScript, Next-style App Router through Vinext 1.0.0-beta.5 and Vite 8.0.13. Authored CSS; Tailwind v4 PostCSS tooling is configured. |
| Backend | Cloudflare ES-module Worker wrapping Vinext rendering/API handlers, tenant scope, security headers, traffic controls and optional scheduled maintenance — `worker/index.ts`. |
| Persistence | D1 binding `DB`; legacy versioned `app_state` JSON with conditional commits by default. Optional normalized tenant tables and transactional revision guards; Drizzle definitions in `db/schema.ts`, auth schema in `db/auth-schema.ts`. |
| Data model | Restaurants, memberships/permissions, menus/categories/modifiers, tables, sessions, orders/lines, bills, payments, requests, feedback, subscriptions/setup and audit records. Authentication adds accounts, sessions, action tokens and security events. |
| Authentication | `app/auth.ts` selects Sites identity unless independent mode is explicitly enabled. Portable development has mock sign-in. Independent password/session/MFA implementation is available behind configuration; hosted rollout is unverified. |
| Isolation | Membership authorization plus hostname/slug validation and tenant-scoped reads/mutations. Normalized tables use restaurant-scoped keys/relationships. Shared physical D1 does not imply a separate database per restaurant. |
| Sessions | Permanent table token identifies the stand; current session capability identifies the visit. Versions and idempotency checks protect edits and duplicate commands. Finalization preserves pricing; release/new sessions revoke prior guest access. |
| Billing | Integer piastres, EGP. Each charge equals rounded subtotal × basis points / 10,000; both apply independently. Current rates apply before finalization; recorded final amounts remain authoritative. Reductions below recorded payments are rejected. |
| Synchronization | Polling with ETags, pagination and reconnect handling, not WebSockets/SSE. No offline mutation queue. |
| Assets/integrations | `qrcode` generates QR images; Lucide supplies icons. Branding/menu images use HTTPS URLs, sample images use Unsplash and the stylesheet references Google Fonts. Resend invitation/recovery integration needs configured credentials and verified sending/delivery. No payment gateway or external POS connector is claimed. |

**API map:** `GET /api/state` returns authorized staff or guest state;
`GET /api/updates` provides conditional/paged polling;
`POST /api/command` dispatches authorized domain actions;
`/api/design` supports design management;
`/api/auth/[action]` handles the configured independent-auth flows. Relevant screens
include `/`, `/dashboard`, `/login`, `/logout`, `/account`, `/activate` and
`/design-preview`. These are application APIs, not a promised third-party developer
integration contract. Connector-preview scaffolding does not establish a live business integration.

**Target production infrastructure:** Cloudflare Registrar, Cloudflare DNS,
Workers Paid hosting, separate staging/production D1 databases, Cloudflare HTTPS,
and GitHub source control. `tap2serve.com`, `admin.tap2serve.com` and registered
restaurant subdomains are represented in routing logic/templates. Actual Cloudflare
account setup, wildcard routing, certificates and deployment are unverified.
`config/wrangler.production.example.jsonc` explicitly remains a placeholder review
template; `.openai/hosting.json` retains Sites project metadata. Neither proves a
live production cutover. See `docs/DEPLOYMENT_READINESS_REPORT.md`.

## 12. Current Development Status

The repository is an Alpha supporting the principal guest-ordering and restaurant
service workflows. Billing source includes the recent live-rate/finalization fix;
older README statements that rates always freeze at session opening are superseded.
Some earlier README boundaries also predate implemented auth/operations tooling.

Production readiness remains conditional on infrastructure provisioning, deliberate
storage/auth cutover, real staff onboarding, mail/TLS verification, backup/recovery,
device/printer acceptance and suitable load/operational checks. Default legacy JSON
storage has a bounded capacity and serialized writes. Polling adds load as active
devices grow. Stand URLs can be shared remotely; a URL is not proof of physical presence.

Prior repository reports record lint/dependency issues and incomplete hosted/hardware
validation; no audit or test suite was rerun for this document. The working tree also
contains uncommitted frontend asset fixes, separate from this documentation commit.
This is suitable for controlled evaluation and an approved staging rehearsal, without
representing restaurant production acceptance or security certification.

## 13. Future Opportunities

Priorities consistent with the vision are the complete POS/cashier roadmap in
section 9; sound/push notifications; operational reporting; reliable physical
receipt setup; approved independent-auth/normalized-D1 rollout; and a repeatable
smart-stand design, provisioning, installation and replacement service. Commercial
subscription collection can follow explicit business/payment requirements. These
extensions need specifications and validation; ingredient-level inventory is excluded.

## 14. Presentation & Proposal Reference Notes

- **Short description:** Tab2Serve connects guests and restaurant teams through
  bilingual table-based ordering, shared bills and an intended branded QR/NFC stand service.
- **Positioning:** restaurant operations software plus a customized physical table
  touchpoint, designed to fit the venue's identity and interior.
- **Current demonstration:** open a table, scan its QR, customize/submit an order,
  progress it in the kitchen, request/finalize the bill, demonstrate Split Bill,
  and record one combined in-person cash/card settlement.
- **Audience:** restaurants, cafés and comparable table-service food businesses;
  owners/managers, service staff, kitchen teams and guests.
- **Software strengths:** shared session/order visibility, configurable menus,
  permissions, bilingual/RTL interfaces, tenant isolation, bill history and precise
  tax/service allocation. Describe intended business improvements without quantified claims.
- **Physical offer:** proposed restaurant-branded QR/NFC stands with a visible
  table ID and suitable material/finish choices. Software links exist; manufacture
  and installation must be confirmed separately in each proposal.
- **Roadmap:** full cashier POS, discounts/refunds/voids, shifts/cash handover,
  reconciliation, dedicated reporting and sound/push alerts are future capabilities.
- **Technical facts:** React/Vinext/Vite, Cloudflare Worker/D1 adapters, EGP integer
  amounts, polling, configurable independent authentication, and prepared Cloudflare
  domain/subdomain deployment templates. Current live infrastructure is unverified.
- **Claims requiring evidence:** public production launch, registered domain
  ownership, manufactured/installed stands, verified NFC/printer compatibility,
  customer counts/testimonials, market leadership, audited security, fiscal compliance,
  measured uptime/load capacity or proven sales/labor savings. Do not present online
  acquiring, automated subscription billing, full POS or ingredient inventory as available.
