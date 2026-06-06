# Production Readiness Plan — Brand Digital Twin OS

> **Single source of truth.** Verified against upstream
> `chandansinghr-ship-it/brand-digital-twin` @ `sync-google3-c2-ui` tip `3126858`
> (fetched 2026-06-06). **This branch is ahead of `main` by 3 commits — needs PR merge.**
>
> Engine work → `chandansinghr-ship-it/brand-digital-twin`  
> UI work → `brand-twin/app/` (this repo)
>
> **Legend:** ✅ done · 🟡 partial · ☐ to build  
> **Sizes:** S ≤0.5d · M 1–2d · L 3–5d · XL 1–2wk

---

## Where we are (@ `3126858` on `sync-google3-c2-ui`)

| Area | State | One-line |
|------|-------|----------|
| P0 — mock→live seams | ✅ | all 4 endpoints + sort + autonomy-409 |
| P1 — hardening | ✅ | atomic jobs, observability, staging, migrations, secrets, security, load test |
| Phase B — lawful | ✅ | B1.4 revocation, B2.3 ToS re-prompt, B2.4 cookie banner, legal routes |
| C2 billing endpoints | ✅ | GET /billing/subscription + POST /billing/suggest + `subscriptions` table |
| Phase C UI | ✅ | Costs + Billing screens mock-gated; P2.1 dismiss UI; signup ToS checkbox |
| recommendation_events live | ✅ | migration 0003+0006; live Supabase writes in `saveRecommendationEvent` |
| shown / approved events | ✅ | emitted on `/recommendations` (shown) and approvals execute (approved) |
| B4 spend caps | ✅ | `governance_engine.ts` enforces `max_per_action_limit` + `max_daily_limit` (migration 0007) |
| Invite allowlist default ON | ✅ | `inviteAllowlistEnabled: env !== 'false'` — doors closed by default |
| Secret provider abstraction | ✅ | `SecretProvider`/`EnvSecretProvider`/`ManagedSecretProvider` + `scrubber.ts` |
| E2E test suite | ✅ | 6 new e2e specs: beta_telemetry, invite_allowlist, secrets, security_redaction, real_world, cross_feature |
| **sync-google3-c2-ui → main** | ❌ | **branch not merged; all above is on branch only** |
| executed events (osActs) | 🟡 | approval-executed emits `approved`; autonomous osActs don't write recommendation_events |
| C1 COGS endpoints | ☐ | `/cogs/coverage`, `/cogs/gaps`, `POST /cogs` absent from server.ts |
| C2 billing lifecycle | ☐ | no trial jobs, no Razorpay, no ops review queue |
| P4 GA | ☐ | blocked on A0 external clocks — start applications now |

---

## Immediate action required

**Merge `sync-google3-c2-ui` → `main`** in the engine repo. Everything listed ✅ above
is on a branch. Until this merges, running against `main` misses: live recommendation
telemetry, spend caps, invite allowlist default, secret provider abstraction, and all
the new E2E tests.

---

## Remaining engine work

### 0. Merge the branch (TODAY, 0 effort)
PR `sync-google3-c2-ui` → `main` in `chandansinghr-ship-it/brand-digital-twin`.

### 1. `executed` event for autonomous osActs (S · engine)
**File:** `server.ts` — `POST /api/v1/actions` handler

After `outcome.status === 'executed'`, emit a `recommendation_events` row with
`action: 'executed'`. Mirrors the pattern for `approved` in the approvals handler.
Without this, H1 time-to-first-action is uncomputable for OS-initiated actions.

```ts
if (outcome.status === 'executed') {
  const event: RecommendationEventEntry = {
    event_id: `evt_exec_${req.idempotencyKey}_${crypto.randomUUID()}`,
    recommendation_id: req.idempotencyKey,
    tenant_id: ctx.tenant.tenantId,
    action: 'executed',
    reason: null,
    created_at: new Date().toISOString(),
  };
  void requestDb.saveRecommendationEvent(event).catch(console.error);
}
```

### 2. C1 COGS endpoints (~6 days · engine)
*Flips the Costs screen from mock to live.*

**2.1 — `CostSource` interface + `tally_adapter.ts` wiring (S)**  
New `cost_source.ts`:
```ts
export interface CostSource {
  provider: CostSourceProvider;
  getUnitCosts(tenantId: string): Promise<{sku: string; unitCost: number}[]>;
}
```
Conform `TallyAdapter` to `CostSource`.

**2.2 — `GET /api/v1/cogs/coverage` (S)**  
Coverage by **ad spend** (not variant count): weight each variant by its sweep `adSpend`.
Return `CogsCoverage = { coveragePct, realPct, estimatedPct, missingCostSkus, basis:'ad_spend' }`.

**2.3 — `GET /api/v1/cogs/gaps` (M)**  
Top-spend variants with no confident `cost_cogs`. Sort by `adSpend` desc. Include
category-estimated rows (`estimatedCogs: true`). Maps to `CogsGap[]` in the UI types.

**2.4 — `POST /api/v1/cogs` (S)**  
Persist `{ sku, unitCost }[]` with `provenance: 'manual'`; trigger coverage recompute.

**2.5 — Category-average estimator (M)**  
`poas_calculator.ts`: for SKUs missing cost, derive `estimatedCogs` from same-category
median. Tag `provenance: 'category_estimate'`. `variants.provenance` column already exists
(migration 0003 added it).

**2.6 — Readiness gate in `risk_radar.ts` (M)**  
When `coveragePct < 80%` (by ad spend), demote auto-executable prescriptions to
`userApproves` + add caveat. `profit_readiness.ts` already has `directional_only` status
— wire it through to the healing engine output.

### 3. C2 Billing lifecycle + payment (~10 days · engine)
*First paid conversion: trial → suggest → approve → charge*

**3.1 — Trial lifecycle jobs in `poas_scheduler.ts` (M)**
- Day-14 nudge: send email + push to `activity_feed` with dollar drag + critical count.
- Day-15 flip: `trial` → `suggest_amount`.
- Recurring charge on billing anniversary.
- Dunning: 3 retries (day 1, 3, 7) then `suspended`.

**3.2 — Ops review queue (M)**
- `GET /api/v1/admin/billing/queue` — list `pending_review` subscriptions (admin-only).
- `POST /api/v1/admin/billing/approve/:orgId` — flip to `active`, trigger first charge.
- Simple admin billing table in `brand-twin/app/` (read + approve per row).

**3.3 — `PaymentProcessor` interface + Razorpay (L)**  
New `payment_processor.ts`:
```ts
export interface PaymentProcessor {
  createOrder(params: {amount: number; currency: string}): Promise<{orderId: string}>;
  capturePayment(orderId: string, paymentId: string): Promise<{success: boolean}>;
  savePaymentMethod(tenantId: string, tokenId: string): Promise<void>;
  chargeOnFile(tenantId: string, amount: number): Promise<{success: boolean; receiptUrl?: string}>;
}
```
Implement `RazorpayProcessor`. Store tokenized card in credential vault. Webhook for
`payment.captured` / `payment.failed`.

**3.4 — Receipt generation (S)**  
On charge: create `receipts` row; expose `GET /api/v1/billing/receipts`.

### 4. Accounting adapters — C1 OAuth (parallel with 3, ~8 days · engine)
*Auto-fill COGS on connect; no manual entry for brands on Zoho/QBO/Xero.*

| Adapter | File | OAuth |
|---------|------|-------|
| Zoho Books | `zoho_adapter.ts` | Zoho OAuth 2.0 |
| QuickBooks Online | `quickbooks_adapter.ts` | Intuit OAuth |
| Xero | `xero_adapter.ts` | Xero OAuth 2.0 |

Each: implements `CostSource`; pulls inventory items → unit cost mapping. Register in
`onboarding_wizard.ts` silent sweep on connect → triggers coverage recompute.

### 5. GA hardening (parallel with 4, ~4 days)

**5.1 — Formal severity model in `incident_response.ts` (M)**

| Level | Trigger | Action |
|-------|---------|--------|
| SEV-0 | DB unreachable / cross-tenant leak | Halt autonomous actions; page immediately |
| SEV-1 | Billing charge failure / auth outage | Page within 5 min |
| SEV-2 | Adapter error rate > 10% | Alert + auto-reroute (existing `reRouteBudget`) |
| SEV-3 | Sweep stale > 2h | Slack alert; no page |

Wire to `MetricsTracker` alert rules in `observability.ts`.

**5.2 — In-app support widget (M · UI)**  
New `brand-twin/app/src/components/SupportWidget.tsx` + button in `Nav.tsx`:
- Link to help center
- Pre-filled email template
- Inline issue form → `POST /api/v1/support/ticket` (or mailto fallback)

**5.3 — P2.3 holdout lift panel (M · engine + UI)**  
Config: per-brand holdout split. On scheduler run, compute treatment vs holdout POAS;
call `/telemetry/lift`; persist result. Add lift panel to Dashboard screen.

---

## A0 — External clocks (start now, run background, gate P4 only)

| Item | Blocks |
|------|--------|
| Google Ads Standard Access application | Live ad reads |
| Meta `ads_read`/`ads_management` App Review | Meta integration |
| Google OAuth consent screen verification | Google Ads OAuth |
| Shopify Partner app listing | Shopify OAuth in prod |
| Legal counsel: real ToS/Privacy/DPA copy | Public launch |

---

## Build order + critical path

```
TODAY:  Merge sync-google3-c2-ui → main
        Start A0 applications (weeks wait; gate P4 only) ─────────────────────────► P4 unlocks

Week 1:  Fix 1 (executed events, S)
         + onboard 3 beta brands (real OAuth + POAS)

Week 2:  C1 COGS: CostSource + 3 endpoints + estimator + readiness gate
         Accounting adapters start in parallel (Zoho, QBO, Xero)

Week 3:  C2: trial lifecycle jobs + ops review queue

Week 3-4: C2: Razorpay + receipts
           GA hardening in parallel (severity model, support widget)

Week 5:  Accounting adapters finish; holdout panel

Week 5-6: A0 approvals clear → GA gate opens
```

**P2 exit gate (before GA):**
- [ ] ≥1 beta brand with real POAS + healing + measured lift
- [ ] All 5 recommendation event types in DB (shown/approved/executed/dismissed/reversed)
- [ ] Zero cross-tenant data leaks in logs + DB queries
- [ ] Spend caps tested: raise-above-limit → QUEUE not AUTO_EXECUTE
- [ ] Invite allowlist enforced: unknown email → 403

**GA definition of done:**
- [ ] Stranger signs up (ToS accepted) → connects Google Ads + Shopify → sees live POAS + healing
- [ ] Trial → suggest → human approve → Razorpay charge succeeds
- [ ] All A0 approvals received
- [ ] Real legal copy (counsel-reviewed) in ToS/Privacy/DPA
- [ ] Rollback rehearsed; SEV model live
