export interface PaymentRequest {
  phone: string;
  /** The server-derived amount to collect (decimal TZS) — see order-payment-obligation.ts. Never a frontend value. */
  amount: number;
  /** Our own reference. Callers are responsible for making it provider-compliant (see each provider's own limits). */
  reference: string;
  description: string;
}

export interface PaymentResponse {
  success: boolean;
  providerRequestId: string;
  message: string;
  raw?: any;
}

/**
 * S0 — Decision 3 ("callback is a signal, not proof"): a webhook body only
 * ever tells us WHICH transaction to go check. It carries no authority of
 * its own; that is why this type has no `success`/`amount`/`status` field.
 */
export interface CallbackSignal {
  providerRequestId: string;
}

export type ProviderVerificationStatus =
  | 'SUCCESS'
  | 'PENDING'
  | 'PROCESSING'
  | 'FAILED'
  | 'UNKNOWN'
  /** The provider cannot be asked (no authoritative query endpoint implemented/verified) — always fails closed. */
  | 'NOT_SUPPORTED';

/**
 * The one authoritative shape a provider can hand back. Money fields are
 * pre-parsed to integer minor units (payment-money.ts) right here at the
 * provider boundary, so nothing downstream ever compares a raw provider
 * string against a DB decimal.
 */
export interface ProviderVerification {
  status: ProviderVerificationStatus;
  amountMinor: number | null;
  currency: string | null;
  providerReference: string | null;
  raw?: unknown;
}

export interface IPaymentProvider {
  readonly name: string;
  initiatePayment(request: PaymentRequest): Promise<PaymentResponse>;
  /** Extracts ONLY the identifier to re-check. Never returns/implies success. */
  parseCallbackSignal(body: any): CallbackSignal | null;
  /**
   * THE authoritative check (Decision 2/3): always queries the provider's
   * own status/query API using our credentials. A provider with no
   * verified query contract must return NOT_SUPPORTED — never fabricate a
   * SUCCESS from the callback body.
   */
  verifyPayment(providerRequestId: string): Promise<ProviderVerification>;
}
