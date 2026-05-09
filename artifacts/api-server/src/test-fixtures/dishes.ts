import { DISHES, type DishData } from "@workspace/menu-catalog";

/**
 * Test-only dish catalog. The production menu-catalog ships empty (dishes
 * are now sourced exclusively from the database), but our integration tests
 * still need a stable pool of fixture dishes for bundle/pricing/group-order
 * scenarios. Keep this list small and deterministic.
 *
 * Includes the premium slugs the loyalty/premium tests look for.
 */

const baseMacros = {
  protein: 30,
  carbs: 40,
  fat: 15,
  fiber: 6,
  calories: 480,
};

function makeDish(
  id: number,
  slug: string,
  name: string,
  price: number,
  category: DishData["category"] = "mains",
): DishData {
  return {
    id,
    slug,
    name,
    description: `${name} test fixture`,
    longDescription: `${name} test fixture (long)`,
    image: `/test/${slug}.jpg`,
    price,
    kitchen: "continental",
    category,
    isVeg: false,
    rdVerified: true,
    prepTime: "20 min",
    macros: baseMacros,
    ingredients: ["test"],
    allergens: [],
    glycaemicIndex: "low",
    sugarPerServing: "0g",
    customizations: [],
    isAvailable: true,
  };
}

export const TEST_DISHES: DishData[] = [
  makeDish(1001, "test-grilled-salmon", "Grilled Salmon", 48500),
  makeDish(1002, "test-power-bowl", "Power Bowl", 39500, "bowls"),
  makeDish(1003, "test-keto-ribeye", "Keto Ribeye", 62500),
  makeDish(1004, "test-miso-cod", "Miso Cod", 54500),
  makeDish(1005, "test-smoothie-bowl", "Smoothie Bowl", 28500, "breakfast"),
  makeDish(1006, "test-grain-salad", "Grain Salad", 32500, "salads"),
  // Premium-slug fixtures so the premium-meal tests can find them.
  // Prices match the seeded menu_items rows so getMergedCatalog (which
  // overlays DB price on top of the static fixture) returns the same
  // value the test reads from the fixture.
  makeDish(2001, "alfredo-pasta-prawns", "Alfredo Pasta Prawns", 24500, "pasta"),
  makeDish(2002, "pesto-pasta-prawns", "Pesto Pasta Prawns", 23000, "pasta"),
  makeDish(
    2003,
    "crispy-peri-peri-chicken-burrito-wrap",
    "Peri-Peri Chicken Wrap",
    23000,
    "wraps",
  ),
];

// Side-effect on import: register the fixture dishes into the real
// menu-catalog DISHES array so server-side resolvers (menuResolver,
// menuEngineering, mealPlanner, coach, dishRationale) can find them
// during tests. The production catalog ships empty; tests opt-in by
// importing this module.
if (DISHES.length === 0) {
  DISHES.push(...TEST_DISHES);
}
