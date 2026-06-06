"use client";

/**
 * Agency portfolio console (CUJ-6 / Option B).
 *
 * One row per managed brand: blended POAS, dollar drag, leaks flagged,
 * autonomy tier, billing status, and a readiness indicator. Sorted by
 * attention (critical → watch → healthy) then drag desc so the worst
 * problems surface first.
 *
 * Clicking a row switches the active mock-brand context and navigates to
 * that brand's POAS dashboard — the same UX an agency operator would use
 * to drill into a client's details.
 *
 * In live mode this screen needs GET /api/v1/agency/portfolio and a
 * multi-tenant context-switcher in the engine; both are on the roadmap.
 */

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePortfolio } from "@/lib/queries";
import { setMockBrandIndex, USE_MOCK } from "@/lib/api";
import { Nav } from "@/components/Nav";
import type { PortfolioEntry } from "@/lib/types";

const ATTENTION_ORDER = { critical: 0, watch: 1, healthy: 2 } as const;

const TIER_LABEL: Record<string, string> = {
  OBSERVE: "Observe",
  REVIEW: "Review",
  ASSISTED: "Assisted",
  AUTONOMOUS: "Autonomous",
  C_SUITE: "C-Suite",
};

const BILLING_LABEL: Record<string, string> = {
  trial: "Trial",
  suggest_amount: "Suggesting",
  pending_review: "Pending",
  active: "Active",
  past_due: "Past due",
  suspended: "Suspended",
};

function attentionDot(a: PortfolioEntry["attention"]) {
  if (a === "critical") return "bg-danger";
  if (a === "watch") return "bg-warning";
  return "bg-success";
}

function billingChipClass(s: string) {
  if (s === "active") return "text-success border-success/30 bg-success/10";
  if (s === "past_due" || s === "suspended")
    return "text-danger border-danger/30 bg-danger/10";
  return "text-text-muted border-border";
}

function readinessBadge(s: PortfolioEntry["readinessStatus"]) {
  if (s === "ready") return { label: "Ready", cls: "text-success" };
  if (s === "directional_only") return { label: "Directional", cls: "text-warning" };
  return { label: "Incomplete", cls: "text-danger" };
}

export default function AgencyPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = usePortfolio();

  const sorted = data
    ? [...data].sort(
        (a, b) =>
          ATTENTION_ORDER[a.attention] - ATTENTION_ORDER[b.attention] ||
          b.dollarDrag - a.dollarDrag,
      )
    : [];

  const totalSpend = sorted.reduce((s, r) => s + r.monthlyAdSpend, 0);
  const totalDrag = sorted.reduce((s, r) => s + r.dollarDrag, 0);
  const criticalCount = sorted.filter((r) => r.attention === "critical").length;

  function drillInto(entry: PortfolioEntry) {
    if (USE_MOCK && entry.brandIndex !== undefined) {
      setMockBrandIndex(entry.brandIndex);
      void qc.invalidateQueries();
    }
    router.push("/dashboard");
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
            <p className="mt-1 text-sm text-text-muted">
              {sorted.length} brands · sorted by profit risk
            </p>
          </div>

          {/* Rollup stats */}
          {!isLoading && sorted.length > 0 && (
            <div className="flex gap-6">
              <Stat
                label="Monthly ad spend"
                value={`$${(totalSpend / 1000).toFixed(0)}k`}
              />
              <Stat
                label="Total profit at risk"
                value={`$${(totalDrag / 1000).toFixed(0)}k`}
                danger
              />
              <Stat
                label="Brands needing action"
                value={String(criticalCount)}
                danger={criticalCount > 0}
              />
            </div>
          )}
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo — click any row to drill into that brand&apos;s POAS board.
            Live mode needs{" "}
            <code className="font-mono">GET /api/v1/agency/portfolio</code> +
            multi-tenant context switching.
          </div>
        )}

        {isLoading && <SkeletonTable />}

        {!isLoading && sorted.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-text-muted">
            No brands in your portfolio yet. Onboard a client from the Connect screen.
          </div>
        )}

        {!isLoading && sorted.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-xs uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-3 text-left">Brand</th>
                  <th className="px-4 py-3 text-right">POAS</th>
                  <th className="px-4 py-3 text-right">Ad spend / mo</th>
                  <th className="px-4 py-3 text-right">Profit at risk</th>
                  <th className="px-4 py-3 text-center">Leaks</th>
                  <th className="px-4 py-3 text-center">Readiness</th>
                  <th className="px-4 py-3 text-center">Tier</th>
                  <th className="px-4 py-3 text-center">Billing</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((entry) => {
                  const rb = readinessBadge(entry.readinessStatus);
                  const isUnhealthy = entry.poas < 1;
                  return (
                    <tr
                      key={entry.orgId}
                      onClick={() => drillInto(entry)}
                      className="cursor-pointer bg-bg transition-colors hover:bg-surface"
                    >
                      {/* Brand name + attention indicator */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${attentionDot(entry.attention)}`}
                          />
                          <span className="font-semibold">{entry.orgName}</span>
                        </div>
                      </td>

                      {/* POAS */}
                      <td className="px-4 py-4 text-right">
                        <span
                          className={`font-mono text-base font-bold tabular-nums ${
                            isUnhealthy ? "text-danger" : entry.poas >= 2 ? "text-success" : "text-text-primary"
                          }`}
                        >
                          {entry.poas.toFixed(2)}×
                        </span>
                      </td>

                      {/* Monthly spend */}
                      <td className="px-4 py-4 text-right font-mono text-xs tabular-nums text-text-muted">
                        ${entry.monthlyAdSpend.toLocaleString()}
                      </td>

                      {/* Dollar drag */}
                      <td className="px-4 py-4 text-right">
                        {entry.dollarDrag > 0 ? (
                          <span className="font-mono text-sm font-semibold tabular-nums text-danger">
                            ${entry.dollarDrag.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-success">—</span>
                        )}
                      </td>

                      {/* Leaks flagged */}
                      <td className="px-4 py-4 text-center">
                        {entry.leaksFlagged > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                            {entry.leaksFlagged}
                          </span>
                        ) : (
                          <span className="text-xs text-success">✓</span>
                        )}
                      </td>

                      {/* Readiness */}
                      <td className={`px-4 py-4 text-center text-xs font-medium ${rb.cls}`}>
                        {rb.label}
                      </td>

                      {/* Tier */}
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono text-xs text-accent">
                          {TIER_LABEL[entry.tier] ?? entry.tier}
                        </span>
                      </td>

                      {/* Billing */}
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${billingChipClass(entry.billingStatus)}`}
                        >
                          {BILLING_LABEL[entry.billingStatus] ?? entry.billingStatus}
                        </span>
                      </td>

                      {/* Drill-in arrow */}
                      <td className="px-4 py-4 text-right text-text-muted">
                        →
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary insights */}
        {!isLoading && sorted.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <InsightCard
              label="Highest POAS"
              brand={sorted.reduce((a, b) => (a.poas > b.poas ? a : b))}
              color="success"
            />
            <InsightCard
              label="Largest profit leak"
              brand={sorted.reduce((a, b) => (a.dollarDrag > b.dollarDrag ? a : b))}
              color="danger"
            />
            <InsightCard
              label="Scale candidate"
              brand={
                sorted.find((e) => e.attention === "healthy" && e.poas >= 2) ??
                sorted[sorted.length - 1]
              }
              color="accent"
            />
          </div>
        )}
      </main>
    </>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="text-right">
      <p className="text-xs text-text-muted">{label}</p>
      <p
        className={`text-xl font-bold tabular-nums ${danger ? "text-danger" : "text-text-primary"}`}
      >
        {value}
      </p>
    </div>
  );
}

function InsightCard({
  label,
  brand,
  color,
}: {
  label: string;
  brand: PortfolioEntry;
  color: "success" | "danger" | "accent";
}) {
  const cls = {
    success: "border-success/25 bg-success/5",
    danger: "border-danger/25 bg-danger/5",
    accent: "border-accent/25 bg-accent/5",
  }[color];
  const textCls = {
    success: "text-success",
    danger: "text-danger",
    accent: "text-accent",
  }[color];

  return (
    <div className={`rounded-xl border p-5 ${cls}`}>
      <p className={`mb-1 text-xs font-semibold uppercase tracking-widest ${textCls}`}>
        {label}
      </p>
      <p className="font-semibold">{brand.orgName}</p>
      <p className={`font-mono text-2xl font-bold tabular-nums ${textCls}`}>
        {brand.poas.toFixed(2)}×
      </p>
      <p className="mt-1 text-xs text-text-muted">
        ${brand.monthlyAdSpend.toLocaleString()} / mo · {TIER_LABEL[brand.tier]}
      </p>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-xl border border-border bg-surface"
        />
      ))}
    </div>
  );
}
