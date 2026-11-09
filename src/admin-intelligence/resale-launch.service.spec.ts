import { ResaleLaunchService } from './resale-launch.service';

/** "Uza tena" launch numbers (owner 2026-11-10): from the records only. */
describe('Uza tena launch numbers', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const ago = (d: number) => new Date(now - d * 86400000).toISOString();
  const order = (o: any) => ({ status: 'delivered', resellerProfit: '13000', totalAmount: '58000', productNameSnapshot: 'Simu',
    sellerId: 9, resellerUserId: 20, supplierName: 'BIS', resellerName: 'Neema', resellerPhone: '+255700000001', ...o });
  const rows = [
    order({ id: 1, createdAt: ago(1), deliveredAt: ago(0.5) }),                                        // owed
    order({ id: 2, createdAt: ago(9), deliveredAt: ago(8) }),                                          // late
    order({ id: 3, createdAt: ago(9), deliveredAt: ago(8), resellerPaidAt: ago(7), resellerConfirmedAt: ago(7) }), // paid in 1 day
    order({ id: 4, createdAt: ago(2), status: 'preparing', resellerUserId: 21, resellerName: 'Juma' }), // coming
    order({ id: 5, createdAt: ago(3), deliveredAt: ago(2), resellerPaidAt: ago(1), resellerDisputedAt: ago(0.5), resellerPaidRef: 'QK1' }),
  ];
  const build = (fail = false) => {
    const db: any = { query: jest.fn(async (sql: string) => {
      if (fail) throw new Error('missing table');
      if (sql.includes('count(DISTINCT p."sellerId")')) return [{ suppliers: 2, products: 15, resellers: 7, offers: 11, members: 9 }];
      return rows;
    }) };
    return new ResaleLaunchService(db);
  };

  it('network, weeks, profit states, pay speed, problems and leaders', async () => {
    const r: any = await build().launch(now);
    expect(r.network).toEqual({ suppliers: 2, products: 15, resellers: 7, offers: 11, members: 9 });
    expect(r.weeks).toHaveLength(8);
    expect(r.weeks.find((w: any) => w.weekAgo === 0)).toMatchObject({ orders: 3, delivered: 2, profit: 26000 });
    expect(r.weeks.find((w: any) => w.weekAgo === 1)).toMatchObject({ orders: 2, delivered: 2 });
    expect(r.profits).toMatchObject({ coming: { count: 1 }, owed: { count: 1, amount: 13000 }, late: { count: 1 }, confirmed: { count: 1 }, disputed: { count: 1 } });
    expect(r.payDays).toEqual({ paid: 2, median: 1, withinThree: 2 });
    expect(r.problems.map((p: any) => [p.orderId, p.state])).toEqual([[2, 'late'], [5, 'disputed']]);
    expect(r.topResellers[0]).toMatchObject({ id: 20, name: 'Neema', orders: 4, delivered: 4 });
  });

  it('a part that cannot be read is null, never made up', async () => {
    const r: any = await build(true).launch(now);
    expect(r).toEqual({ network: null, weeks: null, profits: null, payDays: null, problems: null, topResellers: null, topSuppliers: null });
  });
});
