import { pgTable, serial, varchar, integer, text, jsonb } from "drizzle-orm/pg-core";

export const recipesTable = pgTable("recipes", {
  id: serial("id").primaryKey(),
  recipeNo: integer("recipe_no").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 256 }).notNull().unique(),
  servingSize: varchar("serving_size", { length: 64 }),
  method: text("method").notNull().default(""),
  foodCostPaise: integer("food_cost_paise"),
  // Nutrition label fields (Trust & Transparency)
  caloriesKcal: integer("calories_kcal"),
  proteinG: integer("protein_g"),
  carbsG: integer("carbs_g"),
  fatG: integer("fat_g"),
  fiberG: integer("fiber_g"),
  saturatedFatG: integer("saturated_fat_g"),
  sugarG: integer("sugar_g"),
  sodiumMg: integer("sodium_mg"),
  glycaemicIndex: varchar("glycaemic_index", { length: 16 }),
  allergens: jsonb("allergens").$type<string[]>().default([]),
  micronutrients: jsonb("micronutrients").$type<
    Array<{ key: string; label: string; value: number; unit: string; dailyTargetPct: number }>
  >().default([]),
  sourcingNotes: jsonb("sourcing_notes").$type<
    Array<{ area: string; detail: string }>
  >().default([]),
  containsClaims: jsonb("contains_claims").$type<string[]>().default([]),
  freeFromClaims: jsonb("free_from_claims").$type<string[]>().default([]),
});

export const recipeIngredientsTable = pgTable("recipe_ingredients", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipesTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  rawText: varchar("raw_text", { length: 256 }).notNull(),
  ingredient: varchar("ingredient", { length: 128 }).notNull(),
  quantityText: varchar("quantity_text", { length: 64 }),
});

export type Recipe = typeof recipesTable.$inferSelect;
export type RecipeIngredient = typeof recipeIngredientsTable.$inferSelect;
