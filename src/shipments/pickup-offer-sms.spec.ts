import { PickupOfferSmsService, pickupOfferSms, pickupOfferSmsConfig } from './pickup-offer-sms.service';

// Job offer by SMS (owner 2026-10-14): nearest 1-3 agents, waybill + area only.
describe('pickup offer SMS', () => {
  it('settings: defaults 3 agents after 2 minutes; clamped to 0..3 and 0..60; 0 agents = off', () => {
    expect(pickupOfferSmsConfig({})).toEqual({ agents: 3, delayMinutes: 2 });
    expect(pickupOfferSmsConfig({ PICKUP_OFFER_SMS_AGENTS: '1', PICKUP_OFFER_SMS_DELAY_MINUTES: '5' })).toEqual({ agents: 1, delayMinutes: 5 });
    expect(pickupOfferSmsConfig({ PICKUP_OFFER_SMS_AGENTS: '9', PICKUP_OFFER_SMS_DELAY_MINUTES: '999' })).toEqual({ agents: 3, delayMinutes: 60 });
    expect(pickupOfferSmsConfig({ PICKUP_OFFER_SMS_AGENTS: '-2', PICKUP_OFFER_SMS_DELAY_MINUTES: 'abc' })).toEqual({ agents: 0, delayMinutes: 2 });
  });

  it('the text: waybill and area only, plain characters, one SMS part', () => {
    const text = pickupOfferSms('KTX 1234 5678', 'Kariakoo', 'Dar es Salaam');
    expect(text).toBe('KenteXa: Kazi mpya ya kuchukua mzigo KTX 1234 5678, eneo Kariakoo, kwenda Dar es Salaam. Fungua KenteXa ukubali kazi.');
    const longest = pickupOfferSms('KTX 1234 5678', 'A'.repeat(200), 'B'.repeat(200));
    expect(longest.length).toBeLessThanOrEqual(160);
    expect(/^[\x20-\x7E]+$/.test(longest)).toBe(true);
  });

  it('off (0 agents) or no SMS service: nothing is read or sent', async () => {
    const db: any = { transaction: jest.fn() };
    expect(await new PickupOfferSmsService(db, { sendSms: jest.fn() } as any).runOnce(new Date(), { agents: 0, delayMinutes: 2 }))
      .toEqual({ sent: 0, failed: 0, skipped: 'off' });
    expect(await new PickupOfferSmsService(db).runOnce(new Date(), { agents: 3, delayMinutes: 2 })).toMatchObject({ skipped: 'off' });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('another tick already running: this one skips', async () => {
    const em: any = { query: jest.fn(async () => [{ ok: false }]) };
    const db: any = { transaction: jest.fn(async (cb: any) => cb(em)) };
    const sms: any = { sendSms: jest.fn() };
    expect(await new PickupOfferSmsService(db, sms).runOnce(new Date(), { agents: 3, delayMinutes: 2 }))
      .toEqual({ sent: 0, failed: 0, skipped: 'another_tick_running' });
    expect(sms.sendSms).not.toHaveBeenCalled();
  });
});
