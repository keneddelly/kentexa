export interface PaymentRequest {
  phone: string;
  amount: number;
  reference: string;
  description: string;
}

export interface PaymentResponse {
  success: boolean;
  providerRequestId: string;
  message: string;
  raw?: any;
}

export interface CallbackResult {
  success: boolean;
  providerRequestId: string;
  providerReference?: string;
  failureReason?: string;
}

export interface IPaymentProvider {
  initiatePayment(request: PaymentRequest): Promise<PaymentResponse>;
  parseCallback(body: any): CallbackResult;
}