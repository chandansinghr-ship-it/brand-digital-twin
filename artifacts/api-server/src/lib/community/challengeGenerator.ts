/**
 * Generates one weekly challenge per cohort. Tries Gemini first for
 * variety; falls back to a deterministic recipe so the system always
 * produces a usable challenge even with the model offline.
 */
import { generateText } from "ai";
import { and, eq } from "drizzle-orm";
import {
  db,
  cohortChallengesTable,
  cohortsTable,
  type Cohort,
  type CohortChallenge,
  type CohortChallengeMetric,
} from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "../ai/model";
import { logger } from "../logger";
import { ensureCohortSeeds } from "./cohorts";

const TIMEOUT_MS = 10_000;

export function nextMonday(from: Date = new Date()): string {
  const d = new Date(from);
  const day = d.getUTCDay(); // 0 = Sun
  const diff = ((8 - day) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function metricFor(cohort: Cohort): CohortChallengeMetric {
  if (cohort.slug === "muscle-builders") return "high_protein_lunches";
  if (cohort.slug === "plant-forward") return "plant_forward_meals";
  if (cohort.slug === "fat-loss-cohort") return "calorie_floor_days";
  return "logged_meals";
}

export interface DraftChallenge {
  title: string;
  description: string;
  metric: CohortChallengeMetric;
  targetCount: number;
  rewardPoints: number;
  rationale: string;
  model: string;
  usedFallback: boolean;
}

function deterministicChallenge(cohort: Cohort): DraftChallenge {
  const metric = metricFor(cohort);
  const presets: Record<
    CohortChallengeMetric,
    { title: string; description: string; target: number; reward: number }
  > = {
    high_protein_lunches: {
      title: "5 high-protein lunches this week",
      description:
        "Order or log 5 lunches that hit at least 30g protein. Builds consistency without changing the rest of your week.",
      target: 5,
      reward: 60,
    },
    plant_forward_meals: {
      title: "10 plant-forward meals this week",
      description:
        "Log 10 fully plant-forward meals (no meat). Mix of breakfast, lunch, and dinner counts.",
      target: 10,
      reward: 60,
    },
    calorie_floor_days: {
      title: "Hit your calorie floor 5 days",
      description:
        "Stay above your minimum calorie floor on 5 days this week — the goal is sustainable, not low.",
      target: 5,
      reward: 50,
    },
    logged_meals: {
      title: "Log 14 meals this week",
      description:
        "Two logged meals a day for the week. Logging itself is the win — no judgement on what.",
      target: 14,
      reward: 40,
    },
    ordered_days: {
      title: "Order on 5 days this week",
      description: "Use the cohort to keep your kitchen consistent.",
      target: 5,
      reward: 40,
    },
  };
  const p = presets[metric];
  return {
    title: p.title,
    description: p.description,
    metric,
    targetCount: p.target,
    rewardPoints: p.reward,
    rationale: `Deterministic preset for ${cohort.slug}.`,
    model: "deterministic",
    usedFallback: true,
  };
}

export async function draftChallengeForCohort(
  cohort: Cohort,
): Promise<DraftChallenge> {
  const fallback = deterministicChallenge(cohort);
  try {
    const prompt = [
      "You design a weekly behavioural challenge for a nutrition app cohort.",
      "Output STRICT JSON: {\"title\":string,\"description\":string,\"target\":number,\"reward\":number,\"rationale\":string}.",
      "Title <= 60 chars, action-oriented. Description <= 220 chars, supportive, no medical claims.",
      "Target is the number of qualifying events in one week. Reward is points (30..120).",
      "",
      `Cohort: ${cohort.name} — ${cohort.description}`,
      `Metric the system will measure: ${fallback.metric}`,
      `Reasonable target if unsure: ${fallback.targetCount}`,
    ].join("\n");

    const { text } = await Promise.race([
      generateText({ model: getModel(), prompt, temperature: 0.6 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);
    const parsed = safeParseChallengeJson(text);
    if (!parsed) throw new Error("model returned unparseable JSON");
    return {
      title: parsed.title.slice(0, 200),
      description: parsed.description.slice(0, 800),
      metric: fallback.metric,
      targetCount: clampInt(parsed.target, 1, 50, fallback.targetCount),
      rewardPoints: clampInt(parsed.reward, 10, 200, fallback.rewardPoints),
      rationale: (parsed.rationale ?? "").slice(0, 600),
      model: DEFAULT_MODEL_ID,
      usedFallback: false,
    };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, cohort: cohort.slug },
      "challengeGenerator: fallback",
    );
    return fallback;
  }
}

export function safeParseChallengeJson(text: string): {
  title: string;
  description: string;
  target: number;
  reward: number;
  rationale?: string;
} | null {
  // Models often wrap JSON in ```json fences; strip them.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const title = String(obj["title"] ?? "");
    const description = String(obj["description"] ?? "");
    const target = Number(obj["target"]);
    const reward = Number(obj["reward"]);
    if (!title || !description || !Number.isFinite(target) || !Number.isFinite(reward)) {
      return null;
    }
    return {
      title,
      description,
      target,
      reward,
      rationale: obj["rationale"] ? String(obj["rationale"]) : undefined,
    };
  } catch {
    return null;
  }
}

function clampInt(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * Idempotent: at most one challenge exists per (cohort, weekStartDate).
 * Repeated calls for the same week return the existing row without
 * re-querying the model.
 */
export async function generateChallengeForCohort(
  cohortId: number,
  weekStartDate: string,
): Promise<{ challenge: CohortChallenge; created: boolean }> {
  await ensureCohortSeeds();
  const [cohort] = await db
    .select()
    .from(cohortsTable)
    .where(eq(cohortsTable.id, cohortId))
    .limit(1);
  if (!cohort) throw new Error("cohort not found");

  const [existing] = await db
    .select()
    .from(cohortChallengesTable)
    .where(
      and(
        eq(cohortChallengesTable.cohortId, cohortId),
        eq(cohortChallengesTable.weekStartDate, weekStartDate),
      ),
    )
    .limit(1);
  if (existing) return { challenge: existing, created: false };

  const draft = await draftChallengeForCohort(cohort);
  const [row] = await db
    .insert(cohortChallengesTable)
    .values({
      cohortId,
      weekStartDate,
      title: draft.title,
      description: draft.description,
      metric: draft.metric,
      targetCount: draft.targetCount,
      rewardPoints: draft.rewardPoints,
      status: "active",
      model: draft.model,
      aiRationale: draft.rationale,
    })
    .onConflictDoNothing({
      target: [
        cohortChallengesTable.cohortId,
        cohortChallengesTable.weekStartDate,
      ],
    })
    .returning();
  if (row) return { challenge: row, created: true };

  // Lost the race — read the winning row.
  const [winner] = await db
    .select()
    .from(cohortChallengesTable)
    .where(
      and(
        eq(cohortChallengesTable.cohortId, cohortId),
        eq(cohortChallengesTable.weekStartDate, weekStartDate),
      ),
    )
    .limit(1);
  if (!winner) throw new Error("challenge upsert lost without winner");
  return { challenge: winner, created: false };
}
