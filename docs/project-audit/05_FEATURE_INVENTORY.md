# Feature inventory

Classification concerns actual source and local evidence. **Implemented** does
not imply hosted/mobile/device acceptance. **Missing** is not necessarily a
defect when outside the product's intended scope.

| Feature | Classification | Source and evidence / limits |
| --- | --- | --- |
| Guest ordering | Implemented | app/tab2serve.tsx Guest/cart, lib/domain.mjs guest.order; domain/HTTP/Worker tests pass. Requires staff-opened session. |
| QR table identity | Implemented | app/qr.tsx uses qrcode, table modal builds origin-specific stable table URL. Download/copy exists; device scan not verified. |
| Physical NFC | Partially Implemented | Same copyable URL is intended for an NFC tag; no tag-writing/hardware service or actual tap evidence. |
| Public restaurant/menu page | Implemented | app/page.tsx, restaurant-designs, tenant-views/public-projection; public views exclude staff/private fields. |
| Menu/category management | Implemented | menu.save/category.save/availability in domain and dashboard; tests cover translations/settings/snapshots. |
| Modifiers, quantity, notes | Implemented | linesFrom, validateCommand; 1–40 lines, quantity 1–30, <=10 modifiers; prices from server snapshot. |
| Browser cart and submission | Implemented | Guest basket local state; no saved cart or transactional online checkout. Refresh before submit can lose cart contents. |
| Multiple-person Split Bill calculator | Implemented | app/split-bill.tsx, lib/share-calculator.mjs; pure unsaved local plan, quantity bounds, proportional charges, exact rounding, remainder. No payment allocation. |
| Tax and service | Implemented | domain bill(), per-session BPS snapshots and integer minor units; calculator/SQL/domain tests pass. Configuration is not a claim of tax-law compliance. |
| Table management and token rotation | Implemented | table.save/table.rotate_token permissions, label uniqueness and enabled/billable fields; rotation revokes old stand link/capability. |
| Session open/reopen/request/finalize/release | Implemented | domain lifecycle, version checks/partial uniqueness; HTTP race and stale-capability tests pass. |
| New service on same permanent table | Implemented | session.open may release an already FINALIZED session, retaining old unpaid balance/history; not equivalent to settling it. |
| Duplicate submissions/payments | Implemented | Keys return previous result for matching order/payment data, conflicting reuse 409; concurrent tests pass. Mutations are not automatically replayed by polling. |
| Guest order edits | Implemented | Pending/Accepted only, versioned, retained snapshot pricing; Preparing locks that order. Shared table guests may edit each other's eligible orders by design. |
| Cancellation/void/refund | Missing | No command/status branch or UI; only PENDING/ACCEPTED/PREPARING/READY/SERVED. Do not advertise refunds/cancellations. |
| Bill request and lock | Implemented | guest.bill, BILL_REQUESTED and explicit staff reopen; deduplicates outstanding requests. |
| Frozen final bill | Implemented | billing.finalize with expectedVersion/expectedTotal and preserved finalBill/bills row. |
| Full combined bill settlement | Implemented | billing.pay enforces exact due, expected total, cash/card and key; rejects arbitrary diner payments. |
| Online card payment | Missing | Card is recorded physical payment, not a gateway charge. No provider/webhook/refund integration. |
| Browser receipt | Implemented | billing.print + receipt modal/window.print; draft vs final permission checks. |
| Silent/fiscal/physical printer integration | Missing / Not Verifiable | No ESC/POS bridge/e-invoice implementation; physical 80 mm output not tested. |
| Restaurant dashboard | Implemented | app/tab2serve.tsx, scoped staffView/update projections; backend and SSR pass, complete hydrated UI acceptance blocked. |
| Kitchen/order queues | Implemented | Role-checked forward status transitions and active pending history retention; runtime tests pass. |
| Service calls and private feedback | Implemented | Deduplicated requests with workflow, bounded ratings/comments, permission-filtered feedback; domain/storage tests pass. |
| In-app order notifications | Implemented | createOrderTracker detects new IDs and displays a transient toast. No external push service or implemented audio alert was found. |
| Sync/reconnect | Implemented | Poller one in-flight request, pause/background/offline, abort/stale epoch, backoff/Retry-After, ETag/304; tests pass. No WebSocket/SSE. |
| Offline ordering | Missing | No durable offline mutation queue; backend network required. |
| Historical paging | Implemented | updates-repository live/history/feedback/service/activity, 50/150-row pages, indexed normalized path; other initial/mutation paths remain full tenant. |
| Per-restaurant tax/content/settings | Implemented | settings.save limits rates and rejects design settings on restaurant authority; values snapshotted into sessions. |
| Restaurant design customization | Implemented | Super Admin-only registry/config/draft/publish/revert/private bilingual preview; strict safe fields/URLs; tests pass. Not arbitrary uploaded code/CSS. |
| Multi-restaurant relational storage | Implemented | normalized-store/model, staged schema v3 and composite FKs; actual production activation Not Verifiable. |
| Legacy shared-JSON compatibility | Implemented | store.ts app_state + CAS, default unless changed; strict production guard prevents its use. |
| Super Admin | Implemented | Explicit owner + independent Super Admin role + TOTP, admin origin, recent-auth sensitive commands; tests pass. |
| Subscription/setup controls | Partially Implemented | platform.update and admin UI configure status/rates/setup/billable tables. No subscription charging/invoicing gateway. |
| Independent authentication | Implemented | auth-service/crypto/server: invited accounts, scrypt, opaque sessions, CSRF/TOTP/recovery; combined strict two-restaurant test passes. Hosted mail/key recovery not verified. |
| Staff roles and permissions | Implemented | Explicit permission arrays/memberships checked server-side; inactive staff and foreign objects denied. |
| ChatGPT/Sites independence | Implemented in strict mode | No identity outbound request in strict two-venue test; compatibility paths remain, require correct env configuration. |
| Wildcard restaurant routing | Implemented | tenant-routing/context and Worker; reserved/unknown/foreign host tests pass; actual public routes/DNS/TLS Not Verifiable. |
| Customer-owned external domains | Missing | Slugs under configured roots only; no arbitrary tenant custom-domain onboarding. |
| Core Arabic/English content and RTL | Implemented | i18n/catalogs/provider, translated content fields/errors/permissions; translation tests and bilingual SSR previews pass. Visual RTL browser acceptance blocked. |
| Authentication/account Arabic | Partially Implemented | auth-form.tsx/account-tools.tsx/auth API errors still contain English-only text. |
| Mobile responsiveness | Partially Implemented | Responsive CSS/media queries, logical RTL styles, mobile navigation; automated layout tests blocked and physical-device checks not run. |
| Accessibility | Partially Implemented | Dialog aria-modal/name, focus trap/restore/Escape, labels and polite status live regions in source. No full keyboard/screen-reader/contrast audit passed. |
| Health/logging/cleanup | Implemented | healthz/readyz, redacted request event, scheduled monitor and expired-auth cleanup; actual cron/alert/external uptime setup Not Verifiable. |
| Encrypted backup/recovery tooling | Implemented | backup.mjs/CLI, D1 restore tests; remote automation, retention and measured restore targets Not Verifiable. |
| Production deployment | Not Verifiable | Templates/dry-runs pass; real accounts, DB IDs, secrets, certificates, mail and live dataset not audited. |
| Whole-project lint quality gate | Broken | Repository lint exits 1 with 10 errors and 135 warnings; no source fixes applied. |
| Existing browser test harness | Broken in current checkout | Four Playwright imports fail because dependency is absent; no browser assertions execute. |
