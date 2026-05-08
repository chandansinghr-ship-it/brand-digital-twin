import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// Photos for menu items. The original is preserved; every edit (enhancement,
// AI hero generation, background removal) is stored as a derivative row that
// points back at its source asset. The active hero image on the menu item is
// referenced by `menu_items.image_url`.
export type AssetKind = "original" | "enhanced" | "hero" | "nobg";

export interface AssetProvenance {
  source?: "upload" | "ai-generate" | "ai-edit" | "sharp-enhance";
  model?: string;
  prompt?: string;
  pipeline?: string[];
  createdBy?: string | null;
}

export const menuItemAssetsTable = pgTable(
  "menu_item_assets",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 128 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull().$type<AssetKind>(),
    storagePath: text("storage_path").notNull(),
    publicUrl: text("public_url").notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes"),
    sourceAssetId: integer("source_asset_id"),
    provenance: jsonb("provenance").$type<AssetProvenance>(),
    isAiGenerated: integer("is_ai_generated").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: varchar("created_by", { length: 64 }),
  },
  (t) => [index("menu_item_assets_slug_idx").on(t.slug)],
);

export type MenuItemAsset = typeof menuItemAssetsTable.$inferSelect;
export type InsertMenuItemAsset = typeof menuItemAssetsTable.$inferInsert;
