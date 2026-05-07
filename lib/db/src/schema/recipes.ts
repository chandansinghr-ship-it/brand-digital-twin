import { pgTable, serial, varchar, integer, text } from "drizzle-orm/pg-core";

export const recipesTable = pgTable("recipes", {
  id: serial("id").primaryKey(),
  recipeNo: integer("recipe_no").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 256 }).notNull().unique(),
  servingSize: varchar("serving_size", { length: 64 }),
  method: text("method").notNull().default(""),
  foodCostPaise: integer("food_cost_paise"),
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
