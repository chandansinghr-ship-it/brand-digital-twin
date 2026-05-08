import { pgTable, serial, varchar, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const teamProfilesTable = pgTable("team_profiles", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  bio: text("bio").notNull().default(""),
  signatureLine: varchar("signature_line", { length: 280 }),
  yearsExperience: integer("years_experience").notNull().default(0),
  initials: varchar("initials", { length: 8 }).notNull(),
  accent: varchar("accent", { length: 16 }).notNull().default("gold"),
  credentials: jsonb("credentials").$type<string[]>().default([]),
  kitchens: jsonb("kitchens").$type<string[]>().default([]),
  lifestyles: jsonb("lifestyles").$type<string[]>().default([]),
  ownedDishSlugs: jsonb("owned_dish_slugs").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TeamProfile = typeof teamProfilesTable.$inferSelect;
