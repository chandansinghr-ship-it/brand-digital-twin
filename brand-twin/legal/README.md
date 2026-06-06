# Legal Copy — Counsel Review Package

> **Status: DRAFT — NOT YET IN EFFECT.** These documents are non-lawyer drafts
> prepared for qualified legal counsel to review, complete, and approve before
> they are published or relied upon. They are **not legal advice**.

## Purpose

Internally we hand-hold beta brands; the public won't have that. Before public
launch we need real Terms of Service, Privacy Policy, and a Data Processing
Addendum in effect. Rather than brief counsel from a blank page, these drafts are
written to the product's actual data flows so counsel's time goes to risk-spotting
and jurisdiction fit, not discovery.

## Documents

| File | Serves | Wired to |
|------|--------|----------|
| `TERMS_OF_SERVICE.draft.md` | `GET /api/v1/legal/tos` → `/legal/tos` page | engine `content` field |
| `PRIVACY_POLICY.draft.md` | `GET /api/v1/legal/privacy` → `/legal/privacy` page | engine `content` field |
| `DPA.draft.md` | `GET /api/v1/legal/dpa` → `/legal/dpa` page | engine `content` field |

The UI legal pages (`brand-twin/app/src/app/legal/`) currently render placeholder
copy plus a few hard-coded sections. **Once counsel approves these drafts, they
become the single source of truth** — the engine `/legal/*` endpoints should serve
the approved text verbatim, and the ad-hoc hard-coded sections in the page JSX
should be removed so the page and the canonical document never drift.

## Blanks register — counsel + company must fill before publish

Every `[BRACKETED]` token below appears across the three documents. Resolve once
and apply consistently.

| Token | Meaning | Owner |
|-------|---------|-------|
| `[LEGAL ENTITY NAME]` | Registered company name (e.g. "Acme Technologies Pvt. Ltd.") | Company |
| `[ENTITY TYPE / REG NO.]` | Incorporation type + registration/CIN number | Company |
| `[REGISTERED ADDRESS]` | Principal place of business | Company |
| `[GOVERNING LAW]` | Governing law + courts (e.g. "the laws of India; courts at Bengaluru") | Counsel |
| `[PRIMARY MARKET]` | India-first vs US/EU-first — determines lead framework | Counsel |
| `[CONTACT EMAIL]` | General legal/support contact | Company |
| `[PRIVACY EMAIL]` | Privacy requests inbox | Company |
| `[DPO / GRIEVANCE OFFICER]` | Name + contact for GDPR DPO and India DPDP Grievance Officer | Counsel + Company |
| `[RETENTION — ACTIVE]` | Retention while account active (e.g. "duration of the subscription") | Counsel |
| `[RETENTION — POST-TERMINATION]` | Retention after deletion (e.g. "30 days, then hard-deleted") | Counsel |
| `[SUBPROCESSOR LIST URL]` | Public URL listing subprocessors | Company |
| `[ARBITRATION SEAT]` | If arbitration is used, the seat/venue | Counsel |
| `[EFFECTIVE DATE]` | Date the approved version takes effect | Counsel |
| `[VERSION]` | Semver string returned by the engine + shown on the page | Eng |

## Regulatory scope assumed in these drafts

Drafted as **dual-market** (the product serves India via Razorpay/Tally/INR and
global via Xero/QuickBooks/USD). Counsel should confirm and trim:

- **India** — Digital Personal Data Protection Act, 2023 (DPDP); IT Act / SPDI Rules.
- **EU/UK** — GDPR / UK GDPR (export + erasure rights are already built; SCCs for transfers).
- **California** — CCPA/CPRA (if US consumers in scope).

## Version + re-acceptance

The UI already enforces re-acceptance on a version bump: a `403
POLICY_REACCEPTANCE_REQUIRED` from the API redirects to `/legal/tos?reaccept=true`,
and `acceptLegalDoc(version)` logs the new acceptance (B2.3). When counsel approves
a new version, bump `[VERSION]` in the engine and existing users are re-prompted
automatically.

## Subprocessors referenced (verify before publish)

Google Ads · Meta · Shopify · Razorpay (+ global card processor) · Tally · Zoho
Books · QuickBooks · Xero · Supabase/Postgres (hosting) · Redis (queue) ·
email/notification provider. Counsel should confirm the live list and publish it
at `[SUBPROCESSOR LIST URL]`.
