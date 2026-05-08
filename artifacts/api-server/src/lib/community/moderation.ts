/**
 * AI-driven content moderation with a deterministic policy fallback.
 *
 * Every screened piece of user-generated content gets exactly one
 * `moderation_decisions` row written, regardless of outcome. The row is
 * the canonical audit trail; the appeal workflow operates on it.
 *
 * The policy is intentionally lightweight: deterministic keyword pass
 * runs first (cheap + always-on), Gemini-based pass adds nuance when
 * available. Either pass can flag/hide; the union wins.
 */
import { generateText } from "ai";
import {
  db,
  moderationDecisionsTable,
  type ModerationCategory,
  type ModerationContentType,
  type ModerationDecision,
  type ModerationDecisionRow,
} from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "../ai/model";
import { logger } from "../logger";

const TIMEOUT_MS = 6_000;

const HIDE_THRESHOLD = 4; // severity >= 4 hides immediately
const FLAG_THRESHOLD = 2; // severity >= 2 flags for human review

export interface ScreenInput {
  text: string;
  contentType: ModerationContentType;
  contentId: number;
  userId: string | null;
}

export interface ScreenResult {
  decision: ModerationDecision;
  severity: number;
  categories: ModerationCategory[];
  rationale: string;
  model: string;
  usedFallback: boolean;
}

const SLUR_TERMS = [
  "kill yourself",
  "kys",
  "retard",
  "n-word", // placeholder — keep test-safe
];
const MEDICAL_CLAIM_PATTERNS: RegExp[] = [
  /cures?\s+(diabetes|cancer|covid)/i,
  /miracle\s+(cure|drug|food)/i,
  /detox\s+pills?/i,
];
// IMPORTANT: no `/g` flag here — `RegExp.test` mutates `lastIndex` on
// global regexes which would make the deterministic policy non-deterministic
// across calls.
const SPAM_PATTERNS: RegExp[] = [
  /\bhttps?:\/\/\S+/i,
  /(buy\s+now|click\s+here|telegram\.me|whatsapp\.com)/i,
];
const PII_PATTERNS: RegExp[] = [
  /\b\d{10}\b/, // phone numbers
  /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/, // card numbers
];

/**
 * Pure deterministic policy pass. Exposed for tests so we can lock the
 * behaviour without a model call.
 */
export function applyDeterministicPolicy(text: string): {
  severity: number;
  categories: ModerationCategory[];
  rationale: string;
} {
  const lower = text.toLowerCase();
  const categories = new Set<ModerationCategory>();
  let severity = 0;
  const reasons: string[] = [];

  for (const term of SLUR_TERMS) {
    if (lower.includes(term)) {
      categories.add("hate");
      categories.add("harassment");
      severity = Math.max(severity, 5);
      reasons.push(`matched slur "${term}"`);
    }
  }
  for (const re of MEDICAL_CLAIM_PATTERNS) {
    if (re.test(text)) {
      categories.add("medical_misinfo");
      severity = Math.max(severity, 4);
      reasons.push(`medical-claim pattern ${re.source}`);
    }
  }
  if (/\b(suicide|kill myself|end my life)\b/i.test(text)) {
    categories.add("self_harm");
    severity = Math.max(severity, 5);
    reasons.push("self-harm keyword");
  }
  let spamHits = 0;
  for (const re of SPAM_PATTERNS) {
    if (re.test(text)) spamHits++;
  }
  if (spamHits >= 2) {
    categories.add("spam");
    severity = Math.max(severity, 3);
    reasons.push("multiple spam patterns");
  } else if (spamHits === 1) {
    categories.add("spam");
    severity = Math.max(severity, 2);
    reasons.push("single spam pattern");
  }
  for (const re of PII_PATTERNS) {
    if (re.test(text)) {
      categories.add("pii");
      severity = Math.max(severity, 3);
      reasons.push("PII pattern");
      break;
    }
  }
  return {
    severity,
    categories: [...categories],
    rationale: reasons.join("; "),
  };
}

export function decisionFromSeverity(severity: number): ModerationDecision {
  if (severity >= HIDE_THRESHOLD) return "hidden";
  if (severity >= FLAG_THRESHOLD) return "flagged";
  return "allowed";
}

interface AiVerdict {
  severity: number;
  categories: ModerationCategory[];
  rationale: string;
}

function safeParseAiJson(text: string): AiVerdict | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    const sev = Number(obj["severity"]);
    if (!Number.isFinite(sev)) return null;
    const cats = Array.isArray(obj["categories"])
      ? (obj["categories"] as unknown[])
          .map(String)
          .filter((c): c is ModerationCategory =>
            [
              "harassment",
              "hate",
              "self_harm",
              "spam",
              "medical_misinfo",
              "off_topic",
              "pii",
              "sexual",
              "other",
            ].includes(c),
          )
      : [];
    return {
      severity: Math.max(0, Math.min(5, Math.round(sev))),
      categories: cats,
      rationale: String(obj["rationale"] ?? "").slice(0, 600),
    };
  } catch {
    return null;
  }
}

export async function screenContent(
  input: ScreenInput,
): Promise<ModerationDecisionRow> {
  const det = applyDeterministicPolicy(input.text);

  let aiSeverity = 0;
  let aiCats: ModerationCategory[] = [];
  let aiRationale = "";
  let model = "deterministic";
  let usedFallback = true;

  try {
    const prompt = [
      "You moderate user posts on a nutrition wellness app.",
      "Output STRICT JSON: {\"severity\":0..5, \"categories\":string[], \"rationale\":string}.",
      "Categories must come from: harassment, hate, self_harm, spam, medical_misinfo, off_topic, pii, sexual, other.",
      "Severity scale: 0 fine, 1 borderline, 2-3 needs human review, 4-5 must be hidden.",
      "Be strict on medical misinformation and self-harm; lenient on candid wellness talk.",
      "",
      `Content type: ${input.contentType}`,
      `Content: ${input.text.slice(0, 4000)}`,
    ].join("\n");
    const { text } = await Promise.race([
      generateText({ model: getModel(), prompt, temperature: 0 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);
    const v = safeParseAiJson(text);
    if (v) {
      aiSeverity = v.severity;
      aiCats = v.categories;
      aiRationale = v.rationale;
      model = DEFAULT_MODEL_ID;
      usedFallback = false;
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, contentType: input.contentType },
      "moderation: AI fallback",
    );
  }

  const severity = Math.max(det.severity, aiSeverity);
  const categories = [...new Set([...det.categories, ...aiCats])];
  const decision = decisionFromSeverity(severity);
  const rationale = [det.rationale, aiRationale].filter(Boolean).join(" | ");

  const [row] = await db
    .insert(moderationDecisionsTable)
    .values({
      contentType: input.contentType,
      contentId: input.contentId,
      userId: input.userId,
      decision,
      severity,
      categories,
      rationale: rationale.slice(0, 4000),
      actor: "ai",
      model,
      snapshot: input.text.slice(0, 4000),
    })
    .returning();
  if (!row) throw new Error("failed to write moderation decision");
  // log so the AI-decision pipeline is debuggable
  logger.info(
    {
      decision,
      severity,
      contentType: input.contentType,
      contentId: input.contentId,
      usedFallback,
    },
    "moderation decision",
  );
  return row;
}
