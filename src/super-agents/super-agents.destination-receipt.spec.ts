import { SuperAgentsService } from './super-agents.service';
import { ParcelStatus } from './entities/parcel.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

describe('destination arrival routes', () => {
  const user: any = { id: 9, name: 'Receiver' };
  const hub: any = { id: 6, userId: 9, status: 'active', city: 'Mwanza', businessName: 'Mwanza Hub' };
  const context: any = { userId: 9, profileId: 6, accountRoleId: 17,
    roleType: AccountRoleType.SUPER_AGENT, workspaceId: null };
  const parcel: any = { id: 31, trackingNumber: 'KTX-31', status: ParcelStatus.IN_TRANSIT,
    destinationCity: 'Mwanza', destinationSuperAgent: null, superAgent: { id: 3 },
    buyerPhone: null, order: null };
  let service: any;

  beforeEach(() => {
    parcel.status = ParcelStatus.IN_TRANSIT;
    parcel.destinationSuperAgent = null;
    service = Object.create(SuperAgentsService.prototype);
    service.parcelRepo = { findOne: async () => parcel, update: jest.fn() };
    service.orderRepo = { update: jest.fn() };
    service.superAgentRepo = { findOne: async () => hub };
    service.agentRepo = { find: async () => [] };
    service.recordDestinationHubReceipt = jest.fn(async () => {});
    service.addTrackingEvent = jest.fn(async () => {});
    service.smsService = { sendSms: jest.fn(async () => true) };
  });

  it('accepts only the active receiving hub and ignores caller-supplied city', async () => {
    await service.updateParcelStatus(user, 'KTX-31', {
      status: ParcelStatus.ARRIVED_AT_HUB, city: 'Dar',
    }, context);
    expect(service.recordDestinationHubReceipt).toHaveBeenCalledWith(
      parcel, hub, user, context, ParcelStatus.ARRIVED_AT_HUB, expect.any(String),
    );
    expect(service.parcelRepo.update).not.toHaveBeenCalled();
    expect(parcel.destinationSuperAgent).toBe(hub);
  });

  it('uses the same receipt transaction for the arrival action and does not separately write the order', async () => {
    await service.confirmShipmentArrived(user, 'KTX-31', { city: 'Dar' }, context);
    expect(service.recordDestinationHubReceipt).toHaveBeenCalledWith(
      parcel, hub, user, context, ParcelStatus.AWAITING_BUYER, expect.any(String),
    );
    expect(service.parcelRepo.update).not.toHaveBeenCalled();
    expect(service.orderRepo.update).not.toHaveBeenCalled();
  });

  it('rejects admin and seller claims of physical hub receipt', async () => {
    await expect(service.confirmShipmentArrived(user, 'KTX-31', {}, {
      ...context, roleType: AccountRoleType.ADMIN,
    })).rejects.toThrow('receiving Super Agent');
    expect(service.recordDestinationHubReceipt).not.toHaveBeenCalled();
  });
});
