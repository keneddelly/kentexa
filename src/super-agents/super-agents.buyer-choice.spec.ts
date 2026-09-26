import { ConflictException, ForbiddenException } from '@nestjs/common';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { Agent, AgentStatus } from '../agents/entities/agent.entity';

describe('recipient destination choices', () => {
  const buyer: any = { id: 7, phone: '255700000007', name: 'Recipient' };
  const fixture = () => ({ id: 31, trackingNumber: 'KTX-31', buyerPhone: buyer.phone,
    status: ParcelStatus.AWAITING_BUYER, buyerRequestedDelivery: null,
    destinationCity: 'Mwanza', destinationSuperAgent: { id: 6 }, order: null });
  function setup(changes: any = {}) {
    const parcel = Object.assign(fixture(), changes);
    const update = jest.fn(async () => {});
    const tracking = jest.fn(async () => {});
    const repos = new Map<any, any>([
      [Parcel, { findOne: jest.fn(async () => parcel), update }],
      [ParcelCustodyEvent, { findOne: jest.fn(async () => ({ toCustodianType: 'super_agent', toCustodianId: 6 })) }],
      [ParcelTracking, { insert: tracking }],
      [Agent, { findOne: jest.fn(async () => ({ id: 12, status: AgentStatus.APPROVED,
        user: { id: 15, phone: null }, fullName: 'Agent', city: 'Mwanza',
        district: null, region: null, deliveryCommission: 1500 })) }],
    ]);
    const manager: any = { query: jest.fn(async () => []), getRepository: (entity: any) => repos.get(entity) };
    const service: any = Object.create(SuperAgentsService.prototype);
    service.dataSource = { transaction: jest.fn(async (fn: any) => fn(manager)) };
    service.smsService = { sendSms: jest.fn() };
    return { service, update, tracking, manager, repos };
  }

  it('saves pickup intent without completing delivery or transferring custody', async () => {
    const { service, update, tracking, manager } = setup();
    await service.buyerSelfPickup(buyer, 'KTX-31');
    expect(manager.query).toHaveBeenCalledWith('SELECT id FROM public.parcel WHERE id=$1 FOR UPDATE', [31]);
    expect(update).toHaveBeenCalledWith(31, { buyerRequestedDelivery: false,
      localAgentId: null, localAgentName: null, claimedAt: null });
    expect(tracking).toHaveBeenCalledWith(expect.objectContaining({ status: ParcelStatus.AWAITING_BUYER }));
  });

  it('rejects someone who only knows the tracking number', async () => {
    const { service, update } = setup();
    await expect(service.buyerSelfPickup({ id: 99, phone: '255700000099' }, 'KTX-31'))
      .rejects.toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a repeat or competing choice', async () => {
    const { service, update } = setup({ buyerRequestedDelivery: false });
    await expect(service.buyerSelfPickup(buyer, 'KTX-31')).rejects.toThrow(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a choice without the receiving hub custody event', async () => {
    const { service, repos, update } = setup();
    repos.get(ParcelCustodyEvent).findOne.mockResolvedValue(null);
    await expect(service.buyerSelfPickup(buyer, 'KTX-31')).rejects.toThrow(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('uses the approved agent fee from the database instead of the submitted amount', async () => {
    const { service, update, tracking } = setup();
    await service.buyerRequestDelivery(buyer, 'KTX-31', { agentId: 12, agreedFee: 1 });
    expect(update).toHaveBeenCalledWith(31, expect.objectContaining({
      buyerRequestedDelivery: true, localAgentId: '15', agreedDeliveryFee: 1500,
    }));
    expect(tracking).toHaveBeenCalledTimes(1);
  });
});
