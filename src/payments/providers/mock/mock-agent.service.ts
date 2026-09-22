import { Injectable, Logger } from '@nestjs/common';
import { IPaymentProvider, PaymentRequest, PaymentResponse, CallbackSignal, ProviderVerification } from '../payment-provider.interface';

/**
 * MOCK payment provider — local/dev testing only, never selectable in
 * production (see payments.service.ts's getProvider()). verifyPayment()
 * intentionally returns NOT_SUPPORTED: the mock has no real transaction
 * store to authoritatively verify against, and per Decision 2, S0 never
 * lets a provider fabricate a SUCCESS from a callback body. The dev-only
 * confirm-now convenience (mockAgentCallback in PaymentsService) instead
 * builds its verification directly from our OWN already-stored Payment
 * amount, not from anything this class returns.
 */
@Injectable()
export class MockAgentService implements IPaymentProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockAgentService.name);

  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    this.logger.log(`[MOCK] USSD push to ${request.phone} for TZS ${request.amount} ref: ${request.reference}`);
    await new Promise((res) => setTimeout(res, 500));
    return {
      success: true,
      providerRequestId: request.reference,
      message: `Payment request sent to ${request.phone}. Approve on your phone.`,
    };
  }

  parseCallbackSignal(body: any): CallbackSignal | null {
    const id = body?.providerRequestId;
    return id ? { providerRequestId: id } : null;
  }

  async verifyPayment(): Promise<ProviderVerification> {
    return { status: 'NOT_SUPPORTED', amountMinor: null, currency: null, providerReference: null };
  }
}
