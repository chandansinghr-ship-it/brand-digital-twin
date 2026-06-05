# Third-Party Integrations — Adoption & UX Layer

> These are not data sources (see `PHASED_ROADMAP.md` for connectors). These are
> the connective + experience tools that make the OS adoptable by any market size
> — solo founder to scale agency — without a services team.
>
> Discipline: every 3P tool must *reduce* surface area, not add it. A tool that
> gives the user one more dashboard fails. A tool that makes one connection do the
> work of ten, or delivers a decision without requiring login, passes.

---

## Layer 1 — Unified Integration Aggregator (highest leverage)

The biggest adoption friction is connecting many sources and pulling clean
financial/COGS data. Don't build 40 adapters and 40 OAuth flows — buy one
normalized layer.

| Tool | Covers | Why |
|------|--------|-----|
| **Codat** / **Rutter** | Commerce + accounting + payments unified API | Directly unblocks the COGS problem — one connection pulls cost data from QuickBooks/Xero/Tally/Zoho without per-adapter work |
| **Merge.dev** | CRM, accounting, ticketing unified API | Covers Phase 3/4 CRM + support domains from one integration |
| **Nango** (OSS) | OAuth/integration plumbing | If owning the auth flow but not rebuilding per-provider |

**Market fit:** same connect-flow whether US (Shopify+QuickBooks) or India
(custom store + Tally). One UX pattern, every market.

---

## Layer 2 — Auth & Multi-Tenancy (solves solo → agency)

| Tool | Why |
|------|-----|
| **WorkOS** | Magic-link/social login for solo founders *and* SSO + SCIM + org hierarchies for agencies, from one integration. Gives the agency multi-tenant model real org/RBAC primitives. |
| **Clerk** | Lighter alternative; excellent DX; good if enterprise SSO isn't day-one critical |

This is "one engine, many surfaces" expressed at the identity layer.

---

## Layer 3 — In-Product Guidance (kills cognitive load)

| Tool | Why |
|------|-----|
| **CommandAI** (ex-CommandBar) | ⌘K search + AI copilot + contextual nudges. Natural home for healing recommendations to be *asked about*, not just displayed. |
| **Userflow** / **Appcues** | Interactive checklists + tooltips. The "Profit Readiness 78%" checklist and goal-first onboarding become guided flows, not static screens. |

---

## Layer 4 — Notifications Where Users Already Are

| Tool | Why |
|------|-----|
| **Knock** / **Novu** | One notification layer fanning out to email, in-app, Slack, **WhatsApp, SMS**. The healing card reaches the user *without login*. WhatsApp near-mandatory for India; Slack for global agencies. Same infra, market-appropriate channel. |

This is what converts the OS from "a dashboard you visit" to "a decision that
finds you" — the single biggest driver of recurring engagement.

---

## Layer 5 — Document Parsing (automates the COGS fallback)

| Tool | Why |
|------|-----|
| **Mindee** / **Nanonets** / **Reducto** | OCR + extraction so a brand uploads a supplier invoice and COGS is mapped to SKUs (tactic #4 in `PROFIT_DATA_MODEL.md`). Turns the hardest manual step into drag-and-drop. |

---

## Layer 6 — No-Code Escape Hatch (long tail without bloat)

| Tool | Why |
|------|-----|
| **Zapier** / **Make** (embedded) | Users wire OS triggers ("POAS < 0") to whatever they use. Covers the long tail you'll never build natively — without bloating the core. Respects the anti-suite-trap discipline. |

---

## Layer 7 — Billing (serves "suggest an amount")

| Tool | Why |
|------|-----|
| **Lago** (OSS, usage-based) | Flexible enough for negotiated/suggested-amount pricing without rigid tiers. Clean INR + multi-currency for dual-market. |
| **Stripe Billing** | If preferring managed; strong global rails, weaker India coverage than local PSPs |

---

## The Three If You Did Only Three

1. **Codat / Rutter** — unblocks COGS + financial truth across all markets (biggest friction killer)
2. **Knock + WhatsApp/Slack** — decisions reach users without login (recurring engagement)
3. **WorkOS** — makes solo → agency one product, not two

---

## Roadmap Placement

| Layer | Phase | Rationale |
|-------|-------|-----------|
| Auth (WorkOS/Clerk) | Phase 1 | Foundational — everything sits on it |
| Unified aggregator (Codat/Rutter) | Phase 1 | Unblocks COGS, which gates trustworthy POAS |
| Document parsing (Mindee) | Phase 1 | Completes the COGS fallback path |
| Notifications (Knock) | Phase 2 | Decisions-to-WhatsApp once healing engine produces them |
| In-product guidance (CommandAI) | Phase 2 | Guides the now-richer multi-channel onboarding |
| Billing (Lago) | Phase 2 | Needed when trial → paid conversion goes live |
| No-code (Zapier/Make) | Phase 3 | Long-tail, after core connectors exist |

---

## Build-vs-Buy Principle

Buy the **plumbing** (auth, integration normalization, notification fan-out,
OCR, billing). Build the **brain** (POAS truth, root-cause diagnosis, healing
prescriptions, trust ledger, governance). The brain is the moat; the plumbing
is undifferentiated and a distraction to build. Every hour spent building an
OAuth flow is an hour not spent on the thing no competitor has.
