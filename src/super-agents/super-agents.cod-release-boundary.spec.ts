import { OrderPaymentMethod, PaymentStatus as OrderPaymentStatus, OrderSource } from '../orders/entities/order.entity';
import { ParcelStatus } from './entities/parcel.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { MoneyRoutingBlockedException } from '../money-routing/order-routing-target';
import { MoneyRoutingBlockReason } from '../money-routing/entities/money-routing-entry.entity';
import { SuperAgentsService } from './super-agents.service';

// S0/I2G Issue #12: SuperAgentsService.updateParcelStatus()'s COD-delivery
// block used to call MoneyRoutingService.creditSellerProceeds() directly,
// bypassing OrderReleaseService entirely -- leaving order.escrowStatus /
// fundsReleasedAt permanently unsynchronized with a real wallet credit, with
// no transactional coupling between the order-state write and the credit.
// This suite drives updateParcelStatus() end-to-end (mocking only its I/O
// dependencies) to prove the fix: the canonical release is now the only path
// to a COD seller credit, using the correct net-of-fee amount, with the
// SELLER_SHIPMENT zero-fee exemption preserved exactly as before. A BLOCKED/
// failed release is deliberately NOT caught-and-continued: it must reject
// the whole request, so parcel status, buyerConfirmed, and the COD companion
// facts either all advance together or none do -- never a partial success
// where the parcel is marked delivered but the seller was never paid.
describe('SuperAgentsService.updateParcelStatus() — COD release boundary', () => {
  let service: SuperAgentsService;
  let parcelRepo: any;
  let orderRepo: any;
  let superAgentRepo: any;
  let trackingRepo: any;
  let moneyRouting: any;
  let orderRelease: any;
  let smsService: any;
  let invoicesService: any;
  let activityEvents: any;

  const roleContext = { roleType: AccountRoleType.SUPER_AGENT, userId: 1, profileId: 6, workspaceId: null } as any;
  const hub = { id: 6, city: 'Dar es Salaam', businessName: 'Destination Hub', workspaceId: null };

  const baseOrder = (overrides: Record<string, any> = {}) => ({
    id: 900,
    paymentMethod: OrderPaymentMethod.COD,
    codBalanceCollected: false,
    codRemainingBalance: 5000,
    sellerAmount: 4500,
    totalAmount: 5000,
    source: OrderSource.ONLINE,
    seller: { id: 55 },
    buyer: { id: 77, phone: null, name: 'Mteja' },
    ...overrides,
  });

  const baseParcel = (order: any) => ({
    id: 10,
    trackingNumber: 'KTX-DAR-MZA-000010',
    status: ParcelStatus.OUT_FOR_DELIVERY,
    order,
    seller: order.seller,
    superAgent: null,
    destinationSuperAgent: hub,
    buyerRequestedDelivery: true,
    buyerPhone: null,
  });

  beforeEach(() => {
    parcelRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
    };
    orderRepo = { update: jest.fn().mockResolvedValue(undefined) };
    superAgentRepo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(hub), increment: jest.fn().mockResolvedValue(undefined) };
    trackingRepo = { create: jest.fn((x) => x), save: jest.fn().mockResolvedValue(undefined) };
    moneyRouting = { creditSellerProceeds: jest.fn() }; // must NEVER be called anymore
    orderRelease = { releaseSellerProceeds: jest.fn().mockResolvedValue({ released: true, alreadyReleased: false, routing: { entryId: 1, eventKey: 'k', state: 'ROUTED' } }) };
    smsService = { sendSms: jest.fn().mockResolvedValue(undefined) };
    invoicesService = { recordCodBalanceCollected: jest.fn().mockResolvedValue(undefined) };
    activityEvents = { record: jest.fn() };
    const commerceProfiles = { findForUserByType: jest.fn().mockResolvedValue(null) };

    const noop = {} as any;
    service = new SuperAgentsService(
      superAgentRepo,
      noop, // transportAssignmentRepo
      parcelRepo,
      trackingRepo,
      noop, // rateRepo
      noop, // bulkRepo
      noop, // routeRepo
      orderRepo,
      noop, // agentRepo
      noop, // agentTransactionRepo
      noop, // batchParcelRepo
      noop, // userRepo
      noop, // paymentRepo
      noop, // sellerProfileRepo
      noop, // saleRepo
      smsService,
      noop, // dataSource
      noop, // businessCustomerService
      { create: jest.fn() }, // inAppNotif
      commerceProfiles,
      noop, // profileScope
      invoicesService,
      noop, // auditLog
      noop, // verification
      activityEvents,
      noop, // walletService
      noop, // roleContextService
      moneyRouting,
      orderRelease,
    );
    jest.spyOn(service as any, 'resolveActingSuperAgent').mockResolvedValue(hub);
  });

  it('routes a real (ONLINE-source) COD delivery through OrderReleaseService with the net-of-fee amount, never MoneyRoutingService directly', async () => {
    const order = baseOrder();
    parcelRepo.findOne.mockResolvedValue(baseParcel(order));

    await service.updateParcelStatus(
      { id: 1, name: 'Agent' } as any,
      'KTX-DAR-MZA-000010',
      { status: ParcelStatus.DELIVERED, city: 'Dar es Salaam', codBalanceCollected: 5000 },
      roleContext,
    );

    // 2% of 5000 collected = 100 handling fee -> net = 4500 - 100 = 4400,
    // which is NOT order.sellerAmount's raw 4500 -- proving the override is
    // actually the fee-adjusted figure, not a pass-through.
    expect(orderRelease.releaseSellerProceeds).toHaveBeenCalledWith({
      orderId: 900,
      source: 'COD_DELIVERY',
      amount: 4400,
      orderUpdate: expect.objectContaining({
        paymentStatus: OrderPaymentStatus.PAID,
        codBalanceCollected: true,
        codBalanceCollectedByAgentId: 6,
        codBalanceCollectedAt: expect.any(Date),
      }),
      completeInTransaction: expect.any(Function),
    });
    expect(moneyRouting.creditSellerProceeds).not.toHaveBeenCalled();
    // No separate, uncoordinated order-state write before/alongside the release --
    // the companion facts travel INSIDE the release call's own orderUpdate instead.
    expect(orderRepo.update).not.toHaveBeenCalled();
  });

  it('keeps seller-arranged COD out of the canonical seller-credit path', async () => {
    const order = baseOrder({ source: OrderSource.SELLER_SHIPMENT, sellerAmount: 0 });
    parcelRepo.findOne.mockResolvedValue(baseParcel(order));
    await expect(service.updateParcelStatus(
      { id: 1, name: 'Agent' } as any,
      'KTX-DAR-MZA-000010',
      { status: ParcelStatus.DELIVERED, city: 'Dar es Salaam', codBalanceCollected: 5000 },
      roleContext,
    )).rejects.toThrow(); // this unit fixture has no database; the PostgreSQL gate owns manual completion

    expect(orderRelease.releaseSellerProceeds).not.toHaveBeenCalled();
    expect(moneyRouting.creditSellerProceeds).not.toHaveBeenCalled();
    expect(orderRepo.update).not.toHaveBeenCalled();
  });

  it('a BLOCKED canonical release rejects the WHOLE delivery request -- never catch-and-continue', async () => {
    const order = baseOrder();
    parcelRepo.findOne.mockResolvedValue(baseParcel(order));
    const blocked = new MoneyRoutingBlockedException(MoneyRoutingBlockReason.WALLET_UNRESOLVABLE, { orderId: 900 });
    orderRelease.releaseSellerProceeds.mockRejectedValue(blocked);

    await expect(
      service.updateParcelStatus(
        { id: 1, name: 'Agent' } as any,
        'KTX-DAR-MZA-000010',
        { status: ParcelStatus.DELIVERED, city: 'Dar es Salaam', codBalanceCollected: 5000 },
        roleContext,
      ),
    ).rejects.toBe(blocked);

    // Parcel/order/financial facts must advance together or not at all: the
    // parcel is NOT marked DELIVERED, and no companion order state is
    // written, when the canonical release blocks.
    expect(parcelRepo.update).not.toHaveBeenCalled();
    expect(orderRepo.update).not.toHaveBeenCalled();
  });

  it('an unexpected (non-blocked) error from the release still propagates -- never silently swallowed', async () => {
    const order = baseOrder();
    parcelRepo.findOne.mockResolvedValue(baseParcel(order));
    orderRelease.releaseSellerProceeds.mockRejectedValue(new Error('connection terminated unexpectedly'));

    await expect(
      service.updateParcelStatus(
        { id: 1, name: 'Agent' } as any,
        'KTX-DAR-MZA-000010',
        { status: ParcelStatus.DELIVERED, city: 'Dar es Salaam', codBalanceCollected: 5000 },
        roleContext,
      ),
    ).rejects.toThrow('connection terminated unexpectedly');
  });

  it('rejects a second COD delivery instead of rewriting terminal tracking', async () => {
    const order = baseOrder({ codBalanceCollected: true });
    parcelRepo.findOne.mockResolvedValue(baseParcel(order));

    await expect(service.updateParcelStatus(
      { id: 1, name: 'Agent' } as any,
      'KTX-DAR-MZA-000010',
      { status: ParcelStatus.DELIVERED, city: 'Dar es Salaam' },
      roleContext,
    )).rejects.toThrow('already been recorded');

    expect(orderRelease.releaseSellerProceeds).not.toHaveBeenCalled();
    expect(orderRepo.update).not.toHaveBeenCalled();
  });
});
