/**
 * Wraps the existing weekly-plan generator to produce an RD-reviewable
 * draft. The draft is identical in structure to a user-facing meal plan
 * (so the same renderer can show it), but lives in `rd_plan_proposals`
 * until the RD approves it.
 *
 * On approval (in the route) we materialise it into `meal_plans` as a
 * `draft` row tagged model="rd-approved" so the user can simply tap
 * Accept to schedule it via the existing flow.
 */

import {
  generateWeeklyPlan,
  type PlanGenerationResult,
} from "../mealPlanner";
import type {
  MealPlanConstraints,
  MealPlanDay,
  MealPlanTotals,
} from "@workspace/db";

export interface PlanDraftInput {
  userId: string;
  weekStart: Date;
  overrides?: Partial<MealPlanConstraints>;
}

export interface PlanDraftResult {
  days: MealPlanDay[];
  totals: MealPlanTotals;
  constraints: MealPlanConstraints;
  model: string;
  rationale: string;
  notes: string[];
}

function buildRationale(
  constraints: MealPlanConstraints,
  totals: MealPlanTotals,
  result: PlanGenerationResult,
): string {
  const bits: string[] = [];
  bits.push(
    `Weekly draft built around ${constraints.dailyCalorieTarget ?? "no explicit"} kcal/day` +
      (constraints.dailyProteinTargetGrams
        ? ` and ${constraints.dailyProteinTargetGrams} g protein/day`
        : "") +
      ".",
  );
  bits.push(
    `Achieved avg ${totals.avgCalories} kcal, ${totals.avgProteinGrams} g protein, total spend ₹${(totals.totalPaise / 100).toFixed(0)}.`,
  );
  if (constraints.allergens.length > 0) {
    bits.push(`All allergens excluded: ${constraints.allergens.join(", ")}.`);
  }
  if (constraints.dietaryStyle) {
    bits.push(`Diet preference honoured: ${constraints.dietaryStyle}.`);
  }
  if (result.usedFallback) {
    bits.push("Model unavailable — used deterministic greedy picker as fallback.");
  } else if (result.notes.includes("model_violation_patched")) {
    bits.push("Model output had constraint violations; auto-patched before review.");
  }
  bits.push("Please review allergen-safety, repetition, and slot fit before approving.");
  return bits.join(" ");
}

export async function draftPlanForReview(
  input: PlanDraftInput,
): Promise<PlanDraftResult> {
  const result = await generateWeeklyPlan(
    input.userId,
    input.weekStart,
    input.overrides ?? {},
  );
  return {
    days: result.days,
    totals: result.totals,
    constraints: result.constraints,
    model: result.model,
    rationale: buildRationale(result.constraints, result.totals, result),
    notes: result.notes,
  };
}
