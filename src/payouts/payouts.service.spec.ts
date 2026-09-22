import { BadRequestException } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { PayoutStatus } from './entities/payout.entity';
import { OrderSource, OrderPaymentMethod, PaymentStatus } from '../orders/entities/order.entity';

/**
 * S0 — individual and bulk payout must apply the SAME eligibility rule.
 * The audit found processBulkPayout with NO check at all, unlike processPayout.
 */
describe('PayoutsService — S0 payout eligibility guard', () => {
  let payoutRepo: any;
  let orderRepo: any;
  let paymentEvidence: any;
  let service: PayoutsService;

  const order = (over: any = {}) => ({
    id: 1, seller: { id: 5 }, paymentStatus: PaymentStatus.PAID, payoutStatus: 'pending',
    source: OrderSource.ONLINE, paymentMethod: OrderPaymentMethod.ONLINE, totalAmount: 198000, codUpfrontAmount: null,
    ...over,
  });

  beforeEach(() => {
    payoutRepo = { findOne: jest.fn(), save: jest.fn((x: any) => x), find: jest.fn() };
    orderRepo = { findOne: jest.fn(), save: jest.fn(), update: jest.fn() };
    paymentEvidence = { check: jest.fn() };
    service = new PayoutsService(payoutRepo, orderRepo, paymentEvidence);
  });

  describe('processPayout (single)', () => {
    it('rejects an unpaid order (existing behavior preserved)', async () => {
      orderRepo.findOne.mockResolvedValue(order({ paymentStatus: PaymentStatus.PENDING }));
      await expect(service.processPayout(1, 'mpesa', 'REF1')).rejects.toThrow(BadRequestException);
    });

    it('rejects a "paid" checkout order lacking verified payment evidence', async () => {
      orderRepo.findOne.mockResolvedValue(order());
      paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: false });
      await expect(service.processPayout(1, 'mpesa', 'REF1')).rejects.toThrow(BadRequestException);
      expect(payoutRepo.findOne).not.toHaveBeenCalled();
    });

    it('proceeds when evidence is sufficient', async () => {
      orderRepo.findOne.mockResolvedValue(order());
      paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: true });
      payoutRepo.findOne.mockResolvedValue({ id: 1, sellerAmount: 180000, status: PayoutStatus.PENDING });
      const result = await service.processPayout(1, 'mpesa', 'REF1');
      expect(result.status).toBe(PayoutStatus.PAID);
    });
  });

  describe('processBulkPayout — the audit-found gap (was completely unguarded)', () => {
    it('skips an ineligible order in the batch and reports it, rather than paying it out', async () => {
      const eligible = { id: 10, sellerAmount: 5000, status: PayoutStatus.PENDING, order: order({ id: 100 }) };
      const ineligible = { id: 11, sellerAmount: 9000, status: PayoutStatus.PENDING, order: order({ id: 101 }) };
      payoutRepo.find.mockResolvedValue([eligible, ineligible]);
      paymentEvidence.check.mockImplementation(async (o: any) => ({ applicable: true, sufficient: o.id === 100 }));

      const result = await service.processBulkPayout(5, 'mpesa', 'REF-BULK');

      expect(result.count).toBe(1);
      expect(result.skipped).toEqual([{ orderId: 101, reason: expect.any(String) }]);
      expect(eligible.status).toBe(PayoutStatus.PAID);
      expect(ineligible.status).toBe(PayoutStatus.PENDING); // never touched
    });

    it('refuses the whole batch if NONE of the pending payouts are eligible', async () => {
      const ineligible = { id: 11, sellerAmount: 9000, status: PayoutStatus.PENDING, order: order({ id: 101 }) };
      payoutRepo.find.mockResolvedValue([ineligible]);
      paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: false });

      await expect(service.processBulkPayout(5, 'mpesa', 'REF-BULK')).rejects.toThrow(BadRequestException);
    });

    it('processes every order in the batch when all are eligible (previous behavior preserved)', async () => {
      const a = { id: 10, sellerAmount: 5000, status: PayoutStatus.PENDING, order: order({ id: 100 }) };
      const b = { id: 12, sellerAmount: 7000, status: PayoutStatus.PENDING, order: order({ id: 102 }) };
      payoutRepo.find.mockResolvedValue([a, b]);
      paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: true });

      const result = await service.processBulkPayout(5, 'mpesa', 'REF-BULK');
      expect(result.count).toBe(2);
      expect(result.totalPaid).toBe(12000);
    });
  });
});
