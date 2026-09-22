import { BadRequestException } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { OrderSource, OrderPaymentMethod } from '../orders/entities/order.entity';

describe('ShippingService.markPreparing — S0 payment-evidence guard', () => {
  const build = (orderRepo: any, paymentEvidence: any) =>
    new ShippingService(orderRepo, {} as any, { isAuthorizedFor: jest.fn() } as any, paymentEvidence);

  it('rejects an unpaid order (existing behavior preserved)', async () => {
    const orderRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, seller: { id: 5 }, paymentStatus: 'pending' }), save: jest.fn() };
    const svc = build(orderRepo, { check: jest.fn() });
    await expect(svc.markPreparing(1, 5)).rejects.toThrow(BadRequestException);
  });

  it('rejects a checkout order whose paymentStatus says paid but has NO verified payment evidence', async () => {
    const order = { id: 2, seller: { id: 5 }, paymentStatus: 'paid', source: OrderSource.ONLINE, paymentMethod: OrderPaymentMethod.ONLINE, totalAmount: 198000, codUpfrontAmount: null };
    const orderRepo = { findOne: jest.fn().mockResolvedValue(order), save: jest.fn() };
    const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: true, sufficient: false }) };
    const svc = build(orderRepo, paymentEvidence);

    await expect(svc.markPreparing(2, 5)).rejects.toThrow(BadRequestException);
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('allows a paid order with sufficient verified evidence', async () => {
    const order = { id: 3, seller: { id: 5 }, paymentStatus: 'paid', source: OrderSource.ONLINE, paymentMethod: OrderPaymentMethod.ONLINE, totalAmount: 198000, codUpfrontAmount: null };
    const orderRepo = { findOne: jest.fn().mockResolvedValue(order), save: jest.fn((x) => x) };
    const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: true, sufficient: true }) };
    const svc = build(orderRepo, paymentEvidence);

    const result = await svc.markPreparing(3, 5);
    expect(result.status).toBe('preparing');
    expect(orderRepo.save).toHaveBeenCalled();
  });

  it('allows a non-checkout order with paymentStatus paid regardless of evidence applicability', async () => {
    const order = { id: 4, seller: { id: 5 }, paymentStatus: 'paid', source: 'offline', paymentMethod: OrderPaymentMethod.COD, totalAmount: 60000, codUpfrontAmount: 0 };
    const orderRepo = { findOne: jest.fn().mockResolvedValue(order), save: jest.fn((x) => x) };
    const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: false, sufficient: true }) };
    const svc = build(orderRepo, paymentEvidence);

    await svc.markPreparing(4, 5);
    expect(orderRepo.save).toHaveBeenCalled();
  });
});
