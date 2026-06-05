import {PoasScheduler} from './poas_scheduler';
import {SupabaseClient} from './supabase_client';

describe('PoasScheduler', () => {
  let db: SupabaseClient;
  let scheduler: PoasScheduler;
  const tenantId = 'tenant-sched-test';

  beforeEach(async () => {
    db = new SupabaseClient('https://mock.supabase.co', 'mock-key', true);
    db.setTenantContext(tenantId);
    scheduler = new PoasScheduler(db, 1000); // 1s interval (not used in manual run)

    // Clear db collections
    await db.clearCampaigns(tenantId);
    
    // Seed Client to ensure tenant is picked up by getAllTenants
    await db.saveClient({
      clientId: 'client-1',
      orgId: `org-${tenantId}`,
      name: 'Test Client',
      tenantId: tenantId,
      healthScore: 100,
      churnRisk: 0.0,
      marginTarget: 0.4,
      mrr: 5000,
    });

    // Seed campaigns
    // Campaign 1: Unprofitable (POAS < 1.0)
    await db.saveCampaign({
      campaign_id: 'c-unprofit',
      tenant_id: tenantId,
      name: 'Unprofitable Meta Ads',
      platform: 'meta',
      objective: 'CONVERSIONS',
      status: 'ENABLED',
      surface: 'meta_ads',
      source_id: 'c-unprofit',
      source_system: 'meta',
      source_version: 'v18',
      ingested_at: new Date().toISOString(),
    });

    // Campaign 2: Profitable (POAS >= 1.0)
    await db.saveCampaign({
      campaign_id: 'c-profit',
      tenant_id: tenantId,
      name: 'Profitable Google Ads',
      platform: 'google',
      objective: 'SEARCH',
      status: 'ENABLED',
      surface: 'google_search',
      source_id: 'c-profit',
      source_system: 'google',
      source_version: 'v15',
      ingested_at: new Date().toISOString(),
    });

    // Seed spend
    await db.saveSpendFact({
      campaign_id: 'c-unprofit',
      platform: 'meta',
      day: '2026-06-05',
      amount: 1000, // Spend $1000
      currency: 'USD',
      tenant_id: tenantId,
      source_system: 'meta',
      ingested_at: new Date().toISOString(),
    });
    await db.saveSpendFact({
      campaign_id: 'c-profit',
      platform: 'google',
      day: '2026-06-05',
      amount: 500, // Spend $500
      currency: 'USD',
      tenant_id: tenantId,
      source_system: 'google',
      ingested_at: new Date().toISOString(),
    });

    // Seed orders & order lines
    // Order 1 (Attributed to c-unprofit via touchpoint)
    // Gross: $1200. Cost: $1000. Margin: $200. Spend: $1000. POAS: 0.2 (Unprofitable)
    await db.saveOrder({
      order_id: 'o1',
      customer_id: 'cust1',
      account_id: null,
      channel: 'online',
      surface: 'shopify',
      placed_at: new Date().toISOString(),
      currency: 'USD',
      gross_revenue: 1200,
      total_discounts: 0,
      total_tax: 0,
      shipping_charged: 0,
      status: 'PAID',
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'o1',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });
    await db.saveOrderLine({
      order_line_id: 'ol1',
      order_id: 'o1',
      variant_id: 'v1',
      sku: 'SKU1',
      qty: 1,
      unit_price: 1200,
      line_discount: 0,
      unit_cost: 1000, // COGS is $1000
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'ol1',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });
    await db.saveTouchpoint({
      touchpoint_id: 'tp1',
      customer_id: 'cust1',
      campaign_id: 'c-unprofit',
      order_id: 'o1',
      occurred_at: new Date(Date.now() - 1000).toISOString(),
      type: 'click',
      tenant_id: tenantId,
      source_system: 'meta',
      ingested_at: new Date().toISOString(),
    });

    // Order 2 (Attributed to c-profit via touchpoint)
    // Gross: $1500. Cost: $500. Margin: $1000. Spend: $500. POAS: 2.0 (Profitable)
    await db.saveOrder({
      order_id: 'o2',
      customer_id: 'cust2',
      account_id: null,
      channel: 'online',
      surface: 'shopify',
      placed_at: new Date().toISOString(),
      currency: 'USD',
      gross_revenue: 1500,
      total_discounts: 0,
      total_tax: 0,
      shipping_charged: 0,
      status: 'PAID',
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'o2',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });
    await db.saveOrderLine({
      order_line_id: 'ol2',
      order_id: 'o2',
      variant_id: 'v2',
      sku: 'SKU2',
      qty: 1,
      unit_price: 1500,
      line_discount: 0,
      unit_cost: 500, // COGS is $500
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'ol2',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });
    await db.saveTouchpoint({
      touchpoint_id: 'tp2',
      customer_id: 'cust2',
      campaign_id: 'c-profit',
      order_id: 'o2',
      occurred_at: new Date(Date.now() - 1000).toISOString(),
      type: 'click',
      tenant_id: tenantId,
      source_system: 'google',
      ingested_at: new Date().toISOString(),
    });
  });

  it('should flag unprofitable campaigns with low performance brand signals', async () => {
    // Run the scheduler jobs
    await scheduler.runJobs();

    const signals = await db.getBrandSignals(tenantId);
    
    // Should have created 1 signal for the unprofitable campaign
    const lowPerfSignals = signals.filter((s) => s.type === 'low_performance_roi');
    expect(lowPerfSignals.length).toBe(1);
    expect(lowPerfSignals[0].payload['campaignId']).toBe('c-unprofit');
    expect(lowPerfSignals[0].severity).toBe('high');
    expect(lowPerfSignals[0].message).toContain("has unprofitable POAS");

    // Profitable campaign should NOT have a signal
    const profitSignal = signals.find(
      (s) => s.type === 'low_performance_roi' && s.payload['campaignId'] === 'c-profit'
    );
    expect(profitSignal).toBeUndefined();
  });

  it('should not duplicate signals on consecutive runs', async () => {
    await scheduler.runJobs();
    let signals = await db.getBrandSignals(tenantId);
    expect(signals.filter((s) => s.type === 'low_performance_roi').length).toBe(1);

    // Run again
    await scheduler.runJobs();
    signals = await db.getBrandSignals(tenantId);
    // Still should only have 1 signal
    expect(signals.filter((s) => s.type === 'low_performance_roi').length).toBe(1);
  });
});
