# P1 Remaining — Punch List (spec vs. landed)

> **Status now lives in [`00-REMAINING_WORK.md`](./00-REMAINING_WORK.md)** — the
> single consolidated plan. This file is kept for the detailed P1 evidence trail.
>
> Re-diffed against upstream `chandansinghr-ship-it/brand-digital-twin` @ `91bbbbd`
> (2026-06-06). **Most of P1 has since landed** — only P1.3 and P1.7 remain.

| Ticket | State | Evidence / gap |
|--------|-------|----------------|
| P1.1 atomic job claim | ✅ **DONE** | `claimNextOverdueJob` (`supabase_client.ts:1941`), `schema.sql:346` `FOR UPDATE SKIP LOCKED`, used in `poas_scheduler.ts:63`, **verified** by `tests/e2e/claim_concurrency_test.ts` |
| P1.2 observability | ✅ **DONE** | `MetricsTracker` alert rules (backlog size, latency, failure-rate thresholds) + `DatabaseErrorSink` with recursion redaction scrubber (`observability.ts`, `migrations/0002_create_error_events.sql`); verified by `observability_test.ts`. |
| P1.3 CI/CD + staging | 🟡 **OPEN** | UI CI (`brand-twin-app-ci.yml`) + engine `build.yaml` landed. **Staging env + one-command deploy/rollback still not evidenced.** |
| P1.4 DB safety | ✅ **DONE** | Versioned migrations (`migrations/0001_init.sql`, `0002`) + migration runner + backup export + tested restore drill (`supabase_client.ts`, `supabase_client_test.ts`). |
| P1.5 secrets | ✅ **DONE** | `SecretProvider` / `EnvSecretProvider` / `ManagedSecretProvider` (VaultClient) integrated into server boot validation; `validateEnv()` stays the boot guard. |
| P1.6 security review | ✅ **DONE** | npm-audit CI step, scrubber-based token-leak log redaction checks, cross-tenant OAuth callback-state validation + `governance_adversarial_test.ts` (403 lines). |
| P1.7 load test | 🟡 **OPEN** | Job-claim concurrency test done. **Broader load (N-tenant sweep/healing, SSE fan-out) not done — this is the P1 exit gate.** |

---

## The actual remaining work (only 2 items left)

### P1.3 — staging + release  🟡 OPEN
- [ ] Staging environment mirroring prod.
- [ ] Build-once-promote: the CI artifact is what deploys.
- [ ] One-command deploy + one-command rollback (governance engine already has a
      rollback primitive — wire it).

### P1.7 — load test (the exit gate)  🟡 OPEN
- [ ] Extend the concurrency test into a real load run: N concurrent tenants on
      sweep + healing, SSE fan-out at connection count, ≥2 workers on the queue.
- [ ] Read P1.2 instrumentation during the run; latency + error rate within budget.

---

## Done since the original P1 spec (landed upstream by `91bbbbd`)
P1.1 atomic claim (+ concurrency test) · **P1.2** durable error sink + alert rules
+ redaction · **P1.4** versioned migrations + backup/restore drill · **P1.5**
SecretProvider/Vault integration · **P1.6** npm-audit gate + token-leak scan +
OAuth callback-state validation + adversarial tests · `/ready` DB-ping ·
HTTP server hardening · UI + engine CI.
