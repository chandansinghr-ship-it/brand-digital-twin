import {SupabaseClient} from './supabase_client';
import {GoogleSearchConsoleAdapter} from './google_search_console_adapter';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {GovernanceEngine, TrustLedger, CircuitBreaker, AuditSink} from './governance_engine';
import {Context} from './governance_types';
import {CpluOptimizer} from './cplu_optimizer';

describe('CPLU (Cost-Per-Lifted-User) Optimizer Tests', () => {
  let db: SupabaseClient;
  let gscAdapter: GoogleSearchConsoleAdapter;
  let adsAdapter: GoogleAdsAdapter;
  let engine: GovernanceEngine;
  let optimizer: CpluOptimizer;
  let ctx: Context;

  beforeEach(async () => {
    db = new SupabaseClient('mock-url', 'mock-key', true);
    db.setTenantContext('tenant-cplu');

    // Seed variant to pass COGS coverage check (needs >= 70%)
    await db.saveVariant({
      variant_id: 'var-cov',
      sku: 'SKU-COV',
      price: 10,
      cost: 5,
      title: 'Coverage Seed',
      tenant_id: 'tenant-cplu',
      ingested_at: new Date().toISOString(),
    });

    gscAdapter = new GoogleSearchConsoleAdapter('tenant-cplu', true);
    adsAdapter = new GoogleAdsAdapter('cust-123', 'dev-tok', 'mock-token', 'tenant-cplu');

    const auditLogs: any[] = [];
    const mockAuditSink: AuditSink = {
      record: async (row: Record<string, unknown>) => {
        auditLogs.push(row);
      },
    };
    const trustLedger = new TrustLedger();
    const circuitBreaker = new CircuitBreaker();

    engine = new GovernanceEngine(mockAuditSink, trustLedger, circuitBreaker, undefined, undefined, db);
    optimizer = new CpluOptimizer(db, gscAdapter, adsAdapter, engine);

    ctx = {
      tenant: {
        tenantId: 'tenant-cplu',
        policy: {
          maxDailyDollarsRisk: 1000,
          maxBudgetMovePct: 0.5,
          minConfidence: 0.8,
          escalationRole: 'cmo',
        },
      },
      role: {name: 'admin', permits: () => true},
      verifyWindowMs: 0,
    };
  });

  it('should not scale down budget if CPLU is healthy (under threshold)', async () => {
    // 1. Seed Campaign and Spend facts
    await db.saveCampaign({
      campaign_id: 'c1',
      platform: 'google',
      name: 'Google Search Leads',
      objective: 'leads',
      status: 'active',
      surface: 'google_ads',
      tenant_id: 'tenant-cplu',
      source_system: 'google_ads',
      source_id: 'google-aw-1',
      source_version: 'v1',
      daily_budget: 1000,
      ingested_at: new Date().toISOString(),
    });

    // 30 days of spend facts: $30/day = $900 total spend
    for (let i = 0; i < 30; i++) {
      await db.saveSpendFact({
        campaign_id: 'c1',
        platform: 'google',
        day: new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().split('T')[0],
        amount: 30,
        currency: 'USD',
        tenant_id: 'tenant-cplu',
        source_system: 'google_ads',
        ingested_at: new Date().toISOString(),
      });
    }

    // 2. Set search console brand keyword query mock to 2,000 queries
    // Baseline queries is 1,000. Lifted = 2,000 - 1,000 = 1,000 searchers.
    // Total spend = $900.
    // CPLU = $900 / 1,000 = $0.90 per lifted searcher.
    // Threshold is $2.00.
    gscAdapter.setMockBrandQueries(2000);

    spyOn(engine, 'govern').and.callThrough();

    const res = await optimizer.optimizeAwarenessBudgets('tenant-cplu', ctx, {
      baselineBrandQueries: 1000,
      maxCpluThreshold: 2.00,
      awarenessCampaignIds: ['c1'],
    });

    expect(res.cplu).toBe(0.90);
    expect(res.liftedUsers).toBe(1000);
    expect(res.totalSpend).toBe(900);
    expect(res.actionsPlanned.length).toBe(0);
    expect(engine.govern).not.toHaveBeenCalled();
  });

  it('should scale down budget if CPLU exceeds threshold due to low organic lift', async () => {
    // 1. Seed Campaign and Spend facts (same: $900 total spend, campaign budget $500)
    await db.saveCampaign({
      campaign_id: '888',
      platform: 'google',
      name: 'Mock PMax Campaign',
      objective: 'awareness',
      status: 'active',
      surface: 'google_ads',
      tenant_id: 'tenant-cplu',
      source_system: 'google_ads',
      source_id: 'meta-aw-2',
      source_version: 'v1',
      daily_budget: 500,
      ingested_at: new Date().toISOString(),
    });

    for (let i = 0; i < 30; i++) {
      await db.saveSpendFact({
        campaign_id: '888',
        platform: 'google',
        day: new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().split('T')[0],
        amount: 30,
        currency: 'USD',
        tenant_id: 'tenant-cplu',
        source_system: 'google_ads',
        ingested_at: new Date().toISOString(),
      });
    }

    // 2. Set search console brand keyword queries mock to 1,150 queries
    // Baseline is 1,000. Lifted = 1,150 - 1,000 = 150 searchers.
    // Spend = $900.
    // CPLU = $900 / 150 = $6.00 per lifted searcher.
    // Threshold is $2.00. CPLU $6.00 exceeds $2.00!
    gscAdapter.setMockBrandQueries(1150);

    spyOn(engine, 'govern').and.callThrough();

    const res = await optimizer.optimizeAwarenessBudgets('tenant-cplu', ctx, {
      baselineBrandQueries: 1000,
      maxCpluThreshold: 2.00,
      awarenessCampaignIds: ['888'],
    });

    expect(res.cplu).toBe(6.00);
    expect(res.liftedUsers).toBe(150);
    expect(res.totalSpend).toBe(900);
    expect(res.actionsPlanned.length).toBe(1);

    // Verify proposed scale down action (scale down budget to 70%)
    expect(engine.govern).toHaveBeenCalled();
    const proposed = (engine.govern as jasmine.Spy).calls.mostRecent().args[1];
    expect(proposed.op).toBe('scale_budget');
    expect(proposed.targetId).toBe('888');
    expect(proposed.payload.scaleFactor).toBe(0.7);
    expect(proposed.payload.reason).toContain('CPLU of $6.00 exceeds target threshold of $2.00');
  });
});
