import { ClassifiedsService } from './classifieds.service';
import { ClassifiedStatus } from './entities/classified.entity';
import { ClassifiedInvoiceStatus } from './entities/classified-invoice-request.entity';
import { UserRole } from '../users/entities/user.entity';
import { OrderStatus, OrderSource, OrderPaymentMethod, PaymentStatus } from '../orders/entities/order.entity';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { CodCalculationService } from '../cod/cod-calculation.service';

// The tests below inject a REAL CodCalculationService (it's a pure
// function with no DB access — see cod-calculation.service.spec.ts for
// its own dedicated coverage) rather than a mock, so these tests exercise
// the actual upfront/remaining split end to end.
const realCodCalculation = () => new CodCalculationService();

// Locks in the ownership-based authorization the manual-invoice flow already
// implements (no role/isVerified gate exists anywhere in this service) —
// see the "Classified Seller & Manual Invoice Access" audit: a plain,
// never-approved classified poster must be able to invoice a buyer on their
// own listing exactly the same as an approved/verified seller can.
describe('ClassifiedsService — manual invoice access', () => {
  let service: ClassifiedsService;
  let repo: any;
  let invoiceRequestRepo: any;
  let invoicesService: any;

  const unverifiedOwner = {
    id: 1,
    role: UserRole.USER,
    isVerified: false,
  } as any;

  const verifiedSeller = {
    id: 2,
    role: UserRole.SELLER,
    isVerified: true,
  } as any;

  const otherUser = { id: 99, role: UserRole.USER, isVerified: false } as any;

  const activeListing = {
    id: 10,
    seller: unverifiedOwner,
    status: ClassifiedStatus.ACTIVE,
  } as any;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
    };
    invoiceRequestRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      findOne: jest.fn(),
    };
    invoicesService = {
      generateInvoiceNumber: jest.fn(async () => 'INV-TEST-1'),
    };

    service = new ClassifiedsService(
      repo,
      invoiceRequestRepo,
      {} as any, // invoiceRepo — unused by the methods under test
      {} as any, // orderRepo — unused by the methods under test
      invoicesService,
      {} as any, // dataSource
      {} as any, // feedService
      { findForUserByType: jest.fn(async () => null) } as any, // commerceProfiles
      {} as any, // profileScope
      { upsert: jest.fn(), remove: jest.fn() } as any, // searchIndex
      { createParcelForClassifiedInvoice: jest.fn(async () => ({ id: 1 })) } as any, // superAgents
      realCodCalculation(),
    );
  });

  // Case 1
  it('lets an unverified owner create a manual invoice for their own listing', async () => {
    repo.findOne.mockResolvedValue(activeListing);

    const result = await service.createManualInvoice(unverifiedOwner, {
      buyerName: 'Amina',
      buyerPhone: '255712345678',
      productName: 'Phone',
      classifiedId: activeListing.id,
      amount: 50000,
    });

    expect(result.invoiceNumber).toBe('INV-TEST-1');
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: activeListing.id, seller: { id: unverifiedOwner.id } },
    });
    expect(invoiceRequestRepo.save).toHaveBeenCalled();
  });

  // Case 2 — regression guard: an already-approved/verified seller keeps
  // working exactly the same way (the code never branched on this anyway).
  it('lets a verified/approved seller create a manual invoice the same way', async () => {
    const sellerListing = { ...activeListing, seller: verifiedSeller };
    repo.findOne.mockResolvedValue(sellerListing);

    const result = await service.createManualInvoice(verifiedSeller, {
      buyerName: 'Amina',
      buyerPhone: '255712345678',
      productName: 'Phone',
      classifiedId: sellerListing.id,
      amount: 50000,
    });

    expect(result.invoiceNumber).toBe('INV-TEST-1');
  });

  // Case 3 — ownership is still enforced
  it('rejects fulfilling an invoice request that belongs to a different seller', async () => {
    invoiceRequestRepo.findOne.mockResolvedValue({
      id: 5,
      seller: unverifiedOwner,
      buyer: otherUser,
      classified: activeListing,
      status: ClassifiedInvoiceStatus.PENDING,
    });

    await expect(
      service.createInvoiceForRequest(5, otherUser, {
        amount: 50000,
        invoiceDescription: 'Phone',
      }),
    ).rejects.toThrow('Not your invoice request');
  });

  // Case 4 — inactive/sold listings can't be invoiced
  it('rejects a buyer requesting an invoice on a sold listing', async () => {
    const soldListing = { ...activeListing, status: ClassifiedStatus.SOLD };
    repo.findOne.mockResolvedValue(soldListing);

    await expect(
      service.requestInvoice(soldListing.id, otherUser, {
        buyerName: 'Amina',
        buyerPhone: '255712345678',
        deliveryAddress: 'Dar es Salaam',
      }),
    ).rejects.toThrow('This listing is no longer active');
  });
});

// Link Manual Classified Invoice → Shipment — see plans/mutable-meandering-dongarra.md.
// setShippingMethod() is the core of the fix: it used to always mint a new
// Order (wrong OrderSource, an orphaned raw-SQL parcel_tracking insert) with
// no idempotency guard at all. These tests lock in the corrected behavior.
describe('ClassifiedsService — invoice-to-shipment linking', () => {
  let service: ClassifiedsService;
  let invoiceRequestRepo: any;
  let orderRepo: any;
  let superAgents: any;
  let invoicesService: any;

  const seller = { id: 2, role: UserRole.SELLER, name: 'Seller', city: 'Dar es Salaam' } as any;
  const buyer = { id: 3, name: 'Amina', phone: '255700000000' } as any;
  const classified = { id: 10, title: 'Used iPhone' } as any;

  const basePaidRequest = () => ({
    id: 5,
    seller,
    buyer,
    classified,
    status: ClassifiedInvoiceStatus.PAID,
    amount: 100000,
    buyerMessage: 'Name: Amina | Phone: 255700000000 | Address: Kariakoo',
    order: null,
  });

  beforeEach(() => {
    invoiceRequestRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (x) => x),
    };
    orderRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 77 })),
      update: jest.fn(async () => ({})),
    };
    superAgents = {
      createParcelForClassifiedInvoice: jest.fn(async () => ({ id: 1 })),
    };
    invoicesService = {
      generateInvoiceNumber: jest.fn(async () => 'INV-TEST-1'),
      createForOrder: jest.fn(async () => ({})),
    };

    service = new ClassifiedsService(
      {} as any, // repo (Classified)
      invoiceRequestRepo,
      {} as any, // invoiceRepo
      orderRepo,
      invoicesService,
      {} as any, // dataSource
      {} as any, // feedService
      { findForUserByType: jest.fn(async () => null) } as any,
      {} as any, // profileScope
      { upsert: jest.fn(), remove: jest.fn() } as any,
      superAgents,
      realCodCalculation(),
    );
  });

  it('rejects setting a shipping method on an unpaid invoice', async () => {
    invoiceRequestRepo.findOne.mockResolvedValue({ ...basePaidRequest(), status: ClassifiedInvoiceStatus.SENT });

    await expect(
      service.setShippingMethod(5, seller, { shippingMethod: 'agent' }),
    ).rejects.toThrow(BadRequestException);
    expect(orderRepo.create).not.toHaveBeenCalled();
  });

  it('rejects a seller who does not own the invoice', async () => {
    invoiceRequestRepo.findOne.mockResolvedValue(basePaidRequest());
    const otherSeller = { id: 999 } as any;

    await expect(
      service.setShippingMethod(5, otherSeller, { shippingMethod: 'agent' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('creates no Order/Parcel for buyer_pickup — no shipment needed', async () => {
    invoiceRequestRepo.findOne.mockResolvedValue(basePaidRequest());

    const result = await service.setShippingMethod(5, seller, { shippingMethod: 'buyer_pickup' });

    expect(result.requiresShipment).toBe(false);
    expect(result.orderId).toBeNull();
    expect(orderRepo.create).not.toHaveBeenCalled();
    expect(superAgents.createParcelForClassifiedInvoice).not.toHaveBeenCalled();
  });

  it('creates an Order with the right source and a real Parcel for a real shipping method', async () => {
    invoiceRequestRepo.findOne.mockResolvedValue(basePaidRequest());

    const result = await service.setShippingMethod(5, seller, { shippingMethod: 'agent' });

    expect(orderRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: OrderSource.CLASSIFIED_INVOICE,
        status: OrderStatus.PAID,
        classifiedInvoiceId: 5,
      }),
    );
    expect(superAgents.createParcelForClassifiedInvoice).toHaveBeenCalled();
    expect(result.requiresShipment).toBe(true);
    expect(result.orderId).toBe(77);
    expect(result.trackingNumber).toBe('KTX-ORD-77');
  });

  it('is idempotent — a second call for an already-shipped invoice returns the existing order, not a new one', async () => {
    invoiceRequestRepo.findOne.mockResolvedValue({
      ...basePaidRequest(),
      shippingMethod: 'agent',
      order: { id: 77, status: OrderStatus.PAID, trackingNumber: 'KTX-ORD-77' },
    });

    const result = await service.setShippingMethod(5, seller, { shippingMethod: 'agent' });

    expect(orderRepo.create).not.toHaveBeenCalled();
    expect(superAgents.createParcelForClassifiedInvoice).not.toHaveBeenCalled();
    expect(result.orderId).toBe(77);
    expect(result.message).toMatch(/already/i);
  });

  it('getInvoiceByNumber rejects a user who is neither the buyer nor the seller', async () => {
    invoiceRequestRepo.findOne.mockResolvedValue({ ...basePaidRequest(), invoiceNumber: 'INV-1' });
    const stranger = { id: 12345, role: UserRole.USER } as any;

    await expect(
      service.getInvoiceByNumber('INV-1', stranger),
    ).rejects.toThrow(ForbiddenException);
  });

  it('getInvoiceByNumber allows the buyer to read their own invoice', async () => {
    invoiceRequestRepo.findOne.mockResolvedValue({ ...basePaidRequest(), invoiceNumber: 'INV-1' });

    const result = await service.getInvoiceByNumber('INV-1', buyer);
    expect(result.invoiceNumber).toBe('INV-1');
  });

  it('a COD Order created by setShippingMethod() carries the upfront/remaining split, not a full PAID status', async () => {
    invoiceRequestRepo.findOne.mockResolvedValue({
      ...basePaidRequest(),
      isCod: true,
      codUpfrontAmount: 20_000,
      codRemainingBalance: 80_000,
    });

    await service.setShippingMethod(5, seller, { shippingMethod: 'agent' });

    expect(orderRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: OrderPaymentMethod.COD,
        paymentStatus: PaymentStatus.UPFRONT_PAID,
        codUpfrontAmount: 20_000,
        codRemainingBalance: 80_000,
      }),
    );
  });

  it('a non-COD invoice still creates a fully PAID, ONLINE-method Order (unchanged behavior)', async () => {
    invoiceRequestRepo.findOne.mockResolvedValue(basePaidRequest());

    await service.setShippingMethod(5, seller, { shippingMethod: 'agent' });

    expect(orderRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: OrderPaymentMethod.ONLINE,
        paymentStatus: PaymentStatus.PAID,
        codUpfrontAmount: null,
        codRemainingBalance: null,
      }),
    );
  });
});

describe('ClassifiedsService — COD invoice creation', () => {
  let service: ClassifiedsService;
  let invoiceRequestRepo: any;
  let repo: any;

  const seller = { id: 2, name: 'Seller', city: 'Dar es Salaam' } as any;

  beforeEach(() => {
    invoiceRequestRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };
    repo = { findOne: jest.fn(async () => null) };

    service = new ClassifiedsService(
      repo,
      invoiceRequestRepo,
      {} as any,
      {} as any,
      { generateInvoiceNumber: jest.fn(async () => 'INV-COD-1') } as any,
      {} as any,
      {} as any,
      { findForUserByType: jest.fn(async () => null) } as any,
      {} as any,
      { upsert: jest.fn(), remove: jest.fn() } as any,
      {} as any,
      realCodCalculation(),
    );
  });

  it('computes an intercity upfront split when the seller creates a COD manual invoice', async () => {
    const result = await service.createManualInvoice(seller, {
      buyerName: 'Amina',
      buyerPhone: '255700000000',
      productName: 'Fridge',
      amount: 300_000,
      shippingAmount: 15_000,
      isCod: true,
      regionName: 'Mwanza', // different city from the seller — intercity
    });

    expect(result.totalAmount).toBe(315_000);
    expect(result.isCod).toBe(true);
    expect(result.codUpfrontAmount).toBeGreaterThan(0);
    expect(result.codUpfrontAmount! + result.codRemainingBalance!).toBe(315_000);
  });

  it('a non-COD manual invoice has no upfront/remaining split at all', async () => {
    const result = await service.createManualInvoice(seller, {
      buyerName: 'Amina',
      buyerPhone: '255700000000',
      productName: 'Fridge',
      amount: 300_000,
      shippingAmount: 15_000,
    });

    expect(result.isCod).toBe(false);
    expect(result.codUpfrontAmount).toBeNull();
    expect(result.codRemainingBalance).toBeNull();
  });
});
