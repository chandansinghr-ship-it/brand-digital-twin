import { z } from "zod/v4";
import { DISHES, type DishData } from "@workspace/menu-catalog";
import { definePrompt } from "../prompts";
import { defineTool } from "../tools";
import { registerAgent } from "../agentRegistry";
import {
  briefToPromptMarkdown,
  getUserBrief,
  type UserBrief,
} from "../../userBrief";

async function loadBriefSafe(userId: string | null): Promise<UserBrief | null> {
  if (!userId) return null;
  try {
    return await getUserBrief(userId, {
      include: ["preferences", "premium", "wellness", "recentOrders"],
    });
  } catch {
    return null;
  }
}

interface CoachPromptContext {
  brief?: UserBrief | null;
}

const COACH_PROMPT = definePrompt<CoachPromptContext>({
  name: "coach-agent",
  version: "v1",
  build: (ctx) => {
    const briefBlock =
      ctx?.brief != null
        ? `\n\n${briefToPromptMarkdown(ctx.brief)}\n\nUse the user context above to ground every recommendation. Honor allergens, dietary style, dislikes, and macro targets without exception. Never read the brief back verbatim — pull only the fields that matter for the current question.`
        : "\n\nNo personal context is available. Stay generic, ask the user about goals/allergens before suggesting swaps, and never invent allergen safety claims.";
    return `You are the Tanmatra Nutrition Coach — a warm, behavior-change-friendly guide that helps customers hit their wellness goals using our menu.

YOUR SCOPE — you MAY help with:
- Explaining macros (calories, protein, carbs, fat, fiber) in plain language for any dish (use get_nutrition_facts).
- Searching the live menu for items that match a query, dietary style, kitchen, or macro filter (use search_menu).
- Suggesting concrete dish swaps that better fit the user's goal (use propose_swap). Always justify the swap in one sentence ("more protein, ~120 fewer kcal").
- Offering to add a suggested dish to the user's cart, replace what's already in their cart with a better-fit dish, or schedule it for their next subscription delivery (use prepare_add_to_cart with target = "cart" | "replace_in_cart" | "next_delivery"). Use "replace_in_cart" only when the user explicitly says they want to swap out what they're currently planning to order. This tool only PREPARES a card the user must tap to confirm — you never silently mutate carts.
- Routing the user to a Registered Dietitian when the question crosses into clinical territory (use book_rd_appointment).

OUT OF SCOPE — you MUST refuse politely and route to an RD or human care:
- Diagnosing or treating any medical condition.
- Advising on medications, supplements as treatment, or dosing.
- Symptom triage ("my chest hurts", "I have diabetes — what should I eat to manage it?", anything about pregnancy nutrition, eating disorders, kidney disease, blood sugar management, blood pressure, cholesterol targets, weight-loss medication, etc.).
- Promising health outcomes ("this will cure", "this prevents…").
- Allergen safety judgements (cross-contamination, severity). Defer to support / RD.

WHEN REFUSING A CLINICAL QUESTION, USE EXACTLY:
"That's a clinical question and I'm not the right person to answer it. I can connect you with one of our Registered Dietitians who can review your situation properly — want me to set that up?"
Then call book_rd_appointment to surface the booking card.

ALLERGEN & DIET SAFETY — non-negotiable:
- Never recommend a dish that contains an allergen the user has flagged. The search_menu and propose_swap tools already filter unsafe items; if a tool returns no results, say so and suggest the user update preferences.
- Never recommend a non-vegetarian dish to a vegetarian/vegan user, or non-vegan dairy to a vegan user.
- If asked "is X safe for my [allergy]?", refuse and route to support/RD — do not answer with the menu.

DISCLAIMER — append to every substantive nutrition reply (one short line, not a wall of text):
"This is general nutrition guidance, not medical advice."

GENERAL RULES:
- Never invent dishes, prices, calorie/protein numbers, or kitchen names. If a tool didn't return it, you don't know it.
- Be concise (3-5 sentences for typical answers). Lead with the recommendation, then the why, then the disclaimer.
- Tone: empathetic, behaviour-change friendly. Celebrate small wins. Never shame food choices.${briefBlock}`;
  },
});

const RUPEE = (paise: number) => `₹${Math.round(paise / 100)}`;

/**
 * `sugarPerServing` in the menu catalog is a free-text string like
 * "8g (natural)", "<1g", or "4g". Pull the leading numeric value so
 * "lower_sugar" swap scoring can rank candidates against the original.
 * Returns 0 when no number is present (which means the dish is treated
 * as effectively sugar-free for ranking).
 */
function parseSugarGrams(raw: string | null | undefined): number {
  if (!raw) return 0;
  const m = raw.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

interface BriefDishView {
  slug: string;
  name: string;
  kitchen: string;
  category: string;
  isVeg: boolean;
  rdVerified: boolean;
  pricePaise: number;
  priceLabel: string;
  macros: DishData["macros"];
  allergens: string[];
  glycaemicIndex: DishData["glycaemicIndex"];
  available: boolean;
}

function toView(d: DishData): BriefDishView {
  return {
    slug: d.slug,
    name: d.name,
    kitchen: d.kitchen,
    category: d.category,
    isVeg: d.isVeg,
    rdVerified: d.rdVerified,
    pricePaise: d.price,
    priceLabel: RUPEE(d.price),
    macros: d.macros,
    allergens: d.allergens,
    glycaemicIndex: d.glycaemicIndex,
    available: d.isAvailable,
  };
}

function userAllergens(brief: UserBrief | null | undefined): Set<string> {
  const list = brief?.preferences?.allergens ?? [];
  return new Set(list.map((a) => a.toLowerCase().trim()).filter(Boolean));
}

function userDislikes(brief: UserBrief | null | undefined): Set<string> {
  const list = brief?.preferences?.dislikedIngredients ?? [];
  return new Set(list.map((a) => a.toLowerCase().trim()).filter(Boolean));
}

function violatesDietStyle(d: DishData, brief: UserBrief | null | undefined): boolean {
  const style = brief?.preferences?.dietaryStyle;
  if (!style) return false;
  if ((style === "vegetarian" || style === "vegan") && !d.isVeg) return true;
  if (style === "vegan") {
    const dairyMarkers = ["dairy", "milk", "paneer", "cheese", "yogurt", "curd", "butter", "ghee", "cream"];
    const allergens = d.allergens.map((a) => a.toLowerCase());
    const ingredients = d.ingredients.map((i) => i.toLowerCase()).join(" ");
    if (allergens.some((a) => dairyMarkers.some((m) => a.includes(m)))) return true;
    if (dairyMarkers.some((m) => ingredients.includes(m))) return true;
    if (d.allergens.map((a) => a.toLowerCase()).includes("eggs")) return true;
  }
  return false;
}

function dishContainsAllergen(d: DishData, allergens: Set<string>): boolean {
  if (allergens.size === 0) return false;
  return d.allergens.some((a) => allergens.has(a.toLowerCase().trim()));
}

function dishContainsDislike(d: DishData, dislikes: Set<string>): boolean {
  if (dislikes.size === 0) return false;
  const ing = d.ingredients.map((i) => i.toLowerCase());
  for (const dl of dislikes) {
    if (ing.some((i) => i.includes(dl))) return true;
  }
  return false;
}

function safeForUser(d: DishData, brief: UserBrief | null | undefined): boolean {
  if (!d.isAvailable) return false;
  if (dishContainsAllergen(d, userAllergens(brief))) return false;
  if (dishContainsDislike(d, userDislikes(brief))) return false;
  if (violatesDietStyle(d, brief)) return false;
  return true;
}

const searchMenu = defineTool({
  name: "search_menu",
  description:
    "Search the live menu. Filters out anything the user is allergic to, dislikes, or that violates their dietary style. Read-only.",
  inputSchema: z.object({
    query: z.string().optional(),
    kitchen: z
      .enum(["continental", "indian", "asian", "mediterranean"])
      .optional(),
    category: z
      .enum([
        "beverages",
        "breakfast",
        "salads",
        "soups",
        "pasta",
        "wraps",
        "bowls",
        "snacks",
        "mains",
      ])
      .optional(),
    minProteinGrams: z.number().nonnegative().optional(),
    maxCalories: z.number().positive().optional(),
    vegOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  authScope: "public",
  handler: async (input, ctx) => {
    const brief = await loadBriefSafe(ctx.userId);
    const q = input.query?.toLowerCase().trim() ?? "";
    const limit = input.limit ?? 6;
    let pool = DISHES.filter((d) => safeForUser(d, brief));
    if (input.vegOnly) pool = pool.filter((d) => d.isVeg);
    if (input.kitchen) pool = pool.filter((d) => d.kitchen === input.kitchen);
    if (input.category) pool = pool.filter((d) => d.category === input.category);
    if (typeof input.minProteinGrams === "number") {
      pool = pool.filter((d) => d.macros.protein >= input.minProteinGrams!);
    }
    if (typeof input.maxCalories === "number") {
      pool = pool.filter((d) => d.macros.calories <= input.maxCalories!);
    }
    if (q) {
      pool = pool.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.ingredients.some((i) => i.toLowerCase().includes(q)),
      );
    }
    return {
      success: true as const,
      count: pool.length,
      results: pool.slice(0, limit).map(toView),
    };
  },
});

const getNutritionFacts = defineTool({
  name: "get_nutrition_facts",
  description:
    "Return per-serving macros (calories, protein, carbs, fat, fiber), allergens, and glycaemic index for a dish by slug. Read-only.",
  inputSchema: z.object({ slug: z.string() }),
  authScope: "public",
  handler: async ({ slug }) => {
    const d = DISHES.find((x) => x.slug === slug);
    if (!d) return { success: false as const, error: "Dish not found" };
    return {
      success: true as const,
      slug: d.slug,
      name: d.name,
      macros: d.macros,
      allergens: d.allergens,
      glycaemicIndex: d.glycaemicIndex,
      sugarPerServing: d.sugarPerServing,
      pricePaise: d.price,
      priceLabel: RUPEE(d.price),
      rdVerified: d.rdVerified,
    };
  },
});

const proposeSwap = defineTool({
  name: "propose_swap",
  description:
    "Given a dish slug the user is considering or already has, propose up to 3 safer/better alternatives that match the user's goal (e.g. higher protein for gain_muscle, lower calories for lose_weight). Filters out unsafe items. Read-only.",
  inputSchema: z.object({
    slug: z.string(),
    goal: z
      .enum(["higher_protein", "lower_calories", "more_fiber", "lower_sugar"])
      .optional(),
    limit: z.number().int().min(1).max(3).optional(),
  }),
  authScope: "public",
  handler: async ({ slug, goal, limit }, ctx) => {
    const brief = await loadBriefSafe(ctx.userId);
    const original = DISHES.find((d) => d.slug === slug);
    if (!original) {
      return { success: false as const, error: "Original dish not found" };
    }
    // Default goal from user brief if not given
    let effectiveGoal = goal;
    if (!effectiveGoal) {
      const briefGoal = brief?.preferences?.goal;
      if (briefGoal === "lose_weight") effectiveGoal = "lower_calories";
      else if (briefGoal === "gain_muscle") effectiveGoal = "higher_protein";
      else effectiveGoal = "higher_protein";
    }

    const candidates = DISHES.filter(
      (d) => d.slug !== slug && safeForUser(d, brief) && d.category === original.category,
    );

    const originalSugar = parseSugarGrams(original.sugarPerServing);
    let scored = candidates.map((d) => {
      const dProtein = d.macros.protein - original.macros.protein;
      const dCalories = d.macros.calories - original.macros.calories;
      const dFiber = d.macros.fiber - original.macros.fiber;
      const dSugar = parseSugarGrams(d.sugarPerServing) - originalSugar;
      let score = 0;
      if (effectiveGoal === "higher_protein") score = dProtein - dCalories * 0.05;
      else if (effectiveGoal === "lower_calories") score = -dCalories + dProtein * 0.5;
      else if (effectiveGoal === "more_fiber") score = dFiber - dCalories * 0.02;
      else if (effectiveGoal === "lower_sugar") score = -dSugar - dCalories * 0.01 + dFiber * 0.5;
      return { d, dProtein, dCalories, dFiber, dSugar, score };
    });
    // Only keep dishes that are actually better on the chosen axis.
    scored = scored.filter((s) => {
      if (effectiveGoal === "higher_protein") return s.dProtein > 0;
      if (effectiveGoal === "lower_calories") return s.dCalories < 0;
      if (effectiveGoal === "more_fiber") return s.dFiber > 0;
      if (effectiveGoal === "lower_sugar") return s.dSugar < 0;
      return true;
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit ?? 3);
    return {
      success: true as const,
      original: toView(original),
      goal: effectiveGoal,
      suggestions: top.map((t) => ({
        ...toView(t.d),
        proteinDeltaGrams: t.dProtein,
        caloriesDelta: t.dCalories,
        fiberDeltaGrams: t.dFiber,
        sugarDeltaGrams: t.dSugar,
      })),
      empty: top.length === 0,
    };
  },
});

const prepareAddToCart = defineTool({
  name: "prepare_add_to_cart",
  description:
    "Prepare a one-tap card the user can confirm to add a dish to their cart, or schedule it for their next subscription delivery. This NEVER mutates the cart on its own — the customer must tap the card. Returns the action card payload the UI renders.",
  inputSchema: z.object({
    slug: z.string(),
    quantity: z.number().int().min(1).max(6).optional(),
    target: z.enum(["cart", "next_delivery", "replace_in_cart"]).optional(),
    /** When target is "replace_in_cart", the slug of the dish currently in the cart that this swap should replace. */
    replaceSlug: z.string().optional(),
    reasoning: z.string().min(3),
  }),
  authScope: "public",
  handler: async ({ slug, quantity, target, replaceSlug, reasoning }, ctx) => {
    const brief = await loadBriefSafe(ctx.userId);
    const dish = DISHES.find((d) => d.slug === slug);
    if (!dish) return { success: false as const, error: "Dish not found" };
    if (!safeForUser(dish, brief)) {
      return {
        success: false as const,
        error:
          "This dish conflicts with the customer's allergens, dislikes, or dietary style. Refuse to recommend it and pick a safer alternative.",
      };
    }
    return {
      success: true as const,
      action: {
        kind: "add_to_cart" as const,
        slug: dish.slug,
        name: dish.name,
        image: dish.image,
        quantity: quantity ?? 1,
        target: target ?? "cart",
        replaceSlug: target === "replace_in_cart" ? (replaceSlug ?? null) : null,
        pricePaise: dish.price,
        priceLabel: RUPEE(dish.price),
        macros: dish.macros,
        reasoning,
      },
    };
  },
});

const bookRdAppointment = defineTool({
  name: "book_rd_appointment",
  description:
    "Surface a card the customer can tap to book a Registered Dietitian. Use whenever the question crosses into clinical territory or the user explicitly asks for a human RD. Does not actually book — it returns the link for the UI.",
  inputSchema: z.object({
    reason: z.string().min(3),
    urgency: z.enum(["routine", "soon"]).optional(),
  }),
  authScope: "public",
  handler: async ({ reason, urgency }, ctx) => {
    const brief = await loadBriefSafe(ctx.userId);
    const consultsLeft = brief?.premium?.rdConsultsRemaining ?? null;
    return {
      success: true as const,
      action: {
        kind: "book_rd" as const,
        href: "/rd",
        appointmentsHref: "/appointments",
        reason,
        urgency: urgency ?? "routine",
        premiumConsultsRemaining: consultsLeft,
      },
    };
  },
});

// NOTE: order matters — more specific intents (medication/treatment, severe
// allergy, allergen safety judgements) must be checked BEFORE broad
// condition patterns so e.g. "interact with my statin medication" routes
// to clinical_treatment rather than a generic cardiac bucket. Stems use
// \w* (not \b) so we match natural inflections like "pregnant",
// "anaphylactic", "diabetic", "renal failure", etc.
const REFUSAL_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /\b(diagnose|prescrib|medication|drug interaction|interact\w*\s+(with|my)\s+\w*\s*(med|drug|pill|statin|insulin)|cure|treat(ment)?)\w*/i,
    reason: "clinical_treatment",
  },
  {
    re: /\b(severe\w*|severely)\b[^.?!]{0,40}\ballerg\w*|\banaphyla\w*|\bepi.?pen\w*/i,
    reason: "severe_allergy",
  },
  // Generic "is X safe for my [allergy/intolerance]" phrasing is a safety
  // judgement we never make from the model — even if the dish passes the
  // allergen filter, cross-contamination & severity are out of scope.
  {
    re: /\b(is|are)\b.*\b(safe|ok|okay|fine)\b.*\b(for me|with my|my)\b.*\b(allerg|intoleran|sensitiv|celiac|coeliac|gluten)\w*/i,
    reason: "allergen_safety_judgement",
  },
  {
    re: /\bcross.?contaminat\w*/i,
    reason: "allergen_safety_judgement",
  },
  {
    re: /\b(diabet\w*|insulin|blood sugar|hba1c|hyperglyc\w*|hypoglyc\w*)/i,
    reason: "clinical_diabetes",
  },
  {
    re: /\b(pregnan\w*|prenatal|gestational|breastfeed\w*|lactating|trimester|weeks pregnant)/i,
    reason: "clinical_pregnancy",
  },
  {
    re: /\b(kidney|renal|dialysis|ckd)\w*/i,
    reason: "clinical_renal",
  },
  {
    re: /\b(blood pressure|hypertension|cholesterol|ldl|hdl|statin)\w*/i,
    reason: "clinical_cardiac",
  },
  {
    re: /\b(eating disorder|anorexi\w*|bulimi\w*|binge eating|orthorex\w*)/i,
    reason: "clinical_ed",
  },
];

const CLINICAL_REFUSAL_TEXT =
  "That's a clinical question and I'm not the right person to answer it. I can connect you with one of our Registered Dietitians who can review your situation properly — want me to set that up?";

registerAgent<CoachPromptContext>({
  name: "coach",
  description:
    "Customer-facing nutrition coach. Read-only menu and macro tools, with cart and RD-booking action cards.",
  defaultModel: "gemini-2.5-flash",
  maxSteps: 6,
  systemPrompt: COACH_PROMPT,
  tools: [
    searchMenu,
    getNutritionFacts,
    proposeSwap,
    prepareAddToCart,
    bookRdAppointment,
  ],
  preflight: (msg: string) => {
    const m = REFUSAL_PATTERNS.find((p) => p.re.test(msg));
    if (m) return { refusal: { text: CLINICAL_REFUSAL_TEXT, reason: m.reason } };
    return null;
  },
  detectEscalation: (text: string, toolCalls) => {
    if (toolCalls.some((t) => t.name === "book_rd_appointment" && t.ok)) return true;
    return /registered dietitian|book.*rd|set that up|connect you/i.test(text);
  },
});
