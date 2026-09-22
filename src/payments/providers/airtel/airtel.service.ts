import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { IPaymentProvider, PaymentRequest, PaymentResponse, CallbackSignal, ProviderVerification } from '../payment-provider.interface';

/**
 * S0: no authoritative, verified query/status-check contract has been
 * established for Airtel Money in this codebase (see the S0 pre-
 * implementation verification report). Per Decision 2, an unverified
 * provider must fail closed rather than trust its callback body — so
 * verifyPayment() always returns NOT_SUPPORTED here, and this provider is
 * excluded from PAYMENTS_ENABLED_PROVIDERS by default. initiatePayment() is
 * left implemented (unreachable while disabled) for when a verified
 * contract is added in a future stage.
 */
@Injectable()
export class AirtelService implements IPaymentProvider {
  readonly name = 'airtel';
  private readonly logger = new Logger(AirtelService.name);
  private readonly baseUrl = process.env.AIRTEL_BASE_URL || 'https://openapiuat.airtel.africa';

  private get clientId() {
    return process.env.AIRTEL_CLIENT_ID;
  }
  private get clientSecret() {
    return process.env.AIRTEL_CLIENT_SECRET;
  }

  private async getAccessToken(): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/auth/oauth2/token`,
      { client_id: this.clientId, client_secret: this.clientSecret, grant_type: 'client_credentials' },
      { headers: { 'Content-Type': 'application/json' } },
    );
    return response.data.access_token;
  }

  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const token = await this.getAccessToken();
      const response = await axios.post(
        `${this.baseUrl}/merchant/v1/payments/`,
        {
          reference: request.reference,
          subscriber: { country: 'TZ', currency: 'TZS', msisdn: request.phone },
          transaction: { amount: request.amount, country: 'TZ', currency: 'TZS', id: request.reference },
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Country': 'TZ', 'X-Currency': 'TZS' } },
      );
      return {
        success: true,
        providerRequestId: response.data.data?.transaction?.id || request.reference,
        message: 'Payment initiated. Check your phone.',
        raw: response.data,
      };
    } catch (error: any) {
      this.logger.error('Airtel payment failed', error?.response?.data);
      return { success: false, providerRequestId: request.reference, message: error?.response?.data?.status?.message || 'Payment initiation failed' };
    }
  }

  parseCallbackSignal(body: any): CallbackSignal | null {
    const id = body?.transaction?.id;
    return id ? { providerRequestId: id } : null;
  }

  async verifyPayment(): Promise<ProviderVerification> {
    return { status: 'NOT_SUPPORTED', amountMinor: null, currency: null, providerReference: null };
  }
}
