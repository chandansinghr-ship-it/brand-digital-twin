import { pgTable, serial, varchar, integer } from "drizzle-orm/pg-core";

export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  itemNo: integer("item_no").notNull(),
  product: varchar("product", { length: 256 }).notNull(),
  buyingQty: varchar("buying_qty", { length: 64 }),
  buyingPricePaise: integer("buying_price_paise"),
  perKgUnitPaise: integer("per_kg_unit_paise"),
  pricePer100GmPcsLabel: varchar("price_per_100_gm_pcs_label", { length: 128 }),
  pricePer10GmLabel: varchar("price_per_10_gm_label", { length: 128 }),
});

export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
