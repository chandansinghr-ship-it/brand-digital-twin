import { db, menuItemsTable } from "@workspace/db";
import { DISHES } from "@workspace/menu-catalog";
import { sql } from "drizzle-orm";

async function main() {
  console.log(`Seeding ${DISHES.length} dishes into menu_items...`);

  let inserted = 0;
  let updated = 0;

  for (const d of DISHES) {
    const values = {
      slug: d.slug,
      name: d.name,
      description: d.description,
      pricePaise: d.price,
      category: d.category,
      kitchenLocation: d.kitchen,
      isVeg: d.isVeg,
      isAvailable: d.isAvailable,
      imageUrl: d.image,
      longDescription: d.longDescription,
      allergens: d.allergens.length > 0 ? d.allergens : null,
      macros: {
        kcal: d.macros.calories,
        proteinG: d.macros.protein,
        carbsG: d.macros.carbs,
        fatG: d.macros.fat,
        fiberG: d.macros.fiber,
      },
      macrosAreEstimate: false,
      rdVerified: d.rdVerified,
      rdNote: d.rdNote ?? null,
      prepTime: d.prepTime,
      glycaemicIndex: d.glycaemicIndex,
      sugarPerServing: d.sugarPerServing,
      ingredients: d.ingredients.length > 0 ? d.ingredients : null,
      customizations:
        d.customizations.length > 0 ? d.customizations : null,
      pairingSlug: d.pairingSlug ?? null,
    } as const;

    const result = await db
      .insert(menuItemsTable)
      .values(values)
      .onConflictDoUpdate({
        target: menuItemsTable.slug,
        // Refresh fields that haven't been edited in CMS. We keep editor-managed
        // fields like name/description/price as-is on conflict, and only update
        // the static-only fields (kitchen, category, isVeg) plus macros if they
        // were never set by the editor (macrosAreEstimate=true means default).
        set: {
          category: sql`excluded.category`,
          kitchenLocation: sql`excluded.kitchen_location`,
          isVeg: sql`excluded.is_veg`,
          longDescription: sql`coalesce(${menuItemsTable.longDescription}, excluded.long_description)`,
          allergens: sql`coalesce(${menuItemsTable.allergens}, excluded.allergens)`,
          imageUrl: sql`coalesce(${menuItemsTable.imageUrl}, excluded.image_url)`,
          rdVerified: sql`excluded.rd_verified`,
          rdNote: sql`coalesce(${menuItemsTable.rdNote}, excluded.rd_note)`,
          prepTime: sql`coalesce(${menuItemsTable.prepTime}, excluded.prep_time)`,
          glycaemicIndex: sql`coalesce(${menuItemsTable.glycaemicIndex}, excluded.glycaemic_index)`,
          sugarPerServing: sql`coalesce(${menuItemsTable.sugarPerServing}, excluded.sugar_per_serving)`,
          ingredients: sql`coalesce(${menuItemsTable.ingredients}, excluded.ingredients)`,
          customizations: sql`coalesce(${menuItemsTable.customizations}, excluded.customizations)`,
          pairingSlug: sql`coalesce(${menuItemsTable.pairingSlug}, excluded.pairing_slug)`,
          macros: sql`case when ${menuItemsTable.macros} is null then excluded.macros when (${menuItemsTable.macros} ? 'fiberG') then ${menuItemsTable.macros} else ${menuItemsTable.macros} || jsonb_build_object('fiberG', excluded.macros->'fiberG') end`,
        },
      })
      .returning({ id: menuItemsTable.id, createdAt: menuItemsTable.createdAt });

    const row = result[0];
    if (!row) continue;
    // Heuristic: if createdAt is recent (within last few seconds), it was just inserted.
    if (Date.now() - new Date(row.createdAt).getTime() < 5000) {
      inserted++;
    } else {
      updated++;
    }
  }

  console.log(`Seed complete: ${inserted} inserted, ${updated} refreshed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
