import { startWalkInClaim } from './shipment-claim-start';
import { claimDigest } from './shipment-claim-crypto';

// A walk-in parcel received at a training office (ofisi ya mafunzo): claiming
// it sends no real SMS; the code SMS comes back as trainingSmsPreview.
const KEY = 'test-hmac-key-0123456789abcdef0123456789';
const SECRET = 'abcd2345efgh';

function fakeManager(training: boolean) {
  const receiptDigest = claimDigest(KEY, 'receipt', 19, SECRET);
  const tx = { query: jest.fn(async (sql: string) => {
    if (/FROM public\.shipment WHERE id/.test(sql)) return [{ id: 19, senderPhone: '0712000111', senderUserId: null, intakeChannel: 'walk_in' }];
    if (/FROM public\."user"/.test(sql)) return [{ id: 50, isVerified: true }];
    if (/FROM public\.shipment_claim_receipt/.test(sql)) return [{ receiptSecretDigest: receiptDigest }];
    if (/count\(\*\)::int/.test(sql)) return [{ count: 0 }];
    return [];
  }) };
  return {
    transaction: async (fn: any) => fn(tx),
    query: jest.fn(async (sql: string) => (/isTrainingOffice/.test(sql) && training ? [{ t: 1 }] : [])),
  };
}
const smsService = () => {
  const { SmsService } = require('../sms/sms.service');
  const s: any = Object.create(SmsService.prototype);
  s.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  s.outboundDisabled = false; s.rehearsalPhone = null;
  s.sms = { send: jest.fn(async () => ({ SMSMessageData: { Recipients: [{ status: 'Success' }] } })) };
  return s;
};

describe('claim code SMS for a training-office parcel', () => {
  const input = { shipmentId: 19, claimantUserId: 50, receiptSecret: SECRET, hmacKey: KEY };

  it('training office parcel: no real SMS, the code SMS is returned for the screen', async () => {
    const sms = smsService();
    const r = await startWalkInClaim(fakeManager(true) as any, sms, input);
    expect(sms.sms.send).not.toHaveBeenCalled();
    expect(r.sent).toBe(true);
    expect(r.trainingSmsPreview).toHaveLength(1);
    expect(r.trainingSmsPreview![0].to).toBe('+255712000111');
    expect(r.trainingSmsPreview![0].text).toMatch(/\d{6}/);
  });

  it('real office parcel: real SMS, nothing extra returned', async () => {
    const sms = smsService();
    await expect(startWalkInClaim(fakeManager(false) as any, sms, input)).resolves.toEqual({ sent: true });
    expect(sms.sms.send).toHaveBeenCalledTimes(1);
  });
});
