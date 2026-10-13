import { PickupTasksService, pickupCancelledSms } from './pickup-tasks.service';

// Review D3: when the sender cancels a pickup an agent had already accepted,
// the agent gets one in-app message and one SMS. Nobody is told otherwise.
function service(task: { status: string; agentProfileId: number | null }, opts: { smsThrows?: boolean } = {}) {
  const em = { query: jest.fn(async (sql: string) => {
    if (/FROM public\.shipment WHERE id/.test(sql)) return [{ id: 1, requestedByUserId: 50 }];
    if (/FROM public\.parcel WHERE "shipmentId"/.test(sql)) return [{ id: 2 }];
    if (/FROM public\.parcel_pickup_task WHERE "parcelId"/.test(sql)) return [{ id: 9, ...task }];
    return [];
  }) };
  const db = {
    transaction: async (fn: any) => fn(em),
    query: jest.fn(async () => [{ userId: 70, agentPhone: '0712345678', shipmentNumber: 'KTX-SHP-19',
      trackingNumber: 'KTX-ORD-9', waybillNumber: null, createdAt: new Date() }]),
  };
  const sms = { sendSms: jest.fn(async () => { if (opts.smsThrows) throw new Error('gateway down'); return true; }) };
  const communication = { dispatch: jest.fn(async () => undefined) };
  const s = new PickupTasksService(db as any, sms as any, communication as any);
  (s as any).logger = { warn: jest.fn() };
  return { s, sms, communication, em };
}

describe('cancel after an agent accepted (review D3)', () => {
  it('the agent gets one in-app message and one SMS', async () => {
    const t = service({ status: 'claimed', agentProfileId: 5 });
    await expect(t.s.cancel(50, 1)).resolves.toEqual({ id: 9, parcelId: 2, status: 'cancelled', replay: false });
    expect(t.communication.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'LOGISTICS_PICKUP_CANCELLED', sourceId: 9,
      recipients: [expect.objectContaining({ userId: 70, role: 'agent' })],
      context: expect.objectContaining({ reference: 'KTX-SHP-19' }) }));
    expect(t.sms.sendSms).toHaveBeenCalledTimes(1);
    expect(t.sms.sendSms).toHaveBeenCalledWith('0712345678', 'KenteXa: Kazi ya kuchukua mzigo KTX-SHP-19 imesitishwa na mtumaji. Usiende kuchukua.');
  });

  it('not yet accepted: nobody to tell', async () => {
    const t = service({ status: 'requested', agentProfileId: null });
    await t.s.cancel(50, 1);
    expect(t.communication.dispatch).not.toHaveBeenCalled();
    expect(t.sms.sendSms).not.toHaveBeenCalled();
  });

  it('cancelling again (replay) sends nothing', async () => {
    const t = service({ status: 'cancelled', agentProfileId: 5 });
    await expect(t.s.cancel(50, 1)).resolves.toMatchObject({ replay: true });
    expect(t.sms.sendSms).not.toHaveBeenCalled();
  });

  it('a failed SMS never undoes the cancel', async () => {
    const t = service({ status: 'claimed', agentProfileId: 5 }, { smsThrows: true });
    await expect(t.s.cancel(50, 1)).resolves.toMatchObject({ status: 'cancelled', replay: false });
    expect(t.em.query.mock.calls.some(([sql]: any) => /SET status='cancelled'/.test(sql))).toBe(true);
  });

  it('the SMS is plain text, one part', () => {
    const text = pickupCancelledSms('KTX 9815 9515 21');
    expect(text).toMatch(/^[\x20-\x7E]+$/);
    expect(text.length).toBeLessThanOrEqual(160);
  });
});
