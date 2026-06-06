import {MockPaymentProcessor} from './payment_processor';
import {PoasCalculator} from './poas_calculator';
import {PoasScheduler} from './poas_scheduler';
import {SupabaseClient} from './supabase_client';

describe('PoasScheduler', () => {
  let db: SupabaseClient;
  let scheduler: PoasScheduler;
  const tenantId = 'tenant-sched-test';

  beforeEach(async () => {
    SupabaseClient.useSharedMockDb = true;
    SupabaseClient.resetGlobalMockDb();

    db = new SupabaseClient('https://mock.supabase.co', 'mock-key', true);
    db.setTenantContext(tenantId);
    scheduler = new PoasScheduler(db, 1000);

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
      amount: 1000,
      currency: 'USD',
      tenant_id: tenantId,
      source_system: 'meta',
      ingested_at: new Date().toISOString(),
    });
    await db.saveSpendFact({
      campaign_id: 'c-profit',
      platform: 'google',
      day: '2026-06-05',
      amount: 500,
      currency: 'USD',
      tenant_id: tenantId,
      source_system: 'google',
      ingested_at: new Date().toISOString(),
    });

    // Seed orders & order lines
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

  afterEach(() => {
    SupabaseClient.useSharedMockDb = false;
  });

  it('should schedule, run, reschedule, and flag unprofitable campaigns', async () => {
    // 1. Register tenant to create initial daily job
    await scheduler.registerTenant(tenantId);
    let jobs = await db.getPendingJobs(tenantId);
    expect(jobs.length).toBe(2);
    expect(jobs.some(j => j.type === 'poas_daily')).toBeTrue();
    expect(jobs.some(j => j.type === 'lift_sync')).toBeTrue();

    // 2. Run the polling queue execution
    await scheduler.pollAndExecute();

    // 3. Verify unprofitable campaign has brand signal
    const signals = await db.getBrandSignals(tenantId);
    const lowPerfSignals = signals.filter((s) => s.type === 'low_performance_roi');
    expect(lowPerfSignals.length).toBe(1);
    expect(lowPerfSignals[0].payload['campaignId']).toBe('c-unprofit');

    // 4. Verify original jobs are rescheduled in future (24 hours from now)
    jobs = await db.getPendingJobs(tenantId);
    expect(jobs.length).toBe(2);
    expect(jobs.every(j => j.status === 'pending')).toBeTrue();

    // 5. Subsequent immediate run does not execute (no new signals, no duplicate jobs)
    await scheduler.pollAndExecute();
    const consecutiveJobs = await db.getPendingJobs(tenantId);
    expect(consecutiveJobs.length).toBe(2);
    const originalIds = jobs.map(j => j.job_id).sort();
    const consecutiveIds = consecutiveJobs.map(j => j.job_id).sort();
    expect(consecutiveIds).toEqual(originalIds);
  });

  it('should not duplicate signals on consecutive runs', async () => {
    await scheduler.registerTenant(tenantId);
    await scheduler.pollAndExecute();
    let signals = await db.getBrandSignals(tenantId);
    expect(signals.filter((s) => s.type === 'low_performance_roi').length).toBe(1);

    // Force run another job by manually saving one that is overdue
    const forceOverdueJob = {
      job_id: `job-poas-force-${Date.now()}`,
      tenant_id: tenantId,
      type: 'poas_daily' as const,
      action_id: null,
      run_at: new Date(Date.now() - 1000).toISOString(),
      payload: null,
      status: 'pending' as const,
      created_at: new Date().toISOString(),
    };
    await db.savePendingJob(forceOverdueJob);

    await scheduler.pollAndExecute();
    signals = await db.getBrandSignals(tenantId);
    // Should still have only 1 signal because alreadySignaled guard matches the campaign ID
    expect(signals.filter((s) => s.type === 'low_performance_roi').length).toBe(1);
  });

  it('should split multiple overdue jobs across concurrent scheduler nodes without double-execution', async () => {
    const schedulerA = new PoasScheduler(db, 1000);
    const schedulerB = new PoasScheduler(db, 1000);

    const tenants = ['tenant-1', 'tenant-2', 'tenant-3', 'tenant-4'];
    db.setTenantContext(null);

    // Clear all pending jobs first
    (db as any).mockPendingJobs = [];

    for (const t of tenants) {
      await db.saveClient({
        clientId: `client-${t}`,
        orgId: `org-${t}`,
        name: `Client ${t}`,
        tenantId: t,
        healthScore: 100,
        churnRisk: 0.0,
        marginTarget: 0.4,
        mrr: 5000,
      });

      const job = {
        job_id: `job-poas-${t}`,
        tenant_id: t,
        type: 'poas_daily' as const,
        action_id: null,
        run_at: new Date(Date.now() - 5000).toISOString(),
        payload: null,
        status: 'pending' as const,
        created_at: new Date().toISOString(),
      };
      await db.savePendingJob(job);
    }

    await Promise.all([
      schedulerA.pollAndExecute(),
      schedulerB.pollAndExecute(),
    ]);

    const rawJobs = (db as any).mockPendingJobs;
    expect(rawJobs.length).toBe(4);
    for (const job of rawJobs) {
      expect(job.status).toBe('pending');
      expect(Date.parse(job.run_at)).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
    }
  });

  it('should reschedule the daily job even when executePoasDaily throws a transient error (Test Case 4.1)', async () => {
    // 1. Stub calculate to throw a DB Connection Exception
    const calculateSpy = spyOn(PoasCalculator.prototype, 'calculate').and.callFake(async () => {
      throw new Error('Database Connection Lost');
    });

    // 2. Register tenant to create initial daily job
    await scheduler.registerTenant(tenantId);
    let jobs = await db.getPendingJobs(tenantId);
    expect(jobs.length).toBe(2);
    const dailyJob = jobs.find(j => j.type === 'poas_daily')!;
    const originalJobId = dailyJob.job_id;

    // 3. Run the scheduler execution
    await scheduler.pollAndExecute();

    // 4. Verify original job is now marked 'failed'
    const failedJobs = (db as any).mockPendingJobs.filter((j: any) => j.job_id === originalJobId);
    expect(failedJobs.length).toBe(1);
    expect(failedJobs[0].status).toBe('failed');

    // 5. Critical: Verify a new poas_daily job is scheduled in the pending jobs database
    const newJobs = (db as any).mockPendingJobs.filter((j: any) => j.job_id !== originalJobId && j.type === 'poas_daily');
    expect(newJobs.length).toBe(1);
    expect(newJobs[0].status).toBe('pending');
    expect(Date.parse(newJobs[0].run_at)).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
  });

  describe('Billing Trials & Recurring Charges', () => {
    let mockPayment: MockPaymentProcessor;
    let billingScheduler: PoasScheduler;
    let mockEngine: any;
    let mockGoogleAdapter: any;

    beforeEach(async () => {
      mockPayment = new MockPaymentProcessor();
      billingScheduler = new PoasScheduler(db, 1000, mockPayment);

      mockEngine = {
        govern: jasmine.createSpy('govern').and.callFake(async (adapter, req, ctx) => {
          return { status: 'executed', result: { ok: true } };
        }),
      };
      billingScheduler.registerGovernanceEngine(mockEngine);

      mockGoogleAdapter = {
        platform: 'google',
      };
      billingScheduler.registerAdapter('google', mockGoogleAdapter);

      // Seed a subscription in trial
      await db.saveSubscription({
        org_id: tenantId,
        status: 'trial',
        amount: null,
        currency: 'USD',
        period: 'month',
        trial_day: 1,
        trial_length_days: 15,
        next_charge_at: null,
        note: null,
        updated_at: new Date().toISOString(),
      });
    });

    it('should schedule billing nudge and flip when registering tenant with scheduleBilling=true', async () => {
      await db.deletePendingJob(`job-poas-daily-${tenantId}`);
      
      await billingScheduler.registerTenant(tenantId, true);
      const jobs = await db.getPendingJobs(tenantId);
      
      expect(jobs.length).toBe(4);
      expect(jobs.some(j => j.type === 'poas_daily')).toBe(true);
      expect(jobs.some(j => j.type === 'lift_sync')).toBe(true);
      expect(jobs.some(j => j.type === 'billing_trial_nudge')).toBe(true);
      expect(jobs.some(j => j.type === 'billing_trial_flip')).toBe(true);
    });

    it('should execute billing trial nudge: log activity with drag and critical count', async () => {
      await db.savePendingJob({
        job_id: 'job-nudge-test',
        tenant_id: tenantId,
        type: 'billing_trial_nudge',
        action_id: null,
        run_at: new Date().toISOString(),
        payload: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      await billingScheduler.pollAndExecute();

      const feed = await db.getActivityFeed(tenantId);
      expect(feed.length).toBe(1);
      expect(feed[0].actionType).toBe('billing_trial_nudge');
      expect(feed[0].summary).toContain('Trial ending soon. Potential profit drag:');
      
      const jobs = await db.getPendingJobs(tenantId);
      expect(jobs.some(j => j.job_id === 'job-nudge-test')).toBe(false);
    });

    it('should execute billing trial flip: transition status to suggest_amount', async () => {
      await db.savePendingJob({
        job_id: 'job-flip-test',
        tenant_id: tenantId,
        type: 'billing_trial_flip',
        action_id: null,
        run_at: new Date().toISOString(),
        payload: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      await billingScheduler.pollAndExecute();

      const sub = await db.getSubscription(tenantId);
      expect(sub).not.toBeNull();
      expect(sub!.status).toBe('suggest_amount');

      const feed = await db.getActivityFeed(tenantId);
      expect(feed.some(f => f.actionType === 'billing_trial_flipped')).toBe(true);

      const jobs = await db.getPendingJobs(tenantId);
      expect(jobs.some(j => j.job_id === 'job-flip-test')).toBe(false);
    });

    it('should execute recurring charge successfully and reschedule next charge', async () => {
      const sub = await db.getSubscription(tenantId);
      sub!.status = 'active';
      sub!.amount = 499;
      await db.saveSubscription(sub!);

      await db.savePendingJob({
        job_id: 'job-charge-test',
        tenant_id: tenantId,
        type: 'billing_charge_recurring',
        action_id: null,
        run_at: new Date().toISOString(),
        payload: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      await billingScheduler.pollAndExecute();

      const updatedSub = await db.getSubscription(tenantId);
      expect(updatedSub!.status).toBe('active');
      expect(updatedSub!.next_charge_at).not.toBeNull();

      const feed = await db.getActivityFeed(tenantId);
      expect(feed.some(f => f.actionType === 'billing_charge_success')).toBe(true);

      const receipts = await db.getReceipts(tenantId);
      expect(receipts.length).toBe(1);
      expect(receipts[0].amount).toBe(499);
      expect(receipts[0].receipt_id).toContain('rcpt-rec');

      const jobs = await db.getPendingJobs(tenantId);
      expect(jobs.some(j => j.type === 'billing_charge_recurring')).toBe(true);
      expect(jobs.some(j => j.job_id === 'job-charge-test')).toBe(false);
    });

    it('should handle recurring charge failure: transition to past_due and schedule retry 1', async () => {
      mockPayment.shouldFail = true;

      const sub = await db.getSubscription(tenantId);
      sub!.status = 'active';
      sub!.amount = 499;
      await db.saveSubscription(sub!);

      await db.savePendingJob({
        job_id: 'job-charge-fail-test',
        tenant_id: tenantId,
        type: 'billing_charge_recurring',
        action_id: null,
        run_at: new Date().toISOString(),
        payload: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      await billingScheduler.pollAndExecute();

      const updatedSub = await db.getSubscription(tenantId);
      expect(updatedSub!.status).toBe('past_due');

      const feed = await db.getActivityFeed(tenantId);
      expect(feed.some(f => f.actionType === 'billing_charge_failed')).toBe(true);

      const jobs = await db.getPendingJobs(tenantId);
      const retryJob = jobs.find(j => j.type === 'billing_dunning_retry');
      expect(retryJob).toBeDefined();
      expect(retryJob!.payload.retryCount).toBe(1);
    });

    it('should execute dunning retry successfully, transition to active, and reschedule next charge', async () => {
      const sub = await db.getSubscription(tenantId);
      sub!.status = 'past_due';
      sub!.amount = 499;
      await db.saveSubscription(sub!);

      await db.savePendingJob({
        job_id: 'job-retry-test',
        tenant_id: tenantId,
        type: 'billing_dunning_retry',
        action_id: null,
        run_at: new Date().toISOString(),
        payload: { retryCount: 1 },
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      await billingScheduler.pollAndExecute();

      const updatedSub = await db.getSubscription(tenantId);
      expect(updatedSub!.status).toBe('active');
      expect(updatedSub!.next_charge_at).not.toBeNull();

      const receipts = await db.getReceipts(tenantId);
      expect(receipts.length).toBe(1);
      expect(receipts[0].amount).toBe(499);
      expect(receipts[0].receipt_id).toContain('rcpt-dun');

      const jobs = await db.getPendingJobs(tenantId);
      expect(jobs.some(j => j.type === 'billing_charge_recurring')).toBe(true);
    });

    it('should execute dunning retry failure (retry 1 -> 2): reschedule retry 2', async () => {
      mockPayment.shouldFail = true;

      const sub = await db.getSubscription(tenantId);
      sub!.status = 'past_due';
      sub!.amount = 499;
      await db.saveSubscription(sub!);

      await db.savePendingJob({
        job_id: 'job-retry-fail-test',
        tenant_id: tenantId,
        type: 'billing_dunning_retry',
        action_id: null,
        run_at: new Date().toISOString(),
        payload: { retryCount: 1 },
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      await billingScheduler.pollAndExecute();

      const updatedSub = await db.getSubscription(tenantId);
      expect(updatedSub!.status).toBe('past_due');

      const jobs = await db.getPendingJobs(tenantId);
      const nextRetryJob = jobs.find(j => j.type === 'billing_dunning_retry');
      expect(nextRetryJob).toBeDefined();
      expect(nextRetryJob!.payload.retryCount).toBe(2);
    });

    it('should execute dunning retry failure (retry 3 -> suspend): transition status to suspended', async () => {
      mockPayment.shouldFail = true;

      const sub = await db.getSubscription(tenantId);
      sub!.status = 'past_due';
      sub!.amount = 499;
      await db.saveSubscription(sub!);

      await db.savePendingJob({
        job_id: 'job-retry-fail-3-test',
        tenant_id: tenantId,
        type: 'billing_dunning_retry',
        action_id: null,
        run_at: new Date().toISOString(),
        payload: { retryCount: 3 },
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      await billingScheduler.pollAndExecute();

      const updatedSub = await db.getSubscription(tenantId);
      expect(updatedSub!.status).toBe('suspended');

      const feed = await db.getActivityFeed(tenantId);
      expect(feed.some(f => f.actionType === 'billing_suspended')).toBe(true);

      const jobs = await db.getPendingJobs(tenantId);
      expect(jobs.some(j => j.type === 'billing_dunning_retry')).toBe(false);
    });
  });
});
