import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';
import { trustProxyHops } from '../common/trust-proxy';
import { VersionController } from '../version.controller';
import { ContactService } from '../contact/contact.service';
import { AnalyticsController } from '../analytics/analytics.controller';
import { ActivityController } from '../activity/activity.controller';
import { AdminMirrorService } from '../activity/admin-mirror.service';

const PHONE = '255712345678';

const build = (user: any, { smsSent = true } = {}) => {
  const qb: any = { where: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(user) };
  const userRepo: any = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn().mockResolvedValue(user),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const sms: any = { generateOtp: jest.fn(() => '123456'), sendOtp: jest.fn().mockResolvedValue(smsSent) };
  const events: any = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(userRepo, {} as any, sms, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, undefined, events);
  return { service, userRepo, sms, events };
};

const caught = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as any; } throw new Error('expected a failure'); };

describe('issue #361: sign-in for an account that never typed its code', () => {
  it('sends a new code and tells the page to open the code step, saying whether the SMS went out', async () => {
    const { service, sms, events } = build({ id: 5, phone: PHONE, isVerified: false }, { smsSent: false });
    const err = await caught(service.login('0712345678', 'siri123'));
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.getResponse()).toMatchObject({ code: 'ACCOUNT_NOT_VERIFIED', identifier: PHONE, otpSent: false });
    expect(sms.sendOtp).toHaveBeenCalledWith(PHONE, '123456');
    const types = events.record.mock.calls.map((c: any[]) => c[0].eventType);
    expect(types).toEqual(expect.arrayContaining(['OTP_SENT', 'LOGIN_FAILED']));
  });

  it('a wrong password answers INVALID_CREDENTIALS and is measured without the phone number', async () => {
    const { service, events } = build({ id: 5, phone: PHONE, isVerified: true, password: bcrypt.hashSync('sahihi123', 4) });
    const err = await caught(service.login(PHONE, 'si-sahihi'));
    expect(err.getResponse()).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    const failed = events.record.mock.calls.find((c: any[]) => c[0].eventType === 'LOGIN_FAILED')[0];
    expect(failed).toMatchObject({ actorId: 5, metadata: { reason: 'wrong_password' }, visibility: 'system' });
    expect(JSON.stringify(events.record.mock.calls)).not.toContain('712345678');
  });
});

describe('issue #361: code step errors carry a code the page translates', () => {
  it('a wrong code says how many tries are left', async () => {
    const { service, events } = build({ id: 7, phone: PHONE, isVerified: false, otp: '111111', otpAttempts: 1, otpExpiry: new Date(Date.now() + 60000) });
    const err = await caught(service.verifyOtp(PHONE, '222222'));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe('Incorrect OTP. 3 attempts remaining.');
    expect(err.getResponse()).toMatchObject({ code: 'OTP_WRONG', remaining: 3 });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'OTP_FAILED', metadata: { reason: 'wrong', remaining: 3 } }));
  });

  it('an expired code and a used-up code each have their own code', async () => {
    const expired = build({ id: 7, phone: PHONE, isVerified: false, otp: '1', otpAttempts: 0, otpExpiry: new Date(Date.now() - 1000) });
    expect((await caught(expired.service.verifyOtp(PHONE, '1'))).getResponse()).toMatchObject({ code: 'OTP_EXPIRED' });
    const tooMany = build({ id: 7, phone: PHONE, isVerified: false, otp: '1', otpAttempts: 5, otpExpiry: new Date(Date.now() + 1000) });
    expect((await caught(tooMany.service.verifyOtp(PHONE, '1'))).getResponse()).toMatchObject({ code: 'OTP_TOO_MANY' });
  });

  it('a resend records whether the SMS went out', async () => {
    const { service, events } = build({ id: 7, phone: PHONE, isVerified: false }, { smsSent: false });
    expect(await service.resendOtp(PHONE)).toMatchObject({ otpSent: false });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'OTP_SENT', metadata: { purpose: 'resend', channel: 'sms', delivered: false } }));
  });
});

describe('issue #361: "Unahitaji msaada?"', () => {
  it('saves a support request with the phone, step and error, no email needed', async () => {
    const repo: any = { create: jest.fn((x) => x), save: jest.fn(async (x) => ({ id: 3, ...x })) };
    const svc = new ContactService(repo, {} as any);
    expect(await svc.submitHelp({ phone: '0712 345 678', step: 'code', errorCode: 'OTP_EXPIRED', note: 'SMS haifiki' })).toEqual({ ok: true, id: 3 });
    expect(repo.create.mock.calls[0][0]).toMatchObject({
      name: 'Mgeni', email: '', phone: '0712345678', subject: 'Msaada: usajili',
      message: 'Hatua: code\nKosa: OTP_EXPIRED\nMaelezo: SMS haifiki',
    });
    await expect(svc.submitHelp({ phone: '12' })).rejects.toBeInstanceOf(BadRequestException);
    await svc.submitHelp({ phone: '0712345678', step: 'login', errorCode: 'drop table' });
    expect(repo.create.mock.calls[1][0]).toMatchObject({ subject: 'Msaada: kuingia', message: 'Hatua: login' });
  });
});

describe('issue #361: rate limits per person', () => {
  it('trusts Render\'s proxy hop by default, adjustable 0 to 5', () => {
    expect(trustProxyHops(undefined)).toBe(1);
    expect(trustProxyHops('2')).toBe(2);
    expect(trustProxyHops('0')).toBe(0);
    expect(trustProxyHops('9')).toBe(1);
    expect(trustProxyHops('x')).toBe(1);
  });

  it('the admin can see how the server sees their own request', () => {
    const ctl = new ActivityController({} as any, {} as any);
    const out = ctl.requestSource({ ip: '41.59.1.2', ips: ['41.59.1.2'], socket: { remoteAddress: '10.0.0.4' },
      headers: { 'x-forwarded-for': '41.59.1.2' }, app: { get: () => 1 } });
    expect(out).toMatchObject({ ip: '41.59.1.2', remoteAddress: '10.0.0.4', xForwardedFor: '41.59.1.2', trustProxyHops: 1 });
    const pub = new VersionController().requestSource({ ip: '41.59.1.2', headers: { 'x-forwarded-for': '41.59.1.2, 10.0.0.9' }, socket: { remoteAddress: '10.0.0.4' } });
    expect(pub).toMatchObject({ ip: '41.59.1.2', xForwardedFor: '41.59.1.2, 10.0.0.9', remoteAddress: '10.0.0.4' });
  });

  it('analytics arrives in groups of at most 50, each handled like a single event', async () => {
    const service: any = { trackEvent: jest.fn().mockResolvedValue(undefined) };
    const ctl = new AnalyticsController(service);
    const events = Array.from({ length: 60 }, (_, i) => ({ sessionId: 's1', eventType: 'page_view', page: `P${i}` }));
    const res = await ctl.trackEvents({ events: [...events, { nope: 1 }] }, { headers: {}, socket: {} } as any);
    expect(res).toEqual({ ok: true, received: 50 });
    await new Promise((r) => setImmediate(r));
    expect(service.trackEvent).toHaveBeenCalledTimes(50);
  });
});

describe('issue #361: the sign-up journey for the admin', () => {
  it('reads the steps, SMS delivery and failure reasons for 1 to 90 days', async () => {
    const db: any = { query: jest.fn().mockResolvedValue([]) };
    const mirror = new AdminMirrorService(db);
    const out = await mirror.authFunnel(500);
    expect(out).toMatchObject({ days: 90, measuredSince: null, steps: [], otpDelivery: [], failures: [] });
    expect(db.query.mock.calls[0][1]).toEqual(['90']);
  });
});
