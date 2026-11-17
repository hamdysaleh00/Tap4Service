# Tab2Serve project audit

Evidence-based audit dated **17 November 2026**, Africa/Cairo. Scope: the
working tree based on `dc16595384a1bfe1baa5f63bd4096ac8a3bdf52f`, both available
local history roots, isolated test databases, and the configured GitHub repository.

**Verdict: NO-GO for public production.** Functional backend checks pass, but
critical dependency advisories, a reproduced HEAD rate-limit bypass, failed
lint, incomplete browser acceptance, and unverified hosted operations remain.
This audit supersedes the earlier deployment-preparation assessment where it
adds new evidence. It does not assert that the live Sites installation is running
the inspected candidate or has been compromised.

1. [Executive summary](01_EXECUTIVE_SUMMARY.md)
2. [Project history and timeline](02_PROJECT_HISTORY.md)
3. [System architecture and request flow](03_SYSTEM_ARCHITECTURE.md)
4. [Database audit, ER diagram and complete schema dictionary](04_DATABASE_AUDIT.md)
5. [Feature inventory](05_FEATURE_INVENTORY.md)
6. [Functional test results and frontend limitations](06_FUNCTIONAL_TEST_RESULTS.md)
7. [Security audit and reproduction evidence](07_SECURITY_AUDIT.md)
8. [Performance and scalability](08_PERFORMANCE_AND_SCALABILITY.md)
9. [Deployment readiness, Hostinger and Cloudflare](09_DEPLOYMENT_READINESS.md)
10. [Bugs and technical debt](10_BUGS_AND_TECHNICAL_DEBT.md)
11. [Prioritized recommended action plan](11_RECOMMENDED_ACTION_PLAN.md)
12. [Test execution log](12_TEST_EXECUTION_LOG.md)

Reports distinguish **verified facts**, **inferences**, and **unknowns**. PASS
means a named command/assertion actually ran; BLOCKED is not PASS. A test that
reproduces an insecure behavior is evidence of a defect, not a passing security
control. No application fixes, dependency upgrades, deployments, live DNS changes,
production queries or production data changes were made during this audit.

Reproduction scripts are `tests/project-audit-{runner,scan,schema}.mjs` and
`tests/project-audit.integration.mjs`. Raw local logs and synthetic state are
under ignored `outputs/project-audit/`; earlier full verification logs are under
`outputs/cloudflare-verification/`. Selected sanitized evidence is in this
directory's `evidence/` subdirectory. Raw state/backups are not uploaded.

GitHub target: [hamdysaleh00/tab2serve](https://github.com/hamdysaleh00/tab2serve),
existing branch `main`. Commit/push verification is recorded after the audit
payload is committed; see the synchronization receipt and final delivery message.
The reports cannot embed the hash of a commit containing their own final bytes.

## Verified source upload

The [synchronization receipt](SYNCHRONIZATION.md) records the successful exact-tree
upload to `codex/project-audit-2026-11-17` after Git CLI authentication failed.
GitHub main was left unchanged; review/merge is the remaining integration step.
