import {
  pgTable,
  serial,
  varchar,
  integer,
  jsonb,
  timestamp,
  text,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { mealPlansTable } from "./mealPlans";
import type {
  MealPlanConstraints,
  MealPlanDay,
  MealPlanTotals,
} from "./mealPlans";

/**
 * Cached AI-drafted summary of a client used by the RD copilot. Refreshed
 * on demand from the RD console; not auto-regenerated.
 */
export const rdClientSummariesTable = pgTable(
  "rd_client_summaries",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rdSlug: varchar("rd_slug", { length: 64 }).notNull(),
    summary: text("summary").notNull(),
    /** Compact JSON of source signals (goals, allergens, recent orders). */
    sources: jsonb("sources").$type<Record<string, unknown>>(),
    model: varchar("model", { length: 64 }),
    draftedAt: timestamp("drafted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_rd_summary_user_rd").on(t.userId, t.rdSlug),
  ],
);

export type RdPlanProposalStatus =
  | "ai_drafted"
  | "rd_editing"
  | "rd_approved"
  | "rejected";

/**
 * RD-facing draft of a meal plan. Distinct from `meal_plans` (which is the
 * user-facing record). On approval the proposal is copied into
 * `meal_plans` as a `draft` row with model="rd-approved", and the user can
 * tap Accept to attach it to a subscription.
 */
export const rdPlanProposalsTable = pgTable(
  "rd_plan_proposals",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rdSlug: varchar("rd_slug", { length: 64 }).notNull(),
    weekStartDate: date("week_start_date").notNull(),
    status: varchar("status", { length: 16 })
      .$type<RdPlanProposalStatus>()
      .notNull()
      .default("ai_drafted"),
    constraints: jsonb("constraints").$type<MealPlanConstraints>().notNull(),
    days: jsonb("days").$type<MealPlanDay[]>().notNull().default([]),
    totals: jsonb("totals").$type<MealPlanTotals>(),
    aiRationale: text("ai_rationale"),
    rdNotes: text("rd_notes"),
    /** Set on approval — id of the materialised user `meal_plans` row. */
    mealPlanId: integer("meal_plan_id").references(
      () => mealPlansTable.id,
      { onDelete: "set null" },
    ),
    model: varchar("model", { length: 64 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_rd_proposal_rd").on(t.rdSlug, t.status),
    index("idx_rd_proposal_user").on(t.userId),
  ],
);

export type RdAuditKind =
  | "summary_generated"
  | "proposal_drafted"
  | "proposal_edited"
  | "proposal_approved"
  | "proposal_rejected"
  | "nudge_sent";

/**
 * Append-only log of every AI suggestion and RD decision. Used for
 * downstream quality review of the copilot.
 */
export const rdAuditLogTable = pgTable(
  "rd_audit_log",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rdSlug: varchar("rd_slug", { length: 64 }).notNull(),
    proposalId: integer("proposal_id"),
    // NOTE: no FK on proposalId — we keep audit rows even if a proposal
    // is later deleted, so the AI/RD decision history is preserved.
    kind: varchar("kind", { length: 32 }).$type<RdAuditKind>().notNull(),
    actor: varchar("actor", { length: 8 })
      .$type<"ai" | "rd">()
      .notNull()
      .default("rd"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_rd_audit_rd_user").on(t.rdSlug, t.userId, t.createdAt),
  ],
);

export type AdherenceEventKind =
  | "skipped_delivery"
  | "over_calories"
  | "missed_protein"
  | "outside_plan";

/**
 * Per-day drift event detected by the adherence scanner. Idempotent on
 * (userId, mealPlanId, dayDate, kind) so re-running the scan does not
 * duplicate rows.
 */
export const adherenceEventsTable = pgTable(
  "adherence_events",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    mealPlanId: integer("meal_plan_id")
      .notNull()
      .references(() => mealPlansTable.id, { onDelete: "cascade" }),
    dayDate: date("day_date").notNull(),
    kind: varchar("kind", { length: 24 }).$type<AdherenceEventKind>().notNull(),
    severity: integer("severity").notNull().default(1),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    nudgeSentAt: timestamp("nudge_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_adherence_event").on(
      t.userId,
      t.mealPlanId,
      t.dayDate,
      t.kind,
    ),
    index("idx_adherence_user").on(t.userId, t.dayDate),
  ],
);

export type RdClientSummary = typeof rdClientSummariesTable.$inferSelect;
export type RdPlanProposal = typeof rdPlanProposalsTable.$inferSelect;
export type RdAuditEntry = typeof rdAuditLogTable.$inferSelect;
export type AdherenceEvent = typeof adherenceEventsTable.$inferSelect;
