import { PickupTasksService, pickupAcceptedSms } from './pickup-tasks.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

// When an agent accepts a pickup, the sender gets ONE SMS: who is coming and
// their phone. A repeated tap (replay) sends nothing; a failed SMS never undoes
// the accept.
const role: any = { userId: 50, profileId: 5, roleType: AccountRoleType.AGENT };

function service(opts: { taskStatus?: string; taskAgent?: number | null; sms?: any; info?: any }) {
  const em = { query: jest.fn(async (sql: string) => {
    if (/FROM public\.shipment WHERE/.test(sql)) return [{ id: 1, status: 'confirmed', originCity: 'Dar es Salaam' }];
    if (/FROM public\.parcel WHERE/.test(sql)) return [{ id: 2, status: 'pending', shipmentId: 1 }];
    if (/FROM public\.parcel_pickup_task WHERE/.test(sql)) return [{ id: 9, parcelId: 2, status: opts.taskStatus ?? 'requested', agentProfileId: opts.taskAgent ?? null }];
    if (/FROM public\.agent/.test(sql)) return [{ id: 5, city: 'Dar es Salaam', status: 'approved', userId: 50, baseLatitude: -6.8, baseLongitude: 39.28 }];
    return [];
  }) };
  const db = {
    query: jest.fn(async (sql: string) => {
      if (/t\."parcelId",p\."shipmentId"/.test(sql)) return [{ parcelId: 2, shipmentId: 1 }];
      if (/"senderPhone"/.test(sql)) return [opts.info ?? { senderPhone: '255700000001', agentName: 'Juma Ally', agentPhone: '0712345678',
        shipmentNumber: 'KTX-SHP-19', trackingNumber: 'KTX-ORD-9', waybillNumber: null, createdAt: new Date() }];
      return [];
    }),
    transaction: async (fn: any) => fn(em),
  };
  const sms = opts.sms === undefined ? { sendSms: jest.fn(async () => true) } : opts.sms;
  const s = new PickupTasksService(db as any, sms);
  (s as any).logger = { warn: jest.fn() };
  return { s, sms, em };
}

describe('SMS to the sender when an agent accepts', () => {
  it('a fresh accept sends one SMS to the sender with the agent name, phone and "anakuja kuchukua mzigo"', async () => {
    const t = service({});
    await expect(t.s.claim(9, 50, role)).resolves.toEqual({ id: 9, parcelId: 2, status: 'claimed', replay: false });
    expect(t.sms.sendSms).toHaveBeenCalledTimes(1);
    expect(t.sms.sendSms).toHaveBeenCalledWith('255700000001',
      'KenteXa: Wakala Juma Ally, simu 0712345678, anakuja kuchukua mzigo KTX-SHP-19.');
  });

  it('a repeated tap by the same agent (replay) sends nothing', async () => {
    const t = service({ taskStatus: 'claimed', taskAgent: 5 });
    await expect(t.s.claim(9, 50, role)).resolves.toMatchObject({ replay: true });
    expect(t.sms.sendSms).not.toHaveBeenCalled();
  });

  it('a failed SMS never undoes the accept', async () => {
    const t = service({ sms: { sendSms: jest.fn(async () => { throw new Error('gateway down'); }) } });
    await expect(t.s.claim(9, 50, role)).resolves.toMatchObject({ status: 'claimed', replay: false });
  });

  it('no agent phone on file: no SMS (nothing useful to say)', async () => {
    const t = service({ info: { senderPhone: '255700000001', agentName: 'Juma', agentPhone: null, shipmentNumber: 'KTX-SHP-19' } });
    await t.s.claim(9, 50, role);
    expect(t.sms.sendSms).not.toHaveBeenCalled();
  });

  it('the text stays plain (no emoji, curly quotes) and within one SMS part', () => {
    const text = pickupAcceptedSms('Mama “Nuru” — Boda 🛵 Services Limited of Kariakoo', '+255712345678', 'KTX 9815 9515 21');
    expect(text).toMatch(/^[\x20-\x7E]+$/);
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).toContain('anakuja kuchukua mzigo KTX 9815 9515 21.');
  });
});
