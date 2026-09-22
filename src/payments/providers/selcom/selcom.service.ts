import { Injectable, Logger } from '@nestjs/common';
import { IPaymentProvider, PaymentRequest, PaymentResponse, CallbackSignal, ProviderVerification } from '../payment-provider.interface';
import { signSelcomRequest, fieldsFromBody } from './selcom-signing';
import { parseAmountToMinor } from '../../payment-money';
import * as crypto from 'crypto';

/**
 * Selcom Checkout API, per developers.selcommobile.com (verified against
 * the published API reference, not assumed):
 *   - POST /v1/checkout/create-order-minimal   (creates the order on Selcom's side)
 *   - POST /v1/checkout/wallet-payment          (pushes the USSD PIN prompt)
 *   - GET  /v1/checkout/order-status            <- the ONLY authoritative verification path
 *
 * Documented limitation, accepted explicitly (see the S0 pre-implementation
 * verification report): order-status never echoes a currency field. We
 * always create the order ourselves with currency=TZS on a single-currency
 * TZS merchant account, so verifyPayment() reports 'TZS' rather than a
 * genuinely ambiguous null — there is nothing else the order could be.
 */
@Injectable()
export class SelcomService implements IPaymentProvider {
  readonly name = 'selcom';
  private readonly logger = new Logger(SelcomService.name);
  private readonly apiUrl = process.env.SELCOM_API_URL || 'https://apigw.selcommobile.com/v1';

  private get apiKey() {
    return process.env.SELCOM_API_KEY || '';
  }
  private get apiSecret() {
    return process.env.SELCOM_API_SECRET || '';
  }
  private get vendorId() {
    return process.env.SELCOM_VENDOR_ID || '';
  }
  private get webhookUrl() {
    return process.env.SELCOM_CALLBACK_URL || '';
  }

  private isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret && this.vendorId);
  }

  private async signedRequest(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
    const fields = fieldsFromBody(body ?? {});
    const { headers } = signSelcomRequest(this.apiKey, this.apiSecret, fields);
    const url = method === 'GET' && body ? `${this.apiUrl}${path}?${new URLSearchParams(body as any).toString()}` : `${this.apiUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers,
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    });
    const data: any = await response.json().catch(() => ({}));
    return { response, data };
  }

  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    if (!this.isConfigured()) {
      return { success: false, providerRequestId: request.reference, message: 'Selcom is not configured' };
    }
    try {
      // 1) Create the order on Selcom's side — fields per the Checkout API's
      // "Create Order - Minimal" JSON payload parameters table.
      const orderBody = {
        vendor: this.vendorId,
        order_id: request.reference,
        buyer_email: 'customer@kentexa.com',
        buyer_name: 'Kentexa Customer',
        buyer_phone: request.phone,
        amount: String(request.amount),
        currency: 'TZS',
        no_of_items: 1,
        webhook: this.webhookUrl ? Buffer.from(this.webhookUrl).toString('base64') : undefined,
      };
      const created = await this.signedRequest('POST', '/checkout/create-order-minimal', orderBody);
      const createOk = created.data.resultcode === '000' || created.data.result === 'SUCCESS';
      if (!createOk) {
        this.logger.warn(`Selcom create-order-minimal failed: ${JSON.stringify(created.data)}`);
        return {
          success: false,
          providerRequestId: request.reference,
          message: created.data.message || created.data.resultdesc || 'Payment initiation failed',
          raw: created.data,
        };
      }

      // 2) Push the wallet PIN prompt — order-status is what we actually verify against afterwards.
      const transid = `TXN${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const pushed = await this.signedRequest('POST', '/checkout/wallet-payment', {
        transid,
        order_id: request.reference,
        msisdn: request.phone,
      });
      const pushOk = ['000', '111'].includes(pushed.data.resultcode) || ['SUCCESS', 'PENDING'].includes(pushed.data.result);
      return {
        success: pushOk,
        providerRequestId: request.reference, // we always verify by OUR order_id — see verifyPayment()
        message: pushOk
          ? 'Payment request sent to your phone. Enter your PIN to confirm.'
          : pushed.data.message || 'Payment initiation failed',
        raw: pushed.data,
      };
    } catch (err: any) {
      this.logger.error('Selcom initiatePayment error', err);
      return { success: false, providerRequestId: request.reference, message: 'Selcom is temporarily unavailable. Please try again.' };
    }
  }

  /** The webhook body is a SIGNAL ONLY (Decision 3) — extracts order_id to go verify, nothing more. */
  parseCallbackSignal(body: any): CallbackSignal | null {
    const orderId = body?.order_id;
    if (!orderId) return null;
    return { providerRequestId: orderId };
  }

  /** THE authoritative check: GET /v1/checkout/order-status?order_id=<our reference>. */
  async verifyPayment(providerRequestId: string): Promise<ProviderVerification> {
    if (!this.isConfigured()) {
      return { status: 'NOT_SUPPORTED', amountMinor: null, currency: null, providerReference: null };
    }
    try {
      const { response, data } = await this.signedRequest('GET', '/checkout/order-status', { order_id: providerRequestId });
      if (!response.ok || !(data.resultcode === '000' || data.result === 'SUCCESS') || !Array.isArray(data.data) || data.data.length === 0) {
        return { status: 'UNKNOWN', amountMinor: null, currency: null, providerReference: null, raw: data };
      }
      const entry = data.data[0];
      // payment_status: PENDING, COMPLETED, CANCELLED, USERCANCELLED, REJECTED, INPROGRESS
      const status: ProviderVerification['status'] =
        entry.payment_status === 'COMPLETED'
          ? 'SUCCESS'
          : entry.payment_status === 'INPROGRESS'
            ? 'PROCESSING'
            : entry.payment_status === 'PENDING'
              ? 'PENDING'
              : ['CANCELLED', 'USERCANCELLED', 'REJECTED'].includes(entry.payment_status)
                ? 'FAILED'
                : 'UNKNOWN';
      return {
        status,
        amountMinor: parseAmountToMinor(entry.amount),
        // Selcom's order-status never returns a currency field (documented gap) — our own account/order is TZS-only.
        currency: 'TZS',
        providerReference: entry.reference ?? entry.transid ?? null,
        raw: entry,
      };
    } catch (err: any) {
      this.logger.error('Selcom verifyPayment error', err);
      return { status: 'UNKNOWN', amountMinor: null, currency: null, providerReference: null };
    }
  }
}
