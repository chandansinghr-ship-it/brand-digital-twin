import {CostSource, CostSourceProvider} from './cost_source';

export class ZohoBooksAdapter implements CostSource {
  readonly provider: CostSourceProvider = 'zoho';

  constructor(
    private accessToken: string,
    private zohoUrl = 'https://books.zoho.com/api/v3',
    private organizationId = 'mock_org',
  ) {}

  async getUnitCosts(tenantId: string): Promise<Array<{sku: string; unitCost: number}>> {
    if (this.accessToken.startsWith('mock')) {
      return [
        {sku: 'sku1', unitCost: 4.5},
        {sku: 'sku2', unitCost: 8.0},
      ];
    }

    const url = `${this.zohoUrl}/items?organization_id=${this.organizationId}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Zoho Books API failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items
      .filter((item: any) => item.sku && typeof item.purchase_rate === 'number')
      .map((item: any) => ({
        sku: item.sku,
        unitCost: item.purchase_rate,
      }));
  }
}
