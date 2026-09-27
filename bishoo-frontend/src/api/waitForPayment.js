import api from './api';

// The provider webhook is the only authority for success. A client must
// never call the development-only mock confirmation route or assume that
// showing a phone prompt means money was collected.
export async function waitForPayment(providerRequestId, { attempts = 30, intervalMs = 3000 } = {}) {
  if (!providerRequestId) throw new Error('Payment reference is missing');
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await api.get(`/payments/status/${encodeURIComponent(providerRequestId)}`);
    if (response.data?.status === 'success') return;
    if (response.data?.status === 'failed') {
      const error = new Error('Payment failed');
      error.code = 'PAYMENT_FAILED';
      throw error;
    }
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  const error = new Error('Payment confirmation pending');
  error.code = 'PAYMENT_PENDING';
  throw error;
}
