/**
 * AI-drafted client summary for the RD copilot.
 *
 * Pulls the user's brief + recent RD progress logs + recent orders, then
 * asks Gemini for a tight 5-bullet "what an RD needs to know" rundown.
 * Falls back to a deterministic template if the model is unreachable so
 * the console always renders a useful summary.
 *
 * IMPORTANT: this is RD-facing, so we include the RD-shared signals
 * (progress logs, recently-shared labs) and skip anything the user
 * hasn't shared with this RD slug.
 */

import { generateText } from "ai";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  rdLabUploadsTable,
  rdProgressLogsTable,
} from "@workspace/db";
import { getUserBrief, briefToRedacted } from "../userBrief";
import { getModel, DEFAULT_MODEL_ID } from "../ai/model";
import { logger } from "../logger";

const SUMMARY_TIMEOUT_MS = 12_000;

export interface ClientSummaryInput {
  userId: string;
  rdSlug: string;
}

export interface ClientSummaryResult {
  summary: string;
  model: string;
  sources: Record<string, unknown>;
  usedFallback: boolean;
}

function deterministicSummary(sources: Record<string, unknown>): string {
  const lines: string[] = [];
  const prefs =
    (sources["preferences"] as Record<string, unknown> | undefined) ?? null;
  const profile =
    (sources["profile"] as Record<string, unknown> | undefined) ?? null;
  const recentOrders =
    (sources["recentOrders"] as unknown[] | undefined) ?? [];
  const progress =
    (sources["progress"] as Array<Record<string, unknown>> | undefined) ?? [];

  const goal = prefs?.["goal"] as string | undefined;
  const diet = prefs?.["dietaryStyle"] as string | undefined;
  const allergens = (prefs?.["allergens"] as string[] | undefined) ?? [];
  const calorieTarget = prefs?.["calorieTarget"] as number | undefined;
  const proteinTarget = prefs?.["proteinTargetGrams"] as number | undefined;

  if (goal || diet) {
    lines.push(
      `- Goal: ${goal ?? "unspecified"} • Diet: ${diet ?? "no preference"}.`,
    );
  }
  if (allergens.length > 0) {
    lines.push(`- Allergens to avoid: ${allergens.join(", ")}.`);
  }
  if (calorieTarget || proteinTarget) {
    lines.push(
      `- Targets: ${calorieTarget ?? "—"} kcal/day, ${proteinTarget ?? "—"} g protein/day.`,
    );
  }
  if (profile?.["weightKg"]) {
    lines.push(
      `- Latest profile weight: ${String(profile["weightKg"])} kg.`,
    );
  }
  if (progress.length > 0) {
    const latest = progress[0];
    const w = latest?.["weightKg"];
    const adh = latest?.["adherenceScore"];
    lines.push(
      `- Latest RD log: weight ${w ?? "—"}, adherence ${adh ?? "—"}/10.`,
    );
  }
  if (recentOrders.length > 0) {
    lines.push(`- Recent ordering: ${recentOrders.length} orders in window.`);
  }
  if (lines.length === 0) {
    lines.push("- No notable signals yet — first consult should establish baseline.");
  }
  return lines.join("\n");
}

export async function generateClientSummary(
  input: ClientSummaryInput,
): Promise<ClientSummaryResult> {
  const { userId, rdSlug } = input;

  const brief = await getUserBrief(userId, {
    include: ["preferences", "profile", "recentOrders", "wellness", "premium"],
  }).catch(() => null);

  const [progress, labs] = await Promise.all([
    db
      .select()
      .from(rdProgressLogsTable)
      .where(eq(rdProgressLogsTable.userId, userId))
      .orderBy(desc(rdProgressLogsTable.loggedAt))
      .limit(5),
    db
      .select()
      .from(rdLabUploadsTable)
      .where(
        and(
          eq(rdLabUploadsTable.userId, userId),
          // only labs the user explicitly shared with this RD
          eq(rdLabUploadsTable.sharedWithRdSlug, rdSlug),
        ),
      )
      .orderBy(desc(rdLabUploadsTable.createdAt))
      .limit(5),
  ]);

  const redacted = brief ? briefToRedacted(brief) : null;
  const sources: Record<string, unknown> = {
    preferences: redacted?.preferences ?? null,
    profile: redacted?.profile ?? null,
    wellness: redacted?.wellness ?? null,
    recentOrders: redacted?.recentOrders ?? [],
    progress: progress.map((p) => ({
      loggedAt: p.loggedAt,
      weightKg: p.weightKg,
      energyScore: p.energyScore,
      adherenceScore: p.adherenceScore,
      note: p.note,
    })),
    sharedLabsCount: labs.length,
  };

  const fallback = deterministicSummary(sources);

  try {
    const prompt = [
      "You are a clinical-aware copilot drafting a 5-bullet brief for a Registered Dietitian (RD) about an upcoming client consult.",
      "Be concise, factual, and DO NOT invent data. Only use what is provided. If a field is missing, say 'not on file'.",
      "Surface anything safety-critical (allergens, recent weight changes, low adherence).",
      "Format: 5 bullets max, each ≤ 18 words. No markdown headers.",
      "",
      `Client signals (JSON):\n${JSON.stringify(sources)}`,
    ].join("\n");

    const { text } = await Promise.race([
      generateText({
        model: getModel(),
        prompt,
        temperature: 0.2,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), SUMMARY_TIMEOUT_MS),
      ),
    ]);
    const summary = text.trim();
    if (summary.length === 0) throw new Error("empty");
    return { summary, model: DEFAULT_MODEL_ID, sources, usedFallback: false };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, userId, rdSlug },
      "rd-copilot: client summary fallback",
    );
    return { summary: fallback, model: "deterministic", sources, usedFallback: true };
  }
}
