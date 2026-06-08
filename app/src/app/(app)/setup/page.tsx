"use client";

/**
 * Onboarding wizard — surfaces OnboardingWizard (onboarding_wizard.ts):
 * multi-step setup flow from brand profile through team, platform connections,
 * COGS entry, SKU-to-campaign links, and margin discovery.
 *
 * The core insight: every upstream step unlocks downstream intelligence.
 * Without COGS data there is no POAS. Without SKU links there is no stockout
 * protection. The wizard is the on-ramp to the full profit engine.
 */

import { clsx } from "clsx";
import { Nav } from "@/components/Nav";
import { useOnboarding } from "@/lib/queries";
import { USE_MOCK } from "@/lib/api";
import type { OnboardingStep } from "@/lib/types";

const STEPS: { key: OnboardingStep; label: string; description: string }[] = [
  {
    key: "profile",
    label: "Brand profile",
    description: "Business name, industry, and monthly recurring revenue.",
  },
  {
    key: "team",
    label: "Team",
    description: "Invite team members who need access to the dashboard.",
  },
  {
    key: "platforms",
    label: "Platforms",
    description: "Connect Google Ads, Meta, Shopify, and other integrations.",
  },
  {
    key: "cogs",
    label: "COGS",
    description: "Enter unit costs per SKU to unlock POAS calculation.",
  },
  {
    key: "sku_links",
    label: "SKU links",
    description: "Map products to campaigns for stockout-aware budget control.",
  },
  {
    key: "margin_discovery",
    label: "Margin discovery",
    description: "Review profit-readiness gate and set margin targets.",
  },
];

const PLATFORM_CHIP: Record<string, string> = {
  google:  "border-blue-500/20 bg-blue-500/10 text-blue-400",
  meta:    "border-indigo-400/20 bg-indigo-400/10 text-indigo-300",
  shopify: "border-success/20 bg-success/10 text-success",
};

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function SetupPage() {
  const { data, isLoading, isError, error } = useOnboarding();

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Setup</h1>
          <p className="mt-1 text-sm text-text-muted">
            Complete the onboarding wizard to unlock the full profit engine — each
            step unlocks downstream intelligence.
          </p>
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — set <code className="font-mono">NEXT_PUBLIC_API_URL</code>{" "}
            to wire live onboarding state via{" "}
            <code className="font-mono">GET /api/v1/onboarding</code>.
          </div>
        )}

        {isLoading && (
          <div className="h-64 animate-pulse rounded-xl border border-border bg-surface" />
        )}

        {isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
            Could not load onboarding state: {(error as Error).message}
          </div>
        )}

        {data && (
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            {/* Step progress sidebar */}
            <div className="relative">
              <div className="absolute left-3 top-5 bottom-5 w-px bg-border" />
              <div className="space-y-3">
                {STEPS.map((step, i) => {
                  const done = data.completedSteps.includes(step.key);
                  const active = data.currentStep === step.key;
                  return (
                    <div key={step.key} className="relative flex items-start gap-4">
                      <div
                        className={clsx(
                          "relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          done
                            ? "bg-success text-background"
                            : active
                              ? "bg-accent text-background"
                              : "border border-border bg-surface text-text-muted",
                        )}
                      >
                        {done ? "✓" : i + 1}
                      </div>
                      <div className="pt-0.5">
                        <p
                          className={clsx(
                            "text-sm font-medium",
                            active ? "text-accent" : done ? "text-text-primary" : "text-text-muted",
                          )}
                        >
                          {step.label}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detail panel */}
            <div className="space-y-5">
              {/* Progress summary */}
              <div className="rounded-xl border border-border bg-surface px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Progress</p>
                  <p className="text-xs font-bold tabular-nums text-text-primary">
                    {data.completedSteps.length} / {STEPS.length} steps
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-700"
                    style={{ width: `${(data.completedSteps.length / STEPS.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Current step detail */}
              {(() => {
                const step = STEPS.find((s) => s.key === data.currentStep);
                return step ? (
                  <div className="rounded-xl border border-accent/20 bg-accent/5 px-5 py-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
                      Current step
                    </p>
                    <p className="text-sm font-semibold text-text-primary">{step.label}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{step.description}</p>
                  </div>
                ) : null;
              })()}

              {/* Brand summary */}
              <div className="rounded-xl border border-border bg-surface p-5">
                <h2 className="mb-3 text-sm font-semibold text-text-primary">
                  Brand summary
                </h2>
                <div className="grid gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-text-muted">Client</p>
                    <p className="text-text-primary">{data.clientName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-text-muted">Industry</p>
                    <p className="text-text-primary">{data.industry}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-text-muted">MRR</p>
                    <p className="font-bold tabular-nums text-text-primary">{money(data.mrr)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-text-muted">Margin target</p>
                    <p className="font-bold tabular-nums text-text-primary">{data.marginTarget}%</p>
                  </div>
                </div>
              </div>

              {/* Team */}
              {data.teamMembers.length > 0 && (
                <div className="rounded-xl border border-border bg-surface p-5">
                  <h2 className="mb-3 text-sm font-semibold text-text-primary">Team</h2>
                  <div className="space-y-1">
                    {data.teamMembers.map((m) => (
                      <p key={m} className="text-sm text-text-primary">{m}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected platforms */}
              {data.platforms.length > 0 && (
                <div className="rounded-xl border border-border bg-surface p-5">
                  <h2 className="mb-3 text-sm font-semibold text-text-primary">
                    Connected platforms
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {data.platforms.map((p) => (
                      <span
                        key={p}
                        className={clsx(
                          "rounded-full border px-2.5 py-1 text-xs capitalize",
                          PLATFORM_CHIP[p] ?? "border-border bg-surface-raised text-text-muted",
                        )}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
