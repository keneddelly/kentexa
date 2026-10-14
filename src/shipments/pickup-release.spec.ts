import { ForbiddenException } from '@nestjs/common';
import {
  PickupReleaseService, pickupAcceptTimeouts, pickupNoAgentSenderSms, pickupReleasedSenderSms, pickupTimedOutAgentSms,
} from './pickup-release.service';

// D2 (owner 2026-10-14): "Siwezi kufika" and the accept timeout.
describe('pickup release', () => {
  it('settings: timeout 45 and reminder 30 by default; reminder always before the timeout', () => {
    expect(pickupAcceptTimeouts({})).toEqual({ timeoutMinutes: 45, reminderMinutes: 30 });
    expect(pickupAcceptTimeouts({ PICKUP_ACCEPT_TIMEOUT_MINUTES: '60', PICKUP_ACCEPT_REMINDER_MINUTES: '40' })).toEqual({ timeoutMinutes: 60, reminderMinutes: 40 });
    expect(pickupAcceptTimeouts({ PICKUP_ACCEPT_TIMEOUT_MINUTES: '20', PICKUP_ACCEPT_REMINDER_MINUTES: '50' })).toEqual({ timeoutMinutes: 20, reminderMinutes: 19 });
    expect(pickupAcceptTimeouts({ PICKUP_ACCEPT_TIMEOUT_MINUTES: '1', PICKUP_ACCEPT_REMINDER_MINUTES: '1' })).toEqual({ timeoutMinutes: 10, reminderMinutes: 5 });
  });

  it('SMS texts: plain characters, one SMS part, no names or phones', () => {
    const ref = 'KTX 1234 5678';
    for (const text of [pickupReleasedSenderSms(ref), pickupTimedOutAgentSms(ref), pickupNoAgentSenderSms(ref, 'O'.repeat(200)), pickupNoAgentSenderSms(ref, null)]) {
      expect(text.length).toBeLessThanOrEqual(160);
      expect(/^[\x20-\x7E]+$/.test(text)).toBe(true);
    }
    expect(pickupReleasedSenderSms(ref)).toBe('KenteXa: Wakala hawezi kufika kuchukua mzigo KTX 1234 5678. Tunatafuta wakala mwingine; tutakujulisha.');
  });

  it('"Siwezi kufika" needs the agent\'s own active agent context', async () => {
    const svc = new PickupReleaseService({} as any);
    await expect(svc.releaseByAgent(1, 5, { userId: 6, roleType: 'agent', profileId: 9 } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.releaseByAgent(1, 5, { userId: 5, roleType: 'buyer', profileId: 9 } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('another tick already running: nothing is reminded or released', async () => {
    const em: any = { query: jest.fn(async () => [{ ok: false }]) };
    const db: any = { transaction: jest.fn(async (cb: any) => cb(em)) };
    expect(await new PickupReleaseService(db).runOnce(new Date(), { timeoutMinutes: 45, reminderMinutes: 30 })).toEqual({ reminded: [], released: [] });
  });
});
