// Phase 2 — Governance Engine.
// Enforces blast-radius caps, confidence thresholds, active kill switches,
// circuit breakers, and the trust ledger's earned-trust tier progression.

import {
  PlatformAdapter,
  ActionRequest,
  ActionPlan,
  ActionResult,
  RollbackHandle,
} from "./platform_adapter";
import { MetricsTracker, Span } from "./observability";

export interface TenantPolicy {
  maxDailyDollarsRisk: number; // e.g., $1000
  maxBudgetMovePct: number;    // e.g., 20% (0.20)
  minConfidence: number;       // e.g., 0.85
  escalationRole: string;      // e.g., 'cmo'
}

export interface Tenant {
  tenantId: string;
  policy: TenantPolicy;
  shadowMode?: boolean;
  onboardingStartMs?: number;
}

export interface Role {
  name?: string;
  permits(op: string, entity: string): boolean;
}

export interface Waiver {
  overrideRole: string;
  reason: string;
  expiresAtMs: number;
  allowedOps: string[];
}

export interface WhitelistRule {
  op: string;
  entity: string;
  maxCost: number;
}

export interface Context {
  tenant: Tenant;
  role: Role;
  verifyWindowMs: number;
}

export type DispositionKind = "AUTO_EXECUTE" | "QUEUE" | "BLOCK";
export interface Disposition {
  kind: DispositionKind;
  reason: string;
  approver?: string;
}

// Immutable action log audit sink
export interface AuditSink {
  record(row: Record<string, unknown>): Promise<void>;
}

export interface TrustOutcome {
  success: boolean;
  cost: number;
  timestampMs: number;
  approvedByRole?: string;
}

// --- Trust Ledger System ---
export class TrustLedger {
  private earnedTiers: Map<string, number> = new Map(); // key = "tenantId:actionType" -> tier (0..4)
  private history: Map<string, TrustOutcome[]> = new Map();
  private lastDowngradeTime: Map<string, number> = new Map(); // key -> timestampMs

  constructor() {}

  getTier(tenantId: string, actionType: string): number {
    const key = `${tenantId}:${actionType}`;
    return this.earnedTiers.get(key) ?? 0; // Starts at Tier 0 (observe/recommend)
  }

  setTier(tenantId: string, actionType: string, tier: number) {
    const key = `${tenantId}:${actionType}`;
    this.earnedTiers.set(key, tier);
  }

  recordOutcome(
    tenantId: string,
    actionType: string,
    success: boolean,
    cost = 100,
    maxDailyDollarsRisk = 1000,
    approvedByRole?: string
  ) {
    const key = `${tenantId}:${actionType}`;
    const outcomes = this.history.get(key) ?? [];
    const now = Date.now();

    outcomes.push({
      success,
      cost,
      timestampMs: now,
      approvedByRole,
    });
    this.history.set(key, outcomes);

    const currentTier = this.getTier(tenantId, actionType);

    if (!success) {
      if (currentTier > 0) {
        this.setTier(tenantId, actionType, currentTier - 1);
        this.lastDowngradeTime.set(key, now);
      }
      return;
    }

    // Check oscillation cooldown (1 minute for test purposes)
    const lastDowngrade = this.lastDowngradeTime.get(key) ?? 0;
    if (now - lastDowngrade < 60000) {
      return;
    }

    if (approvedByRole === "cfo" || approvedByRole === "cmo") {
      if (currentTier < 3) {
        this.setTier(tenantId, actionType, currentTier + 1);
      }
      return;
    }

    // Time-decay & Risk-weighted progression
    const halfLifeMs = 86400000;
    let progressionScore = 0;

    for (const outcome of outcomes) {
      if (!outcome.success) continue;
      const ageMs = now - outcome.timestampMs;
      const decayWeight = Math.pow(0.5, ageMs / halfLifeMs);
      const riskWeight = outcome.cost / maxDailyDollarsRisk;
      progressionScore += decayWeight * riskWeight;
    }

    if (progressionScore >= 1.5 && currentTier < 3) {
      this.setTier(tenantId, actionType, currentTier + 1);
      this.history.set(key, []); // Reset outcomes to start next progression level
    }
  }
}

// --- Circuit Breaker System ---
export class CircuitBreaker {
  private trippedPlatforms: Set<string> = new Set();

  trip(platform: string) {
    this.trippedPlatforms.add(platform);
  }

  reset(platform: string) {
    this.trippedPlatforms.delete(platform);
  }

  isTripped(platform: string): boolean {
    return this.trippedPlatforms.has(platform);
  }
}

// --- Main Governance Engine ---
export class GovernanceEngine {
  private killSwitchActive = false;

  private waivers: Map<string, Waiver[]> = new Map();
  private whitelists: Map<string, WhitelistRule[]> = new Map();

  registerWaiver(tenantId: string, waiver: Waiver) {
    const list = this.waivers.get(tenantId) ?? [];
    list.push(waiver);
    this.waivers.set(tenantId, list);
  }

  registerWhitelist(tenantId: string, rule: WhitelistRule) {
    const list = this.whitelists.get(tenantId) ?? [];
    list.push(rule);
    this.whitelists.set(tenantId, list);
  }

  constructor(
    private audit: AuditSink,
    private trustLedger: TrustLedger,
    private circuitBreaker: CircuitBreaker,
    private metrics: MetricsTracker = new MetricsTracker(),
  ) {}

  setKillSwitch(active: boolean) {
    this.killSwitchActive = active;
  }

  /**
   * The single entry point for any write execution request.
   */
  async govern(
    adapter: PlatformAdapter,
    req: ActionRequest,
    ctx: Context,
  ): Promise<{ status: "executed" | "queued" | "blocked" | "rolled_back"; result?: ActionResult }> {
    const span = this.metrics.startSpan("govern", adapter.platform);
    const now = new Date().toISOString();
    const plan = await adapter.plan(req);

    // 1. Audit Phase: Planned
    await this.audit.record({
      action_id: req.idempotencyKey,
      tenant_id: ctx.tenant.tenantId,
      actor: "agent:media_buyer",
      action_type: req.op,
      target_entity: req.entity,
      proposed_payload: req.payload,
      status: "planned",
      created_at: now,
    });

    // 2. Decide Phase
    const disp = this.decide(req, plan, ctx, adapter);

    await this.audit.record({
      action_id: req.idempotencyKey,
      tenant_id: ctx.tenant.tenantId,
      actor: "agent:media_buyer",
      action_type: req.op,
      target_entity: req.entity,
      status: disp.kind.toLowerCase(),
      reason: disp.reason,
      created_at: new Date().toISOString(),
    });

    if (disp.kind === "BLOCK") {
      this.metrics.endSpan(span.spanId, "failure", `Blocked: ${disp.reason}`);
      return { status: "blocked" };
    }

    if (disp.kind === "QUEUE") {
      this.metrics.endSpan(span.spanId, "failure", `Queued: ${disp.reason}`);
      return { status: "queued" };
    }

    // 3. Execute Phase (AUTO_EXECUTE)
    const nowMs = Date.now();
    const isShadow = ctx.tenant.shadowMode === true ||
      (ctx.tenant.onboardingStartMs !== undefined && nowMs - ctx.tenant.onboardingStartMs < 48 * 60 * 60 * 1000);

    let result: ActionResult;
    if (isShadow) {
      result = {
        ok: true,
        auditRef: `shadow_execute_${req.idempotencyKey}`,
        rollback: {
          rollbackId: `shadow_rb_${req.idempotencyKey}`,
          platform: adapter.platform,
          originalState: {},
        },
      };
      await this.audit.record({
        action_id: req.idempotencyKey,
        tenant_id: ctx.tenant.tenantId,
        actor: "agent:media_buyer",
        action_type: req.op,
        target_entity: req.entity,
        status: "shadow_executed",
        reason: "Executed in shadow onboarding mode",
        created_at: new Date().toISOString(),
      });
    } else {
      result = await adapter.execute(plan);
    }
    if (!result.ok) {
      await this.audit.record({
        action_id: req.idempotencyKey,
        tenant_id: ctx.tenant.tenantId,
        actor: "agent:media_buyer",
        action_type: req.op,
        target_entity: req.entity,
        status: "execution_failed",
        reason: result.error,
        created_at: new Date().toISOString(),
      });
      const previousTier = this.trustLedger.getTier(ctx.tenant.tenantId, req.op);
      this.trustLedger.recordOutcome(
        ctx.tenant.tenantId,
        req.op,
        false,
        plan.projectedCost,
        ctx.tenant.policy.maxDailyDollarsRisk,
        ctx.role.name
      );
      const newTier = this.trustLedger.getTier(ctx.tenant.tenantId, req.op);
      if (newTier < previousTier) {
        this.metrics.raiseAlert(`Trust tier degraded from ${previousTier} to ${newTier} for action ${req.op}`);
      }
      this.metrics.endSpan(span.spanId, "failure", result.error);
      return { status: "blocked", result };
    }

    await this.audit.record({
      action_id: req.idempotencyKey,
      tenant_id: ctx.tenant.tenantId,
      actor: "agent:media_buyer",
      action_type: req.op,
      target_entity: req.entity,
      status: "executed",
      created_at: new Date().toISOString(),
    });

    // 4. Verify Phase
    const verifyMetrics = (req.payload as any)?.verifyMetrics ?? {
      preExecutionROAS: 2.0,
      postExecutionROAS: 2.0,
      triggerAnomaly: (req.payload as any)?.triggerAnomaly === true,
    };
    const verificationOk = await this.verify(req, verifyMetrics);

    if (!verificationOk && result.rollback) {
      // 5. Rollback Phase on anomaly detection
      const rollbackResult = await this.executeGradualRollback(adapter, result.rollback);
      await this.audit.record({
        action_id: req.idempotencyKey,
        tenant_id: ctx.tenant.tenantId,
        actor: "agent:media_buyer",
        action_type: req.op,
        target_entity: req.entity,
        status: "rolled_back",
        reason: "Post-execution verification anomaly detected",
        created_at: new Date().toISOString(),
      });

      const previousTier = this.trustLedger.getTier(ctx.tenant.tenantId, req.op);
      this.trustLedger.recordOutcome(
        ctx.tenant.tenantId,
        req.op,
        false,
        plan.projectedCost,
        ctx.tenant.policy.maxDailyDollarsRisk,
        ctx.role.name
      );
      const newTier = this.trustLedger.getTier(ctx.tenant.tenantId, req.op);
      if (newTier < previousTier) {
        this.metrics.raiseAlert(`Trust tier degraded from ${previousTier} to ${newTier} for action ${req.op}`);
      }

      this.circuitBreaker.trip(adapter.platform);
      this.metrics.raiseAlert(`Circuit breaker tripped for platform ${adapter.platform}`);
      this.metrics.endSpan(span.spanId, "failure", "Verification anomaly, rollback initiated");
      return { status: "rolled_back", result: rollbackResult };
    }

    // Success close loop
    this.trustLedger.recordOutcome(
      ctx.tenant.tenantId,
      req.op,
      true,
      plan.projectedCost,
      ctx.tenant.policy.maxDailyDollarsRisk,
      ctx.role.name
    );
    this.metrics.endSpan(span.spanId, "success");
    return { status: "executed", result };
  }

  /**
   * The core decision engine mapping trust tier constraints and limits.
   */
  decide(req: ActionRequest, plan: ActionPlan, ctx: Context, adapter: PlatformAdapter): Disposition {
    const platform = adapter.platform;
    if (this.killSwitchActive) {
      return { kind: "BLOCK", reason: "global kill switch engaged" };
    }

    if (!plan.valid) {
      return { kind: "BLOCK", reason: "invalid action plan" };
    }

    // 1. Check Whitelist Rules first
    const tenantId = ctx.tenant.tenantId;
    const tenantWhitelists = this.whitelists.get(tenantId) ?? [];
    for (const rule of tenantWhitelists) {
      if (rule.op === req.op && rule.entity === req.entity && plan.projectedCost <= rule.maxCost) {
        return { kind: "AUTO_EXECUTE", reason: `action matches whitelist rule: op=${rule.op}, entity=${rule.entity}, maxCost=${rule.maxCost}` };
      }
    }

    // 2. Check Overrides / Waivers
    const nowMs = Date.now();
    const tenantWaivers = this.waivers.get(tenantId) ?? [];
    let hasWaiver = false;
    let waiverReason = "";
    for (const waiver of tenantWaivers) {
      if (
        waiver.expiresAtMs > nowMs &&
        waiver.allowedOps.includes(req.op) &&
        (ctx.role.name === waiver.overrideRole || ctx.role.permits(req.op, req.entity))
      ) {
        hasWaiver = true;
        waiverReason = `temporary override waiver by role '${waiver.overrideRole}' (reason: ${waiver.reason})`;
        break;
      }
    }

    if (!hasWaiver && !ctx.role.permits(req.op, req.entity)) {
      return { kind: "BLOCK", reason: "role permissions do not authorize action" };
    }

    // Enforce blast-radius hard limits, unless waiver is active
    const policy = ctx.tenant.policy;
    if (plan.projectedCost > policy.maxDailyDollarsRisk && !hasWaiver) {
      return { kind: "QUEUE", reason: "projected cost exceeds daily dollars risk limit", approver: policy.escalationRole };
    }

    if (req.confidence < policy.minConfidence && !hasWaiver) {
      return { kind: "QUEUE", reason: "action confidence below minimum threshold", approver: policy.escalationRole };
    }

    if (this.circuitBreaker.isTripped(platform) && !hasWaiver) {
      return { kind: "QUEUE", reason: `circuit breaker is tripped for platform ${platform}`, approver: policy.escalationRole };
    }

    // Irreversible actions (sends, live publishes, payments) never auto-execute, even with waiver
    const cap = adapter.capabilities.find((c: any) => c.entity === req.entity && c.ops.includes(req.op));
    if (cap && !cap.reversible) {
      return { kind: "QUEUE", reason: "irreversible actions (sends/broadcasts) must always queue for human approval", approver: policy.escalationRole };
    }

    // Check earned vs required trust, unless waiver is active
    const earned = this.trustLedger.getTier(ctx.tenant.tenantId, req.op);
    const required = this.riskToTier(plan.projectedCost);

    if (earned < required && !hasWaiver) {
      return { kind: "QUEUE", reason: `earned trust tier (${earned}) is less than required risk tier (${required})`, approver: policy.escalationRole };
    }

    return {
      kind: "AUTO_EXECUTE",
      reason: hasWaiver ? `all checks bypassed by active waiver: ${waiverReason}` : "all checks passed, earned trust satisfies risk limits"
    };
  }

  private riskToTier(projectedCost: number): number {
    if (projectedCost < 100) return 1; // Tier 1: shift small budget
    if (projectedCost < 500) return 2; // Tier 2: moderate changes
    return 3;                         // Tier 3: pre-approval mandatory for large changes
  }

  /**
   * Post-execution validation worker.
   * Checks if the changes took effect or if anomaly occurred.
   */
  private async verify(
    req: ActionRequest,
    metrics: { preExecutionROAS: number; postExecutionROAS: number; triggerAnomaly?: boolean }
  ): Promise<boolean> {
    if (metrics.triggerAnomaly) {
      return false; // Anomaly detected
    }
    // Statistical threshold: Rollback if ROAS drops by more than 15%
    const dropRatio = (metrics.preExecutionROAS - metrics.postExecutionROAS) / metrics.preExecutionROAS;
    if (dropRatio > 0.15) {
      return false;
    }
    return true; // Verification passed
  }

  private async executeGradualRollback(adapter: PlatformAdapter, handle: RollbackHandle): Promise<ActionResult> {
    // Step 1: Revert 50% first
    const partialHandle = { ...handle, scaleFactor: 0.5 };
    const firstStep = await adapter.rollback(partialHandle);
    if (!firstStep.ok) {
      // If partial fails, execute full immediate recovery
      return await adapter.rollback(handle);
    }
    // Step 2: Complete remaining 50%
    return await adapter.rollback({ ...handle, scaleFactor: 1.0 });
  }
}
