import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SuperAgentsService } from './super-agents.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

// KNOWN_FAULTS #15: a walk-in receipt must be re-openable at any time, and
// re-opening must never create or charge anything.
describe('re-open a walk-in receipt', () => {
  const user: any = { id: 9 };
  const ownHub: any = { id: 3, userId: 9 };
  const context: any = { userId: 9, roleType: AccountRoleType.SUPER_AGENT };
  const snapshot = {
    success: true, orderId: 41, trackingNumber: 'KTX-ORD-41', receiptNumber: 'RCP-0041',
    receipt: { receiptNumber: 'RCP-0041', parcelReference: 'KTX-ORD-41', amountPaid: 15000 },
    billing: { isFreeOrder: true },
  };
  let parcel: any;
  let service: any;

  beforeEach(() => {
    parcel = { id: 31, trackingNumber: 'KTX-ORD-41', waybillNumber: 'KTX9584287081',
      superAgent: { id: 3 }, order: { id: 41, offlineReceiptSnapshot: { ...snapshot } } };
    service = Object.create(SuperAgentsService.prototype);
    service.parcelRepo = { findOne: jest.fn(async () => parcel), update: jest.fn(), save: jest.fn() };
    service.orderRepo = { update: jest.fn(), save: jest.fn() };
    service.dataSource = { query: jest.fn(), transaction: jest.fn() };
    service.smsService = { sendSms: jest.fn() };
    service.resolveActingSuperAgent = jest.fn(async () => ownHub);
  });

  it('returns the saved receipt to the hub that registered the parcel, with the waybill', async () => {
    const result = await service.getParcelReceipt(user, 'KTX-ORD-41', context);
    expect(result).toMatchObject({ ...snapshot, waybillNumber: 'KTX9584287081', reopened: true });
    expect(service.parcelRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { trackingNumber: 'KTX-ORD-41' } }));
  });

  it('writes nothing, sends nothing, charges nothing', async () => {
    await service.getParcelReceipt(user, 'KTX-ORD-41', context);
    expect(service.parcelRepo.update).not.toHaveBeenCalled();
    expect(service.parcelRepo.save).not.toHaveBeenCalled();
    expect(service.orderRepo.update).not.toHaveBeenCalled();
    expect(service.orderRepo.save).not.toHaveBeenCalled();
    expect(service.dataSource.query).not.toHaveBeenCalled();
    expect(service.dataSource.transaction).not.toHaveBeenCalled();
    expect(service.smsService.sendSms).not.toHaveBeenCalled();
  });

  it('refuses another office', async () => {
    service.resolveActingSuperAgent = jest.fn(async () => ({ id: 77 }));
    await expect(service.getParcelReceipt(user, 'KTX-ORD-41', context))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an admin (active admin role) open any receipt', async () => {
    service.resolveActingSuperAgent = jest.fn(async () => null);
    await expect(service.getParcelReceipt(user, 'KTX-ORD-41',
      { ...context, roleType: AccountRoleType.ADMIN })).resolves.toMatchObject({ reopened: true });
  });

  it('says clearly when the parcel has no counter receipt (online order, seller drop-off)', async () => {
    parcel.order = { id: 41, offlineReceiptSnapshot: null };
    await expect(service.getParcelReceipt(user, 'KTX-ORD-41', context))
      .rejects.toThrow('Hakuna risiti ya kaunta');
    parcel.order = null;
    await expect(service.getParcelReceipt(user, 'KTX-ORD-41', context))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('never returns a claim secret, even if one were in the snapshot', async () => {
    parcel.order.offlineReceiptSnapshot = { ...snapshot,
      shipmentClaim: { shipmentId: 5, receiptSecret: 'secret' } };
    const result = await service.getParcelReceipt(user, 'KTX-ORD-41', context);
    expect(result).not.toHaveProperty('shipmentClaim');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('unknown number gives 404', async () => {
    service.parcelRepo.findOne = jest.fn(async () => null);
    await expect(service.getParcelReceipt(user, 'KTX-NOPE', context))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
