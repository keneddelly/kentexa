import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  IPaymentProvider, PaymentRequest,
  PaymentResponse, CallbackResult,
} from '../payment-provider.interface';

@Injectable()
export class AirtelService implements IPaymentProvider {
  private readonly logger = new Logger(AirtelService.name);
  private readonly baseUrl = process.env.AIRTEL_BASE_URL || 'https://openapiuat.airtel.africa';

  private get clientId() { return process.env.AIRTEL_CLIENT_ID; }
  private get clientSecret() { return process.env.AIRTEL_CLIENT_SECRET; }
  private get callbackUrl() { return process.env.AIRTEL_CALLBACK_URL; }

  private async getAccessToken(): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/auth/oauth2/token`,
      {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      },
      { headers: { 'Content-Type': 'application/json' } }
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
          subscriber: {
            country: 'TZ',
            currency: 'TZS',
            msisdn: request.phone,
          },
          transaction: {
            amount: request.amount,
            country: 'TZ',
            currency: 'TZS',
            id: request.reference,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Country': 'TZ',
            'X-Currency': 'TZS',
          },
        }
      );

      return {
        success: true,
        providerRequestId: response.data.data?.transaction?.id || '',
        message: 'Payment initiated. Check your phone.',
        raw: response.data,
      };
    } catch (error) {
      this.logger.error('Airtel payment failed', error?.response?.data);
      return {
        success: false,
        providerRequestId: '',
        message: error?.response?.data?.status?.message || 'Payment initiation failed',
      };
    }
  }

  parseCallback(body: any): CallbackResult {
    const success = body?.status === 'TS';
    return {
      success,
      providerRequestId: body?.transaction?.id || '',
      providerReference: body?.transaction?.airtel_money_id,
      failureReason: success ? undefined : body?.status,
    };
  }
}