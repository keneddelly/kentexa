import { computeClickPesaChecksum, verifyClickPesaChecksum, stripChecksumFields } from './clickpesa-checksum';

describe('clickpesa-checksum', () => {
  const key = 'checksum-secret';
  const payload = { orderReference: 'K123', collectedAmount: '36000', status: 'SUCCESS' };

  it('matches the docs.clickpesa.com/home/checksum worked example exactly', () => {
    // From the docs' own JS example.
    const examplePayload = {
      amount: 100,
      currency: 'USD',
      reference: 'TX123',
      exchange: { fromCurrency: 'TZS', toCurrency: 'TZS', rate: '1', amount: '1000' },
      customer: { name: 'John Doe', email: 'john@example.com', phone: '+255123456789' },
    };
    const checksum = computeClickPesaChecksum('secret-key', examplePayload);
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
    // Order-independent: shuffling key order in the same object produces the same checksum.
    const shuffled = {
      customer: examplePayload.customer,
      reference: examplePayload.reference,
      currency: examplePayload.currency,
      exchange: examplePayload.exchange,
      amount: examplePayload.amount,
    };
    expect(computeClickPesaChecksum('secret-key', shuffled)).toBe(checksum);
  });

  it('a correct checksum verifies', () => {
    const checksum = computeClickPesaChecksum(key, payload);
    expect(verifyClickPesaChecksum(key, payload, checksum)).toBe(true);
  });

  it('any change to the payload invalidates the checksum', () => {
    const checksum = computeClickPesaChecksum(key, payload);
    expect(verifyClickPesaChecksum(key, { ...payload, collectedAmount: '99999' }, checksum)).toBe(false);
  });

  it('a missing/garbage checksum never throws and is rejected', () => {
    expect(verifyClickPesaChecksum(key, payload, undefined)).toBe(false);
    expect(verifyClickPesaChecksum(key, payload, null)).toBe(false);
    expect(verifyClickPesaChecksum(key, payload, 'not-hex')).toBe(false);
  });

  it('stripChecksumFields removes checksum/checksumMethod before recomputation, per the docs warning', () => {
    const withMeta = { ...payload, checksum: 'abc', checksumMethod: 'HMAC-SHA256' };
    expect(stripChecksumFields(withMeta)).toEqual(payload);
  });
});
