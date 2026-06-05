import {SupabaseClient} from './supabase_client';
import {PoasCalculator} from './poas_calculator';
import {BrandSignal} from './agency_os_types';

export class PoasScheduler {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: SupabaseClient,
    private readonly intervalMs = 24 * 60 * 60 * 1000, // 24 hours default
  ) {}

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(async () => {
      await this.runJobs();
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async runJobs() {
    const tenants = await this.db.getAllTenants();

    for (const tenantId of tenants) {
      try {
        const tenantDb = this.db.clone();
        tenantDb.setTenantContext(tenantId);
        
        const calcForTenant = new PoasCalculator(tenantDb);
        const reports = await calcForTenant.calculate(tenantId);

        // Scan reports for unprofitable campaigns
        const existingSignals = await tenantDb.getBrandSignals(tenantId);

        for (const report of reports) {
          const isActive = report.status === 'ENABLED' || report.status === 'active';
          if (report.poas !== null && report.poas < 1.0 && isActive) {
            // Unprofitable campaign! Trigger signal if not already present
            const alreadySignaled = existingSignals.some(
              (s) => s.type === 'low_performance_roi' && s.payload['campaignId'] === report.campaignId
            );

            if (!alreadySignaled) {
              const signal: BrandSignal = {
                signalId: `sig-poas-${report.campaignId}-${Date.now()}`,
                tenantId: tenantId,
                source: 'ads',
                type: 'low_performance_roi',
                severity: 'high',
                message: `Campaign '${report.campaignName}' has unprofitable POAS of ${report.poas} (ROAS may look fine but COGS/refunds eating margin).`,
                payload: {
                  campaignId: report.campaignId,
                  poas: report.poas,
                  spend: report.spend,
                },
                timestamp: Date.now(),
              };
              await tenantDb.saveBrandSignal(signal);
            }
          }
        }
      } catch (err) {
        console.error(`POAS Scheduler failed for tenant ${tenantId}:`, err);
      }
    }
  }
}
