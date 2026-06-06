import 'jasmine';
import {ZohoBooksAdapter} from './zoho_books_adapter';
import {QuickBooksAdapter} from './quickbooks_adapter';
import {XeroAdapter} from './xero_adapter';

describe('Accounting Adapters', () => {
  const tenantId = 'test-tenant';

  describe('ZohoBooksAdapter', () => {
    it('should return simulated costs when initialized with mock token', async () => {
      const adapter = new ZohoBooksAdapter('mock_token');
      const costs = await adapter.getUnitCosts(tenantId);
      expect(costs.length).toBe(2);
      expect(costs[0].sku).toBe('sku1');
      expect(costs[0].unitCost).toBe(4.5);
    });
  });

  describe('QuickBooksAdapter', () => {
    it('should return simulated costs when initialized with mock token', async () => {
      const adapter = new QuickBooksAdapter('mock_token', 'mock_realm');
      const costs = await adapter.getUnitCosts(tenantId);
      expect(costs.length).toBe(2);
      expect(costs[0].sku).toBe('sku1');
      expect(costs[0].unitCost).toBe(15.0);
    });
  });

  describe('XeroAdapter', () => {
    it('should return simulated costs when initialized with mock token', async () => {
      const adapter = new XeroAdapter('mock_token', 'mock_xero_tenant');
      const costs = await adapter.getUnitCosts(tenantId);
      expect(costs.length).toBe(2);
      expect(costs[0].sku).toBe('sku1');
      expect(costs[0].unitCost).toBe(10.0);
    });
  });
});
