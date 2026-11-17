# Performance, scalability and reliability

## Measured, bounded local evidence

`node tests/project-audit.integration.mjs` ran 20 sequential reads in a disposable
normalized workerd/D1 fixture: 2 synthetic restaurants, 100 released history
sessions per venue. Ten full snapshots and ten conditional 304 reads were timed.
These figures are local loopback/harness timing, not internet latency, Worker CPU,
capacity, production p95 or a performance SLA.

| Metric | Full snapshot | Unchanged conditional snapshot |
| --- | ---: | ---: |
| Samples | 10 | 10 |
| Median wall latency | 24.01 ms | 7.11 ms |
| p95 (small-sample maximum) | 44.78 ms | 8.47 ms |
| Snapshot-repository rows read | 744 | 9 |

The diagnostic header counts cover the updates repository, excluding strict
independent-auth and tenant-routing reads. No changed command was required
between full snapshots: they omit If-None-Match to measure response construction.
Full raw measurements and limitations are in evidence/performance.json.

Node harness CPU delta was about 16,000 user microseconds for the sample interval;
its RSS was roughly 250 MiB before/after. **Neither measures the separate
workerd isolate's CPU/memory** and must not be compared to the Worker 128 MiB
limit. No per-isolate memory ceiling or paid-plan KDF benchmark was demonstrated.

Existing production integration also verifies 18 simultaneous distinct orders
plus eight identical retries yield exactly 18 records/correct totals. Conflicts
are bounded/retried in the test; this verifies consistency, not a venue-count
throughput guarantee. Local HTTP lifecycle race scripts passed.

## Implemented reliability mechanisms

Per-tenant normalized CAS with atomic batch rollback, unique occupancy/keys,
server order/session version checks, frozen final bills and immutable price
snapshots protect consistency. Different restaurants do not share one application
revision. Legacy mode still serializes the entire platform JSON. Surfaced 409s
must be refreshed/reviewed, not blindly suppressed or treated as success.

Polling has one in-flight request, completion-based scheduling, abort/timeouts,
epochs for stale responses, hidden/offline pauses and Retry-After/exponential
backoff. A 401/403/404/410 blocks ordinary retry until a deliberate refresh.
Mutations are not automatically replayed. Order notifications compare IDs, not
just counts. These mechanisms passed deterministic transport/clock tests; real
wireless reconnect/device acceptance is untested.

## Bottlenecks and scaling limits

- Normalized mutation/public/initial reads still reconstruct a full restaurant
  and diff histories in memory. Updates are bounded/indexed for historical views,
  but live data can grow with outstanding/unserved work. Retention matters.
- Unchanged 304 responses still invoke auth/routing/metadata SQL. Current ETags
  are tenant-revision based, so an unrelated change inside one venue can force
  snapshots for all of its screens.
- A shared D1 per environment still shares database throughput/size. Paid D1's
  per-database size limit is 10 GB; SQL/parameter/batch limits and the app's
  800-statement cap can become operational limits. See
  [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
- Native limiters are per-location approximations. Shared-NAT staff/guest traffic
  must fit the proposed 1,200 read/minute and 60 guest-write/minute budgets;
  table write limits and auth DB counters add their own constraints. HEAD bypass
  is an unresolved gap, not an allowed scaling path.
- Password derivations use memory-hard scrypt, capped at two per isolate; CPU
  ceiling 1,000 ms in deployment templates is provisional. Shed login bursts
  before KDF rather than multiplying memory indefinitely.
- run_worker_first invokes the Worker for assets. Current secureResponse applies
  private/no-store globally; public versioned asset cache optimization is a future
  carefully scoped change, not applied during this audit.
- No push transport, database sharding/archive/retention service, offline
  ordering queue, automatic payment gateway reconciliation or multi-region soak
  measurements exist.

## Monthly estimate (assumptions, not measurements)

Per venue: 11 visible screens average, 10 hours/day, 30 days/month, 1,800
polls/screen-hour, 300 orders/day, 8 mutations/order, plus 10% request headroom.
This gives 6.606M Worker requests/venue/month. Model 5 ms average CPU/request,
30 average D1 rows read/request and 50 billed rows written/mutation. Small staging
adds 0.2M requests, 1M CPU-ms, 6M rows read, 0.1M writes and 0.2 GB. Modelled
storage is 0.1 GB/production venue, not a measured growth forecast.

| Scale + staging | Requests | CPU-ms | Rows read | Rows written | Storage | Compute + D1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 venues | 13.412M | 67.06M | 402.36M | 7.30M | 0.40 GB | ~$6.76/month |
| 10 venues | 66.260M | 331.30M | 1,987.80M | 36.10M | 1.20 GB | ~$27.90/month |
| 100 venues, sensitivity only | 660.800M | 3,304M | 19,824M | 360.10M | 10.20 GB | ~$579.72/month |

The last row is not approved capacity: its assumed production store reaches
10 GB. Account allowances are shared with other workloads. Rates/formulas use
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/); see
the full [usage preparation document](../CLOUDFLARE_USAGE.md). These are estimates
excluding mail, backups, domain/certificates, monitoring, taxes and optional
products. At the current pre-December log rate, one event/request at 100% sampling
adds about $0/$27.76/$384.48 respectively, before extra events. Cloudflare states
logging pricing changes **1 December 2026**: reprice it at actual launch.

The observed 744/9 repository-row contrast shows why a fixed 30-row average can
be optimistic when many snapshots change. It is not a replacement for a weighted
strict-mode trace. At 10 venues, production 3,000 average reads/request instead
of 30 would add ~$173.19/month in D1 reads; 20 ms average CPU instead of 5 raises
compute+D1 to about $47.72. Index writes, auth counters and history growth must
be measured rather than counted as one write per API call.

## Next measurement gate

After dependency remediation, run bounded hosted staging tests at expected
screen/NAT/order concurrency and the largest retained tenant. Record per-route
CPU p50/p95/p99, actual D1 meta rows/latency, batch sizes, contention/409/429 rates,
memory/CPU limit errors, bytes and restore duration. Agree a supported operating
envelope and archive/retention policy. Do not extrapolate this 20-request fixture
into a claim of production reliability or a hard monthly dollar cap.
