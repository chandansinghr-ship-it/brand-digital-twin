# P4 Execution — General Availability (open the doors)

> The final phase: a stranger self-serves to first POAS with no human in the loop.
> By now the product is built (P0), hardened (P1), trust-proven (P2), and lawful +
> paid (P3). P4 is mostly **waiting on external clocks** and **a controlled
> rollout** — not new engine work. Grounded in `brand-digital-twin` @ `fb03ddd`.

---

## The blocker is external, not code
P4's critical path is the **A0 approval clocks** (3–8 weeks, can't be compressed
by building faster). Detail + owners/dates live in `A0-PLATFORM_APPROVALS.md`.

| Clock | Gates | Lead time |
|-------|-------|-----------|
| Google Ads API — Standard Access | live Google Ads OAuth for 3rd-party brands | longest pole |
| Meta — App Review (`ads_read`/`ads_management`) | live Meta Ads connect | weeks |
| Google OAuth consent — verification (sensitive scopes) | the consent screen itself | weeks |
| Shopify — Partner app / App Store listing | distributable Shopify install | weeks |
| Legal — ToS / Privacy / DPA sign-off | lawful operation (B2 surfaces exist; need counsel sign-off) | parallel |

**Action:** these should already be in-flight from day 1 (per A0). P4 cannot open
until **all** clear. If they haven't been submitted, that's the single highest-
leverage thing to do now — everything else is ready before they are.

---

## P4.1 — Pre-launch readiness verification
All prior exit gates green, re-confirmed against prod:
- [ ] P1 gate: 2 instances zero double-claims; error sink redacted; staging
      deploy+rollback one-command; restore drill green.
- [ ] P2 gate: H1 action-rate ≥60%, all 3 brands ≥80% readiness, holdout ≥0.7.
- [ ] P3 gate: trial→paid test-mode charge; readiness gates advice; quotas → 429.
- [ ] No raw tokens logged/returned; state-forgery + cross-tenant tests green.

## P4.2 — Controlled rollout (don't open the floodgates)
- [ ] **Flip the invite/allowlist flag** (B4/P2.4) from closed → public gradually:
      waitlist batch → open signup.
- [ ] **Canary:** first public cohort behind a feature flag; watch P1.2 dashboards
      (error rate, job lag, POAS-calc p95) before widening.
- [ ] **New accounts at OBSERVE** — confirm no autonomous spend reachable for fresh
      public orgs; new-account dollar ceiling (B4) on.
- [ ] **Abuse watch:** connect-attempt throttle + per-tenant quotas live; signup
      verification required before any connect.

## P4.3 — Day-2 operations
- [ ] On-call + incident runbook rehearsed (`incident_response.ts` + P1 runbook).
- [ ] Rollback rehearsed against prod (governance rollback + one-command deploy).
- [ ] Support channel staffed; in-app contact live (B3).
- [ ] Status page / comms plan for incidents.

---

## GA exit gate / definition of done (from PROD_READINESS_PLAN.md)
- [ ] A stranger signs up → creates a brand → connects Google Ads + Shopify via
      OAuth (no human) → sees a live sweep, real POAS, and healing cards.
- [ ] New accounts at OBSERVE; no autonomous spend possible until earned.
- [ ] No raw tokens logged or returned; state-forgery tests green.
- [ ] Billing live; first self-serve paid conversion completed.
- [ ] Rollback plan + incident runbook rehearsed.

When that holds, the OS is publicly live — self-serve, lawful, monetised, and
proven to act on truth.

---

## Sequencing
P4 opens only after P3 is green AND all A0 clocks clear. Rollout is staged
(invite → canary → open), never a hard cutover — the first public traffic is the
first time the whole loop runs unsupervised, so watch it land before widening.
