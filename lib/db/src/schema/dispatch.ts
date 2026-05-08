import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  doublePrecision,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { ridersTable } from "./riders";

export const dispatchDecisionsTable = pgTable(
  "dispatch_decisions",
  {
    id: serial("id").primaryKey(),
    batchKey: varchar("batch_key", { length: 64 }).notNull(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    chosenRiderId: integer("chosen_rider_id").references(() => ridersTable.id),
    chosenScore: doublePrecision("chosen_score"),
    chosenBreakdown: jsonb("chosen_breakdown").$type<Record<string, number | string>>(),
    chosenDistanceKm: doublePrecision("chosen_distance_km"),
    baselineRiderId: integer("baseline_rider_id").references(() => ridersTable.id),
    baselineScore: doublePrecision("baseline_score"),
    baselineDistanceKm: doublePrecision("baseline_distance_km"),
    strategy: varchar("strategy", { length: 32 }).notNull().default("smart"),
    batched: integer("batched").notNull().default(0),
    operatorId: varchar("operator_id", { length: 64 }),
    notes: varchar("notes", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_dispatch_decisions_order").on(table.orderId),
    index("idx_dispatch_decisions_batch").on(table.batchKey),
    index("idx_dispatch_decisions_created").on(table.createdAt),
  ],
);

export const insertDispatchDecisionSchema = createInsertSchema(
  dispatchDecisionsTable,
).omit({ id: true, createdAt: true });
export type InsertDispatchDecision = z.infer<
  typeof insertDispatchDecisionSchema
>;
export type DispatchDecision = typeof dispatchDecisionsTable.$inferSelect;
