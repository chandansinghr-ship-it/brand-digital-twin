import 'jasmine';
import {PlaidAdapter} from './plaid_adapter';

describe('PlaidAdapter', () => {
  const tenantId = 'tenant_plaid_test';

  it('should fetch simulated balances and calculate cash runway correctly', async () => {
    const plaid = new PlaidAdapter('mock_token', tenantId);

    const balances = await plaid.getConsentedBalances();
    expect(balances.length).toBe(2);

    // Chase Checking
    expect(balances[0].bankName).toBe('Chase Bank');
    expect(balances[0].availableBalance).toBe(52000.0);
    expect(balances[0].currency).toBe('USD');

    // SVB Business Money Market
    expect(balances[1].bankName).toBe('Silicon Valley Bank');
    expect(balances[1].availableBalance).toBe(120000.0);
    expect(balances[1].currency).toBe('USD');

    // Total balance = 52000 + 120000 = 172000 USD
    // Burn rate = 40,000 USD per month -> Runway = 172000 / 40000 = 4.3 months
    const runway = await plaid.calculateRunwayMonths(40000);
    expect(runway).toBeCloseTo(4.3, 1);
  });

  it('should return 999 runway months if burn rate is zero or negative', async () => {
    const plaid = new PlaidAdapter('mock_token', tenantId);

    const runwayZero = await plaid.calculateRunwayMonths(0);
    expect(runwayZero).toBe(999);

    const runwayNeg = await plaid.calculateRunwayMonths(-5000);
    expect(runwayNeg).toBe(999);
  });
});
