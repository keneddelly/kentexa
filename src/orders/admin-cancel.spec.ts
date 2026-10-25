import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

// Owner 2026-10-25: admin must be able to remove orders (the old button used the
// buyer's cancel, which accepts unpaid orders only). Cancelled, never erased.
describe('OrdersService.adminCancel', () => {
  const admin = { roleType: AccountRoleType.ADMIN } as any;
  function build(order: any, parcels: any[] = []) {
    const writes: string[] = [];
    const m = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM public."order"')) return order ? [order] : [];
      if (sql.includes('FROM public.parcel WHERE')) return parcels;
      writes.push(sql.replace(/\s+/g, ' ').trim().slice(0, 40));
      return [];
    }) };
    const svc: any = Object.create(OrdersService.prototype);
    svc.repo = { manager: { transaction: async (fn: any) => fn(m) } };
    svc.productsService = { decreaseStock: jest.fn(async () => undefined) };
    svc.activityEvents = { record: jest.fn() };
    return { svc: svc as OrdersService, writes, m, raw: svc };
  }
  const order = (extra: any = {}) => ({ id: 9, status: 'preparing', paymentMethod: 'cod', paymentStatus: 'pending', productId: 4, quantity: 2, sellerId: 5, ...extra });

  it('a pay-on-delivery order being prepared: cancelled, its waiting parcel leaves every list, stock back, reason kept', async () => {
    const t = build(order(), [{ id: 70, status: 'pending', shipmentId: 80 }]);
    const r = await t.svc.adminCancel(9, { id: 1 } as any, ' Oda ya majaribio ', admin);
    expect(r).toMatchObject({ orderId: 9, status: 'cancelled', replay: false });
    expect(t.writes.join(' | ')).toMatch(/UPDATE public."order" SET status = 'cancelled'/);
    expect(t.writes.join(' | ')).toMatch(/UPDATE public.shipment SET status = 'cancelled'/);
    expect(t.writes.join(' | ')).toMatch(/UPDATE public.parcel_pickup_task/);
    expect(t.raw.productsService.decreaseStock).toHaveBeenCalledWith(4, -2, expect.anything(), expect.objectContaining({ referenceId: 9 }));
    expect(t.raw.activityEvents.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ORDER_CANCELLED', actorType: 'admin', metadata: expect.objectContaining({ reason: 'Oda ya majaribio', previousStatus: 'preparing' }),
    }));
  });

  it('twice: the second time changes nothing', async () => {
    const t = build(order({ status: 'cancelled' }));
    await expect(t.svc.adminCancel(9, { id: 1 } as any, 'tena', admin)).resolves.toMatchObject({ replay: true });
    expect(t.writes).toEqual([]);
    expect(t.raw.activityEvents.record).not.toHaveBeenCalled();
  });

  it('refused: delivered, parcel already at an office, paid online, no reason, not admin', async () => {
    await expect(build(order({ status: 'delivered' })).svc.adminCancel(9, {} as any, 'sababu', admin)).rejects.toThrow('imeshafikishwa');
    await expect(build(order(), [{ id: 70, status: 'received_at_hub' }]).svc.adminCancel(9, {} as any, 'sababu', admin))
      .rejects.toThrow('umeshapokelewa ofisini');
    await expect(build(order({ paymentMethod: 'online', paymentStatus: 'paid' })).svc.adminCancel(9, {} as any, 'sababu', admin))
      .rejects.toThrow('Mrudishie pesa');
    await expect(build(order()).svc.adminCancel(9, {} as any, ' ', admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(build(order()).svc.adminCancel(9, {} as any, 'sababu', { roleType: AccountRoleType.SELLER } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
