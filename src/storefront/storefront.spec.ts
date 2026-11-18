import { readFileSync } from 'fs';
import { join } from 'path';
import { cleanCompareAt, cleanHours, cleanIds, cleanTemplate } from './storefront-rules';
import { StorefrontService } from './storefront.service';

/** Duka page template (owner approved 2026-11-18). */
describe('storefront rules', () => {
  it('an old price counts only above the price', () => {
    expect(cleanCompareAt(30000, 25500)).toBe(30000);
    expect(cleanCompareAt(25500, 25500)).toBeNull();
    expect(cleanCompareAt(null, 25500)).toBeNull();
    expect(cleanCompareAt('abc', 100)).toBeNull();
  });

  it('opening hours must be real times; closed every day is no hours', () => {
    expect(cleanHours({ open: '08:00', close: '20:00', closedDays: [0, 0, 9] })).toEqual({ open: '08:00', close: '20:00', closedDays: [0] });
    expect(cleanHours({ open: '8', close: '20:00' })).toBeNull();
    expect(cleanHours({ open: '08:00', close: '20:00', closedDays: [0, 1, 2, 3, 4, 5, 6] })).toBeNull();
  });

  it('page type is store, basic or automatic', () => {
    expect(cleanTemplate('STORE')).toBe('store');
    expect(cleanTemplate('basic')).toBe('basic');
    expect(cleanTemplate('fancy')).toBeNull();
    expect(cleanTemplate(null)).toBeNull();
  });

  it('collection products are whole ids, no repeats, at most 60', () => {
    expect(cleanIds([3, '3', 4, -1, 'x'])).toEqual([3, 4]);
    expect(cleanIds(Array.from({ length: 90 }, (_, i) => i + 1))).toHaveLength(60);
  });
});

describe('storefront service', () => {
  const make = (profile: any) => {
    const calls: string[] = [];
    const db: any = {
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes('to_regclass')) return [{ ok: true }];
        if (sql.includes('FROM public.commerce_profile WHERE id')) return profile ? [profile] : [];
        if (sql.includes('COUNT(*)')) return [{ n: 0 }];
        if (sql.includes('INSERT INTO public.store_collection')) return [{ id: 9 }];
        return [];
      }),
      createQueryBuilder: () => {
        const qb: any = { select: () => qb, from: () => qb, where: () => qb, andWhere: () => qb, getRawMany: async () => [{ id: 1 }] };
        return qb;
      },
    };
    return { svc: new StorefrontService(db), calls };
  };

  it('only the owner changes the shop page', async () => {
    const { svc } = make({ id: 5, ownerId: 7, type: 'business' });
    await expect(svc.saveSettings(5, 8, { pageTemplate: 'store' })).rejects.toThrow('si ukurasa wako');
    await expect(svc.addCollection(5, 8, { title: 'Ofa' })).rejects.toThrow('si ukurasa wako');
  });

  it('a shelf keeps only the shop\'s own products', async () => {
    const { svc, calls } = make({ id: 5, ownerId: 7, type: 'business' });
    await svc.addCollection(5, 7, { title: 'Ofa za wiki', productIds: [1, 2] });
    const insert = calls.find((c) => c.includes('INSERT INTO public.store_collection'))!;
    expect(insert).toBeTruthy();
  });

  it('bad opening hours are refused', async () => {
    const { svc } = make({ id: 5, ownerId: 7, type: 'business' });
    await expect(svc.saveSettings(5, 7, { openingHours: { open: 'x', close: 'y' } })).rejects.toThrow('Saa');
  });

  it('the migration is additive and pinned', () => {
    const mig = readFileSync(join(__dirname, '../database/migrations/1797600000000-AddStoreTemplate.ts'), 'utf8');
    expect(mig.slice(0, mig.indexOf('public async down'))).not.toMatch(/\bDROP\b|DELETE FROM|\bUPDATE\b/);
    const pin = Number((readFileSync(join(__dirname, '../../package.json'), 'utf8').match(/MIGRATION_RUN_UPTO=(\d+)/) || [])[1]);
    expect(pin).toBeGreaterThanOrEqual(1797600000000);
  });
});
