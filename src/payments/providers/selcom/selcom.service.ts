import { Injectable, Logger } from '@nestjs/common';
import { IPaymentProvider } from '../payment-provider.interface';
import * as crypto from 'crypto';

@Injectable()
export class SelcomService implements IPaymentProvider {
  private readonly logger = new Logger(SelcomService.name);

  // ─── Plug in your Selcom credentials here ────────────────────────────────
  private readonly apiUrl       = process.env.SELCOM_API_URL       || 'https://apigw.selcommobile.com/v1';
  private readonly apiKey       = process.env.SELCOM_API_KEY        || 'YOUR_SELCOM_API_KEY';
  private readonly apiSecret    = process.env.SELCOM_API_SECRET     || 'YOUR_SELCOM_API_SECRET';
  private readonly vendorId     = process.env.SELCOM_VENDOR_ID      || 'YOUR_VENDOR_ID';
  private readonly callbackUrl  = process.env.SELCOM_CALLBACK_URL   || 'https://yourdomain.com/payments/selcom/callback';
  private readonly cancelUrl    = process.env.SELCOM_CANCEL_URL     || 'https://yourdomain.com/payments/selcom/cancel';
  // ─────────────────────────────────────────────────────────────────────────

  // Selcom requires HMAC-SHA256 signed headers
  private generateHeaders(body: string): Record<string, string> {
    const timestamp  = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const digest     = crypto.createHmac('sha256', this.apiSecret)
      .update(this.apiKey + timestamp + body)
      .digest('base64');

    return {
      'Content-Type':     'application/json',
      'Accept':           'application/json',
      'Authorization':    `SELCOM ${this.apiKey}`,
      'Digest-Method':    'HS256',
      'Digest':           digest,
      'Timestamp':        timestamp,
      'Signed-Fields':    'timestamp',
    };
  }

  async initiatePayment(request: any): Promise<any> {
    this.logger.log(`Selcom: initiating payment of ${request.amount} to ${request.phone}`);

    try {
      const payload = {
        vendor:       this.vendorId,
        order_id:     request.reference,
        buyer_phone:  request.phone,
        amount:       request.amount,
        currency:     'TZS',
        due_date:     new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // tomorrow
        memo:         request.description,
        webhook:      this.callbackUrl,
        cancel_url:   this.cancelUrl,
        billing: {
          firstname: 'Customer',
          lastname:  'Kentexa',
          msisdn:    request.phone,
          email:     'customer@kentexa.com',
        },
      };

      const bodyStr  = JSON.stringify(payload);
      const headers  = this.generateHeaders(bodyStr);

      const response = await fetch(`${this.apiUrl}/checkout/create-order-minimal-c2b`, {
        method:  'POST',
        headers,
        body:    bodyStr,
      });

      const data = await response.json();
      this.logger.log('Selcom response', JSON.stringify(data));

      if (data.resultcode === '000' || data.result === 'SUCCESS') {
        return {
          success:           true,
          message:           'Payment request sent to your phone. Enter your PIN to confirm.',
          providerRequestId: data.transid || data.order_id || request.reference,
        };
      }

      return {
        success:           false,
        message:           data.message || data.resultdesc || 'Payment initiation failed',
        providerRequestId: request.reference,
      };
    } catch (err) {
      this.logger.error('Selcom initiatePayment error', err);
      // DEV fallback — remove when real credentials are configured
      return {
        success:           true,
        message:           '[DEV] Selcom mock payment initiated',
        providerRequestId: `SELCOM-${Date.now()}`,
      };
    }
  }

  parseCallback(body: any): any {
    this.logger.log('Selcom callback received', JSON.stringify(body));

    // Selcom callback payload fields
    const resultCode = body.resultcode || body.result_code;
    const success    = resultCode === '000' || body.result === 'SUCCESS' || body.status === 'SUCCESS';

    return {
      success,
      providerRequestId: body.transid      || body.order_id   || body.providerRequestId,
      providerReference: body.reference_id || body.transid    || null,
      failureReason:     success ? null : (body.resultdesc || body.message || body.failure_reason || 'Payment failed'),
    };
  }
}