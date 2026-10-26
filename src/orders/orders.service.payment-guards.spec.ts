import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderStatus, OrderPaymentMethod, OrderSource, PaymentStatus } from './entities/order.entity';

/**
 * S0 Commit 4 — fulfilment/COD-collection guards on OrdersService. These
 * are unit tests against the real class (only the specific collaborators
 * each guarded method touches are supplied; everything else resolves to an
 * inert stub) so the actual guard code runs, not a re-implementation of it.
 */
const anyStub: any = new Proxy(function () {}, {
  get: (_t, p) => (p === 'then' || typeof p === 'symbol' ? undefined : anyStub),
  apply: () => Promise.resolve(undefined),
});
const build = <T>(props: Record<string, unknown>): T =>
  new Proxy(Object.assign(Object.create(OrdersService.prototype), props), {
    get: (t, p, r) => (p in t ? Reflect.get(t, p, r) : typeof p === 'symbol' ? undefined : anyStub),
  }) as T;

const seller = { id: 5 };

describe('OrdersService — S0 payment-evidence guards', () => {
  describe('uploadShippingProof', () => {
    it('rejects when the order is paid/preparing by status but has no verified payment evidence (checkout order)', async () => {
      const repo = { findOne: jest.fn(), update: jest.fn() };
      const order = { id: 1, seller, product: null, buyer: null, status: OrderStatus.PAID, source: OrderSource.ONLINE, paymentMethod: OrderPaymentMethod.ONLINE, totalAmount: 198000, codUpfrontAmount: null };
      repo.findOne.mockResolvedValue(order);
      const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: true, sufficient: false }) };
      const svc = build<OrdersService>({ repo, paymentEvidence });

      await expect(svc.uploadShippingProof(1, seller as any, { trackingNumber: 't', shippingReceiptImage: 'r', shippingProductImage: 'p' })).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('proceeds when evidence is sufficient', async () => {
      const repo = { findOne: jest.fn(), update: jest.fn() };
      const order = { id: 1, seller, product: { workspaceId: null }, buyer: null, status: OrderStatus.PAID, source: OrderSource.ONLINE, paymentMethod: OrderPaymentMethod.ONLINE, totalAmount: 198000, codUpfrontAmount: null, platformFeeAmount: 0 };
      repo.findOne.mockResolvedValue(order);
      const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: true, sufficient: true }) };
      const svc = build<OrdersService>({ repo, paymentEvidence, notificationsService: anyStub, communicationEngine: anyStub });

      await svc.uploadShippingProof(1, seller as any, { trackingNumber: 't', shippingReceiptImage: 'r', shippingProductImage: 'p' });
      expect(repo.update).toHaveBeenCalled();
    });
  });

  describe('sellerHandToSuperAgent', () => {
    it('rejects a PAID order lacking verified payment evidence', async () => {
      const repo = { findOne: jest.fn(), update: jest.fn() };
      const order = { id: 2, seller, product: null, status: OrderStatus.PAID, source: OrderSource.ONLINE, paymentMethod: OrderPaymentMethod.ONLINE, totalAmount: 50000, codUpfrontAmount: null };
      repo.findOne.mockResolvedValue(order);
      const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: true, sufficient: false }) };
      const svc = build<OrdersService>({ repo, paymentEvidence });

      await expect(svc.sellerHandToSuperAgent(2, seller as any, { superAgentCity: 'Dar' })).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('superAgentReceiveOrder', () => {
    it('rejects a paid/preparing order lacking verified payment evidence', async () => {
      const repo = { findOne: jest.fn() };
      const order = { id: 3, seller, buyer: null, product: null, status: OrderStatus.PREPARING, source: OrderSource.ONLINE, paymentMethod: OrderPaymentMethod.ONLINE, totalAmount: 50000, codUpfrontAmount: null };
      repo.findOne.mockResolvedValue(order);
      const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: true, sufficient: false }) };
      const svc = build<OrdersService>({ repo, paymentEvidence });

      await expect(svc.superAgentReceiveOrder(3, { id: 9 } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('sellerCollectCodBalance — the exact #75-shaped guard', () => {
    const codOrder = (over: any = {}) => ({
      id: 75, seller, buyer: null, product: null,
      paymentMethod: OrderPaymentMethod.COD, source: OrderSource.ONLINE,
      status: OrderStatus.PENDING_PAYMENT, codBalanceCollected: false,
      codRemainingBalance: 144000, codUpfrontAmount: 36000, totalAmount: 180000,
      ...over,
    });

    it('rejects a checkout COD order that has not yet reached a fulfilment stage (still pending_payment) — cannot be self-collected before deposit AND prep', async () => {
      const repo = { findOne: jest.fn(), update: jest.fn() };
      repo.findOne.mockResolvedValue(codOrder());
      const svc = build<OrdersService>({ repo, parcelRepo: { findOne: jest.fn() }, activityEvents: anyStub });

      await expect(svc.sellerCollectCodBalance(75, seller as any)).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rejects a checkout COD order in PREPARING that has NO verified deposit evidence — the exact hole from the audit', async () => {
      const repo = { findOne: jest.fn(), update: jest.fn() };
      repo.findOne.mockResolvedValue(codOrder({ status: OrderStatus.PREPARING }));
      const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: true, sufficient: false }) };
      const svc = build<OrdersService>({ repo, parcelRepo: { findOne: jest.fn() }, paymentEvidence, activityEvents: anyStub });

      await expect(svc.sellerCollectCodBalance(75, seller as any)).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    // The writes go through the shared delivery sync (order-delivery-sync.ts), in one transaction.
    const dbRepo = (rows: (sql: string) => any[] = () => []) => {
      const query = jest.fn(async (sql: string) => rows(sql));
      const manager: any = { query };
      manager.transaction = jest.fn((cb: any) => cb(manager));
      return { findOne: jest.fn(), update: jest.fn(), manager, query };
    };
    const wrote = (q: jest.Mock, re: RegExp) => q.mock.calls.some((c) => re.test(String(c[0])));

    it('allows it once the deposit is genuinely verified AND the order is in a real fulfilment stage', async () => {
      const repo = dbRepo((sql) => (/SELECT source/.test(sql) ? [{ source: 'online' }] : []));
      repo.findOne.mockResolvedValue(codOrder({ status: OrderStatus.PREPARING }));
      const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: true, sufficient: true }) };
      const svc = build<OrdersService>({ repo, parcelRepo: { findOne: jest.fn().mockResolvedValue(null) }, paymentEvidence, activityEvents: anyStub });

      await svc.sellerCollectCodBalance(75, seller as any);
      expect(wrote(repo.query, /"codBalanceCollected" = true/)).toBe(true);
      // A marketplace order keeps its escrow flow: not completed here.
      expect(wrote(repo.query, /status = 'completed'/)).toBe(false);
    });

    it('a seller_shipment order keeps its existing self-reported trust model — no evidence check at all', async () => {
      const repo = dbRepo((sql) => (/SELECT source/.test(sql) ? [{ source: 'seller_shipment' }]
        : /FOR UPDATE/.test(sql) ? [{ id: 75, source: 'seller_shipment', status: 'pending_payment', paymentStatus: 'paid', paymentMethod: 'cod', codBalanceCollected: true }]
        : []));
      repo.findOne.mockResolvedValue(codOrder({ source: OrderSource.SELLER_SHIPMENT, status: OrderStatus.PENDING_PAYMENT }));
      const paymentEvidence = { check: jest.fn() };
      const svc = build<OrdersService>({ repo, parcelRepo: { findOne: jest.fn().mockResolvedValue(null) }, paymentEvidence, activityEvents: anyStub });

      await svc.sellerCollectCodBalance(75, seller as any);
      expect(paymentEvidence.check).not.toHaveBeenCalled();
      expect(wrote(repo.query, /"codBalanceCollected" = true/)).toBe(true);
    });

    it('same city: the seller confirms the cash and the order is completed, not left preparing', async () => {
      const repo = dbRepo((sql) => (/SELECT source/.test(sql) ? [{ source: 'seller_shipment' }]
        : /FOR UPDATE/.test(sql) ? [{ id: 75, source: 'seller_shipment', status: 'preparing', paymentStatus: 'paid', paymentMethod: 'cod', codBalanceCollected: true }]
        : []));
      repo.findOne.mockResolvedValue(codOrder({ source: OrderSource.SELLER_SHIPMENT, status: OrderStatus.PREPARING }));
      const svc = build<OrdersService>({ repo, parcelRepo: { findOne: jest.fn().mockResolvedValue(null) }, activityEvents: anyStub });

      const res: any = await svc.sellerCollectCodBalance(75, seller as any);
      expect(wrote(repo.query, /status = 'completed'/)).toBe(true);
      expect(res.status).toBe('completed');
    });

    it('an Agent carrying the parcel collects the cash: the seller cannot mark it', async () => {
      const repo = dbRepo((sql) => (/parcel_pickup_task t JOIN/.test(sql) ? [{ '?column?': 1 }] : []));
      repo.findOne.mockResolvedValue(codOrder({ source: OrderSource.SELLER_SHIPMENT, status: OrderStatus.PREPARING }));
      const svc = build<OrdersService>({ repo, parcelRepo: { findOne: jest.fn().mockResolvedValue(null) }, activityEvents: anyStub });

      await expect(svc.sellerCollectCodBalance(75, seller as any)).rejects.toThrow(BadRequestException);
      expect(wrote(repo.query, /"codBalanceCollected" = true/)).toBe(false);
    });
  });
});
