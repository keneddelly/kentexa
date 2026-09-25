import { ConflictException } from '@nestjs/common';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

describe('origin hub custody intake', () => {
  const hub = { id: 12, businessName: 'Hub', phone: null, address: 'Dar' };
  const parcel = { id: 90, trackingNumber: 'KTX-90', status: ParcelStatus.PENDING, superAgent: hub };
  const context = { roleType: AccountRoleType.SUPER_AGENT, userId: 7, profileId: 12, accountRoleId: 42, workspaceId: 8 };
  const user = { id: 7, name: 'Operator', phone: null };
  const dto = { status: ParcelStatus.RECEIVED_AT_HUB, city: 'Dar' };

  function setup(currentStatus: ParcelStatus = ParcelStatus.PENDING, failTracking = false) {
    const writes: string[] = [];
    const repositories = new Map<any, any>([
      [Parcel, { findOne: jest.fn().mockResolvedValue({ ...parcel, status: currentStatus }), update: jest.fn().mockImplementation(async () => { writes.push('parcel'); }) }],
      [ParcelCustodyEvent, { insert: jest.fn().mockImplementation(async () => { writes.push('custody'); }) }],
      [ParcelTracking, { create: (value: any) => value, save: jest.fn().mockImplementation(async () => {
        if (failTracking) throw new Error('tracking unavailable');
        writes.push('tracking');
      }) }],
    ]);
    const transaction = jest.fn(async (callback: any) => callback({ getRepository: (entity: any) => repositories.get(entity) }));
    const service: any = Object.create(SuperAgentsService.prototype);
    service.parcelRepo = { findOne: jest.fn().mockResolvedValue(parcel), update: jest.fn() };
    service.resolveActingSuperAgent = jest.fn().mockResolvedValue(hub);
    service.dataSource = { transaction };
    service.commerceProfiles = { findForUserByType: jest.fn() };
    service.activityEvents = { record: jest.fn() };
    service.smsService = { sendSms: jest.fn() };
    return { service, writes, transaction };
  }

  it('commits status, custody evidence, and tracking in the same transaction', async () => {
    const { service, writes, transaction } = setup();
    await service.updateParcelStatus(user, parcel.trackingNumber, dto, context);
    expect(writes).toEqual(['parcel', 'custody', 'tracking']);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(service.parcelRepo.update).not.toHaveBeenCalled();
  });

  it('rejects a repeated intake before making writes', async () => {
    const { service, writes } = setup(ParcelStatus.RECEIVED_AT_HUB);
    await expect(service.updateParcelStatus(user, parcel.trackingNumber, dto, context)).rejects.toThrow(ConflictException);
    expect(writes).toEqual([]);
  });

  it('does not run post-commit effects when tracking fails within the transaction', async () => {
    const { service } = setup(ParcelStatus.PENDING, true);
    await expect(service.updateParcelStatus(user, parcel.trackingNumber, dto, context)).rejects.toThrow('tracking unavailable');
    expect(service.activityEvents.record).not.toHaveBeenCalled();
    expect(service.smsService.sendSms).not.toHaveBeenCalled();
  });
});
