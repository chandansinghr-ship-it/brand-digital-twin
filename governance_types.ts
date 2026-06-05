/**
 * @fileoverview Type definitions and interfaces for the Governance Engine.
 */

export type SemanticTrustTier = 'OBSERVE' | 'REVIEW' | 'ASSISTED' | 'AUTONOMOUS' | 'C_SUITE';

export const SEMANTIC_TIERS: Record<number, SemanticTrustTier> = {
  0: 'OBSERVE',
  1: 'REVIEW',
  2: 'ASSISTED',
  3: 'AUTONOMOUS',
  4: 'C_SUITE',
};

export interface TenantPolicy {
  maxDailyDollarsRisk: number; // e.g., $1000
  maxBudgetMovePct: number; // e.g., 20% (0.20)
  minConfidence: number; // e.g., 0.85
  escalationRole: string; // e.g., 'cmo'
  tierCaps?: Record<string, number>; // Maps SemanticTrustTier (or its string) to dollar cap
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
  bypassIrreversible?: boolean;
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
  triggerAnomaly?: boolean;
  activeWaivers?: Waiver[];
}

export type DispositionKind = 'AUTO_EXECUTE' | 'QUEUE' | 'BLOCK';

export interface Disposition {
  kind: DispositionKind;
  reason: string;
  approver?: string;
}

export interface AuditSink {
  record(row: Record<string, unknown>): Promise<void>;
}

export interface TrustOutcome {
  success: boolean;
  cost: number;
  timestampMs: number;
  approvedByRole?: string;
}
