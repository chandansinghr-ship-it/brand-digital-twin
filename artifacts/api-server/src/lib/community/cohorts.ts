/**
 * Cohort assignment is deterministic from the user's preferences.
 * We seed three starter cohorts (one per goal × dietary axis) and
 * recompute membership from preferences whenever asked. Membership is
 * idempotent — `assignUserToCohorts` can be called any number of times
 * and converges to the same result without churn.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  cohortsTable,
  cohortMembersTable,
  userPreferencesTable,
  type Cohort,
  type CohortCriteria,
  type UserPreferences,
} from "@workspace/db";

export const SEED_COHORTS: Array<Omit<Cohort, "id" | "createdAt">> = [
  {
    slug: "muscle-builders",
    name: "Muscle Builders",
    description:
      "Members focused on muscle gain or recovery — high-protein meals, lifting cadence.",
    criteria: { goal: ["gain_muscle"] },
    active: 1,
  },
  {
    slug: "fat-loss-cohort",
    name: "Fat Loss Cohort",
    description:
      "Members on a sustainable fat-loss arc — calorie-aware, balanced macros.",
    criteria: { goal: ["lose_weight"] },
    active: 1,
  },
  {
    slug: "plant-forward",
    name: "Plant-Forward",
    description: "Vegan and vegetarian members — plant-protein and gut health.",
    criteria: { dietaryStyle: ["vegan", "vegetarian"] },
    active: 1,
  },
  {
    slug: "general-wellness",
    name: "Everyday Wellness",
    description: "Members who want consistent, balanced eating without a strict goal.",
    criteria: { goal: ["general_wellness", "maintain"] },
    active: 1,
  },
];

let seeded = false;
export async function ensureCohortSeeds(): Promise<void> {
  if (seeded) return;
  for (const c of SEED_COHORTS) {
    await db
      .insert(cohortsTable)
      .values(c)
      .onConflictDoNothing({ target: cohortsTable.slug });
  }
  seeded = true;
}

/**
 * Pure: given a user's preferences and the catalogue of cohorts,
 * returns the cohort ids the user should belong to. Exposed for
 * unit tests so we don't need a DB to validate the rule.
 */
export function pickCohortsForPreferences(
  prefs: Pick<UserPreferences, "goal" | "dietaryStyle"> | null,
  cohorts: Array<Pick<Cohort, "id" | "active" | "criteria">>,
): number[] {
  if (!prefs) return [];
  const matched: number[] = [];
  for (const c of cohorts) {
    if (!c.active) continue;
    const crit = c.criteria as CohortCriteria;
    const goalMatch = !crit.goal || crit.goal.includes(prefs.goal);
    const dietMatch =
      !crit.dietaryStyle || crit.dietaryStyle.includes(prefs.dietaryStyle);
    if (goalMatch && dietMatch && (crit.goal || crit.dietaryStyle)) {
      matched.push(c.id);
    }
  }
  return matched;
}

export async function assignUserToCohorts(userId: string): Promise<number[]> {
  await ensureCohortSeeds();
  const [prefs] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);
  const cohorts = await db.select().from(cohortsTable);
  const desired = new Set(pickCohortsForPreferences(prefs ?? null, cohorts));

  const existing = await db
    .select()
    .from(cohortMembersTable)
    .where(eq(cohortMembersTable.userId, userId));
  const existingSet = new Set(existing.map((e) => e.cohortId));

  // Add missing
  const toAdd = [...desired].filter((id) => !existingSet.has(id));
  if (toAdd.length > 0) {
    await db
      .insert(cohortMembersTable)
      .values(toAdd.map((cohortId) => ({ cohortId, userId })))
      .onConflictDoNothing();
  }

  // Remove cohorts the user no longer matches
  const toRemove = [...existingSet].filter((id) => !desired.has(id));
  if (toRemove.length > 0) {
    await db
      .delete(cohortMembersTable)
      .where(
        and(
          eq(cohortMembersTable.userId, userId),
          inArray(cohortMembersTable.cohortId, toRemove),
        ),
      );
  }

  return [...desired];
}

export async function listCohortsForUser(userId: string): Promise<Cohort[]> {
  await ensureCohortSeeds();
  const rows = await db
    .select({ c: cohortsTable })
    .from(cohortMembersTable)
    .innerJoin(cohortsTable, eq(cohortsTable.id, cohortMembersTable.cohortId))
    .where(eq(cohortMembersTable.userId, userId));
  return rows.map((r) => r.c);
}

export async function listAllCohorts(): Promise<Cohort[]> {
  await ensureCohortSeeds();
  return db.select().from(cohortsTable).orderBy(cohortsTable.id);
}

export async function listCohortMemberIds(cohortId: number): Promise<string[]> {
  const rows = await db
    .select({ u: cohortMembersTable.userId })
    .from(cohortMembersTable)
    .where(eq(cohortMembersTable.cohortId, cohortId));
  return rows.map((r) => r.u);
}
