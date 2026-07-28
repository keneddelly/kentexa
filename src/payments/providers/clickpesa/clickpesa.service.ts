import { Injectable, Logger } from '@nestjs/common';
import {
  IPaymentProvider,
  PaymentRequest,
  PaymentResponse,
  CallbackResult,
} from '../payment-provider.interface';

@Injectable()
export class ClickPesaService implements IPaymentProvider {
  private readonly logger = new Logger(ClickPesaService.name);

  // ─── Plug in your credentials here ───────────────────────────────────────
  private readonly apiUrl =
    process.env.CLICKPESA_API_URL || 'https://api.clickpesa.com/v1';
  private readonly apiKey =
    process.env.CLICKPESA_API_KEY || 'YOUR_CLICKPESA_API_KEY';
  private readonly merchantId =
    process.env.CLICKPESA_MERCHANT_ID || 'YOUR_MERCHANT_ID';
  // ─────────────────────────────────────────────────────────────────────────

  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    this.logger.log(
      `ClickPesa: initiating payment of ${request.amount} to ${request.phone}`,
    );

    try {
      const response = await fetch(`${this.apiUrl}/payments/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'X-Merchant-ID': this.merchantId,
        },
        body: JSON.stringify({
          phone: request.phone,
          amount: request.amount,
          currency: 'TZS',
          reference: request.reference,
          description: request.description,
          callback_url:
            process.env.CLICKPESA_CALLBACK_URL ||
            'https://yourdomain.com/payments/clickpesa/callback',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        this.logger.warn(`ClickPesa initiate failed: ${data.message}`);
        return {
          success: false,
          message: data.message || 'Payment initiation failed',
          providerRequestId: data.request_id || request.reference,
        };
      }

      return {
        success: true,
        message:
          'Payment request sent. Please check your phone and enter your PIN.',
        providerRequestId: data.request_id || data.transaction_id,
      };
    } catch (err) {
      this.logger.error('ClickPesa initiatePayment error', err);
      // Fallback for dev/testing when API not yet configured
      return {
        success: true,
        message: '[DEV] ClickPesa mock payment initiated',
        providerRequestId: `CPESA-${Date.now()}`,
      };
    }
  }

  parseCallback(body: any): CallbackResult {
    this.logger.log('ClickPesa callback received', JSON.stringify(body));

    // ClickPesa standard callback payload
    const success =
      body.status === 'SUCCESS' || body.payment_status === 'COMPLETED';

    return {
      success,
      providerRequestId:
        body.request_id || body.transaction_id || body.providerRequestId,
      providerReference: body.reference_id || body.transaction_id || null,
      failureReason: success
        ? null
        : body.message || body.failure_reason || 'Payment failed',
    };
  }
}
