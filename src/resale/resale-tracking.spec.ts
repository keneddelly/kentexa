import { ResaleService } from './resale.service';
import { ResaleNudgeService, NUDGE_SQL } from './resale-nudge.service';
import { cleanSource } from './resale-rules';

// "Uza tena" growth (owner 2026-11-10): where buyers come from, and the one-day reminder.
describe('Uza tena: link sources', () => {
  const row = { id: 7, productId: 3, price: '55000.00', note: null, isActive: true, resaleOpen: true, resalePrice: '42000.00', resaleMinPrice: null, resellerId: 20, resellerName: 'Neema', resellerPhoto: null };
  const build = (opens: any[] = []) => {
    const calls: any[] = [];
    const db: any = { query: jest.fn(async (sql: string, params: any[]) => {
      calls.push([sql, params]);
      if (sql.includes('JOIN public."user" u')) return [row];
      if (sql.includes('FROM public.resale_offer_open')) return opens;
      if (sql.includes('WHERE o."resellerUserId" = $1::int')) return [{ ...row, name: 'Simu', images: 'a.jpg', stock: 3, orders: '1' }];
      return [];
    }) };
    return { svc: new ResaleService(db, { record: jest.fn() } as any), calls };
  };

  it('only status and share are sources', () => {
    expect(cleanSource('status')).toBe('status');
    expect(cleanSource('share')).toBe('share');
    expect(cleanSource('evil')).toBeNull();
    expect(cleanSource(undefined)).toBeNull();
  });

  it('an open with a source is counted for the day; without one nothing is written', async () => {
    const a = build();
    await a.svc.publicOffer(7, 'status');
    const insert = a.calls.find(([s]) => s.includes('INSERT INTO public.resale_offer_open'));
    expect(insert[1]).toEqual([7, 'status']);
    const b = build();
    await b.svc.publicOffer(7);
    await b.svc.publicOffer(7, 'nonsense');
    expect(b.calls.some(([s]) => s.includes('INSERT INTO public.resale_offer_open'))).toBe(false);
  });

  it('my offers show the opens of the last 30 days by source', async () => {
    const { svc } = build([{ offerId: 7, source: 'status', n: 8 }, { offerId: 7, source: 'share', n: 3 }]);
    const [o] = await svc.myOffers(20);
    expect(o.opens).toEqual({ status: 8, share: 3, total: 11 });
  });
});

describe('Uza tena: the one-day reminder', () => {
  it('reminds each member returned once, pointing to the products to resell', async () => {
    const db: any = { query: jest.fn(async () => [{ userId: 20 }, { userId: 21 }]) };
    const notifier: any = { notify: jest.fn(async () => ({})) };
    const n = await new ResaleNudgeService(db, notifier).remind();
    expect(n).toBe(2);
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 20, type: 'resale_nudge', actionPage: 'MyResales' }));
  });

  it('only people who joined 24 to 48 hours ago, have no offer, and were not reminded', () => {
    expect(NUDGE_SQL).toMatch(/"nudgedAt" IS NULL/);
    expect(NUDGE_SQL).toMatch(/interval '24 hours'/);
    expect(NUDGE_SQL).toMatch(/interval '48 hours'/);
    expect(NUDGE_SQL).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.resale_offer o/);
    expect(NUDGE_SQL).toMatch(/SET "nudgedAt" = now\(\)/);
  });

  it('before the migration ran it does nothing', async () => {
    const db: any = { query: jest.fn(async () => { throw new Error('column "nudgedAt" does not exist'); }) };
    expect(await new ResaleNudgeService(db, { notify: jest.fn() } as any).remind()).toBe(0);
  });
});
