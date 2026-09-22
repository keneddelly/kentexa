import { SelcomService } from './selcom.service';

const jsonResponse = (body: any, ok = true) => ({ ok, json: async () => body });

describe('SelcomService', () => {
  let service: SelcomService;
  const OLD_ENV = process.env;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      SELCOM_API_KEY: 'key-1',
      SELCOM_API_SECRET: 'secret-1',
      SELCOM_VENDOR_ID: 'VENDOR1',
      SELCOM_API_URL: 'https://selcom.test',
      SELCOM_CALLBACK_URL: 'https://kentexa.test/payments/callback/selcom',
    };
    service = new SelcomService();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });
  afterAll(() => { process.env = OLD_ENV; });

  it('refuses to initiate when not configured', async () => {
    process.env.SELCOM_API_KEY = '';
    const svc = new SelcomService();
    const res = await svc.initiatePayment({ phone: '255700000000', amount: 36000, reference: 'K1', description: 'x' });
    expect(res.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates the order then pushes the wallet PIN prompt, signing each request with the documented Selcom headers', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ reference: '0289999288', resultcode: '000', result: 'SUCCESS' }))
      .mockResolvedValueOnce(jsonResponse({ reference: '0289999288', resultcode: '111', result: 'PENDING', message: 'Request in progress.' }));

    const res = await service.initiatePayment({ phone: '255712345678', amount: 36000, reference: 'K1REF', description: 'deposit' });

    const [createCall, pushCall] = fetchMock.mock.calls;
    expect(createCall[0]).toBe('https://selcom.test/checkout/create-order-minimal');
    const createBody = JSON.parse(createCall[1].body);
    expect(createBody).toMatchObject({ vendor: 'VENDOR1', order_id: 'K1REF', buyer_phone: '255712345678', amount: '36000', currency: 'TZS', no_of_items: 1 });
    expect(createCall[1].headers['Digest-Method']).toBe('HS256');
    expect(createCall[1].headers.Authorization).toBe(`SELCOM ${Buffer.from('key-1').toString('base64')}`);
    expect(createCall[1].headers['Signed-Fields'].split(',')).toEqual(Object.keys(createBody));

    expect(pushCall[0]).toBe('https://selcom.test/checkout/wallet-payment');
    const pushBody = JSON.parse(pushCall[1].body);
    expect(pushBody).toMatchObject({ order_id: 'K1REF', msisdn: '255712345678' });

    expect(res.success).toBe(true);
    expect(res.providerRequestId).toBe('K1REF'); // we always verify by OUR order_id, not any Selcom-generated id
  });

  it('a failed create-order-minimal never reaches the wallet-payment push', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ resultcode: '403', result: 'FAIL', message: 'Invalid vendor' }));
    const res = await service.initiatePayment({ phone: '255712345678', amount: 36000, reference: 'K1', description: 'x' });
    expect(res.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('verifyPayment — the authoritative check', () => {
    it('returns NOT_SUPPORTED when unconfigured', async () => {
      process.env.SELCOM_VENDOR_ID = '';
      const svc = new SelcomService();
      expect((await svc.verifyPayment('K1')).status).toBe('NOT_SUPPORTED');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('GETs order-status signed with Signed-Fields=order_id and maps COMPLETED to SUCCESS', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          resultcode: '000',
          result: 'SUCCESS',
          data: [{ order_id: 'K1REF', amount: '36000', payment_status: 'COMPLETED', transid: 'T1', reference: 'SEL-REF-1' }],
        }),
      );
      const result = await service.verifyPayment('K1REF');
      const [call] = fetchMock.mock.calls;
      expect(call[0]).toContain('/checkout/order-status?');
      expect(call[0]).toContain('order_id=K1REF');
      expect(call[1].headers['Signed-Fields']).toBe('order_id');
      expect(result).toMatchObject({ status: 'SUCCESS', amountMinor: 3600000, currency: 'TZS', providerReference: 'SEL-REF-1' });
    });

    it('maps PENDING/INPROGRESS/CANCELLED/USERCANCELLED/REJECTED correctly and never guesses SUCCESS', async () => {
      const cases: Array<[string, string]> = [
        ['PENDING', 'PENDING'],
        ['INPROGRESS', 'PROCESSING'],
        ['CANCELLED', 'FAILED'],
        ['USERCANCELLED', 'FAILED'],
        ['REJECTED', 'FAILED'],
      ];
      for (const [selcomStatus, expected] of cases) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ resultcode: '000', result: 'SUCCESS', data: [{ payment_status: selcomStatus, amount: '1000' }] }));
        expect((await service.verifyPayment('X')).status).toBe(expected);
      }
    });

    it('a network error is reported as UNKNOWN, never SUCCESS', async () => {
      fetchMock.mockRejectedValueOnce(new Error('down'));
      expect((await service.verifyPayment('X')).status).toBe('UNKNOWN');
    });
  });

  it('parseCallbackSignal extracts only order_id — no success field exists on its return type', () => {
    const signal = service.parseCallbackSignal({ order_id: 'K1REF', result: 'SUCCESS', resultcode: '000', amount: '999999' });
    expect(signal).toEqual({ providerRequestId: 'K1REF' });
    expect(Object.keys(signal as object)).toEqual(['providerRequestId']);
  });
});
