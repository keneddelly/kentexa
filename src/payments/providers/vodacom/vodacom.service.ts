import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { IPaymentProvider, PaymentRequest, PaymentResponse, CallbackSignal, ProviderVerification } from '../payment-provider.interface';

/**
 * S0: no authoritative, verified query/status-check contract has been
 * established for Vodacom M-Pesa in this codebase (see the S0 pre-
 * implementation verification report). Per Decision 2, an unverified
 * provider must fail closed rather than trust its callback body — so
 * verifyPayment() always returns NOT_SUPPORTED here, and this provider is
 * excluded from PAYMENTS_ENABLED_PROVIDERS by default. initiatePayment() is
 * left implemented (unreachable while disabled) for when a verified
 * contract is added in a future stage.
 */
@Injectable()
export class VodacomService implements IPaymentProvider {
  readonly name = 'vodacom';
  private readonly logger = new Logger(VodacomService.name);
  private readonly baseUrl = process.env.VODACOM_BASE_URL || 'https://openapi.m-pesa.com/sandbox';

  private get consumerKey() {
    return process.env.VODACOM_CONSUMER_KEY;
  }
  private get consumerSecret() {
    return process.env.VODACOM_CONSUMER_SECRET;
  }
  private get shortcode() {
    return process.env.VODACOM_SHORTCODE;
  }
  private get callbackUrl() {
    return process.env.VODACOM_CALLBACK_URL;
  }

  private async getAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    return response.data.access_token;
  }

  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const token = await this.getAccessToken();
      const response = await axios.post(
        `${this.baseUrl}/ipg/v2/vodacomTZN/c2bPayment/singleStage/`,
        {
          input_Amount: request.amount,
          input_Country: 'TZN',
          input_Currency: 'TZS',
          input_CustomerMSISDN: request.phone,
          input_ServiceProviderCode: this.shortcode,
          input_ThirdPartyConversationID: request.reference,
          input_TransactionReference: request.reference,
          input_PurchasedItemsDesc: request.description,
          input_CallbackURL: this.callbackUrl,
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      return {
        success: true,
        providerRequestId: response.data.output_ConversationID || request.reference,
        message: 'Payment initiated. Check your phone.',
        raw: response.data,
      };
    } catch (error: any) {
      this.logger.error('Vodacom payment failed', error?.response?.data);
      return { success: false, providerRequestId: request.reference, message: error?.response?.data?.output_ResponseDesc || 'Payment initiation failed' };
    }
  }

  parseCallbackSignal(body: any): CallbackSignal | null {
    const id = body?.output_ConversationID;
    return id ? { providerRequestId: id } : null;
  }

  async verifyPayment(): Promise<ProviderVerification> {
    return { status: 'NOT_SUPPORTED', amountMinor: null, currency: null, providerReference: null };
  }
}
