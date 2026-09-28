import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

/**
 * Diagnosing the Stage3KR "SMS not arriving on Handset R" report (Issue #60)
 * found that AT's `status: 'Success'` is only PROVIDER ACCEPTANCE, never
 * handset delivery, and the success path silently discarded AT's own
 * messageId/statusCode/cost -- the only forensic trail available today,
 * since neither a delivery-report webhook nor a status-polling call exists
 * in this integration. This spec proves the corrected log line carries that
 * evidence and is worded as acceptance, not delivery, without ever logging
 * the message body itself for a sensitive send.
 */
describe('SmsService — provider-acceptance is not delivery, and its evidence is captured', () => {
  const buildService = () => {
    // Outside the isolated-staging gate entirely, so the real (unreached)
    // AfricasTalking SDK object is constructed and then its `.send` is
    // swapped for a fake -- no network call, no real credentials needed.
    const config = {
      get: (key: string) => ({ AT_API_KEY: 'unit-test-key', AT_USERNAME: 'unit-test-account' } as Record<string, string>)[key],
    } as ConfigService;
    const service = new SmsService(config);
    const send = jest.fn();
    (service as any).sms = { send };
    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => {});
    return { service, send, logSpy };
  };

  it('acceptance is logged with AT\'s own messageId/statusCode/cost, worded as "accepted", never "delivered"', async () => {
    const { service, send, logSpy } = buildService();
    send.mockResolvedValue({
      SMSMessageData: { Recipients: [{ status: 'Success', messageId: 'ATXid_test123', statusCode: 101, cost: 'TZS 1.5000' }] },
    });
    await expect(service.sendSms('+255712000000', 'not shown', true)).resolves.toBe(true);
    const acceptanceLine = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('accepted by provider'));
    expect(acceptanceLine).toBeDefined();
    expect(acceptanceLine).toContain('messageId=ATXid_test123');
    expect(acceptanceLine).toContain('statusCode=101');
    expect(acceptanceLine).toContain('cost=TZS 1.5000');
    expect(acceptanceLine).not.toMatch(/delivered/i);
    expect(acceptanceLine).not.toContain('not shown'); // sensitive body still never logged
  });

  it('never throws when AT omits messageId/statusCode/cost (defensive, unrelated to this diagnosis)', async () => {
    const { service, send, logSpy } = buildService();
    send.mockResolvedValue({ SMSMessageData: { Recipients: [{ status: 'Success' }] } });
    await expect(service.sendSms('+255712000000', 'msg')).resolves.toBe(true);
    const acceptanceLine = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('accepted by provider'));
    expect(acceptanceLine).toContain('messageId=n/a');
  });
});
