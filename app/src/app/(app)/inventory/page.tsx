"use client";

/**
 * Inventory dashboard — surfaces StockoutPredictor (stockout_predictor.ts):
 * per-SKU stock levels, sales velocity, hours-to-stockout, and which ad
 * campaigns are linked so budget can be paused before inventory runs dry.
 *
 * The core insight: ad platforms charge for every click, even when the
 * landing product is out of stock. Linking inventory velocity to campaign
 * spend lets you pause before the platform bills for zero-conversion clicks.
 */

import { clsx } from "clsx";
import { Nav } from "@/components/Nav";
import { useInventory } from "@/lib/queries";
import { USE_MOCK } from "@/lib/api";
import type { InventoryItem } from "@/lib/types";

const STOCK_CHIP: Record<InventoryItem["stockStatus"], string> = {
  healthy:  "border-success/20 bg-success/10 text-success",
  low:      "border-warning/20 bg-warning/10 text-warning",
  critical: "border-danger/20 bg-danger/10 text-danger",
  out:      "border-danger/40 bg-danger/20 text-danger",
};

const STOCK_LABEL: Record<InventoryItem["stockStatus"], string> = {
  healthy:  "Healthy",
  low:      "Low stock",
  critical: "Critical",
  out:      "Out of stock",
};

const STOCK_BAR: Record<InventoryItem["stockStatus"], string> = {
  healthy:  "bg-success",
  low:      "bg-warning",
  critical: "bg-danger",
  out:      "bg-danger",
};

function hoursLabel(h: number) {
  if (h === 0) return "Out of stock";
  if (h < 24) return `~${Math.round(h)}h`;
  const d = Math.floor(h / 24);
  return `~${d}d`;
}

export default function InventoryPage() {
  const { data, isLoading, isError, error } = useInventory();

  const maxHours = data
    ? Math.max(...data.items.map((i) => i.hoursToStockout), 1)
    : 1;

  const criticalCount = data
    ? data.items.filter((i) => i.stockStatus === "critical" || i.stockStatus === "out").length
    : 0;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
            <p className="mt-1 text-sm text-text-muted">
              Per-SKU stock levels and ad campaign links — pause spend before
              inventory runs out.
            </p>
          </div>
          {data && criticalCount > 0 && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-danger">
                {criticalCount} SKU{criticalCount > 1 ? "s" : ""} need action
              </p>
              <p className="text-[11px] text-text-muted">critical or out of stock</p>
            </div>
          )}
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — set <code className="font-mono">NEXT_PUBLIC_API_URL</code>{" "}
            to wire live SKU data via{" "}
            <code className="font-mono">GET /api/v1/inventory</code>.
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-surface" />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
            Could not load inventory: {(error as Error).message}
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Budget redistribution findings */}
            {data.budgetRedistributionFindings.length > 0 && (
              <div className="rounded-xl border border-danger/20 bg-danger/5 p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-danger">
                  Budget redistribution required
                </p>
                <ul className="space-y-2">
                  {data.budgetRedistributionFindings.map((f, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text-primary">
                      <span className="mt-0.5 shrink-0 text-danger">!</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* SKU table */}
            <div className="rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-text-primary">SKU inventory</h2>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  Last synced{" "}
                  {new Date(data.lastSyncedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div className="divide-y divide-border">
                {data.items.map((item) => (
                  <div key={item.sku} className="px-5 py-4">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-text-muted">
                            {item.sku}
                          </span>
                          <span
                            className={clsx(
                              "rounded-full border px-2 py-0.5 text-[10px]",
                              STOCK_CHIP[item.stockStatus],
                            )}
                          >
                            {STOCK_LABEL[item.stockStatus]}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm font-medium text-text-primary">
                          {item.variantName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-text-muted">
                          Units
                        </p>
                        <p className="text-lg font-bold tabular-nums text-text-primary">
                          {item.qty}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                        <div
                          className={clsx(
                            "h-full rounded-full transition-all duration-700",
                            STOCK_BAR[item.stockStatus],
                          )}
                          style={{
                            width: `${Math.min(100, (item.hoursToStockout / maxHours) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-text-muted">
                        {hoursLabel(item.hoursToStockout)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-text-muted">
                      <span>{item.salesLast7Days} sold (7d)</span>
                      {item.linkedCampaign && (
                        <span>
                          Linked:{" "}
                          <span className="text-text-primary">{item.linkedCampaign}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
