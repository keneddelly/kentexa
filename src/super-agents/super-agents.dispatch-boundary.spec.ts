import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { TransportAssignment, AssignmentStatus } from '../transport/entities/transport-assignment.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

describe('single parcel dispatch boundary', () => {
  const user: any = { id: 7, name: 'Hub operator' };
  const hub: any = { id: 3, city: 'Dar', businessName: 'Dar Hub', status: 'active' };
  const context: any = { userId: 7, profileId: 3, roleType: AccountRoleType.SUPER_AGENT };
  const parcel: any = { id: 31, status: ParcelStatus.RECEIVED_AT_HUB,
    trackingNumber: 'KTX-31', superAgent: hub, destinationCity: 'Mwanza',
    buyerPhone: null, order: null, shipment: null, bulkShipmentId: null };
  const assignment: any = { id: 17, assignedById: 7, status: AssignmentStatus.ACCEPTED,
    parcelRefId: null, parcelId: null, shipmentId: null, trackingNumber: null,
    provider: { name: 'Carrier' } };
  let service: any;
  let writes: string[];

  beforeEach(() => {
    writes = [];
    parcel.status = ParcelStatus.RECEIVED_AT_HUB;
    parcel.bulkShipmentId = null;
    assignment.parcelRefId = null;
    assignment.parcelId = null;
    assignment.status = AssignmentStatus.ACCEPTED;
    const parcelRepo = { findOne: jest.fn(async () => parcel),
      update: jest.fn(async () => { writes.push('parcel'); }) };
    const assignmentRepo = { findOne: jest.fn(async () => assignment),
      update: jest.fn(async () => { writes.push('assignment'); }) };
    const trackingRepo = { insert: jest.fn(async () => { writes.push('tracking'); }) };
    const manager: any = { query: jest.fn(async () => [{ id: 31 }]),
      getRepository: (entity: any) => {
        if (entity === Parcel) return parcelRepo;
        if (entity === TransportAssignment) return assignmentRepo;
        if (entity === ParcelTracking) return trackingRepo;
        throw Error('unexpected repository');
      } };
    service = Object.create(SuperAgentsService.prototype);
    service.parcelRepo = parcelRepo;
    service.transportAssignmentRepo = assignmentRepo;
    service.dataSource = { transaction: async (fn: any) => fn(manager) };
    service.assertOwnsParcel = jest.fn(async () => hub);
    service.addTrackingEvent = jest.fn(async () => {});
    service.auditLog = { record: jest.fn(async () => {}) };
    service.smsService = { sendSms: jest.fn(async () => true) };
  });

  it('does not dispatch a parcel already sent or bundled', async () => {
    parcel.status = ParcelStatus.DISPATCHED;
    await expect(service.dispatchParcel(user, 'KTX-31', {}, context)).rejects.toThrow('outside a bulk shipment');
    parcel.status = ParcelStatus.RECEIVED_AT_HUB;
    parcel.bulkShipmentId = 9;
    await expect(service.dispatchParcel(user, 'KTX-31', {}, context)).rejects.toThrow('outside a bulk shipment');
    expect(writes).toEqual([]);
  });

  it('rejects an assignment already linked to another parcel', async () => {
    assignment.parcelRefId = 66;
    await expect(service.dispatchParcel(user, 'KTX-31', { transportAssignmentId: 17 }, context))
      .rejects.toThrow('not accepted for this parcel');
    expect(writes).toEqual([]);
  });

  it('rejects a competing dispatch after locking the parcel', async () => {
    let reads = 0;
    service.parcelRepo.findOne.mockImplementation(async () => {
      reads += 1;
      return reads === 1 ? { ...parcel } : { ...parcel, status: ParcelStatus.DISPATCHED };
    });
    await expect(service.dispatchParcel(user, 'KTX-31', {}, context)).rejects.toThrow('already moved');
    expect(writes).toEqual([]);
  });

  it('writes assignment, parcel and tracking in the same dispatch transaction', async () => {
    await service.dispatchParcel(user, 'KTX-31', { transportAssignmentId: 17 }, context);
    expect(writes).toEqual(['assignment', 'parcel', 'tracking']);
    expect(service.addTrackingEvent).toHaveBeenCalledWith(
      parcel, ParcelStatus.DISPATCHED, 'Dar', expect.any(String), 'Dar Hub',
      expect.any(Object), true,
    );
  });
});
