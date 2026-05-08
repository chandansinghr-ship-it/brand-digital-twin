/**
 * Integration tests for the checkout safety contract on `finalizeOrder`:
 *
 *   1. The server re-prices every line from the shared catalog and ignores
 *      the client-supplied `price` (so a tampered cart can't get a discount
 *      by claiming `price: 1`, nor charge an inflated price by claiming
 *      `price: 9_999_999`).
 *   2. The pickup discount is sourced from `pickup_locations.discount_paise`
 *      — never the request — and is capped so the order total can never go
 *      negative even when the location's discount exceeds the subtotal.
 *
 * Run with:
 *   node --test --import tsx ./src/lib/loyaltyEngine.checkout.test.ts
 *
 * Hits the real dev DB via DATABASE_URL. Each test uses its own user +
 * external order id so concurrent runs don't collide.
 */

import assert from "node:assert/strict";
import { test, after, before } from "node:test";
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import {
  creditLedgerTable,
  db,
  orderClaimsTable,
  ordersTable,
  pickupLocationsTable,
  usersTable,
} from "@workspace/db";
import { DISHES } from "@workspace/menu-catalog";

import { finalizeOrder } from "./loyaltyEngine";

// Premium-only slugs are gated at the route layer (not finalizeOrder),
// but we still avoid them so the engine-level price assertions are not
// accidentally short-circuited by route-only behavior.
const PREMIUM_SLUGS = new Set([
  "alfredo-pasta-prawns",
  "pesto-pasta-prawns",
  "crispy-peri-peri-chicken-burrito-wrap",
]);

function pickAvailableDishes(n: number) {
  const pool = DISHES.filter(
    (d) => d.isAvailable && !PREMIUM_SLUGS.has(d.slug) && d.price > 0,
  );
  if (pool.length < n) {
    throw new Error(`catalog only has ${pool.length} usable dishes`);
  }
  return pool.slice(0, n);
}

const CREATED_USER_IDS: string[] = [];
const CREATED_PICKUP_IDS: number[] = [];

async function makeUser(): Promise<string> {
  const id = randomUUID();
  await db.insert(usersTable).values({
    id,
    email: `checkout-test-${id}@example.test`,
    firstName: "Checkout",
    lastName: "Tester",
  });
  CREATED_USER_IDS.push(id);
  return id;
}

async function makePickupLocation(discountPaise: number): Promise<number> {
  const [loc] = await db
    .insert(pickupLocationsTable)
    .values({
      name: `Checkout Test Pickup ${randomUUID().slice(0, 6)}`,
      addressLine: "1 Test St",
      city: "Bengaluru",
      pincode: "560001",
      lat: 12.97,
      lng: 77.59,
      discountPaise,
      active: true,
    })
    .returning();
  CREATED_PICKUP_IDS.push(loc!.id);
  return loc!.id;
}

before(async () => {
  // No shared fixture — each test creates its own pickup location with a
  // discount tailored to the assertion (zero, or larger-than-subtotal).
});

after(async () => {
  if (CREATED_USER_IDS.length > 0) {
    await db
      .delete(orderClaimsTable)
      .where(inArray(orderClaimsTable.userId, CREATED_USER_IDS));
    await db
      .delete(ordersTable)
      .where(inArray(ordersTable.userId, CREATED_USER_IDS));
    await db
      .delete(creditLedgerTable)
      .where(inArray(creditLedgerTable.userId, CREATED_USER_IDS));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, CREATED_USER_IDS));
  }
  for (const id of CREATED_PICKUP_IDS) {
    await db.delete(pickupLocationsTable).where(eq(pickupLocationsTable.id, id));
  }
});

test("finalizeOrder ignores client-supplied price and re-prices from the catalog", async () => {
  const userId = await makeUser();
  const pickupLocationId = await makePickupLocation(0);
  const [a, b] = pickAvailableDishes(2);
  const expectedGross = a!.price * 2 + b!.price * 1;

  // Client lies: sends absurd prices, both very high (to inflate the
  // total) and zero (to get a freebie). finalizeOrder must throw both
  // away and re-price every line from the merged catalog.
  const out = await finalizeOrder({
    userId,
    orderId: `ord-${randomUUID()}`,
    fulfillmentType: "pickup",
    pickupLocationId,
    items: [
      { id: a!.id, name: "FAKE NAME", qty: 2, price: 9_999_999 },
      { id: b!.id, name: "FAKE NAME", qty: 1, price: 0 },
    ],
  });

  assert.equal(
    out.grossPaise,
    expectedGross,
    "gross must equal sum of catalog prices, not the client-supplied prices",
  );
  assert.equal(out.bundleDiscountPaise, 0);
  assert.equal(out.pickupDiscountPaise, 0);
  assert.equal(out.preorderDiscountPaise, 0);
  assert.equal(out.finalPaise, expectedGross);

  // The persisted order row must also carry catalog values, not the
  // tampered name/price the client sent.
  const [persisted] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, out.serverOrderId));
  assert.ok(persisted, "order row must exist");
  const persistedItems = (persisted!.items ?? []) as Array<{
    id: number;
    name: string;
    qty: number;
    price: number;
  }>;
  assert.equal(persistedItems.length, 2);
  const persistedA = persistedItems.find((i) => i.id === a!.id)!;
  const persistedB = persistedItems.find((i) => i.id === b!.id)!;
  assert.equal(persistedA.name, a!.name, "name must come from catalog");
  assert.equal(persistedA.price, a!.price, "price must come from catalog");
  assert.equal(persistedA.qty, 2);
  assert.equal(persistedB.name, b!.name);
  assert.equal(persistedB.price, b!.price);
  assert.equal(persistedB.qty, 1);
  assert.equal(persisted!.totalPaise, expectedGross);
});

test("finalizeOrder uses pickup_locations.discount_paise and caps it so total never goes negative", async () => {
  const userId = await makeUser();
  const [a] = pickAvailableDishes(1);
  // Pickup location offers a discount that is FAR larger than the
  // subtotal. The cap inside finalizeOrder must clamp pickupDiscountPaise
  // to the gross so finalPaise can never be negative.
  const oversizedDiscount = a!.price * 10 + 1_000_000;
  const pickupLocationId = await makePickupLocation(oversizedDiscount);

  const out = await finalizeOrder({
    userId,
    orderId: `ord-${randomUUID()}`,
    fulfillmentType: "pickup",
    pickupLocationId,
    // Even if the client also sends a tampered `price`, the discount
    // source is still the DB row, so we keep the price honest here to
    // isolate this assertion to the cap behavior.
    items: [{ id: a!.id, name: a!.name, qty: 1, price: a!.price }],
  });

  // `grossPaise` in the response is the post-discount gross (after
  // bundle + pickup + preorder discounts), so the catalog subtotal is
  // recoverable as gross + pickup discount when no other discount
  // applies.
  const recoveredSubtotal = out.grossPaise + out.pickupDiscountPaise;
  assert.equal(recoveredSubtotal, a!.price, "subtotal must come from catalog");
  assert.equal(
    out.pickupDiscountPaise,
    a!.price,
    "pickup discount must be clamped to subtotal, not the (much larger) DB value",
  );
  assert.equal(
    out.finalPaise,
    0,
    "final must clamp at zero — order total can never go negative",
  );
  assert.ok(out.finalPaise >= 0, "final must never be negative");

  // The persisted total mirrors the clamped final.
  const [persisted] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, out.serverOrderId));
  assert.ok(persisted);
  assert.equal(persisted!.totalPaise, 0);
});

test("finalizeOrder takes the pickup discount from the DB row, ignoring any request-side hint", async () => {
  // The route schema does not even accept a discount field, but we lock
  // in here that finalizeOrder reads the discount from the DB row of the
  // chosen pickup location rather than any caller-controlled value.
  const userId = await makeUser();
  const [a, b] = pickAvailableDishes(2);
  const subtotal = a!.price + b!.price;
  const dbDiscount = Math.floor(subtotal / 4); // 25% off, well within bounds
  const pickupLocationId = await makePickupLocation(dbDiscount);

  const out = await finalizeOrder({
    userId,
    orderId: `ord-${randomUUID()}`,
    fulfillmentType: "pickup",
    pickupLocationId,
    items: [
      { id: a!.id, name: a!.name, qty: 1, price: a!.price },
      { id: b!.id, name: b!.name, qty: 1, price: b!.price },
    ],
  });

  assert.equal(
    out.pickupDiscountPaise,
    dbDiscount,
    "pickup discount must come from pickup_locations.discount_paise",
  );
  // `grossPaise` is the post-discount gross; recover catalog subtotal.
  assert.equal(
    out.grossPaise + out.pickupDiscountPaise,
    subtotal,
    "subtotal recovered from response must equal catalog subtotal",
  );
  assert.equal(out.finalPaise, subtotal - dbDiscount);
});
