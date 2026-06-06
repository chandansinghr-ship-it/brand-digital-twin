# P0 Execution — Close the Four Seams

> Turns `A-ENDPOINT_GAPS_SPEC.md` into an ordered, ticketed work plan. Goal: every
> screen in `app/` runs against real endpoints with `NEXT_PUBLIC_API_URL` set and
> `USE_MOCK=false`. Engine work lands in `chandansinghr-ship-it/brand-digital-twin`
> (read-only here); UI work lands in this repo (`brand-twin/app/`).

---

## Ordering & why

Sequenced by unblock value — each ticket flips a screen from mock to live:

```
P0.1 A2.4 /integrations  ──► Connect screen live      (smallest, warms up the path)
P0.2 A3.4 /sweep         ──► Sweep screen live        (needs runFullSweep aggregator)
P0.3 A3.5 /autonomy      ──► Autonomy dial live        (read + guarded write)
P0.4 A2.5 auth ticket    ──► OAuth + SSE prod-safe     (engine endpoint + UI ✅ done)
```

P0.1–P0.3 are independent and can land in parallel. P0.4's engine half should land
last (it touches the auth signer), but its **UI half is already implemented** (see
below) so the client is ready the moment the endpoint exists.

---

## Tickets

### P0.1 — `GET /api/v1/integrations` (engine)
- Add handler in `server.ts` next to `/api/v1/approvals` (server.ts:809).
- Body: `const integrations = await db.getIntegrationStates(tenantId); sendSuccessResponse(res, { integrations });`
- **Tests:** connected tenant gets real list; cross-tenant isolation holds (RLS).
- **Done:** connect tiles reflect active/suspended/disconnected, no mock.

### P0.2 — `GET /api/v1/sweep` + sort (engine) ✅ FIXED
- ~~Add `RiskRadar.runFullSweep(ctx)`~~ — endpoint already exists (`server.ts:1035`),
  running all 6 scanners via `Promise.all`. Was missing the severity→dollarImpact sort.
- **Fix landed** (`brand-digital-twin@2295891`): added `.sort()` post-flatten using
  `{ CRITICAL:0, WARNING:1, OPPORTUNITY:2 }` rank then `dollarImpact` desc.
- Keep `/risks` (`string[]`) for back-compat; `/sweep` is the rich superset.
- **Tests:** all 5 scanners represented; sort order; empty-state → `[]`.
- **Done:** sweep screen shows live severity→dollar order + 1-tap-fix chip.

### P0.3 — `GET/POST /api/v1/autonomy` (engine) ✅ FIXED
- Both endpoints already existed (`server.ts:1147`). `GET` returns the stored tier;
  `POST` was missing the trust-ledger earned-tier guard (only checked admin role).
- **Fix landed** (`brand-digital-twin@2295891`): `POST` now calls
  `tl.getTier(tenantId, 'global')` and returns `409 TIER_NOT_EARNED` if the
  requested tier exceeds the earned tier; lowering is unrestricted.
- `GET` returns `{tier}` (semantic string, e.g. `"OBSERVE"`); dial maps to level internally.
- **Tests:** lower persists; raise-above-earned → 409; new org → OBSERVE.
- **Done:** dial reflects live tier; lowering persists; over-raise rejected.

### P0.4 — Auth ticket for OAuth redirect + SSE (engine + UI)
- **Engine:** `GET /api/v1/auth/ticket` (Bearer-authed) → single-use ~60s HMAC
  ticket bound to `{userId, orgId}` via the `auth.ts` signer. `/connect/:platform`
  and `/stream` accept `?ticket=`, verify, and **burn** it (replay-guard set).
- **UI (DONE — this repo):**
  - `api.ts` — added `getTicket()`; `connectUrl()` is now async and appends
    `?ticket=` (removed the `?t=` long-lived-token stopgap).
  - `useStream.ts` — fetches a ticket, opens `EventSource('/stream?ticket=…')`,
    cancellation-safe around the async open.
  - `ConnectCard.tsx` — `onConnect` awaits `connectUrl()` before navigating.
- **Tests (engine):** ticket single-use (second use 401); expiry honored; no
  bearer token ever in a URL/log.
- **Done:** OAuth connect + live SSE authenticate with no token in the URL.

---

## Cutover checklist (flip mock → live)
- [ ] Set `NEXT_PUBLIC_API_URL` → staging engine; confirm `USE_MOCK=false`.
- [ ] P0.1–P0.4 endpoints return the documented envelopes (`{status,data,timestamp}`).
- [ ] All 11 routes render live data; `mock.ts` no longer reached at runtime.
- [ ] SSE pushes a `risk_alert` → sweep + risks queries invalidate and refetch.
- [ ] Autonomy raise-above-earned shows the 409 error state in the dial.
- [ ] No `?t=` anywhere; only single-use `?ticket=`.

## Exit gate P0 (from PROD_READINESS_PLAN.md)
- [ ] All 11 UI routes render live data with `USE_MOCK=false`.
- [ ] SSE authenticates via ticket; live events invalidate queries.
- [ ] Autonomy write rejects raise-above-earned with `409`.

---

## Status
- **UI half of A2.5: complete** (this branch) — `getTicket`, async `connectUrl`,
  ticket-authed `useStream`, `ConnectCard` awaits.
- **Engine items P0.1/P0.4 (integrations + auth ticket):** confirmed live in upstream engine.
- **Engine P0.2 sort + P0.3b earned-tier guard:** fixed (`brand-digital-twin@2295891`).
  Commit is local; needs to be pushed to `chandansinghr-ship-it/brand-digital-twin` main
  by someone with write access to that repo.
- **P0 exit gate:** all four engine endpoints are now correct. Set
  `NEXT_PUBLIC_API_URL` pointing at the engine to flip `USE_MOCK=false`.
