# Internal Testing Rollout Plan

> Gate before any brand touches the OS. "Works in tests" ≠ "works on a real
> brand's messy data." This plan is the bridge between spec-conformant build
> and the first internal session where something real breaks.
>
> Current build state: verified @ `d7bb573`. Phase 1 logic is complete.
> What remains is **hardening, seeding, and environment wiring** — not new
> features.

---

## What "ready for internal testing" actually means

Three conditions, in order. All three must be true before the first brand connects:

1. **The engine runs on real credentials** — not mock tokens; real ad account,
   real Shopify, real data flowing through.
2. **The scheduler and settling window survive a restart** — in-process timers
   die on deploy; a brand shouldn't lose a pending verification because the
   process cycled.
3. **The onboarding path is observable** — every screen a brand touches is
   logged so you can see exactly where they stall without guessing.

---

## The gap map (verified against `d7bb573`)

### Gap 1 — In-process timers (hardening debt, blocks production reliability)

| File | Line | Problem |
|------|------|---------|
| `poas_scheduler.ts` | ~15 | `setInterval` — dies on restart, loses per-tenant schedule |
| `governance_engine.ts` | ~509 | `setTimeout` in settling window — a 24–72h window becomes 0h if process restarts |

**Fix:** replace with a persisted job queue. The repo already uses patterns that
can absorb a lightweight durable scheduler — a `pending_jobs` table in Supabase
with a polling worker is enough for Phase 1. BullMQ+Redis is the Phase 2 upgrade.

**Why it blocks internal testing:** if the process restarts between a brand's
action and its verification window closing, the audit trail is silent — the brand
acted, nothing verified, the trust ledger doesn't update. That's exactly the
behaviour that erodes confidence in a first session.

---

### Gap 2 — Real credential wiring (blocks first real connection)

Everything in `google_ads_adapter.ts`, `meta_ads_adapter.ts`, and
`supabase_client.ts` runs correctly behind real credentials — the REAL-WITH-MOCK-FALLBACK
pattern is correct. But `config.ts` still falls back to `mock-*` values when
env vars are absent, which means the first real brand connect silently reads
mock data unless the environment is wired up.

**Fix:** a `.env.example` file listing every required var, and a startup guard
that refuses to run (rather than silently mock) in non-test environments when
real creds are missing. The test suite keeps its mocks; the live server is
honest about what it has.

**Required vars for a first real brand connection:**
```
SUPABASE_URL
SUPABASE_KEY
GOOGLE_ADS_CLIENT_ID
GOOGLE_ADS_CLIENT_SECRET
GOOGLE_ADS_DEVELOPER_TOKEN
META_ADS_APP_ID
META_ADS_APP_SECRET
```

---

### Gap 3 — Onboarding path observability (blocks diagnosing stalls)

The `onboarding_simulator.ts` console flow works but produces no structured log.
When a brand stalls, you have no way to replay *where* without a recording.

**Fix:** emit a structured `onboarding_event` at each stage transition:
```
{ tenantId, stage, event, timestamp, durationMs, data? }
```
Stages: `goal_declared → connected → sweep_started → sweep_complete →
first_poas_computed → first_healing_card_shown → first_action_taken`

Persist to a Supabase `onboarding_events` table. No new infra — same client
that already exists. This is also the instrumentation `VALIDATION_PLAN.md`
needs for measuring time-to-readiness.

---

### Gap 4 — Auth for a real multi-brand session (blocks agency/multi-brand use)

`auth.ts` has a native HS256 JWT implementation that works. The gap is
**org hierarchy** — a single user connecting multiple brands currently requires
separate tokens. For the internal test with brands you already have, this means
you'd need to wire each brand as a separate tenant with its own credentials.

This is acceptable for Phase 1 internal testing *if* you're testing one brand
at a time. Flag it as Phase 2 (WorkOS / Clerk) before opening to external brands
that expect portfolio management.

---

### Gap 5 — Bank connections (open, non-blocking for most brand profiles)

`rbi_aa_adapter.ts` exists with a simulated HDFC account. Plaid equivalent is
not present. For internal testing with brands that have:
- Google Ads + Shopify data → cash runway works from Shopify revenue, not needed
- Only need actual bank balance for the runway-vs-spend throttle

**Verdict:** non-blocking for internal testing. The throttle degrades gracefully
to revenue-based runway. Flag clearly to the brand that bank connections are in
progress and the runway figure is conservative until connected.

---

### Not a gap — confirmed live

| Item | Evidence |
|------|----------|
| §7 Cross-channel guards (organic rank demote) | `risk_radar.ts:640–679` — live |
| §8 Confidence gates (estimatedCogs → medium, low spend → suppress) | `risk_radar.ts:663–674`, `745` — live |
| All 5 sweep checks, sorted by severity→dollarImpact | `onboarding_simulator.ts:482–521` — live |
| Zero-order cold-start + `MarginDiscoveryResult` union | `onboarding_wizard.ts` — live |
| `CampaignCostBreakdown` seam (L1↔L2) | `poas_calculator.ts` + `healing_types.ts` — live |
| Healing cards: three-zone (OS acts / user decides / ads can't fix) | `risk_radar.ts` prescriptions — live |

---

## Sequenced rollout — 4 steps

### Step 1 — Harden the timers (1–2 days)

**In `poas_scheduler.ts`:** replace `setInterval` with a `schedulePoasJob`
function that writes a `{ tenantId, nextRunAt, type:'poas_daily' }` row to
Supabase and a polling worker that picks up overdue jobs on a 5-min tick.

**In `governance_engine.ts`:** replace `setTimeout` in the settling window with
a persisted `{ actionId, verifyAt, type:'settling_window' }` row. The polling
worker handles both job types.

This is ~80 lines of new code. No new infra. Enables safe restarts.

---

### Step 2 — Wire real credentials + startup guard (half a day)

Add `.env.example` to the repo root listing every env var with a comment on
where to get it. Add a `validateEnv()` call in `config.ts` that throws with a
clear message (not a silent mock fallback) when required vars are missing in
non-test mode. Set `NODE_ENV=test` to keep the test suite on mocks.

---

### Step 3 — Add onboarding event log (half a day)

Add an `onboarding_events` table to the Supabase schema (tenantId, stage,
event, timestamp, durationMs). Instrument `onboarding_simulator.ts` to emit
at each of the 7 stage transitions listed above. Add a simple
`getOnboardingTrace(tenantId)` query for replaying a brand's session.

---

### Step 4 — First internal session (the real test)

Connect one brand you already have access to. Run the sweep. Watch the
onboarding trace. The things that will break:
- COGS coverage will be low → the Profit Readiness indicator will surface this correctly
- At least one campaign will have surprising POAS → that's the teardown moment
- Something in the sweep will surface a finding the brand didn't know → that's the H1 test in miniature

After the first session, update `VALIDATION_PLAN.md` with observed stall points
before opening to the second brand.

---

## What this unlocks (the phase gate)

Once Step 4 runs on 2–3 brands you already have:
- You know which stall points are real (vs. spec-predicted)
- You have onboarding traces to compare across brands
- The healing cards have been validated by a human who knows the real account
- You know whether the POAS number triggers action or anxiety

**Then** the founding-cohort recruitment page (`RECRUITMENT_LP.md`) opens —
with real evidence, not just architecture.

---

## What's explicitly out of scope until after internal testing

- Baseline Scan (Stage 0 observable scan) — spec written, not built, not needed to test the core loop
- Email / organic / GA4 channels — Phase 2
- Bank connections (RBI AA / Plaid) — non-blocking, Phase 1 tail
- WorkOS / Clerk agency SSO — Phase 2
- Codat / Rutter aggregator — Phase 2 (COGS entry is manual/CSV for now)
- Public LP — Phase 2 gate

None of these block the internal test. The internal test is specifically designed
to stress what *is* built — POAS truth, healing cards, sweep findings, cold-start.
