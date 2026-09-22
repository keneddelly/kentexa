import { buildSigningString, signSelcomRequest, fieldsFromBody, isoTimestamp } from './selcom-signing';
import * as crypto from 'crypto';

describe('selcom-signing', () => {
  it('buildSigningString puts timestamp first, always, even if not passed as a field', () => {
    const s = buildSigningString('2026-01-01T00:00:00Z', [['order_id', '123'], ['amount', '5000']]);
    expect(s).toBe('timestamp=2026-01-01T00:00:00Z&order_id=123&amount=5000');
  });

  it('isoTimestamp produces a valid ISO-8601 string with a TZD', () => {
    const ts = isoTimestamp(new Date('2026-03-04T05:06:07.000Z'));
    expect(ts).toBe('2026-03-04T05:06:07Z');
  });

  it('signSelcomRequest builds the exact documented headers: Authorization=SELCOM<base64 key>, Digest-Method=HS256, Digest=base64(hmac), Signed-Fields=csv in order', () => {
    const { headers } = signSelcomRequest('MYKEY', 'MYSECRET', [['order_id', '123']], new Date('2026-01-01T00:00:00.000Z'));
    expect(headers.Authorization).toBe(`SELCOM ${Buffer.from('MYKEY').toString('base64')}`);
    expect(headers['Digest-Method']).toBe('HS256');
    expect(headers['Signed-Fields']).toBe('order_id');
    expect(headers.Timestamp).toBe('2026-01-01T00:00:00Z');

    const expectedDigest = crypto
      .createHmac('sha256', 'MYSECRET')
      .update('timestamp=2026-01-01T00:00:00Z&order_id=123')
      .digest('base64');
    expect(headers.Digest).toBe(expectedDigest);
  });

  it('changing the secret, any field value, or the timestamp changes the digest', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const base = signSelcomRequest('K', 'SECRET', [['order_id', '123']], now).headers.Digest;
    expect(signSelcomRequest('K', 'OTHER_SECRET', [['order_id', '123']], now).headers.Digest).not.toBe(base);
    expect(signSelcomRequest('K', 'SECRET', [['order_id', '999']], now).headers.Digest).not.toBe(base);
    expect(signSelcomRequest('K', 'SECRET', [['order_id', '123']], new Date('2026-01-02T00:00:00Z')).headers.Digest).not.toBe(base);
  });

  it('fieldsFromBody preserves insertion order and stringifies non-string values', () => {
    const fields = fieldsFromBody({ order_id: '123', amount: 5000, currency: 'TZS' });
    expect(fields).toEqual([['order_id', '123'], ['amount', '5000'], ['currency', 'TZS']]);
  });
});
