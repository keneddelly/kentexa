import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { computeRouteRange, routePrice, MIN_OTHER_OFFICES } from './route-range';
import { RouteRangeService } from './route-range.service';
import { OfficePriceService } from './office-price.service';
import { checkChargedAmount, quoteOfficePrice } from './office-price';
import { SuperAgentStatus } from './entities/super-agent.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const rate = (officeId: number, ratePerKg: number, minimumCharge = 0) => ({ officeId, ratePerKg, minimumCharge });

describe('route range calculation', () => {
  it('one office\'s price: rate x kg, at least the minimum, rounded up to 100', () => {
    expect(routePrice({ ratePerKg: 2950, minimumCharge: 0 }, 2)).toBe(5900);
    expect(routePrice({ ratePerKg: 1000, minimumCharge: 4050 }, 1)).toBe(4100);
  });

  it(`no range until ${MIN_OTHER_OFFICES} other offices have a rate`, () => {
    const r = computeRouteRange([rate(1, 3000), rate(2, 3300), rate(3, 3700)], 1, 2);
    expect(r).toEqual({ weightKg: 2, officeCount: 3, range: null, mine: 6000, position: null });
    // Without this office's own rate, two other offices are still too few.
    expect(computeRouteRange([rate(2, 3300), rate(3, 3700)], 1, 2).range).toBeNull();
  });

  it('the range ends are rounded so no end is one office\'s exact price', () => {
    const r = computeRouteRange([rate(1, 3000), rate(2, 2850), rate(3, 3350), rate(4, 4150)], 1, 2);
    const othersExact = [5700, 6700, 8300];
    expect(r.range).toEqual({ low: 5000, middle: 6500, high: 9000 });
    for (const v of Object.values(r.range!)) expect(othersExact).not.toContain(v);
    expect(r.mine).toBe(6000);
  });

  it('this office\'s position is a third, never a rank', () => {
    const others = [rate(2, 3000), rate(3, 3500), rate(4, 4000)];
    expect(computeRouteRange([rate(1, 2000), ...others], 1, 1).position).toBe('low');
    expect(computeRouteRange([rate(1, 3600), ...others], 1, 1).position).toBe('middle');
    expect(computeRouteRange([rate(1, 5000), ...others], 1, 1).position).toBe('high');
    // No own rate on the route: a range, but no position.
    expect(computeRouteRange(others.concat(rate(5, 4500)), 1, 1)).toEqual(expect.objectContaining({ mine: null, position: null }));
  });

  it('one price per office; a rate of 0 is ignored; a bad weight counts as 1 kg', () => {
    const r = computeRouteRange([rate(2, 3000), rate(2, 9000), rate(3, 0), rate(4, 3500), rate(5, 4000)], 1, -3);
    expect(r).toEqual(expect.objectContaining({ weightKg: 1, officeCount: 3, mine: null }));
    expect(r.range).toEqual({ low: 3000, middle: 3500, high: 4000 });
  });
});

// ── The service, with an in-memory shipping_rate table ────────────────────────
const office = (id: number, businessName: string, extra: any = {}) =>
  ({ id, userId: id, businessName, city: 'Dar es Salaam', status: SuperAgentStatus.ACTIVE, isTrainingOffice: false, workspaceId: null, ...extra });

function setup() {
  const mine = office(10, 'Ofisi Yangu Kariakoo');
  const rows = [
    { superAgent: mine, originCity: 'Dar es Salaam', destinationCity: 'Mwanza', ratePerKg: 3000, minimumCharge: 0, isActive: true },
    { superAgent: office(11, 'Mwenge Express Cargo'), originCity: 'Dar es Salaam', destinationCity: 'Mwanza', ratePerKg: 2850, minimumCharge: 0, isActive: true },
    { superAgent: office(12, 'Ubungo Parcel Point'), originCity: 'dar es salaam', destinationCity: 'MWANZA', ratePerKg: 3350, minimumCharge: 0, isActive: true },
    { superAgent: office(13, 'Tegeta Haraka'), originCity: 'Dar es Salaam', destinationCity: 'Mwanza', ratePerKg: 4150, minimumCharge: 0, isActive: true },
    // Never counted: a training office, a suspended office, an inactive rate, another route.
    { superAgent: office(14, 'Ofisi ya Mafunzo', { isTrainingOffice: true }), originCity: 'Dar es Salaam', destinationCity: 'Mwanza', ratePerKg: 100, minimumCharge: 0, isActive: true },
    { superAgent: office(15, 'Imesimamishwa Ltd', { status: SuperAgentStatus.SUSPENDED }), originCity: 'Dar es Salaam', destinationCity: 'Mwanza', ratePerKg: 99000, minimumCharge: 0, isActive: true },
    { superAgent: office(16, 'Zamani Cargo'), originCity: 'Dar es Salaam', destinationCity: 'Mwanza', ratePerKg: 50, minimumCharge: 0, isActive: false },
    { superAgent: office(17, 'Arusha Only'), originCity: 'Dar es Salaam', destinationCity: 'Arusha', ratePerKg: 2000, minimumCharge: 0, isActive: true },
  ];
  const like = (v: any, s: string) => (v && v._type === 'ilike' ? String(s).toLowerCase() === String(v._value).toLowerCase() : v === s);
  const rates = { find: jest.fn(async ({ where }: any) => rows.filter((r: any) =>
    like(where.originCity, r.originCity) && like(where.destinationCity, r.destinationCity) && r.isActive === where.isActive)) };
  const offices = { findOne: jest.fn(async ({ where }: any) => (where.id === 10 && where.status === SuperAgentStatus.ACTIVE ? mine : null)) };
  const prices = new OfficePriceService({} as any, {} as any, offices as any, {} as any);
  return { service: new RouteRangeService(rates as any, prices), rows };
}
const ctx = { roleType: AccountRoleType.SUPER_AGENT, userId: 10, profileId: 10, workspaceId: null } as any;
const me = { id: 10 } as any;

describe('RouteRangeService', () => {
  it('gives the rounded range and this office\'s position, from live offices only', async () => {
    const { service } = setup();
    const r = await service.mine(me, ctx, { destinationCity: ' mwanza ', weightKg: '2' });
    expect(r).toEqual({ destinationCity: 'mwanza', weightKg: 2, officeCount: 4, range: { low: 5000, middle: 6500, high: 9000 }, mine: 6000, position: 'middle' });
  });

  it('never includes another office\'s name, id or exact price', async () => {
    const { service, rows } = setup();
    const text = JSON.stringify(await service.mine(me, ctx, { destinationCity: 'Mwanza', weightKg: 2 }));
    for (const r of rows.filter((x) => x.superAgent.id !== 10)) {
      expect(text).not.toContain(r.superAgent.businessName);
      expect(text).not.toMatch(new RegExp(`"(id|officeId|superAgentId)":${r.superAgent.id}\\b`));
      expect(text).not.toContain(String(routePrice(r, 2)));
    }
    expect(text).not.toMatch(/businessName|officeId|superAgent|userId/);
  });

  it('no destination: no range; another role or office cannot ask', async () => {
    const { service } = setup();
    expect((await service.mine(me, ctx, { destinationCity: '' })).range).toBeNull();
    await expect(service.mine(me, { ...ctx, roleType: AccountRoleType.AGENT }, { destinationCity: 'Mwanza' })).rejects.toThrow(ForbiddenException);
    await expect(service.mine(me, { ...ctx, profileId: 11 }, { destinationCity: 'Mwanza' })).rejects.toThrow(ForbiddenException);
  });
});

describe('counter: manual price', () => {
  const quote = quoteOfficePrice({ rule: { chargeMode: 'value', valuePercent: 10, valueMinimum: 5000 }, kgRate: null, declaredValue: 160000 });

  it('a manual price is always accepted: any amount from 0 up, with a reason when it differs', () => {
    for (const amount of [0, 1, 4999, 15900, 16000, 16100, 250000]) {
      expect(() => checkChargedAmount(quote, amount, 'Mteja wa kudumu')).not.toThrow();
    }
    // The same amount as the suggestion needs no reason.
    expect(checkChargedAmount(quote, quote.total, undefined)).toEqual({ changed: false, reason: null });
  });

  it('a reason is required, and saved, when the price differs from the suggestion', () => {
    for (const reason of [undefined, '', '  ', 'ab', 42]) expect(() => checkChargedAmount(quote, quote.total - 1000, reason)).toThrow('REASON_REQUIRED');
    expect(checkChargedAmount(quote, quote.total - 1000, '  Punguzo la mteja  ')).toEqual({ changed: true, reason: 'Punguzo la mteja' });
  });

  it('a by-kg office with no rate for the town: no suggestion, the agent types any price, so the counter is never blocked', () => {
    const q = quoteOfficePrice({ rule: { chargeMode: 'kg', valuePercent: 10, valueMinimum: 5000 }, kgRate: null, declaredValue: 90000, weightKg: 2 });
    expect(q.noSuggestion).toBe(true);
    expect(checkChargedAmount(q, 7000, undefined)).toEqual({ changed: true, reason: null });
    expect(checkChargedAmount(q, 7000, 'Bei ya mji huu')).toEqual({ changed: true, reason: 'Bei ya mji huu' });
  });
});
