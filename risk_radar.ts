import {GoogleAdsAdapter} from './google_ads_adapter';
import {Context, GovernanceEngine} from './governance_engine';
import {ActionRequest} from './platform_adapter';
import {SupabaseClient} from './supabase_client';
import {RbiAaAdapter} from './rbi_aa_adapter';
import {
  RootCause,
  Side,
  Prescription,
  ContextCompleteness,
  RootCauseDiagnosis,
  BaselineContext,
  CategoryBenchmarks,
  DiagnosisInput,
  CampaignPoasReport,
  CampaignCostBreakdown,
} from './healing_types';

export interface VariantInventory {
  variantId: string;
  sku: string;
  qty: number;
  promotedCampaignIds: string[]; // Keep for legacy/fallback
  lowStockThreshold?: number;
  roi?: number;
  bundleId?: string;
}

export class RiskRadar {
  private inventories: VariantInventory[] = [];

  constructor(
    private governance: GovernanceEngine,
    private googleAdapter: GoogleAdsAdapter,
    private db?: SupabaseClient,
    private tenantId?: string,
  ) {}

  seedInventory(variant: VariantInventory) {
    this.inventories.push(variant);
  }

  getInventories(): VariantInventory[] {
    return this.inventories;
  }

  /**
   * Scans inventory levels and applies low-stock warnings or stockout actions.
   */
  async scanStockouts(ctx: Context): Promise<string[]> {
    const actionsTaken: string[] = [];
    const links = this.db && this.tenantId ? await this.db.getProductAdLinks(this.tenantId) : [];

    for (const item of this.inventories) {
      const itemLinks = links.filter((l) => l.variant_id === item.variantId);
      const targets =
        itemLinks.length > 0
          ? itemLinks.map((l) => ({
              entity: (l.ads_ad_group_id ? 'ad_group' : 'campaign') as 'ad_group' | 'campaign',
              targetId: l.ads_ad_group_id || l.ads_campaign_id,
            }))
          : item.promotedCampaignIds.map((id) => ({
              entity: 'campaign' as const,
              targetId: id,
            }));

      if (item.qty <= 0) {
        let alternativeFound = false;
        if (item.bundleId) {
          const siblings = this.inventories.filter(
            (v) =>
              v.bundleId === item.bundleId &&
              v.variantId !== item.variantId &&
              v.qty > (v.lowStockThreshold ?? 0),
          );
          if (siblings.length > 0) {
            alternativeFound = true;
            const sibling = siblings[0];
            for (const tgt of targets) {
              const req: ActionRequest = {
                idempotencyKey: `radar_reallocate_${item.variantId}_to_${sibling.variantId}_${tgt.targetId}`,
                op: 'update_feed',
                entity: tgt.entity,
                targetId: tgt.targetId,
                payload: {
                  reason: `reallocate budget from out-of-stock SKU ${item.sku} to sibling ${sibling.sku}`,
                  activeVariantId: sibling.variantId,
                },
                confidence: 1.0,
              };
              const outcome = await this.governance.govern(
                this.googleAdapter,
                req,
                ctx,
              );
              actionsTaken.push(
                outcome.status === 'executed'
                  ? `reallocated_${tgt.entity}_${tgt.targetId}_to_${sibling.sku}`
                  : `queued_reallocation_${tgt.entity}_${tgt.targetId}_to_${sibling.sku}`,
              );
            }
          }
        }

        if (!alternativeFound) {
          for (const tgt of targets) {
            const req: ActionRequest = {
              idempotencyKey: `radar_stockout_${item.variantId}_${tgt.targetId}`,
              op: 'pause',
              entity: tgt.entity,
              targetId: tgt.targetId,
              payload: {
                reason: `automated safety trigger: out of stock variant ${item.sku}`,
              },
              confidence: 1.0,
            };

            const outcome = await this.governance.govern(
              this.googleAdapter,
              req,
              ctx,
            );
            if (outcome.status === 'executed') {
              actionsTaken.push(
                `paused_${tgt.entity}_${tgt.targetId}_for_${item.sku}`,
              );
            } else {
              actionsTaken.push(
                `queued_pause_${tgt.entity}_${tgt.targetId}_for_${item.sku}`,
              );
            }
          }
        }
      } else if (
        item.lowStockThreshold !== undefined &&
        item.qty <= item.lowStockThreshold
      ) {
        for (const tgt of targets) {
          if (tgt.entity !== 'campaign') {
            continue;
          }
          const req: ActionRequest = {
            idempotencyKey: `radar_lowstock_${item.variantId}_${tgt.targetId}`,
            op: 'scale_budget',
            entity: 'campaign',
            targetId: tgt.targetId,
            payload: {
              scaleFactor: 0.5,
              reason: `low stock warning for variant ${item.sku} (qty=${item.qty})`,
            },
            confidence: 1.0,
          };
          const outcome = await this.governance.govern(
            this.googleAdapter,
            req,
            ctx,
          );
          if (outcome.status === 'executed') {
            actionsTaken.push(
              `scaled_down_campaign_${tgt.targetId}_for_${item.sku}`,
            );
          } else {
            actionsTaken.push(
              `queued_scale_down_campaign_${tgt.targetId}_for_${item.sku}`,
            );
          }
        }
      }
    }

    return actionsTaken;
  }

  async scanROIEfficiency(ctx: Context): Promise<string[]> {
    const actionsTaken: string[] = [];
    const links = this.db && this.tenantId ? await this.db.getProductAdLinks(this.tenantId) : [];

    for (const item of this.inventories) {
      if (item.roi === undefined) continue;

      const itemLinks = links.filter((l) => l.variant_id === item.variantId);
      const targets =
        itemLinks.length > 0
          ? itemLinks.map((l) => ({
              entity: (l.ads_ad_group_id ? 'ad_group' : 'campaign') as 'ad_group' | 'campaign',
              targetId: l.ads_ad_group_id || l.ads_campaign_id,
            }))
          : item.promotedCampaignIds.map((id) => ({
              entity: 'campaign' as const,
              targetId: id,
            }));

      if (item.roi >= 3.0) {
        for (const tgt of targets) {
          if (tgt.entity !== 'campaign') continue;
          const req: ActionRequest = {
            idempotencyKey: `radar_high_roi_${item.variantId}_${tgt.targetId}`,
            op: 'scale_budget',
            entity: 'campaign',
            targetId: tgt.targetId,
            payload: {
              scaleFactor: 1.2,
              reason: `high performance ROI adjustment for variant ${item.sku} (roi=${item.roi})`,
            },
            confidence: 1.0,
          };
          const outcome = await this.governance.govern(
            this.googleAdapter,
            req,
            ctx,
          );
          if (outcome.status === 'executed') {
            actionsTaken.push(
              `scaled_up_campaign_${tgt.targetId}_for_high_roi_${item.sku}`,
            );
          }
        }
      } else if (item.roi <= 1.5) {
        for (const tgt of targets) {
          if (tgt.entity !== 'campaign') continue;
          const req: ActionRequest = {
            idempotencyKey: `radar_low_roi_${item.variantId}_${tgt.targetId}`,
            op: 'scale_budget',
            entity: 'campaign',
            targetId: tgt.targetId,
            payload: {
              scaleFactor: 0.7,
              reason: `low performance ROI scaling for variant ${item.sku} (roi=${item.roi})`,
            },
            confidence: 1.0,
          };
          const outcome = await this.governance.govern(
            this.googleAdapter,
            req,
            ctx,
          );
          if (outcome.status === 'executed') {
            actionsTaken.push(
              `scaled_down_campaign_${tgt.targetId}_for_low_roi_${item.sku}`,
            );
          }
        }
      }
    }

    return actionsTaken;
  }

  /**
   * Monitors financial runway and downscales or pauses campaigns if runway is short.
   */
  async scanFinancialRunway(
    ctx: Context,
    rbiAdapter: RbiAaAdapter,
    monthlyBurnInr: number,
  ): Promise<string[]> {
    const actionsTaken: string[] = [];
    const runwayMonths = await rbiAdapter.calculateRunwayMonths(monthlyBurnInr);

    if (runwayMonths <= 0) return [];

    const campaigns = this.db && this.tenantId ? await this.db.getCampaigns(this.tenantId) : [];

    for (const c of campaigns) {
      const isActive = c.status === 'ENABLED' || c.status === 'active';
      if (!isActive) continue;

      if (runwayMonths < 2) {
        const req: ActionRequest = {
          idempotencyKey: `radar_runway_critical_${c.campaign_id}_${Date.now()}`,
          op: 'pause',
          entity: 'campaign',
          targetId: c.campaign_id,
          payload: {
            reason: `CRITICAL RUNWAY WARNING: Only ${runwayMonths.toFixed(1)} months of cash runway remaining. Pausing campaign to preserve cash.`,
          },
          confidence: 1.0,
        };
        const outcome = await this.governance.govern(this.googleAdapter, req, ctx);
        if (outcome.status === 'executed') {
          actionsTaken.push(`paused_campaign_${c.campaign_id}_critical_runway`);
        }
      } else if (runwayMonths < 4) {
        const req: ActionRequest = {
          idempotencyKey: `radar_runway_low_${c.campaign_id}_${Date.now()}`,
          op: 'scale_budget',
          entity: 'campaign',
          targetId: c.campaign_id,
          payload: {
            scaleFactor: 0.6,
            reason: `LOW RUNWAY WARNING: ${runwayMonths.toFixed(1)} months of cash runway remaining. Scaling budget to 60%.`,
          },
          confidence: 1.0,
        };
        const outcome = await this.governance.govern(this.googleAdapter, req, ctx);
        if (outcome.status === 'executed') {
          actionsTaken.push(`scaled_campaign_${c.campaign_id}_low_runway`);
        }
      }
    }
    return actionsTaken;
  }

  static diagnoseRootCause(input: DiagnosisInput): RootCauseDiagnosis {
    const {report, breakdown, clicks, orders, context, benchmarks} = input;
    const grossRevenue = breakdown.grossRevenue;
    const spend = report.spend;

    if (grossRevenue <= 0 || orders === 0) {
      return {
        campaignId: report.campaignId,
        side: 'UNKNOWN',
        rootCause: 'INSUFFICIENT_DATA',
        secondaryCauses: [],
        evidence: {
          poas: report.poas || 0,
          roas: report.roas || 0,
          gap: 0,
          drivingRatio: 0,
          healthyBand: 0,
          dollarDrag: 0,
        },
        prescriptions: [],
        incrementalityFlag: false,
        confidence: 'high',
        completeness: {visible: [], missing: [], caveat: ''},
      };
    }

    const bm = {
      cogsRatio: benchmarks.cogsRatio ?? 0.55,
      discountRatio: benchmarks.discountRatio ?? 0.10,
      fulfillmentRatio: benchmarks.fulfillmentRatio ?? 0.15,
      marketplaceRatio: benchmarks.marketplaceRatio ?? 0.15,
      refundRatio: benchmarks.refundRatio ?? 0.05,
      spendRatio: benchmarks.spendRatio ?? 0.30,
      categoryMedianCvr: benchmarks.categoryMedianCvr,
      categoryHighRoasThreshold: benchmarks.categoryHighRoasThreshold ?? 4.0,
      lowVarianceThreshold: benchmarks.lowVarianceThreshold ?? 0.05,
    };

    const cogsRatio = breakdown.cogs / grossRevenue;
    const discountRatio = breakdown.discountAmount / grossRevenue;
    const fulfillmentRatio = breakdown.fulfillment / grossRevenue;
    const marketplaceRatio = breakdown.marketplaceFee / grossRevenue;
    const refundRatio = breakdown.refunds / grossRevenue;
    const spendRatio = spend / grossRevenue;
    const cvr = clicks > 0 ? orders / clicks : 0;
    const cac = orders > 0 ? spend / orders : 0;
    const contributionMarginPerOrder = orders > 0 ? breakdown.contributionMargin / orders : 0;

    // Step 1: Pre-margin vs ad-cost split
    const preAdContributionRate = breakdown.contributionMargin / grossRevenue;
    let side: Side = 'UNKNOWN';
    let rootCause: RootCause = 'INSUFFICIENT_DATA';
    const secondaryCauses: RootCause[] = [];

    const isAdSide = preAdContributionRate >= 0.30 && report.poas !== null && report.poas < 1.0;

    if (isAdSide) {
      side = 'ADVERTISING';
      if (cvr < 0.5 * bm.categoryMedianCvr) {
        rootCause = 'LOW_CONVERSION';
      } else if (cac > contributionMarginPerOrder) {
        rootCause = 'CPC_TOO_HIGH';
      } else {
        rootCause = 'SPEND_INEFFICIENT';
      }
    } else {
      side = 'ECONOMICS';
      const candidates: Record<string, number> = {
        'COGS_TOO_HIGH': Math.max(0, cogsRatio - bm.cogsRatio) * grossRevenue,
        'DISCOUNT_OVERUSE': Math.max(0, discountRatio - bm.discountRatio) * grossRevenue,
        'SHIPPING_TOO_HIGH': Math.max(0, fulfillmentRatio - bm.fulfillmentRatio) * grossRevenue,
        'MARKETPLACE_FEES': Math.max(0, marketplaceRatio - bm.marketplaceRatio) * grossRevenue,
        'HIGH_REFUND_RATE': Math.max(0, refundRatio - bm.refundRatio) * grossRevenue,
      };

      let maxDrag = -1;
      let dominant: RootCause = 'INSUFFICIENT_DATA';
      for (const [cause, drag] of Object.entries(candidates)) {
        if (drag > maxDrag) {
          maxDrag = drag;
          dominant = cause as RootCause;
        }
      }

      rootCause = dominant;

      const sortedCandidates = Object.entries(candidates)
        .filter(([cause, drag]) => cause !== rootCause && drag > 0)
        .sort((a, b) => b[1] - a[1]);

      for (const [cause] of sortedCandidates) {
        secondaryCauses.push(cause as RootCause);
      }
    }

    const poas = report.poas || 0;
    const roas = report.roas || 0;
    const gap = (poas - 1) * spend;

    let drivingRatio = 0;
    let healthyBand = 0;
    let dollarDrag = 0;

    if (side === 'ADVERTISING') {
      if (rootCause === 'LOW_CONVERSION') {
        drivingRatio = cvr;
        healthyBand = bm.categoryMedianCvr;
        const expectedOrders = clicks * bm.categoryMedianCvr;
        const lostOrders = Math.max(0, expectedOrders - orders);
        dollarDrag = lostOrders * contributionMarginPerOrder;
      } else if (rootCause === 'CPC_TOO_HIGH') {
        drivingRatio = cac;
        healthyBand = contributionMarginPerOrder;
        dollarDrag = Math.max(0, spend - breakdown.contributionMargin);
      } else {
        drivingRatio = spendRatio;
        healthyBand = bm.spendRatio;
        dollarDrag = Math.max(0, spend - breakdown.contributionMargin);
      }
    } else if (side === 'ECONOMICS') {
      if (rootCause === 'COGS_TOO_HIGH') {
        drivingRatio = cogsRatio;
        healthyBand = bm.cogsRatio;
        dollarDrag = Math.max(0, cogsRatio - bm.cogsRatio) * grossRevenue;
      } else if (rootCause === 'DISCOUNT_OVERUSE') {
        drivingRatio = discountRatio;
        healthyBand = bm.discountRatio;
        dollarDrag = Math.max(0, discountRatio - bm.discountRatio) * grossRevenue;
      } else if (rootCause === 'SHIPPING_TOO_HIGH') {
        drivingRatio = fulfillmentRatio;
        healthyBand = bm.fulfillmentRatio;
        dollarDrag = Math.max(0, fulfillmentRatio - bm.fulfillmentRatio) * grossRevenue;
      } else if (rootCause === 'MARKETPLACE_FEES') {
        drivingRatio = marketplaceRatio;
        healthyBand = bm.marketplaceRatio;
        dollarDrag = Math.max(0, marketplaceRatio - bm.marketplaceRatio) * grossRevenue;
      } else if (rootCause === 'HIGH_REFUND_RATE') {
        drivingRatio = refundRatio;
        healthyBand = bm.refundRatio;
        dollarDrag = Math.max(0, refundRatio - bm.refundRatio) * grossRevenue;
      }
    }

    // Step 3: Incrementality overlay
    const isBrandOrRetargeting =
      report.campaignName.toLowerCase().includes('brand') ||
      report.campaignName.toLowerCase().includes('retarget') ||
      report.campaignName.toLowerCase().includes('remarketing');

    const poasVariance = input.poasVariance ?? 0;
    const incrementalityFlag =
      roas >= bm.categoryHighRoasThreshold &&
      poasVariance < bm.lowVarianceThreshold &&
      isBrandOrRetargeting;

    const prescriptions: Prescription[] = [];
    const drag = dollarDrag;

    if (rootCause === 'LOW_CONVERSION') {
      prescriptions.push({
        tier: 2,
        action: 'A/B creative; tighten audience-page match',
        estimatedRecovery: Math.round(drag * 0.4),
      });
      prescriptions.push({
        tier: 3,
        action: 'Landing page UX improvements',
        estimatedRecovery: Math.round(drag * 0.5),
      });
    } else if (rootCause === 'CPC_TOO_HIGH') {
      prescriptions.push({
        tier: 1,
        action: 'Lower bid; add negatives to reduce waste',
        executableOp: {
          idempotencyKey: `rx_cpc_${report.campaignId}_${Date.now()}`,
          op: 'scale_budget',
          entity: 'campaign',
          targetId: report.campaignId,
          payload: {
            scaleFactor: 0.8,
            reason: `Prescription for CPC_TOO_HIGH: scale budget down to mitigate high CPC (drag=${Math.round(drag)})`,
          },
          confidence: 1.0,
        },
        estimatedRecovery: Math.round(drag * 0.3),
      });
      prescriptions.push({
        tier: 2,
        action: 'Shift keywords to lower-funnel intent',
        estimatedRecovery: Math.round(drag * 0.4),
      });
    } else if (rootCause === 'SPEND_INEFFICIENT') {
      prescriptions.push({
        tier: 1,
        action: 'Reallocate budget to high-POAS twin campaign',
        executableOp: {
          idempotencyKey: `rx_reallocate_${report.campaignId}_${Date.now()}`,
          op: 'scale_budget',
          entity: 'campaign',
          targetId: report.campaignId,
          payload: {
            scaleFactor: 0.7,
            reason: `Prescription for SPEND_INEFFICIENT: scale down inefficient campaign (drag=${Math.round(drag)})`,
          },
          confidence: 1.0,
        },
        estimatedRecovery: Math.round(drag * 0.4),
      });
      prescriptions.push({
        tier: 2,
        action: 'Restructure placements (exclude search partners/display)',
        estimatedRecovery: Math.round(drag * 0.3),
      });
    } else if (rootCause === 'COGS_TOO_HIGH') {
      prescriptions.push({
        tier: 3,
        action: 'Reprice product, renegotiate supplier costs, or pause paid ads on this SKU',
        estimatedRecovery: Math.round(drag * 0.8),
      });
    } else if (rootCause === 'DISCOUNT_OVERUSE') {
      prescriptions.push({
        tier: 2,
        action: 'Test removing active promo codes on this campaign',
        estimatedRecovery: Math.round(drag * 0.5),
      });
      prescriptions.push({
        tier: 3,
        action: 'Revisit overall promotional and discounting strategy',
        estimatedRecovery: Math.round(drag * 0.6),
      });
    } else if (rootCause === 'SHIPPING_TOO_HIGH') {
      prescriptions.push({
        tier: 1,
        action: 'Exclude low-AOV carts from free shipping (raise break-even)',
        executableOp: {
          idempotencyKey: `rx_shipping_${report.campaignId}_${Date.now()}`,
          op: 'update_feed',
          entity: 'campaign',
          targetId: report.campaignId,
          payload: {
            excludeLowAov: true,
            reason: `Prescription for SHIPPING_TOO_HIGH: update feed to exclude low AOV carts (drag=${Math.round(drag)})`,
          },
          confidence: 1.0,
        },
        estimatedRecovery: Math.round(drag * 0.4),
      });
      prescriptions.push({
        tier: 3,
        action: 'Raise free shipping threshold; renegotiate carrier contracts',
        estimatedRecovery: Math.round(drag * 0.6),
      });
    } else if (rootCause === 'MARKETPLACE_FEES') {
      prescriptions.push({
        tier: 3,
        action: 'Shift sales channel mix towards D2C instead of high-fee marketplaces',
        estimatedRecovery: Math.round(drag * 0.7),
      });
    } else if (rootCause === 'HIGH_REFUND_RATE') {
      prescriptions.push({
        tier: 1,
        action: 'Pause paid ads on high-return SKUs associated with this campaign',
        executableOp: {
          idempotencyKey: `rx_refund_${report.campaignId}_${Date.now()}`,
          op: 'update_feed',
          entity: 'campaign',
          targetId: report.campaignId,
          payload: {
            excludeHighRefundSkus: true,
            reason: `Prescription for HIGH_REFUND_RATE: filter out high refund SKUs from product feed (drag=${Math.round(drag)})`,
          },
          confidence: 1.0,
        },
        estimatedRecovery: Math.round(drag * 0.5),
      });
      prescriptions.push({
        tier: 3,
        action: 'Fix product quality, sizing chart discrepancies, or customer expectations',
        estimatedRecovery: Math.round(drag * 0.6),
      });
    }

    // Context layer checks
    for (const rx of prescriptions) {
      const termKey = report.campaignName.toLowerCase();
      const organicRank = context.organicRanks?.[termKey] || 99;

      const isReduction =
        rx.executableOp?.op === 'pause' ||
        (rx.executableOp?.op === 'scale_budget' &&
          (rx.executableOp.payload as any).scaleFactor < 1.0);

      if (isReduction && organicRank <= 3) {
        if (rx.tier === 1) {
          rx.tier = 2;
          rx.action = `[DEMOTED] ${rx.action}. Note: you rank #${organicRank} organically; paid may be defending the SERP — verify before pausing`;
        }
      }

      if (
        context.competitorBiddingBrandTerms &&
        rx.executableOp?.op === 'pause' &&
        isBrandOrRetargeting
      ) {
        rx.action = `${rx.action}. Note: Competitors are bidding on your brand terms; pausing cedes ground`;
      }
    }

    let confidence: 'high' | 'medium' | 'low' = 'high';
    const hasScaleUp = prescriptions.some(
      (rx) =>
        rx.executableOp?.op === 'scale_budget' &&
        (rx.executableOp.payload as any).scaleFactor > 1.0,
    );
    if (context.ratingTrend === 'declining' && hasScaleUp) {
      confidence = 'medium';
    }

    if (breakdown.estimatedCogs) {
      confidence = 'medium';
    }

    const visible: string[] = ['paid', 'commerce'];
    const missing: string[] = [];
    if (!context.organicRanks) {
      missing.push('organic');
    } else {
      visible.push('organic');
    }
    missing.push('email');

    let caveat = `Based on ${visible.join(' + ')} channels.`;
    if (missing.length > 0) {
      caveat += ` ${missing.join(' and ')} not connected — connect them so this accounts for cross-channel effects.`;
    }

    const completeness: ContextCompleteness = {
      visible,
      missing,
      caveat,
    };

    return {
      campaignId: report.campaignId,
      side,
      rootCause,
      secondaryCauses,
      evidence: {
        poas,
        roas,
        gap,
        drivingRatio,
        healthyBand,
        dollarDrag,
      },
      prescriptions,
      incrementalityFlag,
      confidence,
      completeness,
    };
  }
}
