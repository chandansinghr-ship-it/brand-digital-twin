import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// Customer Net Promoter Score responses. Stays read-only-friendly: comment
// is the only free-text field.
export const npsResponsesTable = pgTable(
  "nps_responses",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 128 }),
    score: integer("score").notNull(),
    comment: text("comment"),
    source: varchar("source", { length: 32 })
      .notNull()
      .default("post_delivery"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_nps_created").on(t.createdAt)],
);
export type NpsResponse = typeof npsResponsesTable.$inferSelect;
