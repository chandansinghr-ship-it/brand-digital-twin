# Remaining Work — Single Consolidated Plan

> **This is the one file to read.** It supersedes the scattered `P0-EXECUTION`,
> `P1-EXECUTION`, `P1-PUNCHLIST`, `P2/P3/P4-EXECUTION` docs — those remain as
> detailed references, but status lives **here**.
>
> Verified against upstream `chandansinghr-ship-it/brand-digital-twin` @ `91bbbbd`
> (fetched 2026-06-06). Engine work lands in that repo; UI work lands in
> `brand-twin/app/` (this repo).
>
> **Legend:** ✅ done · 🟡 partial · ☐ to build · ⚠️ done-but-unpushed
> **Sizes:** S ≤0.5d · M 1–2d · L 3–5d · XL 1–2wk

---

## Where we are (the honest summary)

The **engine + UI are far more complete than older specs imply.** The full POAS
engine, governance/trust ledger, healing, sweep, MCP agents, native auth, OAuth
connect, and the entire `brand-twin/app/` UI are built. Since the last punch
list, **most of P1 hardening also landed upstream** (observability, DB safety,
secrets, security review).

| Phase | State | One-line |
|-------|-------|----------|
| **P0** — flip UI mock→live | 🟡 **2 tiny fixes unpushed** | all 4 endpoints live; sweep-sort + autonomy-409 sit in local `2295891` |
| **P1** — hardening & ops | 🟡 **~80% done** | P1.2/1.4/1.5/1.6 ✅; only staging (P1.3) + broad load test (P1.7) left |
| **P2** — private beta (3 brands) | ☐ not started | spec imported; the trust gate before public doors |
| **P3** — lawful & paid | 🟡 **B mostly done, C untouched** | legal/data-rights largely landed; **all of COGS + billing unbuilt** |
| **P4** — GA | ☐ blocked on A0 | external approval clocks — start now, gate launch only |

**The real frontier:** P1.3 + P1.7 (close P1) → P2 beta → **Phase C (COGS +
billing), which is the largest unbuilt chunk** → P4 GA.

---

## P0 — Flip the UI from mock to live  ⚠️ *2 unpushed fixes*

All four endpoints **exist and are live** upstream (`/integrations`, `/sweep`,
`/autonomy` GET+POST, `/auth/ticket`). Two spec-compliance fixes are written but
**not yet pushed upstream** — they live only in local commit
`brand-digital-twin@2295891` (on top of `91bbbbd`):

| # | Fix | File | Size |
|---|-----|------|------|
| P0.2 | `GET /api/v1/sweep` — sort `CRITICAL→WARNING→OPPORTUNITY` then `dollarImpact` desc | `server.ts:~1120` | S |
| P0.3b | `POST /api/v1/autonomy` — `409 TIER_NOT_EARNED` when raising above earned trust-ledger tier | `server.ts:~1181` | S |

**Action:** someone with write access to `chandansinghr-ship-it/brand-digital-twin`
cherry-picks `2295891` onto `main`. Then set `NEXT_PUBLIC_API_URL` →
`USE_MOCK=false`, and verify all 11 routes render live, sweep is severity-ordered,
and an over-raise on the autonomy dial shows the 409 state.

---

## P1 — Hardening & Ops  🟡 *~80% landed upstream*

| # | Item | State | Evidence / gap |
|---|------|-------|----------------|
| P1.1 | Atomic job claim | ✅ | `claimNextOverdueJob` + `FOR UPDATE SKIP LOCKED` + concurrency test |
| P1.2 | Observability | ✅ | `MetricsTracker` alert rules (backlog/latency/failure-rate) + `DatabaseErrorSink` w/ recursion redaction (`observability.ts`, `migrations/0002`) |
| P1.4 | DB safety | ✅ | Versioned migrations (`0001_init`, `0002`) + backup export + tested restore drill |
| P1.5 | Secrets | ✅ | `SecretProvider`/`EnvSecretProvider`/`ManagedSecretProvider` (VaultClient), boot-validated |
| P1.6 | Security review | ✅ | npm-audit CI gate, token-leak scrubber scan, OAuth callback-state validation + `governance_adversarial_test.ts` |
| **P1.3** | **CI/CD + staging** | 🟡 **OPEN** | UI CI + `build.yaml` landed; **staging env + one-command deploy/rollback not done** |
| **P1.7** | **Load test (exit gate)** | 🟡 **OPEN** | job-claim concurrency done; **N-tenant sweep/healing + SSE fan-out not done** |

### Remaining P1 work
- **P1.3** — staging environment mirroring prod; build-once-promote (the CI
  artifact is what deploys); one-command deploy + one-command rollback (wire the
  governance engine's existing rollback primitive). *Size: L · infra + `build.yaml`*
- **P1.7** — extend the concurrency test into a real load run: N concurrent
  tenants on sweep + healing, SSE fan-out at connection count, ≥2 workers on the
  queue; read P1.2 instrumentation during the run; latency + error rate within
  budget. **This is the P1 exit gate.** *Size: M · `tests/e2e/`*

---

## P2 — Private Beta (3 real brands)  ☐ *the trust gate*

No public signup. Onboard 3 in-bag brands by hand (real Google Ads + Shopify
OAuth). *Spec: `VALIDATION_PLAN.md` · files: `onboarding_simulator.ts`, `poas_scheduler.ts`.*

**Exit gate (must pass before any public exposure):**
- [ ] Each brand produces real POAS + live sweep + healing cards
- [ ] ≥1 healing recommendation per brand acted on with **measured POAS lift**
- [ ] Zero cross-tenant data leaks (verified in logs + DB queries)
- [ ] Full 7-stage onboarding telemetry trace per brand
- [ ] No false "ads can't fix" calls that were actually ad-fixable (manual audit)

---

## P3 — Lawful & Paid

### Phase B — Lawful (🟡 mostly landed; small gaps)
| # | Item | State | File |
|---|------|-------|------|
| B1 | Data rights: hard-delete cascade + signed export + anonymize | ✅ | `supabase_client.ts`, `poas_scheduler.ts` |
| B1.4 | Confirm credential-vault secret revocation is wired into delete cascade | ☐ verify | `credential_vault.ts` |
| B2.1 | `/legal/tos` `/privacy` `/dpa` routes exist — **need real counsel copy (A0.5)** | 🟡 | `server.ts:467+` |
| B2.2 | Acceptance log at signup + Consent Mode v2 redaction | ✅ | `user_auth.ts`, `server.ts:232` |
| B2.3 | Version-bump re-prompt on ToS change | ☐ | `user_auth.ts` |
| B2.4 | Cookie consent banner, essential-only default | ☐ | `brand-twin/app/` |
| **B4** | **Abuse: per-tenant quotas + new-account spend caps** (email verify ✅) | ☐ | `rate_limiter.ts`, `user_auth.ts` |
| B3.7 | `incident_response.ts` runbook + severity model | ☐ | `incident_response.ts` |
| B3.8 | In-app support + help center | ☐ | `brand-twin/app/` |

### Phase C — Self-serve value + money  ☐ *NOT STARTED — largest unbuilt chunk*

Confirmed @ `91bbbbd`: no `billing.ts`, no `payment_processor.ts`, no accounting
adapters, no `subscriptions` table, no `CostSource` interface. All of the below
is greenfield.

**C1 — COGS aggregator (8 items, ~XL total):**
- [ ] `CostSource` interface; conform `tally_adapter.ts` *(S)*
- [ ] `zoho_adapter.ts` (OAuth via A2) *(M)*
- [ ] `quickbooks_adapter.ts` *(M)*
- [ ] `xero_adapter.ts` *(M)*
- [ ] Silent COGS sweep on connect → auto-fill — `onboarding_wizard.ts` *(M)*
- [ ] Category-average estimator → `estimatedCogs` tag — `poas_calculator.ts` *(M)*
- [ ] Pareto COGS entry UI (top-spend SKUs) — `brand-twin/app/` *(M)*
- [ ] Readiness gate: low coverage → directional-only advice — `risk_radar.ts` *(M)*

**C2 — Billing + suggest-an-amount (7 items, ~XL total):**
- [ ] `subscriptions` table + state machine — new `billing.ts`, migration *(M)*
- [ ] Trial lifecycle jobs: day-14 nudge, day-15 flip, recurring, dunning *(M)*
- [ ] Day-14 nudge composed from stored findings *(S)*
- [ ] Day-15 suggest-an-amount screen — `brand-twin/app/` *(M)*
- [ ] Ops review queue → approve → first charge — `brand-twin/app/`, `billing.ts` *(M)*
- [ ] `PaymentProcessor` iface + Razorpay + tokenised card — new `payment_processor.ts` *(L)*
- [ ] In-house receipt/invoice generation — `billing.ts` *(S)*

---

## P4 — GA (open the doors)  ☐ *blocked on external clocks*

**A0 — external approval clocks. Start day 1; they gate P4 only, can't be compressed:**
- [ ] Google Ads Standard Access approved
- [ ] Meta `ads_read`/`ads_management` App Review approved
- [ ] Google OAuth consent screen verified (sensitive scopes)
- [ ] Shopify app listed / distributable
- [ ] Legal docs signed off by counsel (feeds B2.1)

**GA definition of done:**
- [ ] Stranger signs up → creates brand → connects Google Ads + Shopify via OAuth
      (no human) → sees live sweep, real POAS, healing cards
- [ ] New accounts at OBSERVE; no autonomous spend until earned
- [ ] No raw tokens logged/returned; state-forgery tests green
- [ ] Billing live; first self-serve paid conversion completed
- [ ] Rollback plan + incident runbook rehearsed

---

## Critical path & what to build next

```
A0 external clocks ───────────────────────────────────────► gate P4 only (start NOW)

P0 fixes ──► P1.3 staging ──► P1.7 load test ──► P2 beta ──► P3: B gaps + Phase C ──► P4 GA
(push 2295891)  (infra)       (P1 exit gate)   (trust gate)   (COGS+billing = the work)
```

**Next three concrete moves, in order:**
1. **Push `brand-digital-twin@2295891`** — closes P0 (2 tiny fixes, already written).
2. **P1.3 staging + P1.7 load test** — the only two P1 items left; P1.7 is the exit gate.
3. **Phase C (COGS + billing)** — the real remaining build (~2 XL blocks). Everything
   else (P2 beta, B-gaps) is small or operational by comparison.

**The honest number:** the engine/UI/hardening are largely done. What stands
between here and a *paying* public product is **P1.3+P1.7 (days), P2 validation
(weeks, mostly operational), and Phase C COGS+billing (the one genuinely large
greenfield block).** A0 clocks run in the background the whole time.
