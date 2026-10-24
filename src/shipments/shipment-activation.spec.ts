import { ShipmentActivationService } from './shipment-activation.service';
import { ShipmentHandoffOption } from './entities/shipment.entity';
import { JourneyLegType } from '../transport/entities/journey-selection.entity';

// KNOWN_FAULTS #22: a same-city door booking from the send form must create
// the pickup job and alert the nearest online agents.
const sameCityLegs = [
  { id: 41, type: JourneyLegType.FIRST_MILE, sequence: 1, executionRequirements: { servicePath: 'direct_delivery' } },
  { id: 42, type: JourneyLegType.LAST_MILE, sequence: 2, executionRequirements: { servicePath: 'direct_delivery' } },
];
const intercityLegs = [
  { id: 51, type: JourneyLegType.FIRST_MILE, sequence: 1, executionRequirements: { servicePath: 'door_to_transport' } },
  { id: 52, type: JourneyLegType.TRANSPORT, sequence: 2, executionRequirements: {}, providerId: null, loadRouteStopId: null },
];

function build(opts: { legs: any[]; shipment?: any; user?: any; request?: jest.Mock; dispatch?: jest.Mock }) {
  const shipment = { id: 18, pickupOption: ShipmentHandoffOption.DOOR, journeySelectionId: 17,
    senderName: 'Asha', senderPhone: '255700000001', ...(opts.shipment || {}) };
  const shipments = { confirmShipment: jest.fn(async () => ({ shipment, parcel: { id: 9 } })) };
  const pickupTasks = { requestForShipment: opts.request || jest.fn(async () => ({ id: 77, status: 'requested', replay: false })) };
  const dispatch = { dispatchPickup: opts.dispatch || jest.fn(async () => ({
    taskId: 77, dispatched: 2, candidateAgentIds: [3, 4], candidateDistancesM: [60, 1447], state: 'offered' })) };
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (/waybillNumber/.test(sql)) return [{ waybillNumber: 'KTX9815951521' }];
      if (/FROM public\."user"/.test(sql)) return [opts.user || { name: 'Asha M', phone: '255711000222' }];
      return [];
    }),
    getRepository: () => ({ find: jest.fn(async () => opts.legs) }),
  };
  const svc = new ShipmentActivationService(shipments as any, pickupTasks as any, dispatch as any, dataSource as any);
  (svc as any).logger = { warn: jest.fn() };
  return { svc, pickupTasks, dispatch, dataSource };
}

describe('same-city door booking from the send form (#22)', () => {
  it('creates the pickup job and alerts agents (in-app only); the sender sees only the count', async () => {
    const t = build({ legs: sameCityLegs });
    const r: any = await t.svc.confirmAndActivate(50, 18, {} as any);
    expect(t.pickupTasks.requestForShipment).toHaveBeenCalledWith(50, 18, expect.objectContaining({
      servicePath: 'direct_delivery', pickupContactName: 'Asha', pickupContactPhone: '255700000001',
      requestKey: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/) }));
    expect(t.dispatch.dispatchPickup).toHaveBeenCalledWith(77, { channels: ['in_app'] });
    expect(r.nextAction).toEqual({ type: 'agent_pickup', actor: 'eligible_local_agent', journeyLegId: 41,
      taskId: 77, status: 'requested', custodyStarted: false, agentsAlerted: 2 });
    expect(JSON.stringify(r)).not.toMatch(/candidate/);
    expect(r.parcel.waybillNumber).toBe('KTX9815951521');
  });

  it('the same booking always uses the same request key (a retry gives the same job)', async () => {
    const a = build({ legs: sameCityLegs }); const b = build({ legs: sameCityLegs });
    await a.svc.confirmAndActivate(50, 18, {} as any); await b.svc.confirmAndActivate(50, 18, {} as any);
    const key = (m: jest.Mock) => m.mock.calls[0][2].requestKey;
    expect(key(a.pickupTasks.requestForShipment as jest.Mock)).toBe(key(b.pickupTasks.requestForShipment as jest.Mock));
  });

  it('no online agent: the job still exists and agentsAlerted is 0', async () => {
    const t = build({ legs: sameCityLegs, dispatch: jest.fn(async () => ({ taskId: 77, dispatched: 0, state: 'awaiting_supply' })) });
    const r: any = await t.svc.confirmAndActivate(50, 18, {} as any);
    expect(r.nextAction).toMatchObject({ type: 'agent_pickup', taskId: 77, agentsAlerted: 0 });
  });

  it('an alert failure keeps the job: agentsAlerted 0, booking unharmed', async () => {
    const t = build({ legs: sameCityLegs, dispatch: jest.fn(async () => { throw new Error('engine down'); }) });
    const r: any = await t.svc.confirmAndActivate(50, 18, {} as any);
    expect(r.nextAction).toMatchObject({ type: 'agent_pickup', taskId: 77, agentsAlerted: 0 });
  });

  it('no sender phone on the booking: the logged-in customer phone and name are used', async () => {
    const t = build({ legs: sameCityLegs, shipment: { senderName: '', senderPhone: null } });
    await t.svc.confirmAndActivate(50, 18, {} as any);
    expect(t.pickupTasks.requestForShipment).toHaveBeenCalledWith(50, 18, expect.objectContaining({
      pickupContactName: 'Asha M', pickupContactPhone: '255711000222' }));
  });

  it('job creation refused: the booking stays confirmed and the sender gets the honest "not assigned" answer', async () => {
    const t = build({ legs: sameCityLegs, request: jest.fn(async () => { throw new Error('Pickup contact name and phone are required'); }) });
    const r: any = await t.svc.confirmAndActivate(50, 18, {} as any);
    expect(r.shipment.id).toBe(18);
    expect(r.nextAction).toMatchObject({ type: 'agent_pickup_pending', pickupTaskCreated: false, contact: { kind: 'none' } });
    expect(t.dispatch.dispatchPickup).not.toHaveBeenCalled();
  });

  it('intercity door pickup is unchanged: no job, no alert (later step)', async () => {
    const t = build({ legs: intercityLegs });
    const r: any = await t.svc.confirmAndActivate(50, 18, {} as any);
    expect(t.pickupTasks.requestForShipment).not.toHaveBeenCalled();
    expect(t.dispatch.dispatchPickup).not.toHaveBeenCalled();
    expect(r.nextAction).toMatchObject({ type: 'agent_pickup_pending', pickupTaskCreated: false });
  });
});

// Send form v2 (2026-10-23): an office booking.
describe('office booking from the send form', () => {
  const officeLegs = (pickupBy: 'office' | 'agent') => [
    { id: 61, type: JourneyLegType.FIRST_MILE, sequence: 1, superAgentId: pickupBy === 'office' ? 10 : null,
      executionRequirements: { servicePath: 'office_routed', officeId: 10, pickupBy } },
    { id: 62, type: JourneyLegType.HUB_INTAKE, sequence: 2, superAgentId: 10, executionRequirements: { servicePath: 'office_routed', officeId: 10 } },
    { id: 63, type: JourneyLegType.CUSTOMER_PICKUP, sequence: 3, executionRequirements: { servicePath: 'office_routed' } },
  ];

  it('an agent picks up for the office: the usual hub-routed job to that office', async () => {
    const t = build({ legs: officeLegs('agent'), shipment: { originHubId: 10 } });
    const r: any = await t.svc.confirmAndActivate(50, 18, {} as any);
    expect(t.pickupTasks.requestForShipment).toHaveBeenCalledWith(50, 18, expect.objectContaining({ servicePath: 'hub_routed' }));
    expect(r.nextAction).toMatchObject({ type: 'agent_pickup', taskId: 77, officeId: 10 });
  });

  it('the office collects itself: no agent job; the office gets one SMS', async () => {
    const t = build({ legs: officeLegs('office'), shipment: { originHubId: 10, trackingNumber: 'KTX-SHP-18', pickupLandmark: 'Duka la bluu, Msimbazi', destinationCity: 'Mbeya' } });
    const sms = { sendSms: jest.fn(async () => true) };
    (t.svc as any).sms = sms;
    (t.dataSource.query as jest.Mock).mockImplementation(async (sql: string) => {
      if (/waybillNumber/.test(sql)) return [{ waybillNumber: 'KTX9815951521' }];
      if (/FROM public\.super_agent/.test(sql)) return [{ phone: '255700000010' }];
      return [];
    });
    const r: any = await t.svc.confirmAndActivate(50, 18, {} as any);
    expect(t.pickupTasks.requestForShipment).not.toHaveBeenCalled();
    expect(r.nextAction).toMatchObject({ type: 'office_pickup', officeId: 10, custodyStarted: false });
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    const [phone, text] = (sms.sendSms.mock.calls[0] as unknown) as [string, string];
    expect(phone).toBe('255700000010');
    expect(text).toMatch(/^KenteXa: Mteja amechagua ofisi yako kuchukua mzigo .+ Asha 255700000001, Duka la bluu, Msimbazi\. Kwenda Mbeya\.$/);
    expect(text.length).toBeLessThanOrEqual(160);
  });
});
