import { ResaleWeeklyService, resellerMessage, shopMessage, weekNumber, RESELLER_WEEK_SQL, SHOP_WEEK_SQL } from './resale-weekly.service';

// "Uza tena" weekly summary (owner 2026-11-10): real numbers only, nothing when there is nothing.
describe('Uza tena weekly summary', () => {
  it('reseller line: opens, orders and profit on its way; silent with nothing', () => {
    expect(resellerMessage({ opens: 11, orders: 2, coming: 26000 }))
      .toBe('Wiki hii watu 11 wamefungua viungo vyako, oda 2. Faida inayokuja: TZS 26,000.');
    expect(resellerMessage({ opens: 4, orders: 0, coming: 0 }))
      .toBe('Wiki hii watu 4 wamefungua viungo vyako. Shiriki tena kwenye WhatsApp Status ili uuze zaidi.');
    expect(resellerMessage({ opens: 0, orders: 0, coming: 13000 })).toBe('Wiki hii hakuna oda mpya. Faida inayokuja: TZS 13,000.');
    expect(resellerMessage({ opens: 0, orders: 0, coming: 0 })).toBeNull();
  });

  it('shop line: sales, resellers and the profit to pay; silent with no sales', () => {
    expect(shopMessage({ sales: 5, resellers: 3, toPay: 39000 }))
      .toBe('Wauzaji 3 wameuza bidhaa zako mara 5 wiki hii. Faida ya kuwalipa (ndani ya siku 3 baada ya mteja kupokea): TZS 39,000.');
    expect(shopMessage({ sales: 1, resellers: 1, toPay: 0 })).toBe('Muuzaji 1 ameuza bidhaa zako mara 1 wiki hii.');
    expect(shopMessage({ sales: 0, resellers: 0, toPay: 5000 })).toBeNull();
  });

  it('sends once per person per week, skipping people with nothing to report', async () => {
    const week = weekNumber(new Date('2026-11-16T05:07:00Z'));
    const db: any = { query: jest.fn(async (sql: string) => {
      if (sql.includes("sourceType\" = 'resale_weekly'")) return [{ userId: 22 }];
      if (sql === RESELLER_WEEK_SQL) return [
        { userId: 20, opens: 11, orders: 2, coming: '26000' },
        { userId: 21, opens: 0, orders: 0, coming: '0' },
        { userId: 22, opens: 3, orders: 0, coming: '0' },
      ];
      if (sql === SHOP_WEEK_SQL) return [{ userId: 9, sales: 2, resellers: 1, toPay: '13000' }];
      return [];
    }) };
    const notifier: any = { notify: jest.fn(async () => ({})) };
    const out = await new ResaleWeeklyService(db, notifier).send(new Date('2026-11-16T05:07:00Z'));
    expect(out).toEqual({ resellers: 1, shops: 1 });
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 20, type: 'resale_weekly', sourceType: 'resale_weekly', sourceId: week }));
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, title: 'Uza tena: wiki hii dukani kwako' }));
    expect(notifier.notify).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 21 }));
    expect(notifier.notify).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 22 }));
  });

  it('does nothing if the tables are not there yet', async () => {
    const db: any = { query: jest.fn(async () => { throw new Error('relation does not exist'); }) };
    expect(await new ResaleWeeklyService(db, { notify: jest.fn() } as any).send()).toEqual({ resellers: 0, shops: 0 });
  });
});
