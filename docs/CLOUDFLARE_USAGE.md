# Monthly Workers and D1 estimate

Planning estimate on 17 November 2026; USD before tax, not measured traffic or a
quote. No plan was purchased. Cloudflare account allowances are shared with other
Workers/databases, including staging. Replace these assumptions with staging
analytics before setting a budget.

## Request model

The foreground poll interval is approximately two seconds **after completion**,
up to about 1,800 polls per visible screen-hour. Hidden/offline tabs pause and
failures back off. A 304 still invokes the Worker and runs authorization/revision
queries; it saves payload and deeper reads, not the request charge. Native
read limits are per client IP/location, so busy venues behind one NAT must be
measured. Guest write limits also check a table key.

Per restaurant, assume 10 service hours/day, 30 days/month, 3 continuously visible
staff screens and an average of 8 visible guest screens; 300 orders/day and 8
mutations per order (ordering, kitchen, billing/payment/session actions); 10%
additional reads/assets/auth/health beyond polls. Count all asset requests as
Worker invocations because `run_worker_first=true`; do not assume free asset-only
handling for this configuration.

```
polls = 11 screens * 10 hours * 30 days * 1,800 = 5,940,000
requests = polls * 1.10 + 300 orders/day * 30 days * 8 = 6,606,000 / venue
CPU assumption = 5 ms/request average, including auth amortized across requests
D1 assumption = 30 rows read/request average; 50 billed rows written/mutation
```

These row assumptions include auth/routing and change snapshots, not just the
rows returned to the client. Indexed unchanged polling is cheaper than changed
snapshots; mutation loads still read/diff full tenant history. Large venues can
exceed these assumptions substantially. Each changed index entry also contributes
to billed writes. Use D1 `meta.rows_read`/`rows_written` and dashboard metrics,
not SQL statement counts, to replace the estimates.

## Estimate including a small staging allowance

Include staging at 0.20M requests, 1M CPU-ms, 6M rows read, 0.10M rows written,
0.20 GB. Production storage allowance below assumes 0.10 GB per restaurant; actual
history/audit/index growth and retention require measurement. Cron/readiness
overhead (8,640 scheduled runs/month per environment) is covered by this planning
headroom; measure cleanup's writes separately. CPU is active processing, not
network wait or the wall time reported by local tests.

| Scale | Requests M | CPU-ms M | D1 rows read M | D1 rows written M | Storage GB | Workers compute + D1/month |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 restaurants + staging | 13.412 | 67.06 | 402.36 | 7.30 | 0.40 | ~$6.76 |
| 10 restaurants + staging | 66.260 | 331.30 | 1,987.80 | 36.10 | 1.20 | ~$27.90 |
| 100 restaurants + staging | 660.800 | 3,304.00 | 19,824.00 | 360.10 | 10.20 | ~$579.72 |

The 100-restaurant row is a sensitivity example, **not an approved capacity**:
a paid D1 database has a 10 GB limit, so the assumed 10 GB production store is
already at its limit. Design retention/sharding or other storage before that
point; account-wide storage allowance is different from per-database limits.

Rates used: Workers Paid $5/month minimum, 10M requests and 30M CPU-ms included;
$0.30/additional M requests and $0.02/additional M CPU-ms. D1 includes 25B reads,
50M writes and 5 GB; overages $0.001/M reads, $1/M writes and $0.75/GB-month.
See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

```
Workers = 5 + max(0, requestsM-10)*0.30 + max(0, cpuMsM-30)*0.02
D1 = max(0, readsM-25000)*0.001 + max(0, writesM-50)*1
     + max(0, storageGB-5)*0.75
```

The template logs one application event/request at 100% sampling. Under the
current pre-December pricing, logging would add about $0 / $27.76 / $384.48 to
the three rows respectively (20M events included, then $0.60/M), before extra
events. Cloudflare announces an Observability pricing transition on **1 December
2026**: reprice logs at launch; these log figures are not valid after that change.
See [Workers Logs pricing](https://developers.cloudflare.com/workers/platform/pricing/#workers-logs).

Excluded: mail provider, domain renewal, certificate products, external monitoring,
backup destinations, tax, existing account usage and optional paid zone products.
Images are external HTTPS URLs; R2 is not required by this release. No online
payment processing fees are estimated because no payment gateway is implemented.

## Sensitivity and operating budget

At 10 venues, 20 ms average CPU instead of 5 raises Workers/D1 compute from
~$27.90 to ~$47.72. Increasing production reads from 30 to 3,000 rows/request raises
10-venue reads to ~198.186B and adds ~$173.19 in D1 reads. Retained history and
frequent changed snapshots matter much more than unchanged 304 payload size.
Doubling visible screen-hours approximately doubles polling requests.

Measure login KDF separately (about 16 MiB working memory per derivation with
two concurrent derivations allowed by this code). The 128 MiB Worker isolate
also holds framework and tenant state. A successful local scrypt test is not a
paid production CPU/memory benchmark. No WebSocket, SSE or durable push system is
implemented to remove polling costs.

Propose an initial owner-approved $15/month compute+D1 budget for two venues,
excluding the services above; alert at 50/80/100% and watch daily requests,
CPU, D1 storage, rows/request, log ingestion and per-route errors. Set actual
billing/usage notifications after approval; no alerts were configured here.
The CPU ceiling and rate limits are safeguards, not a hard dollar cap. Review
growth weekly, retain financial history per an approved policy, and scale only
after measured staging results and the
[D1 platform limits](https://developers.cloudflare.com/d1/platform/limits/) review.
