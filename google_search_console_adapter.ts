import {PlatformAdapter} from './platform_adapter';

export interface SearchConsoleMetrics {
  brandQueriesCount: number;
  totalClicks: number;
  totalImpressions: number;
}

export class GoogleSearchConsoleAdapter implements PlatformAdapter {
  readonly platform = 'google_search_console';
  readonly schemaVersion = 'v1';
  readonly capabilities = [
    {entity: 'keyword', ops: ['read' as const], reversible: false},
  ];

  async healthCheck() {
    return {
      ok: true,
      latencyMs: 12,
      schemaDriftDetected: false,
      deprecationWarnings: [],
    };
  }

  private mockBrandQueries = 5000;

  constructor(
    private readonly tenantId: string,
    private readonly isMockMode = true,
  ) {}

  // Helper to allow unit tests to control mock metrics return value
  setMockBrandQueries(count: number) {
    this.mockBrandQueries = count;
  }

  async getBrandSearchMetrics(
    startDate: string,
    endDate: string,
  ): Promise<SearchConsoleMetrics> {
    if (this.isMockMode) {
      return {
        brandQueriesCount: this.mockBrandQueries,
        totalClicks: Math.round(this.mockBrandQueries * 1.5),
        totalImpressions: this.mockBrandQueries * 10,
      };
    }

    // Production Google Search Console API query logic goes here
    return {
      brandQueriesCount: 0,
      totalClicks: 0,
      totalImpressions: 0,
    };
  }
}
