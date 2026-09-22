import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DailyBatchesService } from './daily-batches.service';
import { OrderSource, OrderPaymentMethod } from '../orders/entities/order.entity';

const anyStub: any = new Proxy(function () {}, {
  get: (_t, p) => (p === 'then' || typeof p === 'symbol' ? undefined : anyStub),
  apply: () => Promise.resolve(undefined),
});
const build = (props: Record<string, unknown>): DailyBatchesService =>
  new Proxy(Object.assign(Object.create(DailyBatchesService.prototype), props), {
    get: (t, p, r) => (p in t ? Reflect.get(t, p, r) : typeof p === 'symbol' ? undefined : anyStub),
  }) as DailyBatchesService;

describe('DailyBatchesService.assignOrderToBatch — S0 payment-evidence guard', () => {
  const seller = { id: 5 };
  const order = (over: any = {}) => ({
    id: 1, seller, buyer: null, product: null,
    source: OrderSource.ONLINE, paymentMethod: OrderPaymentMethod.ONLINE,
    totalAmount: 198000, codUpfrontAmount: null,
    ...over,
  });

  it('had NO payment check at all before S0 — now rejects a checkout order with insufficient evidence, before ever touching the parcel/batch tables', async () => {
    const orderRepo = { findOne: jest.fn().mockResolvedValue(order()) };
    const parcelRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
    const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: true, sufficient: false }) };
    const svc = build({ orderRepo, parcelRepo, paymentEvidence });

    await expect(svc.assignOrderToBatch(1, seller as any)).rejects.toThrow(BadRequestException);
    expect(parcelRepo.findOne).not.toHaveBeenCalled();
  });

  it('proceeds (reaches the duplicate-assignment check) once evidence is sufficient', async () => {
    const orderRepo = { findOne: jest.fn().mockResolvedValue(order()) };
    const parcelRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: true, sufficient: true }) };
    const detectZone = jest.fn().mockResolvedValue(null); // stop here — proves the guard let us past
    const svc = build({ orderRepo, parcelRepo, paymentEvidence, detectZone });

    await expect(svc.assignOrderToBatch(1, seller as any)).rejects.toThrow(BadRequestException); // "no known zone" — different, later failure
    expect(parcelRepo.findOne).toHaveBeenCalled();
  });

  it('a non-checkout order (evidence not applicable) is never blocked by this guard', async () => {
    const orderRepo = { findOne: jest.fn().mockResolvedValue(order({ source: 'seller_shipment' })) };
    const parcelRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: false, sufficient: true }) };
    const detectZone = jest.fn().mockResolvedValue(null);
    const svc = build({ orderRepo, parcelRepo, paymentEvidence, detectZone });

    await expect(svc.assignOrderToBatch(1, seller as any)).rejects.toThrow(BadRequestException); // still reaches the zone check
    expect(parcelRepo.findOne).toHaveBeenCalled();
  });

  it('rejects for a non-owning seller before ever checking payment evidence', async () => {
    const orderRepo = { findOne: jest.fn().mockResolvedValue(order({ seller: { id: 999 } })) };
    const paymentEvidence = { check: jest.fn() };
    const svc = build({ orderRepo, paymentEvidence });

    await expect(svc.assignOrderToBatch(1, seller as any)).rejects.toThrow(BadRequestException);
    expect(paymentEvidence.check).not.toHaveBeenCalled();
  });
});
