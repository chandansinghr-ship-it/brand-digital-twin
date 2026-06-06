import {CostSource, CostSourceProvider} from './cost_source';

export class XeroAdapter implements CostSource {
  readonly provider: CostSourceProvider = 'xero';

  constructor(
    private accessToken: string,
    private tenantId: string,
    private xeroUrl = 'https://api.xero.com/api.xro/2.0',
  ) {}

  async getUnitCosts(tenantId: string): Promise<Array<{sku: string; unitCost: number}>> {
    if (this.accessToken.startsWith('mock')) {
      return [
        {sku: 'sku1', unitCost: 10.0},
        {sku: 'sku2', unitCost: 18.5},
      ];
    }

    const url = `${this.xeroUrl}/Items`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'xero-tenant-id': this.tenantId,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Xero API failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const items = data.Items;
    if (!items || !Array.isArray(items)) {
      return [];
    }

    return items
      .filter((item: any) => item.Code && item.PurchaseDetails && typeof item.PurchaseDetails.UnitPrice === 'number')
      .map((item: any) => ({
        sku: item.Code,
        unitCost: item.PurchaseDetails.UnitPrice,
      }));
  }
}
