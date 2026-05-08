/**
 * Community cohort + moderation schema (Task #38).
 *
 * Cohorts are deterministically computed from a user's preferences
 * (goal + dietary style for now). A weekly job — or an admin button —
 * generates one challenge per cohort using Gemini, with a deterministic
 * fallback. Progress is derived from existing orders/wellness logs, not
 * stored per-tick.
 *
 * Moderation decisions cover any user-generated text (challenge posts,
 * dish reviews) and are AI-driven by default. Every decision is auditable
 * and can be appealed; an admin reviews appeals from a queue.
 */

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export type CohortChallengeStatus = "draft" | "active" | "ended";
export type CohortChallengeMetric =
  | "high_protein_lunches"
  | "plant_forward_meals"
  | "calorie_floor_days"
  | "logged_meals"
  | "ordered_days";

export interface CohortCriteria {
  goal?: string[];
  dietaryStyle?: string[];
}

export const cohortsTable = pgTable("community_cohorts", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description").notNull().default(""),
  criteria: jsonb("criteria").$type<CohortCriteria>().notNull().default({}),
  active: integer("active").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cohortMembersTable = pgTable(
  "community_cohort_members",
  {
    id: serial("id").primaryKey(),
    cohortId: integer("cohort_id")
      .notNull()
      .references(() => cohortsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_cohort_member").on(t.cohortId, t.userId),
    index("idx_cohort_member_user").on(t.userId),
  ],
);

export const cohortChallengesTable = pgTable(
  "community_cohort_challenges",
  {
    id: serial("id").primaryKey(),
    cohortId: integer("cohort_id")
      .notNull()
      .references(() => cohortsTable.id, { onDelete: "cascade" }),
    weekStartDate: varchar("week_start_date", { length: 10 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    metric: varchar("metric", { length: 32 })
      .$type<CohortChallengeMetric>()
      .notNull(),
    targetCount: integer("target_count").notNull().default(5),
    rewardPoints: integer("reward_points").notNull().default(50),
    status: varchar("status", { length: 16 })
      .$type<CohortChallengeStatus>()
      .notNull()
      .default("draft"),
    model: varchar("model", { length: 64 }),
    aiRationale: text("ai_rationale"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_cohort_week").on(t.cohortId, t.weekStartDate),
    index("idx_cohort_challenge_status").on(t.status),
  ],
);

export type ModerationContentType =
  | "challenge_post"
  | "dish_review"
  | "challenge_photo";
export type ModerationDecision = "allowed" | "flagged" | "hidden";
export type ModerationActor = "ai" | "human";
export type ModerationCategory =
  | "harassment"
  | "hate"
  | "self_harm"
  | "spam"
  | "medical_misinfo"
  | "off_topic"
  | "pii"
  | "sexual"
  | "other";

export const moderationDecisionsTable = pgTable(
  "moderation_decisions",
  {
    id: serial("id").primaryKey(),
    contentType: varchar("content_type", { length: 24 })
      .$type<ModerationContentType>()
      .notNull(),
    contentId: integer("content_id").notNull(),
    userId: varchar("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    decision: varchar("decision", { length: 16 })
      .$type<ModerationDecision>()
      .notNull(),
    severity: integer("severity").notNull().default(1),
    categories: jsonb("categories")
      .$type<ModerationCategory[]>()
      .notNull()
      .default([]),
    rationale: text("rationale").notNull().default(""),
    actor: varchar("actor", { length: 8 })
      .$type<ModerationActor>()
      .notNull()
      .default("ai"),
    reviewerId: varchar("reviewer_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    model: varchar("model", { length: 64 }),
    snapshot: text("snapshot").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_moderation_content").on(t.contentType, t.contentId),
    index("idx_moderation_decision").on(t.decision, t.createdAt),
  ],
);

export type ModerationAppealStatus = "open" | "upheld" | "overturned";

export const moderationAppealsTable = pgTable(
  "moderation_appeals",
  {
    id: serial("id").primaryKey(),
    decisionId: integer("decision_id")
      .notNull()
      .references(() => moderationDecisionsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reason: text("reason").notNull().default(""),
    status: varchar("status", { length: 16 })
      .$type<ModerationAppealStatus>()
      .notNull()
      .default("open"),
    reviewerId: varchar("reviewer_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reviewerNote: text("reviewer_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    // Only one OPEN appeal per decision; resolved appeals don't block
    // a follow-up filing and won't collide with each other on resolve.
    uniqueIndex("uq_open_appeal_per_decision")
      .on(t.decisionId)
      .where(sql`status = 'open'`),
    index("idx_appeals_status").on(t.status, t.createdAt),
  ],
);

export type Cohort = typeof cohortsTable.$inferSelect;
export type CohortMember = typeof cohortMembersTable.$inferSelect;
export type CohortChallenge = typeof cohortChallengesTable.$inferSelect;
export type ModerationDecisionRow =
  typeof moderationDecisionsTable.$inferSelect;
export type ModerationAppealRow = typeof moderationAppealsTable.$inferSelect;
