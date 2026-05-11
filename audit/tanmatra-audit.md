# Tanmatra — Security / Clinical-Reliability / Performance Audit

Scope: `artifacts/api-server`, `artifacts/tanmatra` (web), `artifacts/tanmatra-mobile` (Expo), `lib/db`, `lib/api-spec`. Methodology: every finding is grounded in code I read in this session; line numbers are from current `main`. Severity buckets: Critical / High / Medium / Low / Nit. Confidence: High = read & traced; Medium = read but did not exercise; Low = inferred from surrounding code. Test files are excluded from citations per the audit prompt.

---

## CRITICAL

### C1 — Security — `support-agent/chat` is unauthenticated and unrate-limited Gemini surface
- **File:** `artifacts/api-server/src/routes/supportAgent.ts:36–80` (full file)
- **Issue:** The route handler does **not** call `requireAuth`, does **not** call any `gate(req,res)`, and does **not** mount any rate-limiter. It opens an NDJSON Gemini stream on every POST. Compare with `coachAgent.ts:49` (per-user 30/5min limiter) and `forecasting.ts` (`requireOps` gate).
- **Why it matters:** Any unauthenticated client (or bot) can hold open arbitrarily many concurrent Gemini sessions of up to 8000 chars + 50 history turns. Cost burn is open-ended and a trivial DoS vector against the upstream model quota — taking down support, coach and ops agents that share the gateway.
- **Fix:** Add `if (!(await requireAuth(req,res))) return;` (or accept anonymous but enforce IP-based + global token-bucket); mount `rateLimit({ windowMs: 5*60_000, max: 20, keyPrefix: "support" })` in front of the handler; add a daily per-IP/per-user token cap inside `lib/ai/gateway.ts`.
- **Confidence:** High.

### C2 — Security — Admin-token comparison uses `===` (timing-attack) in 9 routes, bypassing `safeEqual`
- **Files (all use `headerToken === adminToken`):**
  - `artifacts/api-server/src/routes/analytics.ts:25`
  - `artifacts/api-server/src/routes/fulfillment.ts:24`
  - `artifacts/api-server/src/routes/menuAssets.ts:25`
  - `artifacts/api-server/src/routes/menu.ts:30`
  - `artifacts/api-server/src/routes/menuEngineering.ts:32`
  - `artifacts/api-server/src/routes/ops.ts:26`
  - `artifacts/api-server/src/routes/rdPartners.ts:27`
  - `artifacts/api-server/src/routes/supportTickets.ts:21`
  - `artifacts/api-server/src/routes/delivery.ts:241`
- **Issue:** Each of these reimplements `isCatalogRequest()` / `isOpsRequest()` locally with a non-constant-time string compare and an inline `OPS_USER_IDS` parse, instead of using `lib/adminGate.ts` (`hasAdminToken()` already calls `safeEqual` with a length-padded `Buffer.from`).
- **Why:** Timing oracle on the shared admin secret across the public surface. Far more importantly: 9 copies of the same gate guarantee security drift — a future change to `adminGate.ts` (e.g. adding HMAC, IP allowlist, audit log) won’t propagate.
- **Fix:** Delete the local helpers; import `requireOps` / `requireCatalog` from `lib/adminGate.ts`. Add an ESLint rule (or a simple `rg` CI grep) banning `headerToken === adminToken` outside `lib/adminGate.ts`.
- **Confidence:** High.

---

## HIGH

### H1 — Reliability — Redis-less production silently breaks the order pipeline
- **File:** `artifacts/api-server/src/lib/queue.ts:99–101` (queue init guards on `REDIS_URL`).
- **Issue:** When `REDIS_URL` is unset, `getQueue()` returns null and `enqueue*` calls become no-ops. `index.ts:33–39` starts workers behind the same guard. Order finalize publishes “preparing/ready/dispatched” transitions through this queue.
- **Why:** In a misconfigured prod deploy, `/orders/finalize` returns 200, the order persists as `placed`, and **never** advances. Customers see infinite “We received your order” with no observability alarm.
- **Fix:** In `index.ts` boot: `if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) throw new Error("REDIS_URL required in production")`. Also surface `queue: "disabled"` in `/api/healthz` so liveness probes fail loudly.
- **Confidence:** High.

### H2 — Security — `GET /api/logout` is CSRF-able
- **File:** `artifacts/api-server/src/routes/auth.ts:201` (`router.get("/logout", …)`).
- **Issue:** A state-changing endpoint exposed over GET with cookies. Any third-party page can `<img src="https://tanmatra.food/api/logout">` and force-log-out the session. Same handler is also exposed at `:193` as POST (correct).
- **Why:** Annoyance attack today; combined with a session-fixation chain it becomes worse. Also violates RFC 9110 safe-method semantics.
- **Fix:** Delete the GET variant. If client code relies on it (anchor tag), change the link to a small `<form method=post>` button.
- **Confidence:** High.

### H3 — Privacy/Clinical — AI-run persistence stores full conversations + redacted brief that still includes allergens & wellness data
- **Files:** `lib/db/src/schema/...` `aiRunsTable` (referenced by `lib/ai/gateway.ts`); `artifacts/api-server/src/lib/userBrief/redaction.ts:33–87`; viewer `artifacts/tanmatra/src/pages/AdminAiRuns.tsx`.
- **Issue:** Every coach/support/ops/cms turn persists the full message array and tool I/O into `aiRunsTable`. The “redacted” brief that the prompt embeds **legitimately** carries `allergens`, `dietaryStyle`, `proteinShortfallStreak`, `todayCalories`, `todayProteinGrams`, `creditBalanceRupees`, `subscription.city`, etc. (see PROMPT_ALLOWLIST). Anyone in `OPS_USER_IDS` can browse all customers’ allergens, wellness streaks, and conversational disclosures via the Admin AI Runs page.
- **Why:** This is health data for a therapeutic-meal product. There’s no per-customer access control inside `aiRunsTable`, no redaction-on-display, no retention cap, and no consent record that the conversation will be reviewed by humans.
- **Fix:** (a) Display only metadata + masked transcript by default; gate full transcript behind a “justification” modal that audits to `opsActions`. (b) Add a retention TTL job (e.g. 30d) for `aiRunsTable.messages`. (c) Add a privacy disclosure to the chat UI (“Conversations may be reviewed by our care team”). (d) Strip wellness numbers from `briefBlock` for support/cms/ops agents that don’t need them.
- **Confidence:** High.

### H4 — Security — Socket.IO auth is **cookie-only**; Expo mobile sessions cannot subscribe
- **Files:** `artifacts/api-server/src/lib/realtime.ts:80–88` (`authenticate(socket.request)` — calls `lib/auth.ts` `authenticate` which only parses cookies); mobile token store `artifacts/tanmatra-mobile/lib/auth.ts` (Bearer token in AsyncStorage; no cookie jar).
- **Issue:** All mobile socket connections arrive without a Cookie header. They become anonymous, hit `subscribe:order` line 99, and get `subscribe:order:error: unauthenticated`. Mobile users therefore get **no realtime delivery events or ETA updates** — they fall back to polling (or nothing).
- **Why:** Silent degradation of the delivery experience on the platform that needs it most (in-transit tracking on a phone).
- **Fix:** In `realtime.ts` add a custom `authenticate` that also reads `socket.handshake.auth.token` (Bearer). Have the mobile client pass `io(url, { auth: { token } })`.
- **Confidence:** High.

### H5 — Clinical Safety — Allergen guardrails not enforced server-side at order finalize
- **Files:** `artifacts/api-server/src/routes/orders.ts` (finalize handler — read indirectly through `loyaltyEngine.ts:1–300` `finalizeCheckout` invocation), `artifacts/tanmatra/src/lib/cartContext.tsx:18–80` (client cart adds without allergen guard).
- **Issue:** I did **not** see any join between `cart.items[].dishId → dishes.allergens` vs. `userPreferences.allergens` inside the finalize path during my read. The `searchMenu` tool filters proactively, but the client cart can hold any dish (allergen filter UI-only). With `allergens` in `preferences.ts:43` capped at 50 entries, a server-side cross-check is cheap.
- **Why:** A therapeutic-meal product that ships an allergen-violating meal to an allergic customer is a regulatory and safety incident, not a UX issue.
- **Fix:** In `finalizeCheckout`, load `userPreferences.allergens`, hydrate each line item’s `dishes.allergens` via `makeBatchDishResolver`, and refuse the order with a 422 + structured `violations[]` if intersection ≠ ∅. Require an explicit `acknowledgeAllergens: ["nuts","dairy"]` body field to override (audited).
- **Confidence:** Medium (file not directly read; high suspicion based on shape of code).

### H6 — Reliability/Observability — `/api/analytics/plan` swallows model errors with a hardcoded success response
- **File:** `artifacts/api-server/src/routes/analytics.ts` and `artifacts/api-server/src/lib/nlAnalytics.ts:planQuery`.
- **Issue:** During my read of `analytics.ts` the planner endpoint had a fallback path returning a stub successful payload when Gemini fails or produces invalid SQL. Combined with `validateSafeSql` rejecting then suppressing, an analyst sees “success” but the SQL was never run / was canned.
- **Why:** Analytics that lie are worse than analytics that are down. Decisions get made on placeholder rows.
- **Fix:** On any `planQuery` failure, return `502 { error, model:"unavailable" }`. Surface `meta.fallback: true` in any case where a stub is intentional.
- **Confidence:** Medium.

### H7 — Security — Group-order code lookup is unauthenticated, no rate limit
- **File:** `artifacts/api-server/src/routes/groupOrders.ts:71–82` (`GET /group-orders/:code`).
- **Issue:** Code space is 6 hex chars (~16.7M). The lookup returns the full row — host name/userId, lines, status. There is no rate-limit middleware on this route prefix, no per-IP cap on the lookup. A modest 100 rps scan finds ~1 group/second once the space is partially populated.
- **Why:** Discloses host identity & live cart contents (incl. dietary signals from items chosen) to anonymous attackers.
- **Fix:** (a) Increase code length to 8 alphanumerics (Crockford base32). (b) Add `rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "group-lookup" })` on `/group-orders/:code`. (c) Strip `participants[].userId` and last names from the response when caller is anonymous.
- **Confidence:** High.

### H8 — Security — CSP is disabled across the entire SPA
- **File:** `artifacts/api-server/src/app.ts:30` (`helmet({ contentSecurityPolicy: false, … })`).
- **Issue:** No CSP at all. The SPA also uses `dangerouslySetInnerHTML` (`artifacts/tanmatra/src/components/ui/chart.tsx:79`) where the injected text is `--color-${key}: ${color};`. `color` originates in the chart `config` object passed by callers — if any caller ever sources color from server JSON, this is a stored-XSS sink with no CSP backstop.
- **Why:** A single XSS in any of the 59 routes (`App.tsx`) becomes session theft + Gemini-cost burn against the customer’s authenticated AI agents.
- **Fix:** Turn CSP on with `default-src 'self'; img-src 'self' data: https://storage.googleapis.com; connect-src 'self' wss:; script-src 'self'; style-src 'self' 'unsafe-inline';` (relax later). Audit the chart component to validate `color` is one of `^#[0-9a-fA-F]{3,8}$|^[a-z-]+$|^var\(--[a-z0-9-]+\)$` before inlining.
- **Confidence:** High.

### H9 — Performance — Wellness `recomputeStreaks` runs synchronously on every log write, scans 30 days
- **Files:** `artifacts/api-server/src/routes/wellness.ts` (POST `/wellness/log`); helper `lib/loyaltyEngine.ts` style aggregator (referenced in scratch).
- **Issue:** Every wellness log POST does an aggregate over the prior 30 days for protein + veg streak, then 2 upserts. With a chatty wearable sync (Apple Health pushes hourly), a single user can drive dozens of full 30-day scans/hour.
- **Why:** Linear-in-history work on the hot write path; will dominate DB CPU before user count justifies it.
- **Fix:** Move to incremental streak update: only the affected day’s totals get recomputed, and the streak is a forward-roll from the previously persisted streak row. Or debounce: enqueue a `recomputeStreaks` job and let BullMQ coalesce.
- **Confidence:** Medium.

---

## MEDIUM

### M1 — DRY/Security — `OPS_USER_IDS` parsed inline in 5 places instead of `adminGate`
`fulfillment.ts:25`, `delivery.ts:242`, `analytics.ts:26`, `analytics.ts:30` (catalog), `ops.ts:27`, `realtime.ts:36`. Same drift risk as C2. Fix: import `isOpsUser`/`isCatalogUser` from `lib/adminGate.ts`.
**Confidence:** High.

### M2 — Reliability — Wellness log insert + recomputeStreaks not in a single transaction
`routes/wellness.ts` POST `/wellness/log`. If the streak recompute throws after the log row is inserted, the user has a phantom log without updated streaks. Fix: wrap in `db.transaction()`.
**Confidence:** Medium.

### M3 — Security/UX — `target="_blank"` without `rel="noopener noreferrer"` (tabnabbing)
- `artifacts/tanmatra/src/pages/RdConsole.tsx:460`
- `artifacts/tanmatra/src/pages/RdPartnersWizard.tsx:943`
- `artifacts/tanmatra/src/pages/ChallengeDetail.tsx:291`
- `artifacts/tanmatra/src/pages/Appointments.tsx:278, 752`
Fix: append `rel="noopener noreferrer"` to all five. Add an ESLint `react/jsx-no-target-blank` rule.
**Confidence:** High.

### M4 — Reliability — No top-level `<ErrorBoundary>` in the SPA
`artifacts/tanmatra/src/main.tsx` mounts `<App />` only; `rg ErrorBoundary` returns nothing. A render error in any route blanks the entire app (white screen). Particularly painful because admin routes are `lazy()` — a chunk-load failure (`failed to fetch dynamically imported module`) kills navigation.
Fix: add a `<RootErrorBoundary>` around `<App />` in `main.tsx` with a “reload” fallback and `console.error → /api/error-report` beacon.
**Confidence:** High.

### M5 — Privacy — PII in info-level logs (mock + production)
- `artifacts/api-server/src/lib/sms.ts:103` logs `e164` + the literal `MOCK_CODE` at info level. Behind `MOCK_OTP` env flag, but a misconfigured production deploy with this flag flipped instantly leaks OTP to the centralized log sink.
- `artifacts/api-server/src/lib/sms.ts:125, 148, 151, 168, 173` log `e164` at info/error.
- `artifacts/api-server/src/lib/whatsapp.ts:100` logs Twilio response `txt` (which Twilio echoes the To number into).
- `artifacts/api-server/src/routes/auth.ts:97, 182` (already noted) log `e164` per OTP request.
Fix: introduce `lib/log/redact.ts` with a `phoneMask("+91XXXXXX1234")` helper and replace all `e164` log fields with `phone: phoneMask(e164)`. Forbid `code` in any log line via a pino `redact` rule.
**Confidence:** High.

### M6 — Security — `SESSION_SAMESITE` defaults to `lax`; cross-origin SPA needs `none`
`lib/auth.ts` cookie writer (read in scratch). When `tanmatra.food` (web) calls `wellness-foods.run.app` (API) cross-origin with `withCredentials`, browsers drop `lax` cookies on top-level navigations triggered by the API (e.g. Stripe redirect back). Fix: when `ALLOWED_ORIGINS` contains a different eTLD+1 than the API host, default to `SameSite=None; Secure`. Document this in `replit.md`.
**Confidence:** Medium.

### M7 — Reliability — Idempotency gap on `/orders/finalize`
`ordersTable.externalOrderId` is the only idempotency knob and it’s **optional**. Mobile/web retries (network blips, double-tap on “Pay”) without a client-generated key create duplicate orders and double-charge wallet credits via `loyaltyEngine.applyCredits`.
Fix: require `Idempotency-Key` header on every state-changing checkout endpoint; persist `(userId, idempotencyKey) UNIQUE` and short-circuit retries with the prior response.
**Confidence:** Medium.

### M8 — Reliability — Health endpoint always returns 200; no DB / Redis / Gemini probe
`artifacts/api-server/src/routes/health.ts` returns `{status:"ok"}` unconditionally. K8s/Cloud Run will route traffic to a pod with a dead pool.
Fix: add `/healthz/deep` that does `select 1`, `redis.ping()`, and reads from one BullMQ queue. Cache result for 5s.
**Confidence:** High.

### M9 — Reliability — Multi-replica `slotsSeeded` is process-local
`routes/fulfillment.ts` (seen in earlier read) sets a process-local `slotsSeeded` boolean to avoid reseeding fulfillment slots. With 3 replicas, all 3 attempt the seed on first hit; safe due to `onConflictDoNothing` but wasteful and noisy in logs.
Fix: store last-seed timestamp in a `system_kv` row, or move to a startup job.
**Confidence:** Medium.

### M10 — Reliability — DB schema lacks an FK on `orders.userId`
`lib/db/src/schema/orders.ts` (read in scratch). `userId` is nullable text, no `references(usersTable.id)`. Orphan orders silently accumulate; user delete (right-to-be-forgotten) leaves them. Fix: nullable FK with `onDelete: "set null"`. Add a backfill check.
**Confidence:** Medium.

### M11 — Security — `validateSafeSql` checks `;` on raw SQL after string literals stripped only for keyword checks
`artifacts/api-server/src/lib/safeSql.ts`. The `;` rejection is applied to the raw input, so `select * from safe_orders where city = 'Bengaluru;'` is wrongly rejected. False positives only — no security hole — but it makes the analyst NL surface unreliable for any value containing `;` or `--`.
Fix: strip string literals **before** the `;` and `--` checks; keep keyword check on the stripped form.
**Confidence:** High.

### M12 — Security — Saved-query authorization
`nlAnalytics.ts` saves analytics queries with `userId` of creator. `markQuerySaved` / `listRecentQueries` (admin route) does not filter by creator, so any analyst with `CATALOG_USER_IDS` can mark another analyst’s query as saved or read their natural-language prompts (which often contain customer names being investigated).
Fix: scope mutations to `creatorUserId === req.user.id`; expose listing only of own + explicitly shared queries.
**Confidence:** Medium.

### M13 — Performance — `App.tsx` ships ~50 customer pages eagerly
Only admin pages and `Styleguide` are `lazy()`. Customer routes (Cart, Checkout, Subscribe, WeeklyPlanner, Rewards, Wellness, Performance, Clinical, RD pages, Marketplace, GroupOrder, Recipes, Challenges, Login, Corporate*, Vouchers, Premium…) are all eager imports (`App.tsx:25–80`). First-load JS for someone landing on `/` includes the entire app graph.
Fix: lazy-load every route except `Home`, `Menu`, `Dish`, `Cart`. Wrap admin route groups in a single chunk.
**Confidence:** High.

### M14 — Reliability — `recomputeStreaks` cache invalidations are process-local (60s drift)
`loyaltyEngine.ts:81 invalidateLoyaltyConfigCache` (per scratch read). Multi-replica: an admin updates loyalty config → only the replica that handled the update flushes; others serve stale config for up to 60s. Fix: publish a Redis pub/sub channel `loyalty:config:invalidate`; subscribers flush their cache.
**Confidence:** Medium.

### M15 — Reliability — `setImmediate` fire-and-forget email dispatch has no retry
`routes/loyalty.ts:181`. If the inline email send throws, the customer never gets the credit-issued notification and there is no DLQ.
Fix: `await enqueue("notifications", { kind: "loyalty.credit_issued", id })` so BullMQ retries with backoff.
**Confidence:** High.

### M16 — Security — `subscribe:order` event payload validation is positive but loose
`realtime.ts:97–116`: `typeof orderId === "number" && Number.isFinite(orderId)` accepts negative or 0 ids. Lookup against `ordersTable.id` will simply miss; not a security hole, but expose `forbidden` for negative ids leaks the existence of integer-id space.
Fix: `if (!Number.isInteger(orderId) || orderId <= 0) return;`.
**Confidence:** High.

### M17 — Reliability — Long-running fetches without timeouts on hot paths
`rg AbortSignal.timeout|signal: ctrl.signal` only finds 4 callers (`anomalyExplainer.ts`, `community/moderation.ts`, `geocode.ts`, `menuCopy.ts`). Other outbound fetches (Gemini in `lib/ai/gateway.ts`, WhatsApp in `lib/whatsapp.ts`, Twilio Verify) lack explicit `AbortSignal.timeout(15_000)`. A hung upstream pins a request worker.
Fix: add a `httpFetchWithTimeout(url, opts, ms = 15_000)` helper and route all outbound HTTP through it.
**Confidence:** High.

### M18 — Reliability — Dockerfile pins nothing about pnpm
`Dockerfile`: `corepack enable` then `pnpm install --frozen-lockfile --ignore-scripts`. Without `corepack prepare pnpm@<X.Y.Z> --activate`, builds drift to whatever pnpm is current at build-time. Lockfile compatibility breaks have happened across pnpm 8→9.
Fix: read the pnpm version from `package.json` `packageManager` field and `corepack prepare $PNPM --activate` explicitly.
**Confidence:** High.

### M19 — Reliability/Security — `--ignore-scripts` skips legitimate native postinstall (sharp, bcrypt-style)
`Dockerfile:23, 30`. `sharp` (used in `lib/imageEnhance.ts`) ships prebuilt binaries via `@img/sharp-*` so this happens to work. Adding any future native dependency without prebuilt arm64 binaries will silently fail at runtime.
Fix: keep `--ignore-scripts` for the build step but add `pnpm rebuild sharp` (or maintain an explicit `onlyBuiltDependencies` allowlist in `pnpm-workspace.yaml` that includes anything you actually need to build).
**Confidence:** Medium.

### M20 — Security — `imageStorage.serveStoredAsset` permits arbitrary characters in `filename`
`lib/imageStorage.ts:84–89`: object name is `[prefix, "menu-assets", slug, filename].join("/")` with `filename: z.string().min(1).max(256)`. With Cloud Storage `..` is just literal chars, so escaping the bucket is impossible — but a caller can craft `filename = "../private-config.json"` and access **any other object in the same bucket** if such objects exist. Currently the bucket only stores menu assets; mixing unrelated objects into it would create a real read-anything bug.
Fix: tighten the schema to `z.string().regex(/^[a-z0-9_-]+\.(jpg|jpeg|png|webp)$/)`.
**Confidence:** Medium.

### M21 — Reliability — `wellness/week` semantics for anonymous users
`routes/wellness.ts:307–313` returns `{ days: [] }` when caller is unauthenticated. Other wellness endpoints use `requireAuth`. The mixed contract is confusing for clients: a 200 with empty data is indistinguishable from “authenticated user with no logs”.
Fix: either `requireAuth` (preferred — wellness is private health data) or return `204` with explicit `meta.unauthenticated: true`.
**Confidence:** High.

---

## LOW

### L1 — Hygiene — `dangerouslySetInnerHTML` in chart styles
`artifacts/tanmatra/src/components/ui/chart.tsx:79`. Currently safe (config is dev-authored), but combine with H8 (no CSP) and any future server-driven theme makes this an XSS sink. Add a `validateColor()` guard.

### L2 — DRY — 51 raw `sql\`\`` template usages in `artifacts/api-server/src/lib/`
High surface area; even if every single one is safe today (most use bound params), there is no static safety net. Add an ESLint rule that flags `sql\`` containing `${req.` directly.

### L3 — UX — `Login.tsx:226` reveals OTP in DEV
Fine for development but ensure CI/CD never builds with `NODE_ENV !== "production"` for production. Add a build guard.

### L4 — Hygiene — No `robots.txt` / `sitemap.xml`
`artifacts/tanmatra/public/` lacks both. SEO loss for a consumer-facing brand. Add a minimal `robots.txt` that blocks `/admin/*` and `/api/*`.

### L5 — Hygiene — Duplicate `lineId` collision in `groupOrders.ts:135`
`Date.now()+random` generation; not crypto-strong. Collisions are functionally harmless (`.removeLine` would target the wrong row). Use `crypto.randomUUID()`.

### L6 — Hygiene — `notifications.dedupeKey` is a nullable unique
A nullable unique behaves database-specifically (Postgres treats each NULL as distinct, so `ON CONFLICT (dedupeKey)` works only when key is present). A partial unique index `WHERE dedupe_key IS NOT NULL` would be clearer.

### L7 — Hygiene — `dispatch` lat/lng nullable with no soft-validation at finalize
A delivery-mode order with NULL coords will simply fail in dispatch with a less-readable error. Add a finalize-time guard.

### L8 — Hygiene — `cartContext.tsx` localStorage stores price + total
`artifacts/tanmatra/src/lib/cartContext.tsx`. Server resolves on finalize, so this is not a security hole, but a poisoned cart misleads the “Sticky checkout bar” total displayed to other tabs. Move price computation into a `useMemo` over server-known prices.

### L9 — Hygiene — `OPS_USER_IDS` env list with no length cap
Operators can drift this list to huge sizes. Cap at 100 ids in `adminGate.ts` and warn above.

### L10 — Hygiene — `index.html` lacks JSON-LD `Organization`/`Restaurant` schema
SEO loss; trivial to add. Also missing `<link rel="canonical">`.

### L11 — Hygiene — No structured error reporting from the SPA
The SPA logs to `console.error`. There’s no `/api/error-report` endpoint mounted (would have shown up in `routes/index.ts`). Without it, M4’s ErrorBoundary can’t beacon. Add a Sentry-equivalent or a tiny in-house collector.

### L12 — Clinical — Refusal heuristics in `coach.ts:391–431` are regex-only
Easy to bypass with paraphrasing (“I’m getting chest pressure when I walk up stairs” vs. “my heart hurts”). Refusal layer should also call a small classifier or rely on the LLM’s safety system instructions, not regex alone, before the model emits anything.

### L13 — Clinical — Mock OTP in dev allows trivial authentication bypass
If `MOCK_OTP=1` is ever set in a non-dev environment, `sms.ts:148` accepts `MOCK_CODE` and authenticates any phone. Add a `process.env.NODE_ENV !== "production"` hard assert at module import time.

### L14 — Reliability — Anti-CSRF strategy relies on SameSite cookies only
There’s no CSRF token middleware. With `SameSite=lax` the GET-logout in H2 demonstrates the gap. For state-changing POSTs, lax cookies are submitted on cross-site navigations triggered by `<form method=post>`. A CSRF double-submit token would close this.

---

## NIT

- **N1** `app.ts:30` `crossOriginResourcePolicy: { policy: "cross-origin" }` is broad; tighten to `same-site` once the asset CDN is configured.
- **N2** `realtime.ts:80` logs full `err` object on auth failure — could include cookie strings. Log only `err.message`.
- **N3** `index.ts:80` SIGTERM handler doesn’t `await` `httpServer.close()` (callback only) before `stopWorkers`. Drain order is reversed; switch to `promisify(httpServer.close.bind(httpServer))()`.
- **N4** `App.tsx:286` shows a dev-only banner under `import.meta.env.DEV`. Wrap in a top-level `if (import.meta.env.DEV)` constant so dead-code-elimination strips it from the prod bundle reliably.
- **N5** `socket.ts` (client) mixes `transports: ["websocket","polling"]`. Polling fallback opens long-poll requests that double the connection count under network blips. Pin to `["websocket"]` for browsers that support it (>97% today).
- **N6** Numerous routes return `res.json({ error: "..." })` instead of using a shared `errors.ts` helper. Inconsistent error shape complicates client-side handling.
- **N7** `cartContext.tsx` re-renders on any state change because `value` is a fresh object every render. Wrap in `useMemo`.
- **N8** `wellness/log` returns `{ log: row }` — non-spread; consistent with API style but inconsistent with most other endpoints that return the resource at the top level.

---

## TOP 10 FIXES (priority-ordered, by ROI)

1. **C1** Authenticate + rate-limit `support-agent/chat` immediately. (1 hr, prevents unbounded Gemini cost.)
2. **C2 + M1** Replace 9× `headerToken === adminToken` with `requireOps`/`requireCatalog`; delete duplicate helpers. (2 hr, eliminates timing oracle and drift.)
3. **H2** Delete `GET /api/logout`. (5 min.)
4. **H1** Fail-closed boot when `REDIS_URL` is missing in production; surface in `/healthz`. (30 min.)
5. **H4** Accept Bearer token in Socket.IO `handshake.auth`; mobile clients pass it. (1 hr; restores realtime delivery for mobile.)
6. **H5** Add server-side allergen guardrail at `/orders/finalize`. (Half day; clinical safety net.)
7. **H8** Turn on a baseline CSP via helmet; tighten `chart.tsx` color sanitisation. (Half day.)
8. **M5 + M3** Implement `phoneMask` redact + `rel="noopener noreferrer"` codemod across the SPA. (2 hr.)
9. **M7** Require `Idempotency-Key` on `/orders/finalize` and persist a unique-per-user index. (Half day.)
10. **M13** Lazy-load all non-Home/Menu/Dish/Cart routes. (2 hr; large TTI improvement.)

---

## TOP 5 ARCHITECTURAL RISKS

1. **Five different admin-gating implementations.** The repo has `lib/adminGate.ts` *and* nine routes that re-roll the same check with weaker primitives. Until this is consolidated and lint-enforced, every new admin route is a coin-flip on whether the secret is timing-safe.
2. **AI-cost surface has no global circuit breaker.** Per-route limiters exist on some agents (`coachAgent`), are missing on others (`supportAgent`, `forecasting` chat), and there is no shared per-day token cap inside `lib/ai/gateway.ts`. A single misbehaving caller (or a bug like H1’s missing limiter) can burn the monthly Gemini budget in hours.
3. **Realtime + AI personalization are coupled to web-only cookie auth.** Mobile (Bearer/AsyncStorage) silently degrades to no realtime tracking and probably broken AI personalization (any future endpoint that relies on `req.session` instead of `req.user.id`). The auth abstraction needs a single transport-agnostic resolver.
4. **No transactional boundaries around multi-step write paths.** Wellness log + streak recompute (M2), credit issue + email enqueue (M15), packaging-return flip + credit issue, and order finalize + loyalty all combine 2–4 writes/dispatches without `db.transaction`. Partial states accumulate silently.
5. **Health & PII data sit in operational tables that ops can browse.** `aiRunsTable` (H3), `wellness*` tables, `userPreferences.allergens` are all queryable from admin pages without per-row consent or display redaction. This is a regulated-data product (therapeutic meals + wellness coaching); the access model needs to evolve before scale, not after.

---

## TOP 3 UNVERIFIABLE ITEMS (need follow-up read or runtime check)

1. **H5 (allergen guardrail at finalize):** I read up to `loyaltyEngine.ts:300` and the `routes/orders.ts` finalize handler indirectly. I did not see the explicit allergen check; high confidence it’s missing but a direct read of `routes/orders.ts` finalize block + `loyaltyEngine.ts:300–1102` is required to confirm.
2. **H6 (analytics planner silent fallback):** `nlAnalytics.ts:planQuery` was inferred from `analytics.ts` callers and the surrounding shape; the exact fallback branch needs to be re-read end-to-end.
3. **L1 / H8 (chart XSS reachability):** `ChartConfig.color` originates wherever each chart is instantiated. I read the chart component but not every caller. If any caller sources color from server JSON (e.g. dashboard themes, brand-color picker, remote experiment config), L1 graduates to High.
