import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';

// One shipment engine (owner 2026-10-25): a marketplace order is shipped like every
// other send — the seller form books the offer and creates the Shipment, the order goes
// on it, and the same activation starts it. The order keeps its waybill from checkout.
describe('OrdersService.shipWithEngine', () => {
  function build(order: any, shipment: any = { id: 88, requestedByUserId: 7, status: 'pending', orderId: null }, opts: { taken?: boolean } = {}) {
    const writes: Array<[string, any[]]> = [];
    const query = jest.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM public.shipment WHERE id')) return shipment ? [shipment] : [];
      if (sql.includes('FROM public.shipment WHERE "orderId"')) return opts.taken ? [{ '?column?': 1 }] : [];
      if (sql.includes('FROM public.parcel WHERE id')) return [{ trackingNumber: 'KTX-ORD-9', waybillNumber: 'KTX0000000018' }];
      writes.push([sql.replace(/\s+/g, ' ').trim(), params]);
      return [];
    });
    const svc: any = Object.create(OrdersService.prototype);
    svc.repo = { findOne: jest.fn(async () => order), manager: { query } };
    svc.assertVerifiedPaymentEvidence = jest.fn(async () => undefined);
    svc.shipmentActivation = { confirmAndActivate: jest.fn(async () => ({ parcel: { id: 70 }, nextAction: { kind: 'office_dropoff' } })) };
    return { svc: svc as OrdersService, raw: svc, writes };
  }
  const order = (extra: any = {}) => ({ id: 9, status: 'paid', seller: { id: 5 }, product: { productType: 'physical' }, codRemainingBalance: null, ...extra });
  const seller = { id: 5 } as any;

  it('puts the order on the seller\'s Shipment, starts it, and answers with the order\'s own waybill', async () => {
    const t = build(order());
    const r: any = await t.svc.shipWithEngine(9, seller, 7, { shipmentId: 88, confirm: {} });
    expect(t.writes[0]).toEqual([expect.stringMatching(/UPDATE public.shipment SET "orderId" = \$2/), [88, 9]]);
    expect(t.raw.shipmentActivation.confirmAndActivate).toHaveBeenCalledWith(7, 88, {});
    expect(t.writes[1][0]).toMatch(/UPDATE public."order" SET status = \$2/);
    expect(t.writes[1][1]).toEqual([9, 'preparing', 'Imetumwa kupitia KenteXa']);
    expect(r).toMatchObject({ orderId: 9, customerNumber: expect.stringMatching(/^KTX/), nextAction: { kind: 'office_dropoff' } });
  });

  it('if starting fails, the Shipment is freed and the order is left as it was', async () => {
    const t = build(order());
    t.raw.shipmentActivation.confirmAndActivate = jest.fn(async () => { throw new BadRequestException('no office'); });
    await expect(t.svc.shipWithEngine(9, seller, 7, { shipmentId: 88 })).rejects.toThrow('no office');
    expect(t.writes.map((w) => w[0])).toEqual([
      expect.stringMatching(/SET "orderId" = \$2/), expect.stringMatching(/SET "orderId" = NULL/),
    ]);
  });

  it('refused: another seller\'s order, unpaid, pay-on-delivery still owed, another person\'s or used Shipment, already shipped', async () => {
    await expect(build(order({ seller: { id: 6 } })).svc.shipWithEngine(9, seller, 7, { shipmentId: 88 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build(order({ status: 'pending_payment' })).svc.shipWithEngine(9, seller, 7, { shipmentId: 88 })).rejects.toThrow('Order must be paid');
    await expect(build(order({ codRemainingBalance: 50000 })).svc.shipWithEngine(9, seller, 7, { shipmentId: 88 })).rejects.toThrow(/kulipa ukipokea/);
    await expect(build(order(), { id: 88, requestedByUserId: 8, status: 'pending', orderId: null }).svc.shipWithEngine(9, seller, 7, { shipmentId: 88 }))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(build(order(), { id: 88, requestedByUserId: 7, status: 'confirmed', orderId: null }).svc.shipWithEngine(9, seller, 7, { shipmentId: 88 }))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(build(order(), undefined, { taken: true }).svc.shipWithEngine(9, seller, 7, { shipmentId: 88 })).rejects.toThrow('imeshatumwa');
  });
});
