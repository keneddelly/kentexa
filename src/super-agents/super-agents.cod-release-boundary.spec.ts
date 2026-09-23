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
// SELLER_SHIPMENT zero-fee exemption preserved exactly as before.
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

  const roleContext = { roleType: AccountRoleType.ADMIN } as any;

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
    destinationSuperAgent: null,
    buyerPhone: null,
  });

  beforeEach(() => {
    parcelRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
    };
    orderRepo = { update: jest.fn().mockResolvedValue(undefined) };
    superAgentRepo = { find: jest.fn().mockResolvedValue([]), increment: jest.fn().mockResolvedValue(undefined) };
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
        codBalanceCollectedByAgentId: null,
        codBalanceCollectedAt: expect.any(Date),
      }),
    });
    expect(moneyRouting.creditSellerProceeds).not.toHaveBeenCalled();
    // No separate, uncoordinated order-state write before/alongside the release --
    // the companion facts travel INSIDE the release call's own orderUpdate instead.
    expect(orderRepo.update).not.toHaveBeenCalled();
  });

  it('preserves the SELLER_SHIPMENT zero-fee exemption exactly: no release call, plain direct order update instead', async () => {
    const order = baseOrder({ source: OrderSource.SELLER_SHIPMENT, sellerAmount: 0 });
    parcelRepo.findOne.mockResolvedValue(baseParcel(order));

    await service.updateParcelStatus(
      { id: 1, name: 'Agent' } as any,
      'KTX-DAR-MZA-000010',
      { status: ParcelStatus.DELIVERED, city: 'Dar es Salaam', codBalanceCollected: 5000 },
      roleContext,
    );

    expect(orderRelease.releaseSellerProceeds).not.toHaveBeenCalled();
    expect(moneyRouting.creditSellerProceeds).not.toHaveBeenCalled();
    expect(orderRepo.update).toHaveBeenCalledWith(
      900,
      expect.objectContaining({ codBalanceCollected: true, paymentStatus: OrderPaymentStatus.PAID }),
    );
  });

  it('a BLOCKED release is caught and logged, never propagated -- the physical delivery flow must not fail because of it', async () => {
    const order = baseOrder();
    parcelRepo.findOne.mockResolvedValue(baseParcel(order));
    orderRelease.releaseSellerProceeds.mockRejectedValue(
      new MoneyRoutingBlockedException(MoneyRoutingBlockReason.WALLET_UNRESOLVABLE, { orderId: 900 }),
    );
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await service.updateParcelStatus(
      { id: 1, name: 'Agent' } as any,
      'KTX-DAR-MZA-000010',
      { status: ParcelStatus.DELIVERED, city: 'Dar es Salaam', codBalanceCollected: 5000 },
      roleContext,
    );

    expect(result).toMatchObject({ status: ParcelStatus.DELIVERED });
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('COD seller proceeds BLOCKED for order #900'));
    // The parcel itself still gets marked delivered even though the release was blocked.
    expect(parcelRepo.update).toHaveBeenCalledWith(10, expect.objectContaining({ status: ParcelStatus.DELIVERED }));
    errSpy.mockRestore();
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

  it('does not re-enter the COD block once codBalanceCollected is already true (unaffected by this fix)', async () => {
    const order = baseOrder({ codBalanceCollected: true });
    parcelRepo.findOne.mockResolvedValue(baseParcel(order));

    await service.updateParcelStatus(
      { id: 1, name: 'Agent' } as any,
      'KTX-DAR-MZA-000010',
      { status: ParcelStatus.DELIVERED, city: 'Dar es Salaam' },
      roleContext,
    );

    expect(orderRelease.releaseSellerProceeds).not.toHaveBeenCalled();
    expect(orderRepo.update).not.toHaveBeenCalled();
  });
});
