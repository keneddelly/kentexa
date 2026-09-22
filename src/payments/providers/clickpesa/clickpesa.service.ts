import { Injectable, Logger } from '@nestjs/common';
import {
  IPaymentProvider,
  PaymentRequest,
  PaymentResponse,
  CallbackSignal,
  ProviderVerification,
} from '../payment-provider.interface';
import { isCompliantProviderReference } from '../../provider-reference';
import { parseAmountToMinor } from '../../payment-money';

/**
 * ClickPesa Collection API, per docs.clickpesa.com (verified against the
 * published OpenAPI specs, not assumed):
 *   - POST {base}/generate-token          (client-id + api-key headers -> {success, token})
 *   - POST {base}/payments/initiate-ussd-push-request
 *   - GET  {base}/payments/{orderReference}   <- the ONLY authoritative verification path
 *
 * There is no sandbox (docs.clickpesa.com/home/sandbox-and-testing-environment):
 * every call here, even in "test", hits live ClickPesa and moves real money
 * once credentials are configured — this adapter is inert (throws
 * NOT_SUPPORTED-shaped failures) until CLICKPESA_CLIENT_ID/API_KEY are set
 * AND `clickpesa` is in PAYMENTS_ENABLED_PROVIDERS (see payments.module.ts).
 */
@Injectable()
export class ClickPesaService implements IPaymentProvider {
  readonly name = 'clickpesa';
  private readonly logger = new Logger(ClickPesaService.name);
  private readonly apiUrl = process.env.CLICKPESA_API_URL || 'https://api.clickpesa.com/third-parties';

  private cachedToken: { token: string; expiresAt: number } | null = null;

  private get clientId() {
    return process.env.CLICKPESA_CLIENT_ID || '';
  }
  private get apiKey() {
    return process.env.CLICKPESA_API_KEY || '';
  }

  /** Tokens are valid 1h (docs.clickpesa.com/api-reference/authorization/generate-token) — cached with a safety margin so we don't burn the pre-KYC 100-calls/day cap regenerating on every request. */
  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) return this.cachedToken.token;

    const response = await fetch(`${this.apiUrl}/generate-token`, {
      method: 'POST',
      headers: { 'client-id': this.clientId, 'api-key': this.apiKey },
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.token) {
      throw new Error(data.message || 'ClickPesa token generation failed');
    }
    // token already carries the "Bearer " prefix per the docs.
    this.cachedToken = { token: data.token as string, expiresAt: now + 55 * 60 * 1000 };
    return this.cachedToken.token;
  }

  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    if (!this.clientId || !this.apiKey) {
      return { success: false, providerRequestId: request.reference, message: 'ClickPesa is not configured' };
    }
    if (!isCompliantProviderReference(request.reference)) {
      // orderReference: alphanumeric, max 20 chars (mobile-money provider limit) — this must never happen
      // for a reference this codebase generates itself; treat it as a hard initiation failure, not a guess.
      return { success: false, providerRequestId: request.reference, message: 'Invalid ClickPesa order reference' };
    }

    try {
      const token = await this.getToken();
      const response = await fetch(`${this.apiUrl}/payments/initiate-ussd-push-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          amount: String(request.amount),
          currency: 'TZS',
          orderReference: request.reference,
          phoneNumber: request.phone.replace(/^\+/, ''), // "without the plus sign" per the docs
        }),
      });
      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        this.logger.warn(`ClickPesa initiate failed: ${JSON.stringify(data)}`);
        return {
          success: false,
          providerRequestId: request.reference,
          message: data.message || 'Payment initiation failed',
          raw: data,
        };
      }
      // PROCESSING/SUCCESS both mean "accepted, USSD sent" at this point — actual settlement is verifyPayment()'s job.
      return {
        success: ['PROCESSING', 'SUCCESS', 'SETTLED'].includes(data.status),
        providerRequestId: request.reference, // we always verify by OUR orderReference — see verifyPayment()
        message: 'Payment request sent. Please check your phone and enter your PIN.',
        raw: data,
      };
    } catch (err: any) {
      this.logger.error('ClickPesa initiatePayment error', err);
      return {
        success: false,
        providerRequestId: request.reference,
        message: 'ClickPesa is temporarily unavailable. Please try again.',
      };
    }
  }

  /** The webhook body is a SIGNAL ONLY (Decision 3) — extracts orderReference to go verify, nothing more. */
  parseCallbackSignal(body: any): CallbackSignal | null {
    const orderReference = body?.data?.orderReference || body?.orderReference;
    if (!orderReference) return null;
    return { providerRequestId: orderReference };
  }

  /** THE authoritative check: GET /payments/{orderReference} (docs.clickpesa.com/api-reference/collection/querying-for-payments). */
  async verifyPayment(providerRequestId: string): Promise<ProviderVerification> {
    if (!this.clientId || !this.apiKey) {
      return { status: 'NOT_SUPPORTED', amountMinor: null, currency: null, providerReference: null };
    }
    try {
      const token = await this.getToken();
      const response = await fetch(`${this.apiUrl}/payments/${encodeURIComponent(providerRequestId)}`, {
        headers: { Authorization: token },
      });
      if (response.status === 404) {
        return { status: 'UNKNOWN', amountMinor: null, currency: null, providerReference: null };
      }
      const data: any = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data) || data.length === 0) {
        return { status: 'UNKNOWN', amountMinor: null, currency: null, providerReference: null, raw: data };
      }
      // Most recent entry wins if the provider ever returns more than one attempt for the same reference.
      const entry = [...data].sort(
        (a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime(),
      )[0];
      const status: ProviderVerification['status'] =
        entry.status === 'SUCCESS' || entry.status === 'SETTLED'
          ? 'SUCCESS'
          : entry.status === 'FAILED'
            ? 'FAILED'
            : entry.status === 'PROCESSING'
              ? 'PROCESSING'
              : entry.status === 'PENDING'
                ? 'PENDING'
                : 'UNKNOWN';
      return {
        status,
        amountMinor: parseAmountToMinor(entry.collectedAmount),
        currency: entry.collectedCurrency ?? null,
        providerReference: entry.paymentReference ?? entry.id ?? null,
        raw: entry,
      };
    } catch (err: any) {
      this.logger.error('ClickPesa verifyPayment error', err);
      return { status: 'UNKNOWN', amountMinor: null, currency: null, providerReference: null };
    }
  }
}
