import { agentHoldsDelivery, completeSettledSellerShipments, recordSellerCodReceived, settleOrderOnDelivery } from './order-delivery-sync';

/** A manager whose order row is `row`; every statement is kept so the writes can be read back. */
const managerWith = (row: any) => {
  const query = jest.fn(async (sql: string) => {
    if (/FROM public\."order" WHERE id = \$1 FOR UPDATE/.test(sql)) return row ? [row] : [];
    if (/SELECT source::text AS source/.test(sql)) return row ? [{ source: row.source }] : [];
    return [];
  });
  return { query, sql: () => query.mock.calls.map((c) => String(c[0])) };
};
const sellerShipment = (over: any = {}) => ({ id: 7, source: 'seller_shipment', status: 'preparing',
  paymentStatus: 'paid', paymentMethod: 'online', codBalanceCollected: false, ...over });

describe('settleOrderOnDelivery — what an order becomes once the recipient has it', () => {
  it('a paid seller shipment is completed (it used to stay preparing)', async () => {
    const m = managerWith(sellerShipment());
    expect(await settleOrderOnDelivery(m, 7)).toBe('completed');
    expect(m.sql().some((q) => /status = 'completed'/.test(q))).toBe(true);
  });

  it('a seller shipment on pay-on-delivery completes only once the cash is collected', async () => {
    const open = managerWith(sellerShipment({ paymentMethod: 'cod', paymentStatus: 'upfront_paid' }));
    expect(await settleOrderOnDelivery(open, 7)).toBe('delivered');
    const paid = managerWith(sellerShipment({ paymentMethod: 'cod', codBalanceCollected: true, status: 'delivered' }));
    expect(await settleOrderOnDelivery(paid, 7)).toBe('completed');
  });

  it('a marketplace order becomes delivered; the buyer or the auto-confirm completes it', async () => {
    const m = managerWith(sellerShipment({ source: 'online' }));
    expect(await settleOrderOnDelivery(m, 7)).toBe('delivered');
    expect(m.sql().some((q) => /status = 'completed'/.test(q))).toBe(false);
  });

  it('never moves a cancelled, disputed or finished order, and ignores a parcel with no order', async () => {
    for (const status of ['cancelled', 'disputed', 'completed']) {
      const m = managerWith(sellerShipment({ status }));
      expect(await settleOrderOnDelivery(m, 7)).toBe(status);
      expect(m.sql().filter((q) => /^\s*UPDATE/.test(q))).toHaveLength(0);
    }
    const none = managerWith(null);
    expect(await settleOrderOnDelivery(none, null)).toBeNull();
    expect(none.query).not.toHaveBeenCalled();
  });
});

describe('recordSellerCodReceived — the seller says the cash is in', () => {
  it('collects, clears a linked POS sale, drops an untaken delivery request and completes the order', async () => {
    const m = managerWith(sellerShipment({ paymentMethod: 'cod', codBalanceCollected: true }));
    expect(await recordSellerCodReceived(m, 7)).toBe('completed');
    const sql = m.sql();
    expect(sql.some((q) => /"codBalanceCollected" = true/.test(q))).toBe(true);
    expect(sql.some((q) => /UPDATE public\.sale/.test(q))).toBe(true);
    expect(sql.some((q) => /parcel_pickup_task t SET status = 'cancelled'/.test(q) && /t\.status = 'requested'/.test(q))).toBe(true);
  });

  it('a marketplace COD order keeps its delivery state', async () => {
    const m = managerWith(sellerShipment({ source: 'online', paymentMethod: 'cod' }));
    expect(await recordSellerCodReceived(m, 7)).toBeNull();
    expect(m.sql().some((q) => /status = 'completed'|status = 'delivered'/.test(q))).toBe(false);
  });
});

describe('agentHoldsDelivery / completeSettledSellerShipments', () => {
  it('an Agent holds the delivery only once they have claimed or collected it', async () => {
    const query = jest.fn(async () => [{ '?column?': 1 }]);
    expect(await agentHoldsDelivery({ query }, 7)).toBe(true);
    expect((query.mock.calls[0] as any[])[1]).toEqual([7, ['claimed', 'collected']]);
    expect(await agentHoldsDelivery({ query: jest.fn(async () => []) }, 7)).toBe(false);
  });

  it('the daily sweep completes handed-over, paid seller shipments and counts them', async () => {
    const query = jest.fn(async () => [{ id: 1 }, { id: 2 }]);
    expect(await completeSettledSellerShipments({ query })).toBe(2);
    const sql = String((query.mock.calls[0] as any[])[0]);
    expect(sql).toMatch(/source::text = 'seller_shipment'/);
    expect(sql).toMatch(/p\.status::text IN \('delivered', 'self_pickup'\)/);
  });
});
