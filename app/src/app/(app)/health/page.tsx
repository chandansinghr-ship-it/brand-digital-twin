"use client";

/**
 * Account health dashboard — surfaces AccountHealthDashboard (account_health.ts):
 * six weighted dimensions (brand / financial / team / client / operational /
 * performance), live anomaly detection, and predictive alerts.
 *
 * The core insight: a single ROAS metric tells you nothing about whether the
 * business behind the ads is actually healthy. This six-dimension view shows
 * the structural signals that matter for long-run growth.
 */

import { clsx } from "clsx";
import { Nav } from "@/components/Nav";
import { useAccountHealth } from "@/lib/queries";
import { USE_MOCK } from "@/lib/api";
import type { HealthDimension, HealthStatus } from "@/lib/types";

const STATUS_CHIP: Record<HealthStatus, string> = {
  good:     "border-success/20 bg-success/10 text-success",
  warning:  "border-warning/20 bg-warning/10 text-warning",
  critical: "border-danger/20 bg-danger/10 text-danger",
};

const STATUS_BAR: Record<HealthStatus, string> = {
  good:     "bg-success",
  warning:  "bg-warning",
  critical: "bg-danger",
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  good:     "Good",
  warning:  "Warning",
  critical: "Critical",
};

function DimensionCard({ dim }: { dim: HealthDimension }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">{dim.label}</span>
        <span
          className={clsx(
            "rounded-full border px-2 py-0.5 text-[10px]",
            STATUS_CHIP[dim.status],
          )}
        >
          {STATUS_LABEL[dim.status]}
        </span>
      </div>
      <div className="mb-2 flex items-end gap-2">
        <span className="text-3xl font-bold tabular-nums text-text-primary">
          {dim.score}
        </span>
        <span className="mb-1 text-xs text-text-muted">/ 100</span>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
        <div
          className={clsx("h-full rounded-full transition-all duration-700", STATUS_BAR[dim.status])}
          style={{ width: `${dim.score}%` }}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-text-muted">{dim.note}</p>
    </div>
  );
}

export default function HealthPage() {
  const { data, isLoading, isError, error } = useAccountHealth();

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Account Health</h1>
          <p className="mt-1 text-sm text-text-muted">
            Six-dimension health score with live anomaly detection and predictive alerts.
          </p>
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — set <code className="font-mono">NEXT_PUBLIC_API_URL</code>{" "}
            to wire live signals via{" "}
            <code className="font-mono">GET /api/v1/health</code>.
          </div>
        )}

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl border border-border bg-surface" />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
            Could not load health data: {(error as Error).message}
          </div>
        )}

        {data && (
          <div className="space-y-8">
            {/* Overall score banner */}
            <div className="flex items-center gap-5 rounded-xl border border-border bg-surface px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">Overall score</p>
                <p className="mt-0.5 text-5xl font-bold tabular-nums text-text-primary">
                  {data.overallScore}
                </p>
              </div>
              <div className="flex-1">
                <div className="mb-1.5 h-3 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className={clsx("h-full rounded-full transition-all duration-700", STATUS_BAR[data.overallStatus])}
                    style={{ width: `${data.overallScore}%` }}
                  />
                </div>
                <span
                  className={clsx(
                    "rounded-full border px-2 py-0.5 text-[10px]",
                    STATUS_CHIP[data.overallStatus],
                  )}
                >
                  {STATUS_LABEL[data.overallStatus]}
                </span>
              </div>
              <p className="text-[11px] text-text-muted">
                Last updated{" "}
                {new Date(data.lastUpdated).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>

            {/* Six dimension cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.dimensions.map((dim) => (
                <DimensionCard key={dim.key} dim={dim} />
              ))}
            </div>

            {/* Anomalies */}
            {data.anomalies.length > 0 && (
              <div className="rounded-xl border border-warning/20 bg-warning/5 p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-warning">
                  Anomalies detected
                </p>
                <ul className="space-y-2">
                  {data.anomalies.map((a, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text-primary">
                      <span className="mt-0.5 shrink-0 text-warning">•</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Predictive alerts */}
            {data.predictiveAlerts.length > 0 && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-accent">
                  Predictive alerts
                </p>
                <ul className="space-y-2">
                  {data.predictiveAlerts.map((a, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text-primary">
                      <span className="mt-0.5 shrink-0 text-accent">→</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
