import { ClassifiedsService } from './classifieds.service';
import { ClassifiedStatus } from './entities/classified.entity';
import { ClassifiedInvoiceStatus } from './entities/classified-invoice-request.entity';
import { UserRole } from '../users/entities/user.entity';

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
