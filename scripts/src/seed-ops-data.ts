import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  db,
  inventoryItemsTable,
  packagingItemsTable,
  recipeIngredientsTable,
  recipesTable,
} from "@workspace/db";

const ROOT = resolve(process.cwd(), "..");
const ASSETS = resolve(ROOT, "attached_assets");

const PACKAGING_RAW: Array<{ no: number; name: string; pricePcs?: number }> = [
  { no: 1, name: "Sandwich Box", pricePcs: 6.96 },
  { no: 2, name: "Salad Box 500 ml", pricePcs: 12 },
  { no: 3, name: "Salad Box 750 ml", pricePcs: 14 },
  { no: 4, name: "Tissue" },
  { no: 5, name: "Glasses 250 ml" },
  { no: 6, name: "Paper Straw" },
  { no: 7, name: "Soup Box" },
  { no: 8, name: "Cling Wrap" },
  { no: 9, name: "Aluminium Foil" },
  { no: 10, name: "Dip Box 30 ml" },
  { no: 11, name: "Paper Bags" },
  { no: 12, name: "Wrap Box" },
  { no: 13, name: "Wooden Cutlery" },
  { no: 14, name: "Black Box with Lid 100 ml" },
  { no: 15, name: "Cello Tape" },
];

const toPaise = (rupees: number | undefined | null): number | null =>
  rupees == null || Number.isNaN(rupees) ? null : Math.round(rupees * 100);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 240);
}

function parseInventory(): Array<typeof inventoryItemsTable.$inferInsert> {
  const file = readFileSync(
    resolve(ASSETS, "Pasted-NO-PRODUCT-QTY-BUYING-PRICE-PER-KG-UNIT-PRICE-PER-100-G_1778173002870.txt"),
    "utf8",
  );
  const lines = file.split("\n").slice(1);
  const out: Array<typeof inventoryItemsTable.$inferInsert> = [];
  for (const line of lines) {
    const cells = line.split("\t").map((c) => c.trim());
    if (cells.length < 2) continue;
    const itemNo = Number(cells[0]);
    if (!Number.isInteger(itemNo) || itemNo <= 0) continue;
    const product = cells[1];
    if (!product) continue;
    const buyingQty = cells[2] || null;
    const buyingPrice = Number(cells[3]);
    const perKgUnit = Number(cells[4]);
    const pricePer100 = cells[5] || null;
    const pricePer10 = cells[6] || null;
    out.push({
      itemNo,
      product,
      buyingQty,
      buyingPricePaise: Number.isFinite(buyingPrice) ? toPaise(buyingPrice) : null,
      perKgUnitPaise: Number.isFinite(perKgUnit) ? toPaise(perKgUnit) : null,
      pricePer100GmPcsLabel: pricePer100,
      pricePer10GmLabel: pricePer10,
    });
  }
  return out;
}

function parseFoodCosts(): Map<string, number> {
  const file = readFileSync(
    resolve(ASSETS, "Pasted--MENU-FOOD-COST-AS-PER-HYPER-PURE-INVENTORY-INGREDIENT-_1778173069967.txt"),
    "utf8",
  );
  const map = new Map<string, number>();
  for (const line of file.split("\n").slice(1)) {
    const cells = line.split("\t").map((c) => c.trim());
    const name = cells[0];
    if (!name) continue;
    for (let i = 1; i < cells.length; i++) {
      const v = Number(cells[i]);
      if (Number.isFinite(v) && v > 0) {
        map.set(slugify(name), v);
        break;
      }
    }
  }
  return map;
}

interface ParsedRecipe {
  no: number;
  name: string;
  servingSize: string | null;
  ingredients: Array<{ raw: string; ingredient: string; quantity: string | null }>;
  method: string;
}

function parseRecipes(): ParsedRecipe[] {
  const file = readFileSync(
    resolve(ASSETS, "Pasted--RECIPE-AND-MENU-1-Activated-Charcoal-Smoothie-Ingredie_1778173045207.txt"),
    "utf8",
  );
  const lines = file.split("\n").map((l) => l.replace(/\t/g, "").replace(/^·\s*/, "").trim());
  const recipes: ParsedRecipe[] = [];
  let current: ParsedRecipe | null = null;
  type Mode = "none" | "ingredients" | "method";
  let mode: Mode = "none";

  const headerRe = /^(\d+)\.\s+([^.]+?)\s*$/;
  const ingredientsRe = /^Ingredients(?:\s*\(([^)]+)\))?\s*:?\s*$/i;
  const methodRe = /^Method\s*:?\s*$/i;
  const stepRe = /^\d+\.\s*(.+)$/;
  const dashSplit = /\s[–-]\s/;

  const flush = () => {
    if (current) recipes.push(current);
    current = null;
    mode = "none";
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const h = headerRe.exec(line);
    const expectedNo = current ? current.no + 1 : 1;
    if (h && Number(h[1]) === expectedNo && !/[.,;:]$/.test(h[2])) {
      flush();
      current = {
        no: Number(h[1]),
        name: h[2].trim(),
        servingSize: null,
        ingredients: [],
        method: "",
      };
      mode = "none";
      continue;
    }
    if (!current) continue;
    const ing = ingredientsRe.exec(line);
    if (ing) {
      mode = "ingredients";
      if (ing[1]) current.servingSize = ing[1].trim();
      continue;
    }
    if (methodRe.test(line)) {
      mode = "method";
      continue;
    }
    if (mode === "ingredients") {
      const parts = line.split(dashSplit);
      if (parts.length >= 2) {
        current.ingredients.push({
          raw: line,
          ingredient: parts[0].trim().slice(0, 128),
          quantity: parts.slice(1).join(" - ").trim().slice(0, 64),
        });
      } else if (line.length < 80) {
        current.ingredients.push({
          raw: line,
          ingredient: line.slice(0, 128),
          quantity: null,
        });
      }
    } else if (mode === "method") {
      const step = stepRe.exec(line);
      if (step) {
        current.method += (current.method ? "\n" : "") + step[1].trim();
      } else if (current.method) {
        current.method += " " + line;
      }
    }
  }
  flush();
  return recipes;
}

async function main() {
  console.log("Clearing existing ops data…");
  await db.delete(recipeIngredientsTable);
  await db.delete(recipesTable);
  await db.delete(inventoryItemsTable);
  await db.delete(packagingItemsTable);

  console.log("Seeding packaging…");
  await db.insert(packagingItemsTable).values(
    PACKAGING_RAW.map((p) => ({
      itemNo: p.no,
      name: p.name,
      pricePerPiecePaise: toPaise(p.pricePcs),
    })),
  );

  console.log("Seeding inventory…");
  const inv = parseInventory();
  if (inv.length) await db.insert(inventoryItemsTable).values(inv);
  console.log(`  inserted ${inv.length} inventory rows`);

  console.log("Seeding recipes…");
  const costs = parseFoodCosts();
  const recipes = parseRecipes();
  const seenSlugs = new Set<string>();
  let inserted = 0;
  for (const r of recipes) {
    let slug = slugify(r.name);
    if (!slug) continue;
    let dedupe = slug;
    let n = 2;
    while (seenSlugs.has(dedupe)) dedupe = `${slug}-${n++}`;
    seenSlugs.add(dedupe);
    const cost = costs.get(slug);
    const [row] = await db
      .insert(recipesTable)
      .values({
        recipeNo: r.no,
        name: r.name,
        slug: dedupe,
        servingSize: r.servingSize,
        method: r.method,
        foodCostPaise: cost ? toPaise(cost) : null,
      })
      .returning({ id: recipesTable.id });
    if (r.ingredients.length) {
      await db.insert(recipeIngredientsTable).values(
        r.ingredients.map((ing, idx) => ({
          recipeId: row.id,
          position: idx,
          rawText: ing.raw.slice(0, 256),
          ingredient: ing.ingredient,
          quantityText: ing.quantity,
        })),
      );
    }
    inserted++;
  }
  console.log(`  inserted ${inserted} recipes`);
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
