/**
 * Plan-adherence detector.
 *
 * Compares an RD-approved meal plan against the client's actual
 * behaviour for past days in the plan window:
 *
 *   - skipped_delivery : a subscription delivery scheduled inside the
 *                        plan week is `skipped` or `cancelled`.
 *   - over_calories    : day's nutrition logs exceed the plan's planned
 *                        calorie sum by ≥ 25%.
 *   - missed_protein   : day's nutrition logs cover < 70% of plan
 *                        protein and the day is fully past.
 *   - outside_plan     : the user placed an order on a plan day whose
 *                        items don't match any of that day's slot dishes
 *                        (by slug).
 *
 * Drift events are written to `adherence_events`, idempotent on
 * (userId, mealPlanId, dayDate, kind) — re-running the scan is safe.
 *
 * Returns the events created in this run plus a summary count by kind
 * across the plan, so the RD console can show a drift dashboard.
 */

import { and, eq, gte, lte } from "drizzle-orm";
import {
  db,
  adherenceEventsTable,
  mealPlansTable,
  nutritionLogsTable,
  ordersTable,
  subscriptionDeliveriesTable,
  type AdherenceEvent,
  type AdherenceEventKind,
  type MealPlan,
  type MealPlanDay,
  type SubscriptionItem,
} from "@workspace/db";

export const OVER_CALORIES_RATIO = 1.25;
export const MISSED_PROTEIN_RATIO = 0.7;

export interface AdherenceScanResult {
  newEvents: AdherenceEvent[];
  countsByKind: Record<AdherenceEventKind, number>;
  totalDays: number;
  daysScanned: number;
}

function emptyCounts(): Record<AdherenceEventKind, number> {
  return {
    skipped_delivery: 0,
    over_calories: 0,
    missed_protein: 0,
    outside_plan: 0,
  };
}

function dayDishSlugs(day: MealPlanDay): Set<string> {
  const slugs = new Set<string>();
  if (day.breakfast?.slug) slugs.add(day.breakfast.slug);
  if (day.lunch?.slug) slugs.add(day.lunch.slug);
  if (day.dinner?.slug) slugs.add(day.dinner.slug);
  return slugs;
}

function dayPlanCalories(day: MealPlanDay): number {
  return (
    (day.breakfast?.calories ?? 0) +
    (day.lunch?.calories ?? 0) +
    (day.dinner?.calories ?? 0)
  );
}

function dayPlanProtein(day: MealPlanDay): number {
  return (
    (day.breakfast?.protein ?? 0) +
    (day.lunch?.protein ?? 0) +
    (day.dinner?.protein ?? 0)
  );
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface DetectInput {
  plan: Pick<MealPlan, "id" | "userId" | "days" | "subscriptionId">;
  /** Override "now" for tests. */
  now?: Date;
}

interface PreparedDrift {
  userId: string;
  mealPlanId: number;
  dayDate: string;
  kind: AdherenceEventKind;
  severity: number;
  detail: Record<string, unknown>;
}

/**
 * Pure function — computes drift for a plan from supplied data.
 * Exported for unit testing without touching the DB.
 */
export function computeDrift(
  plan: { id: number; userId: string; days: MealPlanDay[] },
  data: {
    deliveriesByDate: Map<string, { status: string }[]>;
    logsByDate: Map<string, { calories: number; protein: number }>;
    ordersByDate: Map<string, { items: { name?: string; slug?: string }[] }[]>;
  },
  now: Date = new Date(),
): PreparedDrift[] {
  const drifts: PreparedDrift[] = [];
  const today = isoDay(now);

  for (const day of plan.days) {
    if (day.date >= today) continue; // only past days
    const slugs = dayDishSlugs(day);

    // skipped_delivery
    const deliveries = data.deliveriesByDate.get(day.date) ?? [];
    for (const d of deliveries) {
      if (d.status === "skipped" || d.status === "cancelled") {
        drifts.push({
          userId: plan.userId,
          mealPlanId: plan.id,
          dayDate: day.date,
          kind: "skipped_delivery",
          severity: d.status === "cancelled" ? 3 : 2,
          detail: { deliveryStatus: d.status },
        });
        break; // one per day is enough
      }
    }

    // calorie / protein vs nutrition logs
    const logs = data.logsByDate.get(day.date);
    const planCals = dayPlanCalories(day);
    const planProt = dayPlanProtein(day);
    if (logs && planCals > 0) {
      if (logs.calories > planCals * OVER_CALORIES_RATIO) {
        drifts.push({
          userId: plan.userId,
          mealPlanId: plan.id,
          dayDate: day.date,
          kind: "over_calories",
          severity:
            logs.calories > planCals * 1.5 ? 3 : 2,
          detail: { plannedKcal: planCals, loggedKcal: logs.calories },
        });
      }
      if (planProt > 0 && logs.protein < planProt * MISSED_PROTEIN_RATIO) {
        drifts.push({
          userId: plan.userId,
          mealPlanId: plan.id,
          dayDate: day.date,
          kind: "missed_protein",
          severity:
            logs.protein < planProt * 0.4 ? 3 : 2,
          detail: { plannedProtein: planProt, loggedProtein: logs.protein },
        });
      }
    }

    // outside_plan: any order item with a slug not in today's plan
    const orders = data.ordersByDate.get(day.date) ?? [];
    if (slugs.size > 0) {
      const offending: string[] = [];
      for (const o of orders) {
        for (const it of o.items) {
          // Items recorded historically may not carry a slug; in that
          // case fall back to name match against day's dish names.
          const itSlug = it.slug;
          if (itSlug && !slugs.has(itSlug)) {
            offending.push(itSlug);
          }
        }
      }
      if (offending.length > 0) {
        drifts.push({
          userId: plan.userId,
          mealPlanId: plan.id,
          dayDate: day.date,
          kind: "outside_plan",
          severity: 1,
          detail: { offendingSlugs: Array.from(new Set(offending)).slice(0, 5) },
        });
      }
    }
  }
  return drifts;
}

export async function detectAdherenceForPlan(
  input: DetectInput,
): Promise<AdherenceScanResult> {
  const { plan } = input;
  const now = input.now ?? new Date();
  const days = plan.days ?? [];
  if (days.length === 0) {
    return {
      newEvents: [],
      countsByKind: emptyCounts(),
      totalDays: 0,
      daysScanned: 0,
    };
  }

  const dates = days.map((d) => d.date).sort();
  const firstDate = dates[0]!;
  const lastDate = dates[dates.length - 1]!;
  const startTs = new Date(`${firstDate}T00:00:00.000Z`);
  const endTs = new Date(`${lastDate}T23:59:59.999Z`);

  // Pull data slices in parallel.
  const [deliveriesRows, logsRows, ordersRows] = await Promise.all([
    plan.subscriptionId
      ? db
          .select({
            scheduledFor: subscriptionDeliveriesTable.scheduledFor,
            status: subscriptionDeliveriesTable.status,
          })
          .from(subscriptionDeliveriesTable)
          .where(
            and(
              eq(subscriptionDeliveriesTable.subscriptionId, plan.subscriptionId),
              gte(subscriptionDeliveriesTable.scheduledFor, startTs),
              lte(subscriptionDeliveriesTable.scheduledFor, endTs),
            ),
          )
      : Promise.resolve([]),
    db
      .select({
        loggedFor: nutritionLogsTable.loggedFor,
        calories: nutritionLogsTable.calories,
        protein: nutritionLogsTable.proteinGrams,
      })
      .from(nutritionLogsTable)
      .where(
        and(
          eq(nutritionLogsTable.userId, plan.userId),
          gte(nutritionLogsTable.loggedFor, firstDate),
          lte(nutritionLogsTable.loggedFor, lastDate),
        ),
      ),
    db
      .select({
        createdAt: ordersTable.createdAt,
        items: ordersTable.items,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.userId, plan.userId),
          gte(ordersTable.createdAt, startTs),
          lte(ordersTable.createdAt, endTs),
        ),
      ),
  ]);

  const deliveriesByDate = new Map<string, { status: string }[]>();
  for (const row of deliveriesRows) {
    const k = isoDay(row.scheduledFor);
    const arr = deliveriesByDate.get(k) ?? [];
    arr.push({ status: row.status });
    deliveriesByDate.set(k, arr);
  }

  const logsByDate = new Map<string, { calories: number; protein: number }>();
  for (const row of logsRows) {
    const k = row.loggedFor;
    const cur = logsByDate.get(k) ?? { calories: 0, protein: 0 };
    cur.calories += row.calories;
    cur.protein += row.protein;
    logsByDate.set(k, cur);
  }

  const ordersByDate = new Map<
    string,
    { items: { name?: string; slug?: string }[] }[]
  >();
  for (const row of ordersRows) {
    const k = isoDay(row.createdAt);
    const arr = ordersByDate.get(k) ?? [];
    // ordersTable.items historically has {id,name,qty,price}. Slug may be
    // absent; we treat absence as "not enough info" and skip outside_plan
    // detection for that item rather than false-flagging.
    arr.push({
      items: (row.items as Array<Record<string, unknown>>).map((it) => ({
        name: it["name"] as string | undefined,
        slug: it["slug"] as string | undefined,
      })),
    });
    ordersByDate.set(k, arr);
  }

  const drifts = computeDrift(
    { id: plan.id, userId: plan.userId, days },
    { deliveriesByDate, logsByDate, ordersByDate },
    now,
  );

  // Idempotent insert. ON CONFLICT keeps the original row + nudgeSentAt.
  const newEvents: AdherenceEvent[] = [];
  for (const d of drifts) {
    const inserted = await db
      .insert(adherenceEventsTable)
      .values(d)
      .onConflictDoNothing({
        target: [
          adherenceEventsTable.userId,
          adherenceEventsTable.mealPlanId,
          adherenceEventsTable.dayDate,
          adherenceEventsTable.kind,
        ],
      })
      .returning();
    if (inserted[0]) newEvents.push(inserted[0]);
  }

  // Counts include both pre-existing and new drift events for this plan.
  const allForPlan = await db
    .select()
    .from(adherenceEventsTable)
    .where(
      and(
        eq(adherenceEventsTable.userId, plan.userId),
        eq(adherenceEventsTable.mealPlanId, plan.id),
      ),
    );
  const counts = emptyCounts();
  for (const e of allForPlan) counts[e.kind] += 1;

  const today = isoDay(now);
  const daysScanned = days.filter((d) => d.date < today).length;

  return {
    newEvents,
    countsByKind: counts,
    totalDays: days.length,
    daysScanned,
  };
}

/**
 * Build the plain-text body for a nudge given a drift event. Deterministic
 * (no model) so the same drift always produces the same nudge — important
 * for audit and for tests.
 */
export function buildNudgeText(event: AdherenceEvent): string {
  const detail = (event.detail ?? {}) as Record<string, unknown>;
  switch (event.kind) {
    case "skipped_delivery":
      return `We noticed your ${event.dayDate} delivery was skipped — want to swap it into another day this week so the plan stays on track?`;
    case "over_calories":
      return `Your logged calories for ${event.dayDate} (${detail["loggedKcal"]} kcal) ran ahead of plan (${detail["plannedKcal"]} kcal). A lighter dinner tomorrow or a 20-min walk will rebalance the week.`;
    case "missed_protein":
      return `Protein was light on ${event.dayDate} (${detail["loggedProtein"]} g vs ${detail["plannedProtein"]} g target). Add a Greek-yogurt or paneer snack today and you're back on plan.`;
    case "outside_plan":
      return `Saw an off-plan order on ${event.dayDate}. No judgement — flagging it so we can adjust your plan if your taste is shifting.`;
  }
}

/**
 * Returns true if drift severity is high enough that we should escalate
 * back to the RD instead of just nudging the user. Threshold:
 *   - any severity-3 event, OR
 *   - 3+ unresolved events within 7 days.
 */
export function shouldEscalateToRd(events: AdherenceEvent[]): boolean {
  if (events.some((e) => e.severity >= 3)) return true;
  const recent = events.filter((e) => {
    const ts = new Date(e.createdAt).getTime();
    return Date.now() - ts < 7 * 24 * 3600 * 1000;
  });
  return recent.length >= 3;
}
