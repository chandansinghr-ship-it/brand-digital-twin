"use client";

/**
 * Operational hubs — surfaces OperationalHubManager (operational_hubs.ts):
 * five integration hubs (Brand Monitoring, CRM, Finance, Project Management,
 * Creative) each with recent signals and connection status.
 *
 * The core insight: brand decisions happen across five distinct systems. Without
 * a unified signal layer, each team works from partial information. The hubs
 * view surfaces the freshest signal from each system in one place.
 */

import { clsx } from "clsx";
import { Nav } from "@/components/Nav";
import { useHubs } from "@/lib/queries";
import { USE_MOCK } from "@/lib/api";
import type { HubSignal, HubType, OperationalHub, SignalSeverity } from "@/lib/types";

const HUB_ICON: Record<HubType, string> = {
  brand_monitoring: "◈",
  crm:              "◎",
  finance:          "◉",
  project_mgmt:     "◐",
  creative:         "◑",
};

const SEVERITY_CHIP: Record<SignalSeverity, string> = {
  info:    "border-accent/20 bg-accent/10 text-accent",
  warning: "border-warning/20 bg-warning/10 text-warning",
  alert:   "border-danger/20 bg-danger/10 text-danger",
};

const SEVERITY_DOT: Record<SignalSeverity, string> = {
  info:    "bg-accent",
  warning: "bg-warning",
  alert:   "bg-danger",
};

function SignalRow({ signal }: { signal: HubSignal }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div
        className={clsx(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          SEVERITY_DOT[signal.severity],
        )}
      />
      <div className="flex-1">
        <p className="text-sm leading-snug text-text-primary">{signal.message}</p>
        <p className="mt-0.5 text-[11px] text-text-muted">
          {new Date(signal.timestamp).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </p>
      </div>
      <span
        className={clsx(
          "mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px]",
          SEVERITY_CHIP[signal.severity],
        )}
      >
        {signal.severity.charAt(0).toUpperCase() + signal.severity.slice(1)}
      </span>
    </div>
  );
}

function HubCard({ hub }: { hub: OperationalHub }) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="text-xl text-text-muted">{HUB_ICON[hub.type]}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-text-primary">{hub.name}</p>
          <p className="text-[11px] text-text-muted">
            Last activity{" "}
            {new Date(hub.lastActivity).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        <span
          className={clsx(
            "rounded-full border px-2 py-0.5 text-[10px]",
            hub.isConnected
              ? "border-success/20 bg-success/10 text-success"
              : "border-border bg-surface-raised text-text-muted",
          )}
        >
          {hub.isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="divide-y divide-border px-5">
        {hub.recentSignals.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">No recent signals.</p>
        ) : (
          hub.recentSignals.map((s) => <SignalRow key={s.id} signal={s} />)
        )}
      </div>
    </div>
  );
}

export default function HubsPage() {
  const { data, isLoading, isError, error } = useHubs();

  const alertCount = data
    ? data.hubs.flatMap((h) => h.recentSignals).filter((s) => s.severity === "alert").length
    : 0;

  const disconnectedCount = data
    ? data.hubs.filter((h) => !h.isConnected).length
    : 0;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Hubs</h1>
            <p className="mt-1 text-sm text-text-muted">
              Unified signal feed across brand monitoring, CRM, finance, project
              management, and creative systems.
            </p>
          </div>
          {data && (alertCount > 0 || disconnectedCount > 0) && (
            <div className="text-right space-y-0.5">
              {alertCount > 0 && (
                <p className="text-xs uppercase tracking-wide text-danger">
                  {alertCount} alert{alertCount > 1 ? "s" : ""}
                </p>
              )}
              {disconnectedCount > 0 && (
                <p className="text-[11px] text-text-muted">
                  {disconnectedCount} hub{disconnectedCount > 1 ? "s" : ""} disconnected
                </p>
              )}
            </div>
          )}
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — set <code className="font-mono">NEXT_PUBLIC_API_URL</code>{" "}
            to wire live hub signals via{" "}
            <code className="font-mono">GET /api/v1/hubs</code>.
          </div>
        )}

        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-surface" />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
            Could not load hubs: {(error as Error).message}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {data.hubs.map((hub) => (
              <HubCard key={hub.type} hub={hub} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
