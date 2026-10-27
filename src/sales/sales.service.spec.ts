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

describe('SalesService — POS part 1: offline, split payment, Deni (owner 2026-10-27)', () => {
  const seller = { id: 1, name: 'Duka Store' } as any;
  const product = { id: 10, seller, displayPrice: 5_000, sku: 'SKU1', name: 'Sukari', availableInStore: true } as any;
  function harness(opts: { existing?: any } = {}) {
    const managerQuery = jest.fn(async () => []);
    const adjustStock = jest.fn(async () => {});
    const mockManager: any = {
      getRepository: (entity: any) => {
        if (entity.name === 'Product') return { findOne: jest.fn(async () => product) };
        if (entity.name === 'Sale') return saleRepo;
        if (entity.name === 'SaleItem') return { create: jest.fn((x) => x) };
        return {};
      },
      query: managerQuery,
    };
    const saleRepo: any = { create: jest.fn((x) => x), save: jest.fn(async (x) => ({ ...x, id: 5, items: x.items })), findOne: jest.fn(async () => opts.existing ?? null) };
    const dataSource: any = {
      transaction: jest.fn((cb) => cb(mockManager)),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('information_schema.columns')) return [{ ok: true }];
        if (sql.includes('"clientSaleId" = $2')) return opts.existing ? [{ id: opts.existing.id }] : [];
        return [];
      }),
    };
    const service = new SalesService(saleRepo, {} as any, {} as any, {} as any, { findOne: jest.fn(async () => seller) } as any,
      dataSource, { adjustStock } as any, { generateReceiptNumber: jest.fn(async () => 'R-1') } as any,
      { sendSms: jest.fn(async () => true) } as any, { appendInvite: jest.fn(async (m: string) => m) } as any);
    return { service, saleRepo, managerQuery, adjustStock, dataSource };
  }
  const id = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';
  const base = { channel: SaleChannel.LOCAL_POS, items: [{ productId: 10, quantity: 2 }], paymentMethod: SalePaymentMethod.CASH, amountPaid: 0 };

  it('a split payment: the sum is what was paid and the largest part is the method; all parts are kept', async () => {
    const h = harness();
    const sale: any = await h.service.createSale(1, 9, { ...base, clientSaleId: id,
      payments: [{ method: 'cash', amount: 4000 }, { method: 'mpesa', amount: 6000, reference: 'QK12' }] } as any);
    expect(sale).toMatchObject({ amountPaid: 10000, paymentMethod: 'mpesa', changeDue: 0 });
    const update = h.managerQuery.mock.calls.find(([sql]) => String(sql).includes('"clientSaleId" = $2'));
    expect(update[1]).toEqual([5, id, null, JSON.stringify([
      { method: 'cash', amount: 4000, reference: null }, { method: 'mpesa', amount: 6000, reference: 'QK12' }]), false]);
  });

  it('the same offline sale sent twice is recorded once', async () => {
    const h = harness({ existing: { id: 44, receiptNumber: 'R-44' } });
    await expect(h.service.createSale(1, 9, { ...base, amountPaid: 10000, clientSaleId: id, soldAt: new Date().toISOString() } as any))
      .resolves.toMatchObject({ id: 44 });
    expect(h.saleRepo.save).not.toHaveBeenCalled();
  });

  it('an offline sale takes stock to zero instead of refusing; an online one does not', async () => {
    const h = harness();
    await h.service.createSale(1, 9, { ...base, amountPaid: 10000, clientSaleId: id, soldAt: new Date().toISOString() } as any);
    expect(h.adjustStock).toHaveBeenCalledWith(10, -2, expect.anything(), expect.objectContaining({ floorAtZero: true }));
    const online = harness();
    await online.service.createSale(1, 9, { ...base, amountPaid: 10000 } as any);
    expect(online.adjustStock).toHaveBeenCalledWith(10, -2, expect.anything(), expect.objectContaining({ floorAtZero: false }));
  });

  it('Deni: needs the customer, leaves the balance owed, and is not "paid in full"', async () => {
    const h = harness();
    await expect(h.service.createSale(1, 9, { ...base, amountPaid: 4000, credit: true } as any)).rejects.toThrow('jina na simu');
    const sale: any = await h.service.createSale(1, 9, { ...base, amountPaid: 4000, credit: true, customerName: 'Neema', customerPhone: '0712345678' } as any);
    expect(sale).toMatchObject({ balanceDue: 6000, changeDue: 0, isCod: false });
    await expect(h.service.createSale(1, 9, { ...base, amountPaid: 10000, credit: true, customerName: 'Neema', customerPhone: '0712345678' } as any))
      .rejects.toThrow('hakuna deni');
    await expect(h.service.createSale(1, 9, { ...base, amountPaid: 4000 } as any)).rejects.toThrow(BadRequestException);
  });
});
