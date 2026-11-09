import { AdminOverviewService } from './admin-overview.service';

/** Owner 2026-11-09: the admin Muhtasari from database counts, in one call. */
describe('AdminOverviewService', () => {
  it('reads each number from the database; a failing query gives null for that number only', async () => {
    const db = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM public."user"') && !sql.includes('"order"')) return [{ total: '120', today: '3', week: '15' }];
        if (sql.includes('FROM public.identity_profile')) return [{ pending: '4' }];
        if (sql.includes('FROM public.contact_message')) throw new Error('relation does not exist');
        if (sql.includes('FROM public."order" o')) return [{ id: 9, totalAmount: '45000', status: 'pending', createdAt: '2026-11-09', buyerName: 'Asha' }];
        if (sql.includes('FROM public."order"')) return [{ total: '50', today: '2', todayValue: '90000', week: '9', weekValue: '400000', paidValue: '1000000' }];
        return [{}];
      }),
    };
    const r: any = await new AdminOverviewService(db as any).overview();
    expect(r.users).toEqual({ total: 120, today: 3, week: 15 });
    expect(r.orders).toMatchObject({ today: 2, todayValue: 90000, paidValue: 1000000 });
    expect(r.needsAction.identityPending).toBe(4);
    expect(r.needsAction.contactOpen).toBeNull();
    expect(r.recentOrders).toEqual([{ id: 9, totalAmount: 45000, status: 'pending', createdAt: '2026-11-09', buyerName: 'Asha' }]);
  });
});
