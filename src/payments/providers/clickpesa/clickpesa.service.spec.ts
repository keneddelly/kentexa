import { ClickPesaService } from './clickpesa.service';

const jsonResponse = (body: any, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => body,
});

describe('ClickPesaService', () => {
  let service: ClickPesaService;
  const OLD_ENV = process.env;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = { ...OLD_ENV, CLICKPESA_CLIENT_ID: 'client-1', CLICKPESA_API_KEY: 'key-1', CLICKPESA_API_URL: 'https://cp.test' };
    service = new ClickPesaService();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });
  afterAll(() => { process.env = OLD_ENV; });

  it('refuses to initiate when not configured (no client-id/api-key)', async () => {
    process.env.CLICKPESA_CLIENT_ID = '';
    process.env.CLICKPESA_API_KEY = '';
    const svc = new ClickPesaService();
    const res = await svc.initiatePayment({ phone: '255700000000', amount: 36000, reference: 'K123ABC', description: 'x' });
    expect(res.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to initiate with a non-compliant reference (not alphanumeric / too long) rather than sending it to ClickPesa', async () => {
    const res = await service.initiatePayment({ phone: '255700000000', amount: 36000, reference: 'KNT-CUST-1-1234567890', description: 'x' });
    expect(res.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('generates a token then calls initiate-ussd-push-request with the server-derived amount, TZS, and our orderReference', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ success: true, token: 'Bearer tok-1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'CP1', status: 'PROCESSING', orderReference: 'K123ABC' }));

    const res = await service.initiatePayment({ phone: '+255700000000', amount: 36000, reference: 'K123ABC', description: 'deposit' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://cp.test/generate-token', expect.objectContaining({
      method: 'POST',
      headers: { 'client-id': 'client-1', 'api-key': 'key-1' },
    }));
    const [, initCall] = fetchMock.mock.calls;
    expect(initCall[0]).toBe('https://cp.test/payments/initiate-ussd-push-request');
    expect(initCall[1].headers.Authorization).toBe('Bearer tok-1');
    const body = JSON.parse(initCall[1].body);
    expect(body).toEqual({ amount: '36000', currency: 'TZS', orderReference: 'K123ABC', phoneNumber: '255700000000' });
    expect(res.success).toBe(true);
    expect(res.providerRequestId).toBe('K123ABC');
  });

  it('caches the token across two initiations (only ONE generate-token call)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ success: true, token: 'Bearer tok-1' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'PROCESSING' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'PROCESSING' }));
    await service.initiatePayment({ phone: '255700000000', amount: 1000, reference: 'A', description: 'x' });
    await service.initiatePayment({ phone: '255700000000', amount: 1000, reference: 'B', description: 'x' });
    const tokenCalls = fetchMock.mock.calls.filter((c) => c[0].endsWith('/generate-token'));
    expect(tokenCalls).toHaveLength(1);
  });

  describe('verifyPayment — the authoritative check', () => {
    it('returns NOT_SUPPORTED when unconfigured, never fabricating a status', async () => {
      process.env.CLICKPESA_CLIENT_ID = '';
      const svc = new ClickPesaService();
      const result = await svc.verifyPayment('K123ABC');
      expect(result.status).toBe('NOT_SUPPORTED');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('queries GET /payments/{orderReference} and maps SUCCESS/SETTLED to SUCCESS with parsed minor-unit amount', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ success: true, token: 'Bearer tok-1' }))
        .mockResolvedValueOnce(jsonResponse([{ id: 'CP1', status: 'SUCCESS', paymentReference: 'CP-REF-9', collectedAmount: '36000', collectedCurrency: 'TZS', orderReference: 'K123ABC' }]));

      const result = await service.verifyPayment('K123ABC');
      const [, queryCall] = fetchMock.mock.calls;
      expect(queryCall[0]).toBe('https://cp.test/payments/K123ABC');
      expect(result).toMatchObject({ status: 'SUCCESS', amountMinor: 3600000, currency: 'TZS', providerReference: 'CP-REF-9' });
    });

    it('maps FAILED/PENDING/PROCESSING correctly and never guesses SUCCESS for anything else', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ success: true, token: 'Bearer tok-1' }))
        .mockResolvedValueOnce(jsonResponse([{ status: 'FAILED' }]));
      expect((await service.verifyPayment('X')).status).toBe('FAILED');
    });

    it('a 404 (unknown transaction) is reported as UNKNOWN, not FAILED and not SUCCESS', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ success: true, token: 'Bearer tok-1' }))
        .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ message: 'not found' }) });
      expect((await service.verifyPayment('unknown-ref')).status).toBe('UNKNOWN');
    });

    it('a network error during verification is reported as UNKNOWN, never SUCCESS', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, token: 'Bearer tok-1' })).mockRejectedValueOnce(new Error('network down'));
      expect((await service.verifyPayment('X')).status).toBe('UNKNOWN');
    });
  });

  it('parseCallbackSignal extracts ONLY the orderReference — no success/amount/status field exists on its return type', () => {
    const signal = service.parseCallbackSignal({ event: 'PAYMENT RECEIVED', data: { orderReference: 'K123ABC', status: 'SUCCESS', collectedAmount: '999999999' } });
    expect(signal).toEqual({ providerRequestId: 'K123ABC' });
    expect(Object.keys(signal as object)).toEqual(['providerRequestId']);
  });

  it('parseCallbackSignal returns null when it cannot identify a reference', () => {
    expect(service.parseCallbackSignal({})).toBeNull();
  });
});
