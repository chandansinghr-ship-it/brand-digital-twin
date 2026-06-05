# [PRIORITY A0] Platform Approvals Checklist

> The external clocks that gate A2 (OAuth connect) and therefore public launch.
> Start these the same day code work begins — approval timelines are 3–8 weeks
> and cannot be compressed by building faster.
>
> Format: what to apply for · exact scopes needed · evidence required ·
> realistic timeline · the blocking dependency it unlocks.

---

## How to use this doc

Assign one owner per platform. Log the date each is submitted and the date it
clears in the `[ ]` lines below. Nothing blocks *building* A1/A2/A3 — only
*going public* is gated. But delaying the submissions delays the launch date
by exactly the approval lead time, so submit before the first line of A2 code
is written.

---

## P1 — Google Ads API (Standard Access)

### What you're applying for
The Google Ads API is gated behind **Standard Access** for any app that runs
OAuth flows for third-party brands. Basic Access (10k ops/day per customer) is
auto-approved for internal/test use; Standard Access is required for public
multi-customer deployment.

### Exact scopes required

| Scope | Used by |
|-------|---------|
| `https://www.googleapis.com/auth/adwords` | Google Ads read + write (campaign data, spend, bid adjustments — the write path in `google_ads_adapter.ts` already uses this) |
| `https://www.googleapis.com/auth/content` | Google Merchant Center (product/inventory feed — `gmc_adapter.ts`) |

### OAuth consent screen verification
Sensitive/restricted scope → Google's OAuth App Verification required (separate
from API access). Required before public OAuth works for accounts outside your
own Google Workspace.

**Steps:**
1. GCP Console → APIs & Services → OAuth consent screen.
2. Set **User Type: External** (to allow third-party brand accounts).
3. Add both scopes above; add your Privacy Policy URL (B2 must be live first —
   or use a placeholder staging URL at review time, update before launch).
4. Submit for **OAuth App Verification** (the security review queue, not just
   the basic consent screen).
5. Separately: Google Ads API → [Apply for Standard Access](https://developers.google.com/google-ads/api/docs/access-levels#apply_for_standard_access) — fill out the access request form in the Google Ads developer console.

**Evidence package Google typically asks for:**
- Live product URL (can be a private beta with login — they don't need it public).
- Video walkthrough of the OAuth flow (screen recording, 2–5 min).
- How ad account data is used (link to Privacy Policy section on ad data).
- How users can revoke access (settings screen in A3 — build this into the
  spec: `DELETE /connect/google` → vault.revokeSecret + clear integration_state).
- No automated ad account modifications without explicit user action (the
  governance engine's OBSERVE-by-default and approval queue are your answer here —
  document them in the evidence).

**Timeline:** OAuth App Verification: 4–6 weeks. Standard Access: 2–4 weeks
(can run in parallel). Longer if Google requests changes.

**Owner:** ____________  **Submitted:** ____________  **Cleared:** ____________

---

## P2 — Meta Ads (App Review)

### What you're applying for
Meta requires **App Review** before any app can request permissions beyond the
basic set for users other than the developer account. All the permissions needed
for reading and managing ads for third-party brand accounts require review.

### Exact permissions required

| Permission | Used by |
|------------|---------|
| `ads_read` | Campaign spend, impressions, clicks — `meta_ads_adapter.ts` |
| `ads_management` | Write path (bid/budget adjustments via the governance engine) |
| `business_management` | Reading Business Manager structure, ad account enumeration |
| `pages_read_engagement` | Page metrics for organic social context (Phase 2, but apply now — adding permissions post-review restarts the clock) |

### Steps
1. [Meta for Developers](https://developers.facebook.com/) → create or open your
   app (type: **Business**).
2. App Review → Permissions and Features → request each permission above.
3. For each permission, submit:
   - A **screencast** showing the exact OAuth flow and where the permission is
     used in the UI (the live sweep + recommendations screens from A3).
   - A written **use-case explanation** (e.g., "ads_read is used to retrieve
     campaign spend to compute Profit on Ad Spend for the brand").
   - Privacy Policy URL (same as Google — can be staging at review time).
4. Set the app's **Privacy Policy URL** and **Terms of Service URL** in app
   settings before submitting.
5. For `ads_management` (write): expect extra scrutiny — document that all
   write actions go through a human-approval gate (the approvals queue) and
   that new accounts start at OBSERVE tier with no auto-execution.

**Timeline:** Initial review: 1–2 weeks. Revision rounds: 1–2 weeks each.
`ads_management` write permission often requires one revision round. Budget
3–6 weeks total.

**Owner:** ____________  **Submitted:** ____________  **Cleared:** ____________

---

## P3 — Shopify Partner App

### What you're applying for
To install your app into third-party Shopify stores, you need a **Shopify
Partner account** and an app registered in the Partner Dashboard. The OAuth
flow is then per-store (each store owner installs via the app's OAuth grant).
If you want to distribute via the Shopify App Store, there is a separate
**App Store listing review** — that is optional for a private or direct-install
launch but required for App Store discovery.

### OAuth scopes required

| Scope | Used by |
|-------|---------|
| `read_orders` | Order data for POAS calculation — `shopify_adapter.ts` |
| `read_products` | Catalog / variant COGS data (`cost_cogs` field) — cold-start sweep |
| `read_inventory` | Stock levels for stockout sweep check |
| `read_analytics` | Session / funnel data (optional; useful for checkout event scan) |

### Steps
1. [partners.shopify.com](https://partners.shopify.com) → create a Partner
   account (if not already).
2. Apps → Create App → **Custom app** (for direct installs without App Store
   listing) or **Public app** (for App Store). Start with Custom/Unlisted — it
   skips the App Store review queue while still enabling production OAuth.
3. In the app settings, set:
   - App URL: `https://yourdomain.com/api/v1/connect/shopify`
   - Redirect URL: `https://yourdomain.com/api/v1/connect/shopify/callback`
4. Note the **API key** and **API secret** — these go into `config.ts` env vars
   (`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`).
5. For the HMAC-signed callback verification (`shopify_adapter.ts`), use the
   API secret. Never log it.
6. **App Store listing (if desired later):** submit separately after the app is
   live and has real installs. This review checks UI quality, support docs,
   pricing page — do it after soft launch, not before.

**Timeline:** Partner account + Custom App: same day. App Store listing
review: 3–5 weeks (defer until post-launch).

**Owner:** ____________  **Submitted:** ____________  **Cleared:** ____________

---

## P4 — Legal (ToS / Privacy Policy / DPA)

### What this gates
- Google OAuth consent screen verification requires a live Privacy Policy URL.
- Meta App Review requires a live Privacy Policy URL.
- B2 (legal surfaces in the product) is a Phase B item, but the **drafting
  clock starts now** — legal review takes 2–4 weeks even with a fast solicitor.

### What to commission
1. **Privacy Policy** — must cover: data collected (ad account data, revenue,
   COGS, bank balances via RBI AA/Plaid), how it is used, third parties it is
   shared with (none — all in-house), retention period, deletion rights (GDPR
   Art. 17, DPDP §12), data controller details.
2. **Terms of Service** — standard SaaS terms + ad API usage terms (user
   warrants they have rights to connect their ad accounts; no liability for
   automated actions beyond what user approves).
3. **Data Processing Agreement (DPA)** — required by GDPR if you have EU brand
   customers. Standard SCCs (Standard Contractual Clauses) cover transfer
   obligations.
4. **Cookie Policy** — brief; essential cookies only by default (B4 consent
   banner). Document what is set and why.

### Staging placeholder approach
While the legal draft is being reviewed, host a placeholder page at the URLs
you give to Google/Meta. Mark it clearly "Draft — not in effect". Update the
live URL once legal review completes. Google/Meta typically do not re-verify
if the URL stays the same and the page is materially the same.

**Timeline:** Brief legal → first draft: 1 week. Review + finalise: 1–2 weeks.
Total: 2–4 weeks. Engage immediately — this is also needed for Phase B (B2).

**Owner:** ____________  **Engaged:** ____________  **Draft live:** ____________  **Final:** ____________

---

## P5 — Google Analytics / Search Console (Phase A, low-friction)

GA4 and Search Console do not require app review for OAuth access — they use
the same Google OAuth consent screen verified in P1. Once P1 clears, these
scopes just need adding to the consent screen:

| Scope | Used by |
|-------|---------|
| `https://www.googleapis.com/auth/analytics.readonly` | GA4 funnel / cohort data (Phase 2, but add now) |
| `https://www.googleapis.com/auth/webmasters.readonly` | Search Console — organic rank context in healing engine |

Add these to the P1 OAuth consent screen submission. No separate review queue.

---

## Critical path summary

```
Day 1 ──► Submit P1 (Google OAuth + Standard Access) ─────────────────────► ~Week 6
Day 1 ──► Submit P2 (Meta App Review) ────────────────────────────────────► ~Week 5
Day 1 ──► Create P3 (Shopify Partner App, Custom) ────────────────────────► Day 1
Day 1 ──► Engage legal for P4 ────────────────────────────────────────────► ~Week 4
          │
          └─ Meanwhile: build A1 (auth) → A2 code-complete → A3 SPA ──────► ~Week 8
                                                                 │
P1 + P2 cleared ─────────────────────────────────────────────── ┘ ──────► Public launch
```

**The actual blocker is P1 and P2.** P3 is same-day. P4 is needed for P1/P2 anyway.
Build A1/A2/A3 during the P1/P2 wait — but do NOT publish the OAuth flows publicly
until P1 and P2 are cleared, or accounts get blocked mid-use.

---

## Revoking access (required evidence for P1/P2)

Both Google and Meta require you to show users can revoke access. Build into A3:
- Settings → Integrations → Disconnect [platform] → `DELETE /connect/:platform`
  → `CredentialVault.revokeSecret(tenantId, platform)` + flip
  `integration_state = 'disconnected'`.
- This is the same path used by the reconnect flow on refresh failure (A2 spec).

---

## Quick-start actions (do these today)

1. [ ] Open [Google Ads API Access form](https://developers.google.com/google-ads/api/docs/access-levels) and start the Standard Access application.
2. [ ] Open GCP Console → OAuth consent screen → set External, add `adwords` + `content` scopes, submit for verification.
3. [ ] Open Meta for Developers → create / open app → submit `ads_read` + `ads_management` for App Review.
4. [ ] Open [partners.shopify.com](https://partners.shopify.com) → create Custom App → note client ID + secret → wire into config.
5. [ ] Brief a solicitor for Privacy Policy + ToS + DPA. Give them the data-flow summary: ad account data, revenue, COGS, bank balances; India + global users; no third-party data sale.
6. [ ] Stage a placeholder Privacy Policy URL (even a simple page) — you'll need it immediately for P1/P2 submission.
