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

export const etaPredictionsTable = pgTable(
  "eta_predictions",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    zone: varchar("zone", { length: 64 }).notNull(),
    modelVersion: varchar("model_version", { length: 32 })
      .notNull()
      .default("v1-heuristic"),
    predictedMinutes: doublePrecision("predicted_minutes").notNull(),
    predictedEtaAt: timestamp("predicted_eta_at", {
      withTimezone: true,
    }).notNull(),
    features: jsonb("features").$type<Record<string, number | string>>(),
    actualMinutes: doublePrecision("actual_minutes"),
    actualDeliveredAt: timestamp("actual_delivered_at", {
      withTimezone: true,
    }),
    errorMinutes: doublePrecision("error_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_eta_predictions_order").on(table.orderId),
    index("idx_eta_predictions_zone_created").on(table.zone, table.createdAt),
  ],
);

export const insertEtaPredictionSchema = createInsertSchema(
  etaPredictionsTable,
).omit({ id: true, createdAt: true });
export type InsertEtaPrediction = z.infer<typeof insertEtaPredictionSchema>;
export type EtaPrediction = typeof etaPredictionsTable.$inferSelect;
