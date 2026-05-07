import {
  boolean,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const dishAvailabilityTable = pgTable("dish_availability", {
  slug: varchar("slug", { length: 128 }).primaryKey(),
  available: boolean("available").notNull().default(true),
  reason: text("reason"),
  updatedBy: varchar("updated_by", { length: 128 }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type DishAvailability = typeof dishAvailabilityTable.$inferSelect;

export const opsActionsTable = pgTable(
  "ops_actions",
  {
    id: serial("id").primaryKey(),
    operatorId: varchar("operator_id", { length: 128 }),
    agent: varchar("agent", { length: 64 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    params: jsonb("params").notNull(),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    status: varchar("status", { length: 32 }).notNull(),
    error: text("error"),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ops_actions_operator_created").on(
      table.operatorId,
      table.createdAt,
    ),
    index("idx_ops_actions_action_created").on(table.action, table.createdAt),
  ],
);

export type OpsAction = typeof opsActionsTable.$inferSelect;
export type InsertOpsAction = typeof opsActionsTable.$inferInsert;
