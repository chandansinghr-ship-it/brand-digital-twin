# P1 Remaining — Punch List (spec vs. landed)

> **Status now lives in [`00-REMAINING_WORK.md`](./00-REMAINING_WORK.md)** — the
> single consolidated plan. This file is kept for the P1 evidence trail.
>
> **P1 is fully complete** as of upstream `cec5437` (2026-06-06).

| Ticket | State | Evidence |
|--------|-------|----------|
| P1.1 atomic job claim | ✅ **DONE** | `claimNextOverdueJob` (`supabase_client.ts:1941`), `FOR UPDATE SKIP LOCKED`, `tests/e2e/claim_concurrency_test.ts` |
| P1.2 observability | ✅ **DONE** | `MetricsTracker` alert rules (backlog/latency/failure-rate) + `DatabaseErrorSink` redaction scrubber (`observability.ts`, `migrations/0002`); `observability_test.ts` |
| P1.3 CI/CD + staging | ✅ **DONE** | `scripts/deploy.sh`, `scripts/rollback.sh`, `scripts/rollback_recent_actions.js`; governance engine rollback wired (`eb9c272`) |
| P1.4 DB safety | ✅ **DONE** | Versioned migrations (`0001_init`, `0002`) + migration runner + backup export + tested restore drill (`supabase_client.ts`, `supabase_client_test.ts`) |
| P1.5 secrets | ✅ **DONE** | `SecretProvider`/`EnvSecretProvider`/`ManagedSecretProvider` (VaultClient) integrated into server boot validation |
| P1.6 security review | ✅ **DONE** | npm-audit CI gate + token-leak scrubber log scan + OAuth callback-state validation + `governance_adversarial_test.ts` (403 lines) |
| P1.7 load test | ✅ **DONE** | `tests/e2e/specs/real_load_test.ts` (252 lines) + `/metrics` endpoint (`70bc7e8`) |
