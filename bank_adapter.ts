// Common interface and types for cash balance/statement retrieval adapters.

/**
 * Summary details of a retrieved bank account statement.
 */
export interface BankAccountSummary {
  bankName: string;
  accountNumber: string;
  availableBalance: number;
  currency: string;
  consentId: string;
  lastUpdated: string;
}

/**
 * Standard interface for bank integration statement retrieval adapters.
 */
export interface BankAdapter {
  readonly platform: string;
  readonly schemaVersion: string;
  getConsentedBalances(): Promise<BankAccountSummary[]>;
  calculateRunwayMonths(monthlyBurn: number): Promise<number>;
}
