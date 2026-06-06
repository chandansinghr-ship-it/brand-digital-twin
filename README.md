# Brand Digital Twin OS — working directory

> **This is a different project from Tanmatra** (the meal-delivery monorepo that
> owns this repo's root, `artifacts/`, `lib/`, and `CLAUDE.md`).

This folder is a **self-contained working space** for the Brand Digital Twin OS —
a profit-truth-based autonomous ad-ops platform whose engine lives in the
separate repo `chandansinghr-ship-it/brand-digital-twin`. The files here are the
strategy + architecture + build-spec set (and a runnable product-UI scaffold)
authored against that engine.

Nothing in here is part of the Tanmatra application. It is kept on the
`claude/jolly-mendel-zh6TR` branch and should **not** be merged into Tanmatra's
`main`.

## Contents

| Path | Role |
|------|------|
| `00-REMAINING_WORK.md` | Master tracker — 51 build units, status synced to upstream |
| `A0-PLATFORM_APPROVALS.md` | External-approval checklist (Google/Meta/Shopify/legal) |
| `A-PHASE_BUILD_SPEC.md` | Phase A — usable by a stranger (auth + OAuth + UI) |
| `A3-SCAFFOLD_SPEC.md` | Product-UI scaffold spec |
| `B-PHASE_BUILD_SPEC.md` | Phase B — lawful & trustworthy |
| `C-PHASE_BUILD_SPEC.md` | Phase C — self-serve value + money |
| `PROJECT_STATE.md` | Single-source-of-truth state doc — read first to resume |
| `IMPLEMENTATION_PLAN.md`, `PHASED_ROADMAP.md` | Sequenced roadmap |
| `ARCHITECTURE_VISION.md`, `USER_JOURNEYS.md`, `PROFIT_DATA_MODEL.md`, `HEALING_RECOMMENDATIONS.md`, `BRAND_BASELINE_SCAN.md`, `INTEGRATIONS_3P.md` | Design + strategy docs |
| `PUBLIC_LAUNCH_GAP.md`, `VALIDATION_PLAN.md`, `ROLLOUT_PLAN.md`, `RECRUITMENT_LP.md`, `RELEVANT_REPOS.md`, `LANDING_PAGE_DRAFT.md` | Launch, validation, GTM |
| `app/` | Runnable Next.js product-UI scaffold (A3) — copy into `brand-digital-twin` when wiring live |

## Production-readiness execution plan (P0 → P4)

The gated path from headless engine to public, self-serve, paid product. Start at
`PROD_READINESS_PLAN.md` (the master), then each phase has an execution doc with
ordered tickets + exit gate. Status is the diff against live upstream
(`brand-digital-twin` @ `fb03ddd`).

| Phase | Docs | Status |
|-------|------|--------|
| **Master** | `PROD_READINESS_PLAN.md` | 5 gated phases, invariants, critical path |
| **P0** — close the seams | `P0-EXECUTION.md` | ✅ all 4 endpoints landed upstream + tested |
| **P1** — hardening & ops | `P1-EXECUTION.md`, `P1-PUNCHLIST.md`, `P1.2-OBSERVABILITY_SPEC.md`, `P1.4-DB_SAFETY_SPEC.md`, `P1.5-SECRET_MANAGEMENT_SPEC.md`, `P1.6-SECURITY_REVIEW_SPEC.md`, `P1.7-LOAD_TEST_SPEC.md` | 🟡 floor done (atomic claim, /ready, validateEnv, CI); ops items open |
| **P2** — private beta | `P2-EXECUTION.md` (+ `VALIDATION_PLAN.md`) | 🔴 instrumentation + doors-closed enforcement to build |
| **P3** — lawful & paid | `P3-EXECUTION.md` (+ `B-`/`C-PHASE_BUILD_SPEC.md`) | 🟡 B1/B2 done; B4/C1/C2 open |
| **P4** — GA | `P4-EXECUTION.md` (+ `A0-PLATFORM_APPROVALS.md`) | 🔴 gated on A0 external clocks |

**Order:** P0 → P1 → P2 → P3 → P4, each behind a hard exit gate. Two invariants
never relax: new accounts start at **OBSERVE**; **no raw tokens/PAN** ever logged
or stored. The single longest pole is the **A0 approval clocks** (3–8 wks) — they
gate only P4 but should be in-flight now, since all build work fits their window.

## Why it lives in the Tanmatra repo

The write scope for this session is limited to `chan8822/wellness-foods`, so the
brand-twin planning + UI work is corralled here under one folder rather than
polluting the Tanmatra root. When a dedicated home is available, this directory
moves out wholesale.