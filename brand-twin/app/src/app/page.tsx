"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAuthed, USE_MOCK } from "@/lib/api";

const TIERS = [
  { name: "OBSERVE", desc: "Monitors only. Zero actions taken." },
  { name: "REVIEW", desc: "Proposes fixes. Every action needs your approval." },
  { name: "ASSISTED", desc: "Executes small, capped fixes. Escalates the rest." },
  { name: "AUTONOMOUS", desc: "Acts within your daily spend cap. Queues outliers." },
  { name: "C‑SUITE", desc: "Full autonomy within the policies you configure." },
];

const INTEGRATIONS = [
  "Google Ads",
  "Meta Ads",
  "Shopify",
  "Tally",
  "Zoho Books",
  "QuickBooks",
  "Xero",
];

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Only auto-redirect in live mode when the user is already authenticated.
    // Mock mode always shows the LP so new visitors can explore before diving in.
    if (!USE_MOCK && isAuthed()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const primaryHref = USE_MOCK ? "/connect" : "/signup";
  const primaryLabel = USE_MOCK ? "Explore the demo" : "Request early access";

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      {/* ── Sticky nav ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-bold tracking-tight">Brand Digital Twin</span>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              Sign in
            </Link>
            <Link
              href={primaryHref}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <div className="mx-auto mb-5 w-fit rounded-full border border-accent/30 bg-accent/10 px-4 py-1 text-xs font-medium text-accent">
          Private beta — limited spots available
        </div>
        <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Stop optimising for clicks.
          <br />
          <span className="text-accent">Start optimising for profit.</span>
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-text-muted">
          Brand Digital Twin connects your ad accounts, store, and books to surface your
          real Profit on Ad Spend — then diagnoses what&apos;s dragging it and fixes it,
          automatically or with your sign-off.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={primaryHref}
            className="rounded-lg bg-accent px-8 py-3 font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {primaryLabel}
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-border px-8 py-3 text-sm text-text-muted transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Sign in to your account
          </Link>
        </div>
      </section>

      {/* ── ROAS vs POAS ── */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-text-muted">
            The number that&apos;s lying to you
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-danger/25 bg-danger/5 p-7">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-danger">
                ROAS — what most brands track
              </p>
              <p className="mb-3 font-mono text-4xl font-bold tabular-nums">4.2×</p>
              <p className="text-sm leading-relaxed text-text-muted">
                Revenue ÷ ad spend. Looks healthy. But it ignores COGS, shipping,
                returns, marketplace fees, and fulfillment. That 4.2× could be losing
                money on every single order.
              </p>
            </div>
            <div className="rounded-xl border border-success/25 bg-success/5 p-7">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-success">
                POAS — your real margin return
              </p>
              <p className="mb-3 font-mono text-4xl font-bold tabular-nums">1.8×</p>
              <p className="text-sm leading-relaxed text-text-muted">
                (Revenue − COGS) ÷ ad spend. The actual profit your ads are generating.
                Now you can see which campaigns make money, which destroy it, and exactly
                how much is at stake.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="mb-3 text-center text-3xl font-bold tracking-tight">
          From connect to profit clarity in minutes
        </h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-text-muted">
          Three steps. No data warehouse. No analyst required.
        </p>
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Connect your stack",
              desc: "OAuth your Google Ads, Meta, and Shopify in under 3 minutes. Add accounting sources — QuickBooks, Xero, Zoho Books, Tally — to sharpen your COGS.",
            },
            {
              step: "02",
              title: "See your real POAS",
              desc: "The engine ingests your data and surfaces POAS beside ROAS for every campaign, ranked worst-first by dollar drag. No spreadsheets.",
            },
            {
              step: "03",
              title: "Fix what's broken",
              desc: "Get precise prescriptions for every underperforming campaign. Approve each fix manually, or let the engine execute within limits you define.",
            },
          ].map((s) => (
            <div
              key={s.step}
              className="rounded-xl border border-border bg-surface p-6"
            >
              <p className="mb-3 font-mono text-xs text-accent">{s.step}</p>
              <h3 className="mb-2 font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust Tiers ── */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="mb-3 text-center text-3xl font-bold tracking-tight">
            You control how much it does
          </h2>
          <p className="mx-auto mb-12 max-w-xl text-center text-text-muted">
            Five autonomy tiers, from read-only to fully autonomous. Set it where you&apos;re
            comfortable. Lower it anytime, instantly.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {TIERS.map((t, i) => (
              <div
                key={t.name}
                className="flex-1 rounded-xl border border-border bg-bg p-4 transition-colors hover:border-accent/30"
                style={{ opacity: 0.45 + i * 0.13 }}
              >
                <p className="mb-1.5 font-mono text-xs font-semibold text-accent">
                  {t.name}
                </p>
                <p className="text-xs leading-relaxed text-text-muted">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h2 className="mb-3 text-3xl font-bold tracking-tight">
          Built for your whole stack
        </h2>
        <p className="mb-10 text-text-muted">
          Connect the platforms you already use. Everything feeds your POAS.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {INTEGRATIONS.map((name) => (
            <span
              key={name}
              className="rounded-full border border-border bg-surface px-5 py-2 text-sm text-text-muted"
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight">
            Pay what it&apos;s worth to your business
          </h2>
          <p className="mb-8 text-text-muted">
            After your 15-day trial, we recap the profit we surfaced or protected and
            invite you to name a recurring monthly amount. No tiers, no feature gates.
            You pay what the value is genuinely worth to you.
          </p>
          <div className="rounded-xl border border-accent/20 bg-accent/10 p-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">
              Pricing model
            </p>
            <p className="mb-1 text-2xl font-bold">Suggest-an-amount</p>
            <p className="text-sm text-text-muted">
              15-day free trial → value recap → you name a recurring monthly price
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h2 className="mb-4 text-4xl font-bold tracking-tight">
          Ready to see your real POAS?
        </h2>
        <p className="mb-8 text-text-muted">
          Currently in private beta. A handful of spots remain. No card required to start.
        </p>
        <Link
          href={primaryHref}
          className="rounded-lg bg-accent px-10 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {primaryLabel}
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} Trending Media Service Pvt. Ltd.</p>
          <nav className="flex gap-5">
            <Link href="/legal/tos" className="transition-colors hover:text-text-primary">
              Terms of Service
            </Link>
            <Link href="/legal/privacy" className="transition-colors hover:text-text-primary">
              Privacy Policy
            </Link>
            <Link href="/legal/dpa" className="transition-colors hover:text-text-primary">
              DPA
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
