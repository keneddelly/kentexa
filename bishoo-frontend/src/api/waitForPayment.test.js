import api from './api';
import { waitForPayment } from './waitForPayment';

jest.mock('./api', () => ({ get: jest.fn() }));

afterEach(() => jest.clearAllMocks());

test('only a server-confirmed success resolves', async () => {
  api.get.mockResolvedValueOnce({ data: { status: 'pending' } })
    .mockResolvedValueOnce({ data: { status: 'success' } });
  await expect(waitForPayment('provider-ref', { attempts: 2, intervalMs: 0 })).resolves.toBeUndefined();
  expect(api.get).toHaveBeenCalledWith('/payments/status/provider-ref');
});

test('an unconfirmed payment never becomes a success', async () => {
  api.get.mockResolvedValue({ data: { status: 'pending' } });
  await expect(waitForPayment('provider-ref', { attempts: 2, intervalMs: 0 }))
    .rejects.toMatchObject({ code: 'PAYMENT_PENDING' });
});

test('a failed payment reports failure', async () => {
  api.get.mockResolvedValue({ data: { status: 'failed' } });
  await expect(waitForPayment('provider-ref', { attempts: 1 }))
    .rejects.toMatchObject({ code: 'PAYMENT_FAILED' });
});
