import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeDrift,
  buildNudgeText,
  shouldEscalateToRd,
  OVER_CALORIES_RATIO,
  MISSED_PROTEIN_RATIO,
} from "./adherence";
import type { AdherenceEvent, MealPlanDay } from "@workspace/db";

function dayWithSlots(date: string): MealPlanDay {
  return {
    date,
    breakfast: {
      dishId: 1,
      slug: "oats-bowl",
      name: "Oats Bowl",
      image: "",
      pricePaise: 12000,
      calories: 400,
      protein: 20,
      carbs: 50,
      fat: 10,
    },
    lunch: {
      dishId: 2,
      slug: "rajma-chawal",
      name: "Rajma Chawal",
      image: "",
      pricePaise: 18000,
      calories: 600,
      protein: 25,
      carbs: 80,
      fat: 12,
    },
    dinner: {
      dishId: 3,
      slug: "paneer-tikka",
      name: "Paneer Tikka",
      image: "",
      pricePaise: 22000,
      calories: 550,
      protein: 30,
      carbs: 30,
      fat: 25,
    },
  };
}

const plan = {
  id: 42,
  userId: "user-1",
  days: [dayWithSlots("2026-05-10"), dayWithSlots("2026-05-11")],
};
const now = new Date("2026-05-15T00:00:00.000Z");

describe("computeDrift", () => {
  it("only flags past days", () => {
    const future = new Date("2026-05-09T00:00:00.000Z");
    const drift = computeDrift(
      plan,
      {
        deliveriesByDate: new Map([
          ["2026-05-10", [{ status: "skipped" }]],
        ]),
        logsByDate: new Map(),
        ordersByDate: new Map(),
      },
      future,
    );
    assert.equal(drift.length, 0);
  });

  it("flags skipped delivery", () => {
    const drift = computeDrift(
      plan,
      {
        deliveriesByDate: new Map([
          ["2026-05-10", [{ status: "skipped" }]],
        ]),
        logsByDate: new Map(),
        ordersByDate: new Map(),
      },
      now,
    );
    const skipped = drift.filter((d) => d.kind === "skipped_delivery");
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0]!.dayDate, "2026-05-10");
  });

  it("flags over_calories above the ratio threshold and not at it", () => {
    const planCals = 400 + 600 + 550;
    const justUnder = Math.floor(planCals * OVER_CALORIES_RATIO);
    const justOver = Math.ceil(planCals * OVER_CALORIES_RATIO) + 1;
    const drift = computeDrift(
      plan,
      {
        deliveriesByDate: new Map(),
        logsByDate: new Map([
          ["2026-05-10", { calories: justUnder, protein: 100 }],
          ["2026-05-11", { calories: justOver, protein: 100 }],
        ]),
        ordersByDate: new Map(),
      },
      now,
    );
    const over = drift.filter((d) => d.kind === "over_calories");
    assert.deepEqual(
      over.map((d) => d.dayDate),
      ["2026-05-11"],
    );
  });

  it("flags missed_protein below the ratio threshold", () => {
    const planProt = 20 + 25 + 30;
    const low = Math.floor(planProt * MISSED_PROTEIN_RATIO) - 1;
    const drift = computeDrift(
      plan,
      {
        deliveriesByDate: new Map(),
        logsByDate: new Map([
          ["2026-05-10", { calories: 1500, protein: low }],
        ]),
        ordersByDate: new Map(),
      },
      now,
    );
    const missed = drift.filter((d) => d.kind === "missed_protein");
    assert.equal(missed.length, 1);
    assert.ok(missed[0]!.severity >= 2);
  });

  it("flags outside_plan only when offending slug is present", () => {
    const drift = computeDrift(
      plan,
      {
        deliveriesByDate: new Map(),
        logsByDate: new Map(),
        ordersByDate: new Map([
          [
            "2026-05-10",
            [{ items: [{ slug: "oats-bowl" }, { slug: "burger" }] }],
          ],
          [
            "2026-05-11",
            [{ items: [{ slug: "oats-bowl" }, { slug: "rajma-chawal" }] }],
          ],
        ]),
      },
      now,
    );
    const outside = drift.filter((d) => d.kind === "outside_plan");
    assert.deepEqual(
      outside.map((d) => d.dayDate),
      ["2026-05-10"],
    );
    assert.deepEqual(outside[0]!.detail["offendingSlugs"], ["burger"]);
  });

  it("does not false-flag outside_plan when item slugs are missing", () => {
    const drift = computeDrift(
      plan,
      {
        deliveriesByDate: new Map(),
        logsByDate: new Map(),
        ordersByDate: new Map([
          ["2026-05-10", [{ items: [{ name: "Mystery Wrap" }] }]],
        ]),
      },
      now,
    );
    assert.equal(
      drift.filter((d) => d.kind === "outside_plan").length,
      0,
    );
  });
});

describe("buildNudgeText", () => {
  function event(
    kind: AdherenceEvent["kind"],
    detail: Record<string, unknown> = {},
  ): AdherenceEvent {
    return {
      id: 1,
      userId: "u",
      mealPlanId: 1,
      dayDate: "2026-05-10",
      kind,
      severity: 2,
      detail,
      nudgeSentAt: null,
      createdAt: new Date(),
    } as AdherenceEvent;
  }

  it("produces deterministic non-empty text for each kind", () => {
    assert.match(buildNudgeText(event("skipped_delivery")), /skipped|swap/);
    assert.match(
      buildNudgeText(
        event("over_calories", { plannedKcal: 1500, loggedKcal: 2200 }),
      ),
      /2200/,
    );
    assert.match(
      buildNudgeText(
        event("missed_protein", { plannedProtein: 80, loggedProtein: 30 }),
      ),
      /30/,
    );
    assert.match(buildNudgeText(event("outside_plan")), /off-plan/);
  });
});

describe("shouldEscalateToRd", () => {
  function event(severity: number, daysAgo = 0): AdherenceEvent {
    return {
      id: 1,
      userId: "u",
      mealPlanId: 1,
      dayDate: "2026-05-10",
      kind: "over_calories",
      severity,
      detail: {},
      nudgeSentAt: null,
      createdAt: new Date(Date.now() - daysAgo * 24 * 3600 * 1000),
    } as AdherenceEvent;
  }
  it("escalates on a single severity-3 event", () => {
    assert.equal(shouldEscalateToRd([event(3)]), true);
  });
  it("escalates on 3+ recent low-sev events", () => {
    assert.equal(shouldEscalateToRd([event(1), event(1), event(1)]), true);
  });
  it("does not escalate on stale events", () => {
    assert.equal(
      shouldEscalateToRd([event(1, 30), event(1, 30), event(1, 30)]),
      false,
    );
  });
});
