import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SaleChannel, SalePaymentMethod } from './entities/sale.entity';

// Locks in the ONE explicit escape hatch Cash-on-Delivery gets from
// createSale()'s otherwise-strict "paid in full at creation" rule — see
// plans/mutable-meandering-dongarra.md's COD engine design.
describe('SalesService — Cash on Delivery', () => {
  let service: SalesService;
  let saleRepo: any;
  let productRepo: any;
  let userRepo: any;
  let invoicesService: any;
  let smsService: any;
  let growthInvite: any;

  const seller = { id: 1, name: 'Duka Store' } as any;
  const product = { id: 10, seller, displayPrice: 50_000, sku: 'SKU1', name: 'Item', availableInStore: true } as any;

  beforeEach(() => {
    const mockManager = {
      getRepository: (entity: any) => {
        if (entity.name === 'Product') return { findOne: jest.fn(async () => product) };
        if (entity.name === 'Sale') return saleRepo;
        if (entity.name === 'SaleItem') return { create: jest.fn((x) => x) };
        return {};
      },
    };
    saleRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 1, items: x.items })),
      findOne: jest.fn(),
    };
    productRepo = { findOne: jest.fn(async () => product) };
    userRepo = { findOne: jest.fn(async () => seller) };
    invoicesService = { generateReceiptNumber: jest.fn(async () => 'KNT-RCP-2026-ABCDE') };
    smsService = { sendSms: jest.fn(async () => true) };
    growthInvite = { appendInvite: jest.fn(async (msg: string) => msg) };

    service = new SalesService(
      saleRepo,
      {} as any, // saleItemRepo
      productRepo,
      {} as any, // orderRepo
      userRepo,
      { transaction: jest.fn((cb) => cb(mockManager)) } as any, // dataSource
      { adjustStock: jest.fn(async () => {}) } as any, // inventory
      invoicesService,
      smsService,
      growthInvite,
    );
  });

  const baseDto = () => ({
    channel: SaleChannel.MANUAL,
    items: [{ productId: 10, quantity: 1 }],
    paymentMethod: SalePaymentMethod.CASH,
    amountPaid: 50_000,
  });

  it('rejects a non-COD sale where amountPaid is short of the total (existing behavior unchanged)', async () => {
    await expect(
      service.createSale(1, 1, { ...baseDto(), amountPaid: 20_000 } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a COD sale with no customerPhone — nobody to collect the balance from', async () => {
    await expect(
      service.createSale(1, 1, { ...baseDto(), isCod: true, amountPaid: 20_000 } as any),
    ).rejects.toThrow(/customerPhone/);
  });

  it('allows a COD sale to be created with a partial payment and tracks the balance', async () => {
    const result = await service.createSale(1, 1, {
      ...baseDto(),
      isCod: true,
      amountPaid: 20_000,
      customerPhone: '0700000000',
    } as any);

    expect(result.isCod).toBe(true);
    expect(result.amountPaid).toBe(20_000);
    expect(result.balanceDue).toBe(30_000);
    expect(result.changeDue).toBe(0);
  });

  it('rejects a COD sale where amountPaid exceeds the total', async () => {
    await expect(
      service.createSale(1, 1, {
        ...baseDto(),
        isCod: true,
        amountPaid: 60_000,
        customerPhone: '0700000000',
      } as any),
    ).rejects.toThrow(/cannot exceed/);
  });

  describe('recordCodBalancePayment', () => {
    it('clears the balance and marks the sale paid in full', async () => {
      saleRepo.findOne.mockResolvedValue({
        id: 5,
        sellerId: 1,
        isCod: true,
        total: 50_000,
        amountPaid: 20_000,
        balanceDue: 30_000,
        customerPhone: '0700000000',
        receiptNumber: 'KNT-RCP-2026-ABCDE',
      });

      const result = await service.recordCodBalancePayment(1, 5);

      expect(result.amountPaid).toBe(50_000);
      expect(result.balanceDue).toBe(0);
      expect(smsService.sendSms).toHaveBeenCalled();
    });

    it('rejects collecting a balance on a non-COD sale', async () => {
      saleRepo.findOne.mockResolvedValue({ id: 5, sellerId: 1, isCod: false, balanceDue: 0 });
      await expect(service.recordCodBalancePayment(1, 5)).rejects.toThrow(BadRequestException);
    });

    it('rejects collecting a balance that is already zero', async () => {
      saleRepo.findOne.mockResolvedValue({ id: 5, sellerId: 1, isCod: true, balanceDue: 0 });
      await expect(service.recordCodBalancePayment(1, 5)).rejects.toThrow(BadRequestException);
    });

    it('rejects a sale that does not belong to this seller', async () => {
      saleRepo.findOne.mockResolvedValue(null); // findOne is scoped by {id, sellerId} in the real query
      await expect(service.recordCodBalancePayment(999, 5)).rejects.toThrow(NotFoundException);
    });
  });
});
