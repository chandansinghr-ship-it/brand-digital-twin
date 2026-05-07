import { pgTable, serial, varchar, integer } from "drizzle-orm/pg-core";

export const packagingItemsTable = pgTable("packaging_items", {
  id: serial("id").primaryKey(),
  itemNo: integer("item_no").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  pricePerPiecePaise: integer("price_per_piece_paise"),
});

export type PackagingItem = typeof packagingItemsTable.$inferSelect;
