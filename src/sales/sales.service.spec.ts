import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SaleChannel, SalePaymentMethod } from './entities/sale.entity';

// Locks in the ONE explicit escape hatch Cash-on-Delivery gets from
// createSale()'s otherwise-strict "paid in full at creation" rule — see
// plans/mutable-meandering-dongarra.md's COD engine design.
describe('SalesService — Cash on Delivery', () => {
  let service: SalesService;
  let dataSource: any;
  let managerQuery: jest.Mock;
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
    managerQuery = jest.fn(async () => []);
    (mockManager as any).query = managerQuery;
    dataSource = { transaction: jest.fn((cb) => cb(mockManager)), query: jest.fn(async () => []), manager: mockManager };
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
      dataSource as any,
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

  // Owner 2026-10-22: a full payment is cash or mobile money, never COD.
  it('rejects a COD sale whose amount paid equals the total', async () => {
    await expect(
      service.createSale(1, 1, { ...baseDto(), isCod: true, amountPaid: 50_000, customerPhone: '0700000000' } as any),
    ).rejects.toThrow(/taslimu au pesa ya simu/);
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('a COD sale gets no receipt SMS (its one text is sent with the shipment)', async () => {
    await service.createSale(1, 1, { ...baseDto(), isCod: true, amountPaid: 20_000, customerPhone: '0700000000' } as any);
    await new Promise((r) => setImmediate(r));
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('a paid sale still gets its receipt SMS, unchanged', async () => {
    await service.createSale(1, 1, { ...baseDto(), customerPhone: '0700000000' } as any);
    await new Promise((r) => setImmediate(r));
    expect(smsService.sendSms).toHaveBeenCalledTimes(1);
    expect(smsService.sendSms).toHaveBeenCalledWith('0700000000',
      'KenteXa: Umepokea risiti KNT-RCP-2026-ABCDE ya TZS 50,000 kutoka Duka Store.');
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

    it('a shipped COD sale: the order on its parcel is settled in the same step', async () => {
      saleRepo.findOne.mockResolvedValue({ id: 5, sellerId: 1, isCod: true, total: 50_000, amountPaid: 20_000, balanceDue: 30_000 });
      dataSource.query.mockResolvedValueOnce([{ id: 77, codBalanceCollected: false, paymentMethod: 'cod', officeHandles: false }]);
      managerQuery.mockImplementation(async (sql: string) => (/SELECT source/.test(sql) ? [{ source: 'seller_shipment' }]
        : /FOR UPDATE/.test(sql) ? [{ id: 77, source: 'seller_shipment', status: 'preparing', paymentStatus: 'paid', paymentMethod: 'cod', codBalanceCollected: true }]
        : []));
      await service.recordCodBalancePayment(1, 5);
      const sqls = managerQuery.mock.calls.map((c) => String(c[0]));
      expect(sqls.some((q) => /"codBalanceCollected" = true/.test(q))).toBe(true);
      expect(sqls.some((q) => /status = 'completed'/.test(q))).toBe(true);
    });

    it('a shipped COD sale an Agent is carrying: the till refuses, the Agent collects', async () => {
      saleRepo.findOne.mockResolvedValue({ id: 5, sellerId: 1, isCod: true, total: 50_000, amountPaid: 20_000, balanceDue: 30_000 });
      dataSource.query.mockResolvedValueOnce([{ id: 77, codBalanceCollected: false, paymentMethod: 'cod', officeHandles: false }]);
      managerQuery.mockResolvedValueOnce([{ 1: 1 }]); // agentHoldsDelivery
      await expect(service.recordCodBalancePayment(1, 5)).rejects.toThrow(BadRequestException);
      expect(saleRepo.save).not.toHaveBeenCalled();
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
