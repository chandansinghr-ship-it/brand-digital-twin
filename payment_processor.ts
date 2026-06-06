/**
 * @fileoverview PaymentProcessor interface and MockPaymentProcessor.
 */

import {config} from './config';
import {CredentialVault} from './credential_vault';
import {SupabaseClient} from './supabase_client';

export interface PaymentProcessor {
  createOrder(params: {amount: number; currency: string}): Promise<{orderId: string}>;
  capturePayment(orderId: string, paymentId: string): Promise<{success: boolean}>;
  savePaymentMethod(tenantId: string, tokenId: string): Promise<void>;
  chargeOnFile(tenantId: string, amount: number): Promise<{success: boolean; receiptUrl?: string}>;
}

export class MockPaymentProcessor implements PaymentProcessor {
  shouldFail = false;

  async createOrder(params: {amount: number; currency: string}): Promise<{orderId: string}> {
    return {orderId: `order_${Math.random().toString(36).substring(2, 9)}`};
  }

  async capturePayment(orderId: string, paymentId: string): Promise<{success: boolean}> {
    if (this.shouldFail) return {success: false};
    return {success: true};
  }

  async savePaymentMethod(tenantId: string, tokenId: string): Promise<void> {
    // No-op in mock
  }

  async chargeOnFile(tenantId: string, amount: number): Promise<{success: boolean; receiptUrl?: string}> {
    if (this.shouldFail) {
      return {success: false};
    }
    return {
      success: true,
      receiptUrl: `https://receipts.mock.payment/rcpt_${Math.random().toString(36).substring(2, 9)}`,
    };
  }
}

export class RazorpayPaymentProcessor implements PaymentProcessor {
  constructor(private readonly db: SupabaseClient) {}

  private getAuthHeader(): string {
    const keyId = config.billing.razorpay.keyId;
    const keySecret = config.billing.razorpay.keySecret;
    return 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64');
  }

  async createOrder(params: {amount: number; currency: string}): Promise<{orderId: string}> {
    const url = 'https://api.razorpay.com/v1/orders';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(params.amount * 100), // smallest unit (cents/paise)
        currency: params.currency,
        receipt: `rcpt_${Date.now()}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Razorpay createOrder failed: ${response.statusText}`);
    }
    const data = await response.json() as any;
    return {orderId: data.id};
  }

  async capturePayment(orderId: string, paymentId: string): Promise<{success: boolean}> {
    const paymentUrl = `https://api.razorpay.com/v1/payments/${paymentId}`;
    const payResponse = await fetch(paymentUrl, {
      headers: {'Authorization': this.getAuthHeader()}
    });
    if (!payResponse.ok) return {success: false};
    const payment = await payResponse.json() as any;

    if (payment.status === 'captured') return {success: true};

    const url = `https://api.razorpay.com/v1/payments/${paymentId}/capture`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: payment.amount,
        currency: payment.currency,
      }),
    });

    if (!response.ok) return {success: false};
    const data = await response.json() as any;
    return {success: data.status === 'captured'};
  }

  async savePaymentMethod(tenantId: string, tokenData: string): Promise<void> {
    const vault = new CredentialVault(this.db, config.auth.masterKey);
    await vault.storeSecret(tenantId, 'razorpay', 'customer_token', tokenData);
  }

  async chargeOnFile(tenantId: string, amount: number): Promise<{success: boolean; receiptUrl?: string}> {
    const vault = new CredentialVault(this.db, config.auth.masterKey);
    let tokenDataStr: string | null = null;
    try {
      tokenDataStr = await vault.getSecret(tenantId, 'razorpay', 'customer_token');
    } catch (err) {
      return {success: false};
    }
    if (!tokenDataStr) return {success: false};

    const {customerId, token} = JSON.parse(tokenDataStr) as {
      customerId: string;
      token: string;
    };

    let orderId: string;
    try {
      const order = await this.createOrder({amount, currency: 'USD'});
      orderId = order.orderId;
    } catch (err) {
      return {success: false};
    }

    const url = 'https://api.razorpay.com/v1/payments';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: `billing@tenant-${tenantId}.com`,
        contact: '9999999999',
        amount: Math.round(amount * 100),
        currency: 'USD',
        order_id: orderId,
        customer_id: customerId,
        token: token,
        recurring: 1,
      }),
    });

    if (!response.ok) return {success: false};
    const data = await response.json() as any;
    if (data.status === 'captured') {
      return {
        success: true,
        receiptUrl: `https://dashboard.razorpay.com/payments/${data.id}`,
      };
    }
    return {success: false};
  }
}
