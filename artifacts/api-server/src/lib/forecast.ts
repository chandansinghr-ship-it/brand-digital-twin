import {
  db,
  forecastSnapshotsTable,
  ordersTable,
} from "@workspace/db";
import { and, gte, ne, sql } from "drizzle-orm";

export type Daypart = "breakfast" | "lunch" | "snacks" | "dinner";
export type Granularity = "daypart" | "hour";

const DAYPART_HOURS: Record<Daypart, [number, number]> = {
  breakfast: [5, 11],
  lunch: [11, 15],
  snacks: [15, 19],
  dinner: [19, 23],
};

export function dayparts(): Daypart[] {
  return Object.keys(DAYPART_HOURS) as Daypart[];
}

export function daypartFor(d: Date): Daypart {
  const h = d.getHours();
  for (const [name, [lo, hi]] of Object.entries(DAYPART_HOURS) as [
    Daypart,
    [number, number],
  ][]) {
    if (h >= lo && h < hi) return name;
  }
  return "dinner";
}

export interface ForecastRow {
  zone: string;
  dishSlug: string;
  dishName: string;
  /** "breakfast" | "lunch" | ... when granularity=daypart, "00".."23" when hour */
  bucket: string;
  daypart: Daypart;
  hour?: number;
  forecastQty: number;
  observedDays: number;
}

interface OrderItem {
  id?: number;
  slug?: string;
  name: string;
  qty: number;
  price?: number;
}

/**
 * Baseline forecast: rolling average of qty sold per
 * (zone, bucket, dayOfWeek, dish) over the last `lookbackDays`.
 *
 * `granularity="daypart"` (default) buckets into 4 dayparts.
 * `granularity="hour"` returns per-hour forecasts (24 buckets).
 *
 * Designed so it can later be replaced by a real ML model without
 * changing the surface.
 */
export async function computeForecast(opts: {
  lookbackDays?: number;
  zone?: string;
  forDate?: Date;
  granularity?: Granularity;
}): Promise<ForecastRow[]> {
  const lookbackDays = opts.lookbackDays ?? 28;
  const granularity = opts.granularity ?? "daypart";
  const since = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000);
  const target = opts.forDate ?? new Date();
  const targetDow = target.getDay();

  const conditions = [
    gte(ordersTable.createdAt, since),
    ne(ordersTable.status, "cancelled"),
  ];

  const rows = await db
    .select({
      city: ordersTable.city,
      items: ordersTable.items,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(and(...conditions));

  // bucket: zone|bucket|dow|dishSlug
  const buckets = new Map<
    string,
    { qty: number; days: Set<string>; name: string; daypart: Daypart; hour: number }
  >();
  for (const r of rows) {
    const created = new Date(r.createdAt);
    const dow = created.getDay();
    const dp = daypartFor(created);
    const hour = created.getHours();
    const bucketKey = granularity === "hour" ? String(hour).padStart(2, "0") : dp;
    const zone = (r.city ?? "default").toLowerCase();
    if (opts.zone && zone !== opts.zone.toLowerCase()) continue;
    const dayKey = created.toISOString().slice(0, 10);
    for (const it of (r.items as OrderItem[] | null) ?? []) {
      const slug =
        it.slug ??
        (typeof it.id === "number" ? `id-${it.id}` : it.name.toLowerCase());
      const key = `${zone}|${bucketKey}|${dow}|${slug}`;
      const cur =
        buckets.get(key) ??
        {
          qty: 0,
          days: new Set<string>(),
          name: it.name,
          daypart: dp,
          hour,
        };
      cur.qty += Number(it.qty) || 0;
      cur.days.add(dayKey);
      buckets.set(key, cur);
    }
  }

  const out: ForecastRow[] = [];
  for (const [key, val] of buckets) {
    const [zone, bucket, dowStr, slug] = key.split("|");
    if (Number(dowStr) !== targetDow) continue;
    out.push({
      zone: zone!,
      dishSlug: slug!,
      dishName: val.name,
      bucket: bucket!,
      daypart: val.daypart,
      hour: granularity === "hour" ? val.hour : undefined,
      forecastQty: val.qty / Math.max(val.days.size, 1),
      observedDays: val.days.size,
    });
  }
  out.sort((a, b) => b.forecastQty - a.forecastQty);
  return out;
}

/**
 * Persist today's daypart-level forecasts as snapshots so we can later
 * compare against actuals (MAPE). Idempotent via the unique index.
 */
export async function persistForecastSnapshots(opts: {
  zone?: string;
  forDate?: Date;
}): Promise<{ inserted: number }> {
  const target = opts.forDate ?? new Date();
  const forDate = target.toISOString().slice(0, 10);
  const rows = await computeForecast({
    zone: opts.zone,
    forDate: target,
    granularity: "daypart",
  });
  if (rows.length === 0) return { inserted: 0 };
  const values = rows.map((r) => ({
    forDate,
    daypart: r.daypart,
    zone: r.zone,
    dishSlug: r.dishSlug,
    forecastQty: r.forecastQty,
  }));
  const result = await db
    .insert(forecastSnapshotsTable)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: forecastSnapshotsTable.id });
  return { inserted: result.length };
}

/**
 * Backfill `actual_qty` on existing snapshots by counting items sold per
 * (date, daypart, zone, dish) from `orders`. Safe to re-run.
 */
export async function backfillActuals(opts: {
  sinceDays?: number;
}): Promise<{ updated: number }> {
  const sinceDays = opts.sinceDays ?? 14;
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
  const rows = await db
    .select({
      city: ordersTable.city,
      items: ordersTable.items,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, since),
        ne(ordersTable.status, "cancelled"),
      ),
    );
  // (date, daypart, zone, slug) -> qty
  const actuals = new Map<string, number>();
  for (const r of rows) {
    const created = new Date(r.createdAt);
    const dateKey = created.toISOString().slice(0, 10);
    const dp = daypartFor(created);
    const zone = (r.city ?? "default").toLowerCase();
    for (const it of (r.items as OrderItem[] | null) ?? []) {
      const slug =
        it.slug ??
        (typeof it.id === "number" ? `id-${it.id}` : it.name.toLowerCase());
      const k = `${dateKey}|${dp}|${zone}|${slug}`;
      actuals.set(k, (actuals.get(k) ?? 0) + (Number(it.qty) || 0));
    }
  }
  let updated = 0;
  for (const [k, qty] of actuals) {
    const [d, dp, z, s] = k.split("|");
    const r = await db.execute(sql`
      UPDATE forecast_snapshots
      SET actual_qty = ${qty}
      WHERE for_date = ${d}
        AND daypart = ${dp}
        AND zone = ${z}
        AND dish_slug = ${s}
    `);
    updated += r.rowCount ?? 0;
  }
  return { updated };
}

/** MAPE per dishSlug per zone over snapshots that have actuals filled in. */
export async function forecastMape(opts: { sinceDays?: number }): Promise<
  Array<{ zone: string; dishSlug: string; mape: number; n: number }>
> {
  const since = new Date(
    Date.now() - (opts.sinceDays ?? 30) * 24 * 3600 * 1000,
  );
  const rows = await db.execute<{
    zone: string;
    dish_slug: string;
    mape: number;
    n: number;
  }>(sql`
    SELECT zone, dish_slug,
           AVG(ABS(forecast_qty - actual_qty) / NULLIF(actual_qty, 0)) AS mape,
           COUNT(*)::int AS n
    FROM forecast_snapshots
    WHERE actual_qty IS NOT NULL
      AND for_date >= ${since.toISOString().slice(0, 10)}
    GROUP BY zone, dish_slug
    ORDER BY mape ASC NULLS LAST
  `);
  return rows.rows.map((r) => ({
    zone: r.zone,
    dishSlug: r.dish_slug,
    mape: Number(r.mape),
    n: Number(r.n),
  }));
}
