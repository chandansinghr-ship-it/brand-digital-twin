"use client";

/**
 * Forecast dashboard — surfaces SpendForecaster (spend_forecaster.ts),
 * StockoutPredictor (stockout_predictor.ts), and BankAdapter (bank_adapter.ts):
 * 24h spend projection, cash runway months, and per-SKU hours-to-stockout.
 *
 * The core insight: ad platforms keep spending even when the product is about to
 * stock out. This view connects ad spend velocity to inventory runway so budget
 * can be paused before the platform charges for clicks that can't convert.
 */

import { clsx } from "clsx";
import { Nav } from "@/components/Nav";
import { useForecast } from "@/lib/queries";
import { USE_MOCK } from "@/lib/api";
import type { SkuStockForecast } from "@/lib/types";

const STOCK_CHIP: Record<SkuStockForecast["stockStatus"], string> = {
  healthy:  "border-success/20 bg-success/10 text-success",
  low:      "border-warning/20 bg-warning/10 text-warning",
  critical: "border-danger/20 bg-danger/10 text-danger",
  out:      "border-danger/40 bg-danger/20 text-danger",
};

const STOCK_LABEL: Record<SkuStockForecast["stockStatus"], string> = {
  healthy:  "Healthy",
  low:      "Low",
  critical: "Critical",
  out:      "Out of stock",
};

const STOCK_BAR: Record<SkuStockForecast["stockStatus"], string> = {
  healthy:  "bg-success",
  low:      "bg-warning",
  critical: "bg-danger",
  out:      "bg-danger",
};

function money(n: number, currency = "USD") {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

function hoursLabel(h: number) {
  if (h === 0) return "Out of stock";
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d ${Math.round(h % 24)}h`;
}

export default function ForecastPage() {
  const { data, isLoading, isError, error } = useForecast();

  const maxHours = data
    ? Math.max(...data.stockForecasts.map((s) => s.hoursToStockout), 1)
    : 1;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Forecast</h1>
          <p className="mt-1 text-sm text-text-muted">
            24h spend projection, cash runway, and SKU stockout horizon — so you
            pause ads before inventory runs dry.
          </p>
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — set <code className="font-mono">NEXT_PUBLIC_API_URL</code>{" "}
            to wire live forecasts via{" "}
            <code className="font-mono">GET /api/v1/forecast</code>.
          </div>
        )}

        {isLoading && (
          <div className="space-y-4">
            <div className="h-28 animate-pulse rounded-xl border border-border bg-surface" />
            <div className="h-64 animate-pulse rounded-xl border border-border bg-surface" />
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
            Could not load forecast: {(error as Error).message}
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Top-line metrics strip */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  24h spend forecast
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-text-primary">
                  {money(data.forecast24hSpend, data.currency)}
                </p>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  vs {money(data.currentDailySpend, data.currency)} yesterday
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  Cash runway
                </p>
                <p
                  className={clsx(
                    "mt-1 text-3xl font-bold tabular-nums",
                    data.cashRunwayMonths < 3
                      ? "text-danger"
                      : data.cashRunwayMonths < 5
                        ? "text-warning"
                        : "text-success",
                  )}
                >
                  {data.cashRunwayMonths.toFixed(1)}
                  <span className="ml-1 text-base font-normal text-text-muted">mo</span>
                </p>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  {data.bankName} · {money(data.availableBalance, data.currency)} available
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  Monthly burn
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-text-primary">
                  {money(data.monthlyBurn, data.currency)}
                </p>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  via Open Banking consent
                </p>
              </div>
            </div>

            {/* SKU stockout table */}
            <div className="rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-text-primary">
                  SKU stockout forecast
                </h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  Pause linked campaigns before inventory hits zero to avoid wasted spend.
                </p>
              </div>
              <div className="divide-y divide-border">
                {data.stockForecasts.map((s) => (
                  <div key={s.sku} className="px-5 py-3">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="mr-2 font-mono text-[10px] text-text-muted">
                          {s.sku}
                        </span>
                        <span className="text-sm font-medium text-text-primary">
                          {s.variantName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs tabular-nums text-text-muted">
                          {s.qty} units · {s.salesLast7Days}/7d
                        </span>
                        <span
                          className={clsx(
                            "rounded-full border px-2 py-0.5 text-[10px]",
                            STOCK_CHIP[s.stockStatus],
                          )}
                        >
                          {STOCK_LABEL[s.stockStatus]}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                        <div
                          className={clsx(
                            "h-full rounded-full transition-all duration-700",
                            STOCK_BAR[s.stockStatus],
                          )}
                          style={{
                            width: `${Math.min(100, (s.hoursToStockout / maxHours) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-20 text-right text-xs tabular-nums text-text-muted">
                        {hoursLabel(s.hoursToStockout)}
                      </span>
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
