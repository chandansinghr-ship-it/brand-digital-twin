import {CostSource, CostSourceProvider} from './cost_source';

export class QuickBooksAdapter implements CostSource {
  readonly provider: CostSourceProvider = 'quickbooks';

  constructor(
    private accessToken: string,
    private realmId: string,
    private quickbooksUrl = 'https://quickbooks.api.intuit.com',
  ) {}

  async getUnitCosts(tenantId: string): Promise<Array<{sku: string; unitCost: number}>> {
    if (this.accessToken.startsWith('mock')) {
      return [
        {sku: 'sku1', unitCost: 15.0},
        {sku: 'sku2', unitCost: 22.5},
      ];
    }

    const query = encodeURIComponent("select * from Item where Type='Inventory'");
    const url = `${this.quickbooksUrl}/v3/company/${this.realmId}/query?query=${query}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`QuickBooks API failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const items = data.QueryResponse?.Item;
    if (!items || !Array.isArray(items)) {
      return [];
    }

    return items
      .filter((item: any) => item.Sku && typeof item.PurchaseCost === 'number')
      .map((item: any) => ({
        sku: item.Sku,
        unitCost: item.PurchaseCost,
      }));
  }
}
