import type { DishData } from "@workspace/menu-catalog";
import type { PlanGoal, RdPlan } from "./rdPlans";
import type { RdBookingProfile } from "./rdBookingData";

export type Protocol = "wellness" | "performance" | "clinical";

export const PROTOCOLS: Protocol[] = ["wellness", "performance", "clinical"];

export const PROTOCOL_LABELS: Record<Protocol, string> = {
  wellness: "Wellness",
  performance: "Performance",
  clinical: "Clinical",
};

export const PROTOCOL_TAGLINES: Record<Protocol, string> = {
  wellness:
    "Preventive, longevity-leaning meals — high-fibre, low-GI, gentle on sodium and sugar.",
  performance:
    "High-protein, recovery-tuned plates engineered for muscle synthesis and glycogen reload.",
  clinical:
    "RD-signed, low-GI therapeutic meals built for diabetes, cardiometabolic and gut protocols.",
};

export const PROTOCOL_PLAN_GOALS: Record<Protocol, PlanGoal[]> = {
  wellness: ["senior_vitality", "low_fodmap"],
  performance: ["lean_muscle"],
  clinical: ["weight_loss", "diabetic_friendly", "pcos_balance"],
};

const PROTOCOL_RD_KEYWORDS: Record<Protocol, string[]> = {
  wellness: ["wellness", "family", "senior", "longevity", "general"],
  performance: ["sport", "muscle", "performance", "recomposition", "lean"],
  clinical: [
    "diabet",
    "pcos",
    "cardio",
    "cholesterol",
    "clinical",
    "ibs",
    "gut",
  ],
};

export function isProtocol(v: unknown): v is Protocol {
  return v === "wellness" || v === "performance" || v === "clinical";
}

/** Predicate for filtering the menu catalog by protocol track. */
export function matchesProtocol(dish: DishData, protocol: Protocol): boolean {
  const sugar = parseFloat(dish.sugarPerServing) || 0;
  switch (protocol) {
    case "wellness":
      return (
        dish.glycaemicIndex !== "high" &&
        dish.macros.fiber >= 4 &&
        sugar <= 12
      );
    case "performance":
      return dish.macros.protein >= 18;
    case "clinical":
      return (
        dish.rdVerified &&
        dish.glycaemicIndex === "low" &&
        sugar <= 10
      );
  }
}

export function dishesForProtocol(
  dishes: DishData[],
  protocol: Protocol,
): DishData[] {
  return dishes.filter((d) => matchesProtocol(d, protocol));
}

export function plansForProtocol(plans: RdPlan[], protocol: Protocol): RdPlan[] {
  const goals = PROTOCOL_PLAN_GOALS[protocol];
  return plans.filter((p) => goals.includes(p.goal));
}

export function rdsForProtocol<T extends RdBookingProfile>(
  rds: T[],
  protocol: Protocol,
): T[] {
  const keywords = PROTOCOL_RD_KEYWORDS[protocol];
  return rds.filter((rd) =>
    rd.specialties.some((s) =>
      keywords.some((k) => s.toLowerCase().includes(k)),
    ),
  );
}
