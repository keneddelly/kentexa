import { lastValueFrom, of, defer } from 'rxjs';
import { SmsService } from '../sms/sms.service';
import { captureTrainingSms, runAsTrainingOffice } from './training-mode';
import { TrainingModeInterceptor } from './training-mode.interceptor';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

// Training office ("ofisi ya mafunzo"): no real SMS; the text comes back with
// the response as trainingSmsPreview and is shown on screen.
const smsService = () => {
  const s: any = Object.create(SmsService.prototype);
  s.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  s.outboundDisabled = false; s.rehearsalPhone = null;
  s.sms = { send: jest.fn(async () => ({ SMSMessageData: { Recipients: [{ status: 'Success' }] } })) };
  return s as SmsService & { sms: { send: jest.Mock } };
};

describe('training office SMS', () => {
  it('outside training mode nothing is captured', () => {
    expect(captureTrainingSms('+255700000001', 'x')).toBe(false);
  });

  it('inside training mode SmsService sends nothing, records the text, and reports "sent"', async () => {
    const sms = smsService();
    const previews = await runAsTrainingOffice(async (p) => {
      await new Promise((r) => setTimeout(r, 5));            // async work keeps the training context
      expect(await sms.sendSms('0712345678', 'KenteXa: Mzigo KTX 9815 9515 21 umepokelewa.')).toBe(true);
      return p;
    });
    expect(sms.sms.send).not.toHaveBeenCalled();
    expect(previews).toEqual([{ to: '+255712345678', text: 'KenteXa: Mzigo KTX 9815 9515 21 umepokelewa.' }]);
  });

  it('a normal office still sends real SMS', async () => {
    const sms = smsService();
    expect(await sms.sendSms('0712345678', 'hello')).toBe(true);
    expect(sms.sms.send).toHaveBeenCalledTimes(1);
  });

  const ctx = (roleContext: any) => ({ getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ roleContext }) }) }) as any;
  const interceptor = (training: boolean) => new TrainingModeInterceptor({ query: jest.fn(async () => [{ isTrainingOffice: training }]) } as any);
  const office = { roleType: AccountRoleType.SUPER_AGENT, profileId: 7 };

  it('a training office request: the handler SMS is captured and returned as trainingSmsPreview', async () => {
    const sms = smsService();
    const handler = { handle: () => defer(async () => { await sms.sendSms('0712345678', 'SMS ya mpokeaji'); return { ok: true }; }) };
    const body = await lastValueFrom(interceptor(true).intercept(ctx(office), handler));
    expect(body).toEqual({ ok: true, trainingSmsPreview: [{ to: '+255712345678', text: 'SMS ya mpokeaji' }] });
    expect(sms.sms.send).not.toHaveBeenCalled();
  });

  it('a real office request is untouched (real SMS, no preview)', async () => {
    const sms = smsService();
    const handler = { handle: () => defer(async () => { await sms.sendSms('0712345678', 'real'); return { ok: true }; }) };
    expect(await lastValueFrom(interceptor(false).intercept(ctx(office), handler))).toEqual({ ok: true });
    expect(sms.sms.send).toHaveBeenCalledTimes(1);
  });

  it('non-office requests skip the lookup entirely', async () => {
    const i = interceptor(true);
    const body = await lastValueFrom(i.intercept(ctx({ roleType: AccountRoleType.BUYER, profileId: 1 }), { handle: () => of({ a: 1 }) }));
    expect(body).toEqual({ a: 1 });
    expect((i as any).db.query).not.toHaveBeenCalled();
  });
});
