"use client";

/**
 * AI Agent control panel — surfaces the multi-agent orchestration layer:
 * OrganizationCEOAgent (agents/ceo_agent.ts) delegates to AnalystAgent,
 * RiskRadarAgent, and GovernanceShadowAgent; proposals go to consensus voting
 * before surfacing for human approval (multi_agent_governance.ts).
 *
 * The core insight: three specialist agents vote independently on every budget
 * proposal. Consensus prevents any single model's blind spot from acting
 * autonomously. Proposals that fail consensus automatically escalate to the user.
 */

import { clsx } from "clsx";
import { Nav } from "@/components/Nav";
import { useAgents } from "@/lib/queries";
import { USE_MOCK } from "@/lib/api";
import type { AgentExecutionReport, AgentVote, MultiAgentProposal } from "@/lib/types";

const STATUS_CHIP: Record<AgentExecutionReport["status"], string> = {
  success: "border-success/20 bg-success/10 text-success",
  failed:  "border-danger/20 bg-danger/10 text-danger",
  pending: "border-warning/20 bg-warning/10 text-warning",
};

const STATUS_LABEL: Record<AgentExecutionReport["status"], string> = {
  success: "Success",
  failed:  "Failed",
  pending: "Running",
};

const PROPOSAL_STATUS_CHIP: Record<MultiAgentProposal["status"], string> = {
  pending:  "border-warning/20 bg-warning/10 text-warning",
  approved: "border-success/20 bg-success/10 text-success",
  rejected: "border-danger/20 bg-danger/10 text-danger",
};

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function VoteRow({ vote }: { vote: AgentVote }) {
  return (
    <div className="flex items-start gap-2">
      <span className={clsx("mt-0.5 shrink-0 text-base", vote.approved ? "text-success" : "text-danger")}>
        {vote.approved ? "✓" : "✗"}
      </span>
      <div>
        <span className="text-xs font-medium text-text-primary">{vote.role}</span>
        <p className="text-[11px] text-text-muted">{vote.reason}</p>
      </div>
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: MultiAgentProposal }) {
  const approveCount = proposal.votes.filter((v) => v.approved).length;
  const total = proposal.votes.length;
  const consensus = approveCount === total;
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={clsx(
            "rounded-full border px-2 py-0.5 text-[10px]",
            PROPOSAL_STATUS_CHIP[proposal.status],
          )}
        >
          {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
        </span>
        <span className="text-xs text-text-muted font-mono">{proposal.proposalId}</span>
        <span
          className={clsx(
            "ml-auto rounded-full border px-2 py-0.5 text-[10px]",
            consensus
              ? "border-success/20 bg-success/10 text-success"
              : "border-warning/20 bg-warning/10 text-warning",
          )}
        >
          {approveCount}/{total} votes
        </span>
      </div>
      <p className="mb-1 text-sm font-semibold text-text-primary">
        Shift {money(proposal.amount)} from{" "}
        <span className="capitalize">{proposal.sourceChannel}</span> →{" "}
        <span className="capitalize">{proposal.targetChannel}</span>
      </p>
      <p className="mb-4 text-xs leading-relaxed text-text-muted">{proposal.rationale}</p>
      <div className="space-y-2 border-t border-border pt-3">
        {proposal.votes.map((v) => (
          <VoteRow key={v.agentId} vote={v} />
        ))}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const { data, isLoading, isError, error } = useAgents();

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">AI Agents</h1>
          <p className="mt-1 text-sm text-text-muted">
            CEO orchestrates Analyst, RiskRadar, and GovernanceShadow agents.
            Proposals require consensus before surfacing for human approval.
          </p>
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — set <code className="font-mono">NEXT_PUBLIC_API_URL</code>{" "}
            to wire live agent runs via{" "}
            <code className="font-mono">GET /api/v1/agents</code>.
          </div>
        )}

        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-surface" />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
            Could not load agent data: {(error as Error).message}
          </div>
        )}

        {data && (
          <div className="space-y-8">
            {/* Execution summary strip */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Strategy status</p>
                <p
                  className={clsx(
                    "mt-1 text-2xl font-bold capitalize",
                    data.strategyStatus === "complete" ? "text-success" :
                    data.strategyStatus === "running"  ? "text-warning" : "text-text-muted",
                  )}
                >
                  {data.strategyStatus}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">CPLU</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-text-primary">
                  ${data.cpluOptimization.cplu.toFixed(2)}
                </p>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  {data.cpluOptimization.liftedUsers.toLocaleString()} lifted users
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Actions planned</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-text-primary">
                  {data.cpluOptimization.actionsPlanned}
                </p>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  {money(data.cpluOptimization.totalSpend)} awareness spend
                </p>
              </div>
            </div>

            {/* Execution reports */}
            <div className="rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-text-primary">Execution log</h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  Last run:{" "}
                  {new Date(data.lastRun).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div className="divide-y divide-border">
                {data.executionReports.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3">
                    <span
                      className={clsx(
                        "mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px]",
                        STATUS_CHIP[r.status],
                      )}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-text-primary">{r.agent}</p>
                      <p className="text-[11px] text-text-muted">{r.result}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-agent proposals */}
            <div>
              <h2 className="mb-4 text-sm font-semibold text-text-primary">
                Consensus proposals
              </h2>
              <div className="space-y-4">
                {data.proposals.map((p) => (
                  <ProposalCard key={p.proposalId} proposal={p} />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
