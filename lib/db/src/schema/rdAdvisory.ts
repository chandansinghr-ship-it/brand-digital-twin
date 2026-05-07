import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  text,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Maps an authenticated user to a single RD slug. A user with a row here is
 * authorised to act as that RD in the console (read clients' messages /
 * progress / labs and post replies as the RD).
 */
export const rdUsersTable = pgTable(
  "rd_users",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rdSlug: varchar("rd_slug", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_rd_users_user").on(t.userId),
    uniqueIndex("uq_rd_users_slug").on(t.rdSlug),
  ],
);

export type AppointmentKind = "intro_15m" | "follow_up_30m" | "follow_up_45m";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled";
export type PaymentStatus = "free" | "pending" | "paid" | "refunded";
export type RdMessageSender = "user" | "rd";

/**
 * Optional override for RD office-hour windows. When no rows exist for an
 * RD, the API falls back to the static schedule shipped in the client
 * (rdBookingData.ts). When rows exist, they take precedence.
 *
 * dayOfWeek: 0=Sun..6=Sat. startMinute/endMinute are minutes-since-midnight
 * in the RD's local timezone (server treats as IST for this app).
 */
export const rdAvailabilityTable = pgTable(
  "rd_availability",
  {
    id: serial("id").primaryKey(),
    rdSlug: varchar("rd_slug", { length: 64 }).notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_rd_avail_slug").on(t.rdSlug, t.dayOfWeek)],
);

export const rdAppointmentsTable = pgTable(
  "rd_appointments",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rdSlug: varchar("rd_slug", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 24 }).$type<AppointmentKind>().notNull(),
    status: varchar("status", { length: 16 })
      .$type<AppointmentStatus>()
      .notNull()
      .default("scheduled"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    pricePaise: integer("price_paise").notNull().default(0),
    paymentStatus: varchar("payment_status", { length: 16 })
      .$type<PaymentStatus>()
      .notNull()
      .default("free"),
    joinUrl: text("join_url"),
    userQuestion: text("user_question"),
    rdNotes: text("rd_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_rd_appt_user").on(t.userId, t.startAt),
    index("idx_rd_appt_rd").on(t.rdSlug, t.startAt),
  ],
);

export const rdMessagesTable = pgTable(
  "rd_messages",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rdSlug: varchar("rd_slug", { length: 64 }).notNull(),
    senderRole: varchar("sender_role", { length: 8 })
      .$type<RdMessageSender>()
      .notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_rd_msg_thread").on(t.userId, t.rdSlug, t.createdAt)],
);

export const rdProgressLogsTable = pgTable(
  "rd_progress_logs",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    loggedAt: timestamp("logged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
    energyScore: integer("energy_score"),
    adherenceScore: integer("adherence_score"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_rd_progress_user").on(t.userId, t.loggedAt)],
);

export const rdLabUploadsTable = pgTable(
  "rd_lab_uploads",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sharedWithRdSlug: varchar("shared_with_rd_slug", { length: 64 }),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    sizeBytes: integer("size_bytes"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_rd_lab_user").on(t.userId, t.createdAt)],
);

export type RdAppointment = typeof rdAppointmentsTable.$inferSelect;
export type RdMessage = typeof rdMessagesTable.$inferSelect;
export type RdProgressLog = typeof rdProgressLogsTable.$inferSelect;
export type RdLabUpload = typeof rdLabUploadsTable.$inferSelect;
export type RdUser = typeof rdUsersTable.$inferSelect;
export type RdAvailability = typeof rdAvailabilityTable.$inferSelect;
