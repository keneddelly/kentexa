import { of, lastValueFrom } from 'rxjs';
import { CustodyFact, ShipmentState, deriveHolder, deriveShipmentState } from './shipment-projection';
import { ParcelReferenceInterceptor } from './parcel-reference.interceptor';

/**
 * Logistics repair Gate 3 -- the ONE Shipment status projector, as a pure
 * function: every status and timestamp a Shipment can have after "confirmed"
 * follows from the parcel and its custody ledger, and only moves forward.
 */
describe('deriveShipmentState', () => {
  const T0 = new Date('2026-10-07T06:00:00.000Z');
  const at = (minutes: number) => new Date(T0.getTime() + minutes * 60000);
  const NOW = at(600);
  const fact = (eventKind: string, minutes: number, toCustodianType: string | null = null, toCustodianId: number | null = null): CustodyFact =>
    ({ eventKind, recordedAt: at(minutes), toCustodianType, toCustodianId });
  const confirmed: ShipmentState = { status: 'confirmed', collectedAt: null, deliveredAt: null, completedAt: null };
  const derive = (over: Partial<Parameters<typeof deriveShipmentState>[0]>) =>
    deriveShipmentState({ current: confirmed, parcelStatus: 'pending', custody: [], hasOrder: false, orderStatus: null, now: NOW, ...over });

  it('a confirmed Shipment whose parcel has not moved stays confirmed, with no timestamps', () => {
    expect(derive({})).toEqual(confirmed);
  });

  it.each([
    ['an Agent collected it from the sender', 'origin_agent_collected', 'collected_by_agent'],
    ['the origin desk received it', 'origin_hub_received', 'received_at_hub'],
  ])('%s -> collected, timestamped from the custody event', (_label, kind, parcelStatus) => {
    expect(derive({ parcelStatus, custody: [fact(kind, 10)] })).toEqual({
      status: 'collected', collectedAt: at(10), deliveredAt: null, completedAt: null,
    });
  });

  it.each([
    ['loaded on a Run (the parcel row itself does not change)', 'parcel_run_loaded', 'received_at_hub'],
    ['collected by a carrier', 'transport_provider_collected', 'dispatched'],
    ['received at the destination hub', 'destination_hub_received', 'arrived_at_hub'],
    ['out with a delivery Agent', 'destination_agent_received', 'out_for_delivery'],
  ])('%s -> in transit', (_label, kind, parcelStatus) => {
    const state = derive({ parcelStatus, custody: [fact('origin_hub_received', 5), fact(kind, 30)] });
    expect(state.status).toBe('in_transit');
    expect(state.collectedAt).toEqual(at(5));
    expect(state.deliveredAt).toBeNull();
  });

  it.each(['dispatched', 'in_transit', 'transferred_hub', 'arrived_at_hub', 'awaiting_buyer', 'out_for_delivery'])(
    'a legacy path that only set the parcel to %s (no custody event) is still in transit',
    (parcelStatus) => {
      const state = derive({ parcelStatus });
      expect(state.status).toBe('in_transit');
      expect(state.collectedAt).toEqual(NOW); // no evidence of when: the moment it was first observed
    },
  );

  it.each([
    ['handed over by an Agent', 'recipient_agent_delivery', 'delivered'],
    ['collected by the recipient at the hub', 'recipient_self_pickup', 'self_pickup'],
  ])('%s: a Shipment with no Order is delivered AND completed at that instant', (_label, kind, parcelStatus) => {
    expect(derive({ parcelStatus, custody: [fact('origin_hub_received', 5), fact(kind, 90)] })).toEqual({
      status: 'completed', collectedAt: at(5), deliveredAt: at(90), completedAt: at(90),
    });
  });

  it('a Shipment carrying an Order\'s parcel is delivered, and completed only when the Order is', () => {
    const custody = [fact('origin_hub_received', 5), fact('recipient_self_pickup', 90)];
    const delivered = derive({ parcelStatus: 'self_pickup', custody, hasOrder: true, orderStatus: 'delivered' });
    expect(delivered).toEqual({ status: 'delivered', collectedAt: at(5), deliveredAt: at(90), completedAt: null });
    const closed = deriveShipmentState({
      current: delivered, parcelStatus: 'self_pickup', custody, hasOrder: true, orderStatus: 'completed', now: NOW,
    });
    expect(closed).toEqual({ status: 'completed', collectedAt: at(5), deliveredAt: at(90), completedAt: NOW });
  });

  it('never goes backwards: a late "departed" signal after hub receipt changes nothing', () => {
    const current: ShipmentState = { status: 'in_transit', collectedAt: at(5), deliveredAt: null, completedAt: null };
    expect(deriveShipmentState({
      current, parcelStatus: 'received_at_hub', custody: [fact('origin_hub_received', 5)],
      hasOrder: false, orderStatus: null, now: NOW,
    })).toEqual(current);
  });

  it('never rewrites a timestamp once set', () => {
    const current: ShipmentState = { status: 'collected', collectedAt: at(1), deliveredAt: null, completedAt: null };
    const state = deriveShipmentState({
      current, parcelStatus: 'self_pickup',
      custody: [fact('origin_hub_received', 5), fact('recipient_self_pickup', 90)],
      hasOrder: false, orderStatus: null, now: NOW,
    });
    expect(state.collectedAt).toEqual(at(1));
    expect(state.deliveredAt).toEqual(at(90));
  });

  it.each(['pending', 'cancelled'] as const)('never confirms or un-cancels: a %s Shipment is left exactly as it is', (status) => {
    const current: ShipmentState = { status, collectedAt: null, deliveredAt: null, completedAt: null };
    expect(deriveShipmentState({
      current, parcelStatus: 'delivered', custody: [fact('recipient_agent_delivery', 90)],
      hasOrder: false, orderStatus: null, now: NOW,
    })).toBe(current);
  });

  it('a returned or disputed parcel does not invent a Shipment status', () => {
    const current: ShipmentState = { status: 'in_transit', collectedAt: at(5), deliveredAt: null, completedAt: null };
    for (const parcelStatus of ['returned', 'disputed']) {
      expect(deriveShipmentState({ current, parcelStatus, custody: [], hasOrder: false, orderStatus: null, now: NOW })).toEqual(current);
    }
  });
});

describe('deriveHolder — who physically has the parcel', () => {
  const f = (eventKind: string, toCustodianType: string | null, toCustodianId: number | null = null): CustodyFact =>
    ({ eventKind, recordedAt: new Date(), toCustodianType, toCustodianId });
  it('nobody in the network yet: the sender', () => {
    expect(deriveHolder([])).toEqual({ holder: 'sender', holderHubId: null });
  });
  it.each([
    [f('origin_hub_received', 'super_agent', 6), { holder: 'hub', holderHubId: 6 }],
    [f('origin_agent_collected', 'local_agent', 3), { holder: 'agent', holderHubId: null }],
    [f('parcel_run_loaded', 'transport_provider', 9), { holder: 'carrier', holderHubId: null }],
    [f('parcel_run_unloaded', null), { holder: 'carrier', holderHubId: null }], // a claim, not a receipt
    [f('recipient_self_pickup', 'recipient_contact'), { holder: 'recipient', holderHubId: null }],
  ])('the latest custody fact decides: %j', (last, expected) => {
    expect(deriveHolder([f('origin_hub_received', 'super_agent', 1), last])).toEqual(expected);
  });
});

/**
 * One customer tracking number, at every ':trackingNumber' door: the number
 * in the URL is turned into the parcel's own before the handler runs, and
 * the Shipment is re-projected after a successful change.
 */
describe('ParcelReferenceInterceptor', () => {
  const setup = (rows: Record<string, any[]>) => {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      const key = Object.keys(rows).find((k) => sql.includes(k));
      return key ? rows[key] : [];
    });
    const dataSource: any = { query, manager: { query } };
    return { interceptor: new ParcelReferenceInterceptor(dataSource), queries };
  };
  const context = (request: any): any => ({ switchToHttp: () => ({ getRequest: () => request }) });
  const run = async (interceptor: ParcelReferenceInterceptor, request: any) => {
    const seen: string[] = [];
    const next = { handle: () => { seen.push(request.params.trackingNumber); return of({ ok: true }); } };
    await lastValueFrom(interceptor.intercept(context(request), next as any));
    await new Promise((resolve) => setImmediate(resolve)); // the projection runs after the response
    return seen;
  };

  it('a customer number (the Shipment\'s) reaches the handler as the parcel\'s own number', async () => {
    const { interceptor } = setup({ 'AS own': [{ own: null, viaShipment: 'KTX-PCL-9' }] });
    const request = { method: 'GET', params: { trackingNumber: 'KTX-SHP-4' } };
    expect(await run(interceptor, request)).toEqual(['KTX-PCL-9']);
  });

  it('a number a parcel already carries is left exactly as it is', async () => {
    const { interceptor } = setup({ 'AS own': [{ own: 'KTX-ORD-7', viaShipment: 'KTX-OTHER' }] });
    expect(await run(interceptor, { method: 'GET', params: { trackingNumber: 'KTX-ORD-7' } })).toEqual(['KTX-ORD-7']);
  });

  it('an unknown number is passed through for the handler\'s own 404', async () => {
    const { interceptor } = setup({ 'AS own': [{ own: null, viaShipment: null }] });
    expect(await run(interceptor, { method: 'GET', params: { trackingNumber: 'KTX-NOPE-1' } })).toEqual(['KTX-NOPE-1']);
  });

  it('after a successful change the parcel\'s Shipment is projected; a read projects nothing', async () => {
    const rows = {
      'AS own': [{ own: 'KTX-SHP-4', viaShipment: null }],
      '"shipmentId" IS NOT NULL': [{ id: 31 }],
    };
    const read = setup(rows);
    await run(read.interceptor, { method: 'GET', params: { trackingNumber: 'KTX-SHP-4' } });
    expect(read.queries.some((q) => q.includes('"shipmentId" IS NOT NULL'))).toBe(false);

    const write = setup(rows);
    await run(write.interceptor, { method: 'PATCH', params: { trackingNumber: 'KTX-SHP-4' } });
    expect(write.queries.some((q) => q.includes('"shipmentId" IS NOT NULL'))).toBe(true);
    expect(write.queries.some((q) => q.includes('SELECT "shipmentId" FROM public.parcel WHERE id'))).toBe(true);
  });

  it('routes without a tracking number, and a failing lookup, never break the request', async () => {
    const { interceptor } = setup({});
    const plain = { method: 'POST', params: {} as any };
    const next = { handle: () => of('ok') };
    expect(await lastValueFrom(interceptor.intercept(context(plain), next as any))).toBe('ok');

    const failing: any = { query: jest.fn(async () => { throw new Error('db down'); }), manager: { query: jest.fn(async () => { throw new Error('db down'); }) } };
    const broken = new ParcelReferenceInterceptor(failing);
    expect(await run(broken, { method: 'PATCH', params: { trackingNumber: 'KTX-SHP-4' } })).toEqual(['KTX-SHP-4']);
  });
});
