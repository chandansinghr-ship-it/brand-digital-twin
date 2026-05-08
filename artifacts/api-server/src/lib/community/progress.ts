/**
 * Pure progress derivation — counts events from the user's existing
 * nutrition logs against a challenge's metric, scoped to the
 * challenge's week. We use `nutrition_logs` (which auto-records ordered
 * dishes via `source = 'auto_order'`) so a single source covers both
 * "ordered a high-protein dish" and "manually logged one".
 *
 * Kept side-effect free for unit tests; the route layer wires the DB.
 */
import { and, eq, gte, lt } from "drizzle-orm";
import {
  db,
  nutritionLogsTable,
  type CohortChallenge,
  type CohortChallengeMetric,
  type NutritionLog,
} from "@workspace/db";

export interface ProgressInput {
  metric: CohortChallengeMetric;
  logs: Array<
    Pick<
      NutritionLog,
      "loggedFor" | "calories" | "proteinGrams" | "vegServings" | "source"
    >
  >;
  calorieFloor: number | null;
}

export interface ProgressResult {
  count: number;
  details: Array<{ key: string; reason: string }>;
}

export function computeProgress(input: ProgressInput): ProgressResult {
  const details: Array<{ key: string; reason: string }> = [];
  switch (input.metric) {
    case "high_protein_lunches": {
      // Best-effort: any log with >=30g protein. We don't track meal slot
      // on logs yet, so we count protein-rich entries broadly.
      let count = 0;
      for (const m of input.logs) {
        if (m.proteinGrams >= 30) {
          count++;
          details.push({
            key: `${m.loggedFor}:${m.proteinGrams}`,
            reason: `${m.proteinGrams}g protein`,
          });
        }
      }
      return { count, details };
    }
    case "plant_forward_meals": {
      let count = 0;
      for (const m of input.logs) {
        if (m.vegServings >= 2) {
          count++;
          details.push({
            key: `${m.loggedFor}:${m.vegServings}`,
            reason: `${m.vegServings} veg servings`,
          });
        }
      }
      return { count, details };
    }
    case "calorie_floor_days": {
      if (!input.calorieFloor) return { count: 0, details: [] };
      const byDay = new Map<string, number>();
      for (const m of input.logs) {
        const k = String(m.loggedFor);
        byDay.set(k, (byDay.get(k) ?? 0) + m.calories);
      }
      let count = 0;
      for (const [day, total] of byDay) {
        if (total >= input.calorieFloor) {
          count++;
          details.push({ key: day, reason: `${total} kcal` });
        }
      }
      return { count, details };
    }
    case "logged_meals": {
      const count = input.logs.length;
      return {
        count,
        details: input.logs.slice(0, 5).map((l) => ({
          key: String(l.loggedFor),
          reason: "meal logged",
        })),
      };
    }
    case "ordered_days": {
      const days = new Set<string>();
      for (const m of input.logs) {
        if (m.source === "auto_order") days.add(String(m.loggedFor));
      }
      return {
        count: days.size,
        details: [...days].map((d) => ({ key: d, reason: "ordered" })),
      };
    }
  }
}

export async function getUserChallengeProgress(
  userId: string,
  challenge: CohortChallenge,
  calorieFloor: number | null,
): Promise<ProgressResult> {
  const weekStart = challenge.weekStartDate; // YYYY-MM-DD
  const end = new Date(`${weekStart}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  const weekEnd = end.toISOString().slice(0, 10);

  const logs = await db
    .select({
      loggedFor: nutritionLogsTable.loggedFor,
      calories: nutritionLogsTable.calories,
      proteinGrams: nutritionLogsTable.proteinGrams,
      vegServings: nutritionLogsTable.vegServings,
      source: nutritionLogsTable.source,
    })
    .from(nutritionLogsTable)
    .where(
      and(
        eq(nutritionLogsTable.userId, userId),
        gte(nutritionLogsTable.loggedFor, weekStart),
        lt(nutritionLogsTable.loggedFor, weekEnd),
      ),
    );

  return computeProgress({
    metric: challenge.metric,
    logs,
    calorieFloor,
  });
}
