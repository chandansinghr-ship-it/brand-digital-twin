import {ActionRequest} from './platform_adapter';

export interface CampaignCostBreakdown {
  grossRevenue: number;
  discountAmount: number;
  cogs: number;
  fulfillment: number;
  marketplaceFee: number;
  refunds: number;
  spend?: number;
  contributionMargin: number;
  estimatedCogs: boolean;
}

export interface CampaignPoasReport {
  campaignId: string;
  campaignName: string;
  platform: string;
  status: string;
  spend: number;
  contributionMargin: number;
  poas: number | null;
  roas: number | null;
  breakdown?: CampaignCostBreakdown;
  clicks: number;
  orders: number;
}

export type RootCause =
  | 'LOW_CONVERSION'
  | 'CPC_TOO_HIGH'
  | 'SPEND_INEFFICIENT'
  | 'COGS_TOO_HIGH'
  | 'DISCOUNT_OVERUSE'
  | 'SHIPPING_TOO_HIGH'
  | 'MARKETPLACE_FEES'
  | 'HIGH_REFUND_RATE'
  | 'INSUFFICIENT_DATA';

export type Side = 'ADVERTISING' | 'ECONOMICS' | 'UNKNOWN';

export interface Prescription {
  tier: 1 | 2 | 3;
  action: string;
  executableOp?: ActionRequest;
  estimatedRecovery: number;
}

export interface ContextCompleteness {
  visible: string[];
  missing: string[];
  caveat: string;
}

export interface RootCauseDiagnosis {
  campaignId: string;
  side: Side;
  rootCause: RootCause;
  secondaryCauses: RootCause[];
  evidence: {
    poas: number;
    roas: number;
    gap: number;
    drivingRatio: number;
    healthyBand: number;
    dollarDrag: number;
  };
  prescriptions: Prescription[];
  incrementalityFlag: boolean;
  confidence: 'high' | 'medium' | 'low';
  completeness: ContextCompleteness;
}

export interface BaselineContext {
  organicRanks?: Record<string, number>;
  competitorBiddingBrandTerms?: boolean;
  ratingTrend?: 'declining' | 'stable' | 'improving';
}

export interface CategoryBenchmarks {
  cogsRatio?: number;
  discountRatio?: number;
  fulfillmentRatio?: number;
  marketplaceRatio?: number;
  refundRatio?: number;
  spendRatio?: number;
  categoryMedianCvr: number;
  categoryHighRoasThreshold?: number;
  lowVarianceThreshold?: number;
}

export interface DiagnosisInput {
  report: CampaignPoasReport;
  breakdown: CampaignCostBreakdown;
  clicks: number;
  orders: number;
  context: BaselineContext;
  benchmarks: CategoryBenchmarks;
  poasVariance?: number;
}

export interface RecommendationCard {
  campaignId: string;
  campaignName: string;
  poas: number;
  roas: number;
  dollarDrag: number;
  dominantCause: RootCause;
  side: Side;
  confidence: 'high' | 'medium' | 'low';
  caveat: string;
  osActs: Prescription[];
  userApproves: Prescription[];
  adsCantFix: Prescription[];
}
