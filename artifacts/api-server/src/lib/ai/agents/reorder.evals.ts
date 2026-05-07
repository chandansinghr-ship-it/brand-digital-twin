import type { EvalCase } from "./support.evals";

export const reorderEvals: EvalCase[] = [
  {
    name: "out-of-scope refusal (refunds)",
    message: "Please refund order 123 right now.",
    expect: {
      containsAny: [
        "scope",
        "can't",
        "cannot",
        "not able",
        "ops agent",
        "support",
        "reorder",
      ],
    },
  },
  {
    name: "low stock listing uses tool",
    message: "What ingredients are running low right now?",
    expect: { toolUsed: "list_low_stock" },
  },
  {
    name: "demand forecast uses tool",
    message: "Just call get_demand_forecast for the default zone and show me the top dishes — don't recommend or draft anything.",
    expect: { toolUsed: "get_demand_forecast" },
  },
  {
    name: "reorder recommendation uses tool",
    message: "Recommend what we should reorder today.",
    expect: { toolUsed: "recommend_reorder" },
  },
];
