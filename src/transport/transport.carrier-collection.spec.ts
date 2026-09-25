import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TransportService } from './transport.service';
import { AssignmentStatus } from './entities/transport-assignment.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { Parcel, ParcelStatus, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { TransportAssignment } from './entities/transport-assignment.entity';
import { TransportProvider, ProviderStatus } from './entities/transport-provider.entity';

describe('carrier collection custody boundary', () => {
  const caller: any = { id: 44 };
  const context: any = { userId: 44, roleType: AccountRoleType.TRANSPORT_PROVIDER,
    accountRoleId: 70, profileId: 11, businessId: null, workspaceId: null };
  const assignment = () => ({ id: 8, parcelRefId: 2, parcelId: 2, providerId: 11,
    assignedById: 30, trackingNumber: 'KTX-2', status: AssignmentStatus.ACCEPTED });
  const parcel = () => ({ id: 2, status: ParcelStatus.READY_FOR_DISPATCH,
    trackingNumber: 'KTX-2', originCity: 'Dar', superAgent: { id: 3, userId: 30 } });
  function setup(overrides: { lastCustody?: any; failTracking?: boolean; parcel?: any } = {}) {
    const current = assignment();
    const custody = overrides.lastCustody === undefined
      ? { toCustodianType: 'super_agent', toCustodianId: 3 } : overrides.lastCustody;
    const writes: string[] = [];
    const repos = new Map<any, any>([
      [TransportAssignment, { findOne: jest.fn(async () => current), save: jest.fn(async (row) => { writes.push('assignment'); return row; }) }],
      [TransportProvider, { findOne: jest.fn(async () => ({ id: 11, userId: 44, businessId: null, status: ProviderStatus.VERIFIED, name: 'Carrier' })) }],
      [Parcel, { findOne: jest.fn(async () => overrides.parcel ?? parcel()), update: jest.fn(async () => { writes.push('parcel'); }) }],
      [ParcelCustodyEvent, { findOne: jest.fn(async () => custody), insert: jest.fn(async () => { writes.push('custody'); }) }],
      [ParcelTracking, { insert: jest.fn(async () => {
        if (overrides.failTracking) throw Error('tracking unavailable');
        writes.push('tracking');
      }) }],
    ]);
    const manager: any = { query: jest.fn(async () => []), getRepository: (entity: any) => repos.get(entity) };
    const dataSource: any = { transaction: jest.fn(async (fn) => fn(manager)) };
    const noop: any = {};
    const service = new TransportService(noop, noop, noop, repos.get(TransportAssignment),
      noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, dataSource);
    return { service, writes, manager, dataSource, current, repos };
  }

  it('requires the assigned provider role even when an admin requests collected', async () => {
    const { service, dataSource } = setup();
    await expect(service.updateAssignmentStatus(caller, 8, { status: AssignmentStatus.COLLECTED },
      { ...context, roleType: AccountRoleType.ADMIN })).rejects.toThrow(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('records carrier custody, parcel progress and tracking in the same transaction', async () => {
    const { service, writes, manager, repos } = setup();
    await service.updateAssignmentStatus(caller, 8, { status: AssignmentStatus.COLLECTED }, context);
    expect(manager.query.mock.calls.map(([sql]: [string]) => sql)).toEqual([
      'SELECT id FROM public.parcel WHERE id=$1 FOR UPDATE',
      'SELECT id FROM public.transport_assignment WHERE id=$1 FOR UPDATE',
    ]);
    expect(writes).toEqual(['custody', 'parcel', 'tracking', 'assignment']);
    expect(repos.get(ParcelCustodyEvent).insert).toHaveBeenCalledWith(
      expect.objectContaining({ actorSource: 'account_role', actorProviderId: null,
        toCustodianType: 'transport_provider', toCustodianId: 11 }),
    );
  });

  it('rejects collection without an origin hub custody event', async () => {
    const { service, writes } = setup({ lastCustody: null });
    await expect(service.updateAssignmentStatus(caller, 8, { status: AssignmentStatus.COLLECTED }, context))
      .rejects.toThrow(ConflictException);
    expect(writes).toEqual([]);
  });

  it('propagates a tracking failure so the transaction can roll back', async () => {
    const { service, dataSource } = setup({ failTracking: true });
    await expect(service.updateAssignmentStatus(caller, 8, { status: AssignmentStatus.COLLECTED }, context))
      .rejects.toThrow('tracking unavailable');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});
