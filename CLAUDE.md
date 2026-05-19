# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Install dependencies**
```bash
pnpm install
```

**Run apps (always filter — never run `pnpm dev` at the workspace root)**
```bash
pnpm --filter @workspace/api-server run dev       # Express API server
pnpm --filter @workspace/tanmatra run dev          # Customer web app (Vite)
pnpm --filter @workspace/tanmatra-mobile run dev   # Expo mobile app
```

**Type-checking and build**
```bash
pnpm run typecheck          # Full typecheck: lib project refs + all artifact packages
pnpm run typecheck:libs     # Lib packages only (tsc --build on tsconfig.json at root)
pnpm run build              # typecheck + build all packages
```

**Tests**
```bash
pnpm run test                                               # All tests across the workspace
pnpm --filter @workspace/api-server run test               # All api-server tests
# Run a single test file (from api-server):
node --test --import tsx ./src/lib/loyaltyEngine.checkout.test.ts
node --test --import tsx ./src/lib/dispatch.bulkhead.test.ts
node --test --import tsx ./src/lib/mealPlanner.test.ts
node --test --import tsx ./src/routes/groupOrders.test.ts
```

**API codegen (after changing `lib/api-spec/openapi.yaml`)**
```bash
pnpm --filter @workspace/api-spec run codegen   # Regenerates React Query hooks + Zod schemas via Orval
```

**Database (dev only — requires `DATABASE_URL`)**
```bash
pnpm --filter @workspace/db run push    # Push Drizzle schema to database
```

**Evals**
```bash
pnpm run evals    # Runs api-server AI evals
```

## Architecture

This is a pnpm monorepo for **Tanmatra** — a clinical-grade meal-delivery and wellness platform.

### Package layout

| Path | Role |
|------|------|
| `artifacts/tanmatra` | Customer web app — React 19 + React Router v7 + Vite |
| `artifacts/tanmatra-mobile` | Expo React Native app |
| `artifacts/api-server` | Express 5 backend |
| `artifacts/mockup-sandbox` | Vite preview server for UI mockup work |
| `lib/api-spec` | **OpenAPI source of truth** (`openapi.yaml`) + Orval codegen config |
| `lib/api-client-react` | Generated React Query hooks + Zod schemas (do not edit manually) |
| `lib/api-zod` | Shared Zod request/response schemas |
| `lib/db` | Drizzle ORM schema + migrations (Postgres) |
| `lib/menu-catalog` | Shared dish/menu data types |
| `lib/preferences-match` | Shared dietary preference-matching logic |
| `lib/integrations-gemini-ai` | Gemini AI integration utilities |
| `scripts/` | One-off data scripts (seeding, backfills, audits) |

### Contract-first API flow

1. Edit `lib/api-spec/openapi.yaml` (single source of truth).
2. Run `pnpm --filter @workspace/api-spec run codegen` — Orval regenerates `lib/api-client-react` (hooks) and `lib/api-zod` (schemas).
3. The API server validates requests/responses using the same generated Zod schemas.
4. The web app consumes the generated React Query hooks from `@workspace/api-client-react`.

### API server internals (`artifacts/api-server`)

- **Entry**: `src/index.ts` → `src/app.ts` (Express app) → `src/routes/index.ts` (mounts all routers).
- **Auth**: Session cookie (`authMiddleware`) with an admin token shim (`adminSessionShim`) for admin routes.
- **Rate limiting**: Per-route middleware in `src/middlewares/rateLimitMiddleware.ts` (separate limits for menu, orders, AI, payments, addresses).
- **Dispatch engine**: `src/lib/dispatch.ts` — heuristic rider assignment with priority tiers (`routine` / `urgent` / `stat`). STAT orders have a 5-minute SLA breach threshold.
- **Queue**: BullMQ + Redis (`src/lib/queue.ts`) for async order pipeline steps. Redis is optional; queuing is skipped when `REDIS_URL` is absent.
- **AI agents**: `src/lib/ai/` — agent gateway (`gateway.ts`), registry (`agentRegistry.ts`), and agents for support, ops, reorder, CMS, and coach. Each agent is defined with `definePrompt` + `defineTool` helpers.
- **Realtime**: Socket.IO (`src/lib/realtime.ts`) for live order tracking events.
- **Scheduled jobs**: `src/lib/analyticsScheduler.ts`, `mealPlanScheduler.ts`, `menuEngineeringScheduler.ts`, `loyaltyScheduler.ts`, `anomalyScheduler.ts`.

### Web app internals (`artifacts/tanmatra`)

- **Routing**: File-based via React Router v7 (`src/routes.ts`). Admin routes are behind `AdminAuthLayout`; RD console behind `RdAuthLayout`.
- **Design system**: `src/index.css` is the single source of truth for all CSS custom properties (`@theme`): colors, type scale, radii, shadows, motion durations/easings. JS tokens are mirrored in `src/lib/motion.ts` for Framer Motion.
- **Global chrome**: `src/components/layout/Header.tsx` (desktop) and `BottomNav.tsx` (mobile). IA grouping: **Eat / Plan / Track / Community / Account**. Update both when adding customer routes.
- **Command palette**: `src/components/CommandPalette.tsx` — global ⌘K; register new customer routes here.
- **Data fetching**: `@workspace/api-client-react` generated hooks + TanStack Query. `useMenuCatalog()` falls back to `STATIC_DISHES` so the UI never blanks.
- **Icons**: Phosphor (`@phosphor-icons/react`) on new customer surfaces; Lucide (`lucide-react`) on legacy admin/RD screens.
- **Live styleguide**: `/__styleguide` route (`src/pages/Styleguide.tsx`) — keep in sync when adding tokens.

### Database (`lib/db`)

Drizzle ORM against Postgres. Schema files live in `lib/db/src/schema/` — one file per domain (orders, auth, riders, menu items, subscriptions, etc.). Migrations are managed via `drizzle-kit`.

### Required environment variables

| Variable | Used by |
|----------|---------|
| `DATABASE_URL` | `lib/db`, `artifacts/api-server` |
| `REDIS_URL` | `artifacts/api-server` (BullMQ queue — optional) |

## Key conventions

- **Colors**: Clinical Dark palette is locked — `#D4AF37` (clinical-gold), `#6BA3C8` (blue), `#7D9E7E` (sage). No new base colors without explicit approval.
- **New design tokens**: Add to `src/index.css @theme` AND update `/__styleguide`.
- **Tabular numerals**: Use `.text-clinical-data` / `font-variant-numeric: tabular-nums` wherever clinical data is displayed.
- **Combo cards on Menu**: Must be a single clickable card opening a Dialog listing constituent dishes (each linking to `/dish/:slug`) with an "Add Combo" CTA.
- **Zod imports**: Use `zod/v4` (`import { z } from "zod/v4"`) — not the legacy `zod` entry.
- **Package manager**: `pnpm` only. The root `preinstall` script rejects npm/yarn.
