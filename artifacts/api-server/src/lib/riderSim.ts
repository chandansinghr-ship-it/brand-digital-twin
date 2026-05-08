import { db, ordersTable, ridersTable, deliveryEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { emitRiderPosition, emitDeliveryEta, emitDeliveryEvent } from "./realtime";
import { logger } from "./logger";

const KITCHEN = { lat: 12.9716, lng: 77.5946 } as const;

const TICK_MS = 2000;
const AVG_SPEED_KMH = 28;
const STEPS_TO_DESTINATION = 30;

interface Sim {
  orderId: number;
  riderId: number;
  start: { lat: number; lng: number };
  dest: { lat: number; lng: number };
  step: number;
  timer: NodeJS.Timeout;
}

const active = new Map<number, Sim>();

function destinationFor(orderId: number): { lat: number; lng: number } {
  const seed = (orderId * 9301 + 49297) % 233280;
  const r1 = (seed / 233280 - 0.5) * 0.04;
  const r2 = (((seed * 7) % 233280) / 233280 - 0.5) * 0.04;
  return { lat: KITCHEN.lat + r1, lng: KITCHEN.lng + r2 };
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function recordRiderPosition(
  riderId: number,
  lat: number,
  lng: number,
  orderId?: number,
): Promise<void> {
  await db.update(ridersTable).set({ lat, lng }).where(eq(ridersTable.id, riderId));
  emitRiderPosition(riderId, { lat, lng, orderId });
  if (orderId) {
    const dest = destinationFor(orderId);
    const meters = haversineMeters({ lat, lng }, dest);
    const etaMs = (meters / 1000 / AVG_SPEED_KMH) * 3600 * 1000;
    const etaAt = new Date(Date.now() + etaMs).toISOString();
    emitDeliveryEta(orderId, { etaAt, distanceMeters: Math.round(meters) });
  }
}

export function stopSimulation(orderId: number): void {
  const sim = active.get(orderId);
  if (!sim) return;
  clearInterval(sim.timer);
  active.delete(orderId);
  logger.info({ orderId }, "rider simulation stopped");
}

export function startSimulation(orderId: number, riderId: number): void {
  if (active.has(orderId)) return;
  const dest = destinationFor(orderId);
  const start = { ...KITCHEN };
  const sim: Sim = {
    orderId,
    riderId,
    start,
    dest,
    step: 0,
    timer: setInterval(() => void tick(orderId), TICK_MS),
  };
  active.set(orderId, sim);
  logger.info({ orderId, riderId, dest }, "rider simulation started");
  void recordRiderPosition(riderId, start.lat, start.lng, orderId);
}

async function tick(orderId: number): Promise<void> {
  const sim = active.get(orderId);
  if (!sim) return;
  sim.step += 1;
  const t = Math.min(1, sim.step / STEPS_TO_DESTINATION);
  const lat = sim.start.lat + (sim.dest.lat - sim.start.lat) * t;
  const lng = sim.start.lng + (sim.dest.lng - sim.start.lng) * t;
  try {
    await recordRiderPosition(sim.riderId, lat, lng, orderId);
  } catch (err) {
    logger.error({ err, orderId }, "rider simulation tick failed");
  }
  if (t >= 1) {
    stopSimulation(orderId);
    try {
      await db
        .insert(deliveryEventsTable)
        .values({ orderId, riderId: sim.riderId, event: "rider_at_customer" });
      emitDeliveryEvent(orderId, { event: "rider_at_customer", riderId: sim.riderId });
    } catch (err) {
      logger.error({ err, orderId }, "failed to record arrival event");
    }
  }
}

export async function resumeActiveSimulations(): Promise<void> {
  try {
    const orders = await db
      .select({ id: ordersTable.id, riderId: ordersTable.riderId, status: ordersTable.status })
      .from(ordersTable);
    for (const o of orders) {
      if (!o.riderId) continue;
      if (o.status === "rider_assigned" || o.status === "ready" || o.status === "out_for_delivery") {
        startSimulation(o.id, o.riderId);
      }
    }
  } catch (err) {
    logger.warn({ err }, "could not resume rider simulations on boot");
  }
}
