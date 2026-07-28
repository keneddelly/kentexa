import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  IPaymentProvider,
  PaymentRequest,
  PaymentResponse,
  CallbackResult,
} from '../payment-provider.interface';

@Injectable()
export class VodacomService implements IPaymentProvider {
  private readonly logger = new Logger(VodacomService.name);
  private readonly baseUrl =
    process.env.VODACOM_BASE_URL || 'https://openapi.m-pesa.com/sandbox';

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
    const credentials = Buffer.from(
      `${this.consumerKey}:${this.consumerSecret}`,
    ).toString('base64');

    const response = await axios.get(
      `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${credentials}` } },
    );

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
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        success: true,
        providerRequestId: response.data.output_ConversationID,
        message: 'Payment initiated. Check your phone.',
        raw: response.data,
      };
    } catch (error) {
      this.logger.error('Vodacom payment failed', error?.response?.data);
      return {
        success: false,
        providerRequestId: '',
        message:
          error?.response?.data?.output_ResponseDesc ||
          'Payment initiation failed',
      };
    }
  }

  parseCallback(body: any): CallbackResult {
    const success = body?.output_ResponseCode === 'INS-0';
    return {
      success,
      providerRequestId: body?.output_ConversationID || '',
      providerReference: body?.output_TransactionID,
      failureReason: success ? undefined : body?.output_ResponseDesc,
    };
  }
}
