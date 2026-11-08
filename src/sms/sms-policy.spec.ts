import { smsAllowed, smsSendAll } from './sms-policy';
import { SmsService } from './sms.service';

// Owner 2026-11-08: "kill SMS for now, only push notifications and phone calling".
describe('SMS budget: codes only by default', () => {
  it('codes always go; everything else only with SMS_SEND_ALL=1', () => {
    expect(smsSendAll({})).toBe(false);
    expect(smsAllowed(true, {})).toBe(true);
    expect(smsAllowed(false, {})).toBe(false);
    expect(smsAllowed(false, { SMS_SEND_ALL: '1' })).toBe(true);
  });

  it('a normal message is not sent (no provider call); a code is', async () => {
    const svc: any = Object.create(SmsService.prototype);
    const send = jest.fn(async () => ({ SMSMessageData: { Recipients: [{ status: 'Success' }] } }));
    Object.assign(svc, { sms: { send }, logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() }, outboundDisabled: false, rehearsalPhone: null, isDev: false, shortCode: null });
    expect(await svc.sendSms('0712345678', 'KenteXa: Oda yako imethibitishwa')).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(await svc.sendSms('0712345678', 'KenteXa: code 123456', true)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
