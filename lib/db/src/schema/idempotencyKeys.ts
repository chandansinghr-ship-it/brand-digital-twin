import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Server-managed `Idempotency-Key` cache. The order-create middleware
 * persists a row per (user_id, key) BEFORE the handler runs, then
 * stamps the row with the response (`status_code` + `response_body`)
 * synchronously inside the response hook so the next replay can read
 * back the original answer byte-for-byte.
 *
 * `status_code = NULL` means the request is in-flight: a concurrent
 * duplicate POST polls this column until the winner stamps it, then
 * replays the cached response. `request_hash` is a SHA-256 hex of the
 * canonical JSON body — a key reused with a different body returns
 * 409 so client bugs are loud, not silent.
 *
 * Rows expire 24 h after creation; the sweeper in
 * `lib/idempotency.ts` deletes expired rows on a slow timer.
 */
export const idempotencyKeysTable = pgTable(
  "idempotency_keys",
  {
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    statusCode: integer("status_code"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.key] }),
    // Backs the periodic sweep that purges expired rows.
    index("idempotency_keys_expires_at_idx").on(table.expiresAt),
    // Defensive guard so a malformed status (e.g. 0 or negative)
    // can't be persisted via raw SQL paths.
    check(
      "idempotency_keys_status_chk",
      sql`${table.statusCode} is null or (${table.statusCode} >= 100 and ${table.statusCode} < 600)`,
    ),
  ],
);

export type IdempotencyKey = typeof idempotencyKeysTable.$inferSelect;
