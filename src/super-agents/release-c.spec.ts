import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { TransportAssignment } from '../transport/entities/transport-assignment.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { isIntercity, normalizePlace } from './region-match';
import { ShipmentsService } from '../shipments/shipments.service';

describe('region match (C1/C2)', () => {
  it('treats spellings of one region as the same place', () => {
    expect(normalizePlace('Dar-es-Salaam')).toBe('dar es salaam');
    expect(isIntercity('Dar es Salaam', ' dar es salaam ')).toBe(false);
    expect(isIntercity('Mwanza', 'Mkoa wa Mwanza')).toBe(false);
  });
  it('another region is intercity; an unknown place never is', () => {
    expect(isIntercity('Dar es Salaam', 'Katavi')).toBe(true);
    expect(isIntercity('Dar es Salaam', '')).toBe(false);
    expect(isIntercity(null, 'Katavi')).toBe(false);
  });
});

describe('C2: dispatch of an intercity parcel', () => {
  const user: any = { id: 7, name: 'Hub operator' };
  const hub: any = { id: 3, city: 'Dar es Salaam', businessName: 'Dar Hub', status: 'active' };
  const context: any = { userId: 7, profileId: 3, roleType: AccountRoleType.SUPER_AGENT };
  let parcel: any;
  let service: any;
  let writes: string[];

  beforeEach(() => {
    writes = [];
    parcel = { id: 31, status: ParcelStatus.RECEIVED_AT_HUB, trackingNumber: 'KTX-ORD-31', superAgent: hub,
      originCity: 'Dar es Salaam', destinationCity: 'Katavi', buyerPhone: null, order: null, shipment: null,
      bulkShipmentId: null };
    const parcelRepo = { findOne: jest.fn(async () => parcel), update: jest.fn(async () => { writes.push('parcel'); }) };
    const trackingRepo = { insert: jest.fn(async () => { writes.push('tracking'); }) };
    const manager: any = { query: jest.fn(async (sql: string) => (/parcel_pickup_task/.test(sql) ? [] : [{ id: 31 }])),
      getRepository: (entity: any) => {
        if (entity === Parcel) return parcelRepo;
        if (entity === ParcelTracking) return trackingRepo;
        if (entity === TransportAssignment) return { findOne: jest.fn(), update: jest.fn() };
        throw Error('unexpected repository');
      } };
    service = Object.create(SuperAgentsService.prototype);
    service.parcelRepo = parcelRepo;
    service.agentRepo = { findOne: jest.fn(async () => ({ id: 5, fullName: 'Boda', user: { id: 50 } })) };
    service.superAgentRepo = { findOne: jest.fn(async () => null) };
    service.dataSource = { transaction: async (fn: any) => fn(manager), query: async () => [] };
    service.assertOwnsParcel = jest.fn(async () => hub);
    service.addTrackingEvent = jest.fn(async () => {});
    service.auditLog = { record: jest.fn(async () => {}) };
    service.smsService = { sendSms: jest.fn(async () => true) };
  });

  it('refuses a local agent of the sending city, and writes nothing', async () => {
    await expect(service.dispatchParcel(user, 'KTX-ORD-31', { localAgentId: 5, busCompany: 'Shabiby' }, context))
      .rejects.toThrow('hakitumwi kwa wakala wa mtaa');
    expect(writes).toEqual([]);
  });

  it('refuses a dispatch with no bus, courier or arranged transport', async () => {
    await expect(service.dispatchParcel(user, 'KTX-ORD-31', { transportType: 'bus', busCompany: '  ', courierName: '' }, context))
      .rejects.toThrow('Weka jina la basi au courier');
    expect(writes).toEqual([]);
  });

  it('a bus company is enough', async () => {
    const result = await service.dispatchParcel(user, 'KTX-ORD-31', { transportType: 'bus', busCompany: 'Shabiby Line' }, context)
      .catch((e: Error) => e);
    expect(String((result as any)?.message ?? '')).not.toMatch(/wakala wa mtaa|Weka jina la basi/);
  });

  it('a same-city parcel may still go with a local agent', async () => {
    parcel.destinationCity = 'Dar-es-Salaam';
    const result = await service.dispatchParcel(user, 'KTX-ORD-31', { localAgentId: 5 }, context).catch((e: Error) => e);
    expect(String((result as any)?.message ?? '')).not.toMatch(/wakala wa mtaa|Weka jina la basi/);
  });
});

describe('claim by the number on the receipt (Release C, option a)', () => {
  const svc: any = Object.create(ShipmentsService.prototype);
  beforeEach(() => {
    svc.shipmentRepo = { manager: { query: jest.fn(async (_sql: string, params: any[]) => (
      params[0] === 'KTX9815951521' || params[1] === 'KTX-ORD-129' ? [{ id: 77 }] : []
    )) } };
  });
  it('finds the shipment from the waybill as printed, with spaces', async () => {
    await expect(svc.resolveClaimShipmentId(' ktx 9815 9515 21 ')).resolves.toBe(77);
  });
  it('finds it from an old KTX-ORD number too', async () => {
    await expect(svc.resolveClaimShipmentId('ktx-ord-129')).resolves.toBe(77);
  });
  it('old receipts with a plain shipment id still work', async () => {
    await expect(svc.resolveClaimShipmentId('123')).resolves.toBe(123);
  });
  it('an unknown number gets the same answer as a wrong secret', async () => {
    await expect(svc.resolveClaimShipmentId('KTX-ORD-999')).rejects.toThrow('Invalid claim credentials');
  });
  it('the printed secret (groups of four) is read back as issued', () => {
    expect(ShipmentsService.normalizeClaimSecret('0123 4567 89AB-cdef')).toBe('0123456789abcdef');
  });
});
