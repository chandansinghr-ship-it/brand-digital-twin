import {SupabaseClient, CampaignEntry} from './supabase_client';
import {GoogleSearchConsoleAdapter} from './google_search_console_adapter';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {GovernanceEngine} from './governance_engine';
import {Context} from './governance_types';
import {ActionRequest} from './platform_adapter';

export class CpluOptimizer {
  constructor(
    private readonly db: SupabaseClient,
    private readonly gscAdapter: GoogleSearchConsoleAdapter,
    private readonly adsAdapter: GoogleAdsAdapter,
    private readonly engine: GovernanceEngine,
  ) {}

  async optimizeAwarenessBudgets(
    tenantId: string,
    ctx: Context,
    options: {
      baselineBrandQueries: number;
      maxCpluThreshold: number;
      awarenessCampaignIds: string[];
    },
  ): Promise<{
    cplu: number;
    liftedUsers: number;
    totalSpend: number;
    actionsPlanned: string[];
  }> {
    const actionsPlanned: string[] = [];

    // 1. Fetch search console brand keyword queries
    const today = new Date().toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const metrics = await this.gscAdapter.getBrandSearchMetrics(thirtyDaysAgo, today);

    const currentQueries = metrics.brandQueriesCount;
    const liftedUsers = Math.max(0, currentQueries - options.baselineBrandQueries);

    // 2. Sum awareness campaign spends from database facts
    const spendFacts = await this.db.getSpendFacts(tenantId).catch(() => []);
    const relevantFacts = spendFacts.filter((f) => options.awarenessCampaignIds.includes(f.campaign_id));
    const totalSpend = relevantFacts.reduce((sum, f) => sum + f.amount, 0);

    // 3. Calculate Cost-Per-Lifted-User (CPLU)
    const cplu = liftedUsers > 0 ? totalSpend / liftedUsers : totalSpend;

    // 4. Check if CPLU exceeds threshold
    if (cplu > options.maxCpluThreshold && totalSpend > 0) {
      // Fetch current campaigns to see their budgets
      const campaigns = await this.db.getCampaigns(tenantId);
      const activeAwarenessCampaigns = campaigns.filter(
        (c) =>
          options.awarenessCampaignIds.includes(c.campaign_id) &&
          (c.status === 'ENABLED' || c.status === 'active'),
      );

      for (const camp of activeAwarenessCampaigns) {
        const currentBudget = camp.daily_budget || 100;
        const newBudget = Math.round(currentBudget * 0.7); // Scale budget down by 30%

        const action: ActionRequest = {
          idempotencyKey: `act-cplu-scale-${camp.campaign_id}-${Date.now()}`,
          op: 'scale_budget',
          entity: 'campaign',
          targetId: camp.campaign_id,
          payload: {
            scaleFactor: 0.7,
            reason: `CPLU of $${cplu.toFixed(2)} exceeds target threshold of $${options.maxCpluThreshold.toFixed(2)}. Scaling down budget to preserve capital.`,
          },
          confidence: 0.95,
        };

        const res = await this.engine.govern(this.adsAdapter, action, ctx);
        if (res.status === 'executed' || res.status === 'queued') {
          actionsPlanned.push(action.idempotencyKey);
        }
      }
    }

    return {
      cplu,
      liftedUsers,
      totalSpend,
      actionsPlanned,
    };
  }
}
