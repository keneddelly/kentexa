import { Injectable, Logger } from '@nestjs/common';
import {
  IPaymentProvider,
  PaymentRequest,
  PaymentResponse,
  CallbackResult,
} from '../payment-provider.interface';

/**
 * MOCK AGENT PAYMENT PROVIDER
 * Simulates mobile money USSD push for agent payments.
 * When real API is ready:
 *   - Replace initiatePayment() with real API call
 *   - Replace parseCallback() with real callback parsing
 *   - Everything else stays the same
 */
@Injectable()
export class MockAgentService implements IPaymentProvider {
  private readonly logger = new Logger(MockAgentService.name);

  async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
    this.logger.log(
      `[MOCK] USSD push to ${request.phone} for TZS ${request.amount} ref: ${request.reference}`,
    );

    // Simulate network delay
    await new Promise((res) => setTimeout(res, 500));

    // Mock always succeeds — replace with real API call when ready
    return {
      success: true,
      providerRequestId: `MOCK-${request.reference}-${Date.now()}`,
      message: `Payment request sent to ${request.phone}. Approve on your phone.`,
    };
  }

  parseCallback(body: any): CallbackResult {
    // Replace with real callback parsing when API is ready
    return {
      success: body?.status === 'SUCCESS',
      providerRequestId: body?.providerRequestId || '',
      providerReference: body?.transactionId,
      failureReason: body?.reason,
    };
  }
}
