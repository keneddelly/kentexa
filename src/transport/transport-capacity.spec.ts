import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TransportService } from './transport.service';
import { capacityWeightKg, releaseSlotAtomic, reserveSlotAtomic } from './slot-capacity';
import { AvailabilityStatus, ProviderAvailability } from './entities/provider-availability.entity';
import { ProviderStatus, TransportProvider } from './entities/transport-provider.entity';

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const placeholders = (sql: string) => new Set(sql.match(/\$\d+/g) || []).size;

describe('capacityWeightKg — the single canonical weight rule', () => {
  it.each([[undefined, 1], [null, 1], ['', 1], [0, 1], ['0', 1], [2, 2], ['2.50', 2.5], [0.4, 0.4]])(
    '%p -> %p (unspecified means the agreed 1 kg fallback)',
    (raw, expected) => expect(capacityWeightKg(raw)).toBe(expected),
  );
  it.each([[NaN], [-1], ['abc'], [Infinity], [-Infinity]])('%p is rejected, never allowed to corrupt arithmetic', (raw) => {
    expect(() => capacityWeightKg(raw)).toThrow(BadRequestException);
  });
});

describe('reserveSlotAtomic / releaseSlotAtomic — SQL contract', () => {
  const managerReturning = (rows: any[]) => {
    const query = jest.fn(async () => rows);
    return { manager: { query } as any, query };
  };

  it('strict reserve is ONE conditional UPDATE whose WHERE re-asserts status, date, free slot, kg, provider and route', async () => {
    const { manager, query } = managerReturning([{ id: 3 }]);
    const ok = await reserveSlotAtomic(manager, 3, 12.5, { today: TODAY, providerId: 5, routeId: 8 });
    expect(ok).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, any[]];
    expect(sql).toMatch(/^\s*UPDATE public\.provider_availability/);
    for (const clause of [
      `"usedSlots" < "totalSlots"`, `"status" = 'open'`, `"date" >= $3::date`, `"providerId" = $4`, `"routeId" = $5`,
      `("totalCapacityKg" = 0 OR ("totalCapacityKg" - "usedCapacityKg") >= $2::numeric)`,
    ]) expect(sql).toContain(clause);
    // arithmetic is done by PostgreSQL in numeric, never in JS
    expect(sql).toContain(`"usedCapacityKg" = "usedCapacityKg" + $2::numeric`);
    expect(sql).toContain(`"usedSlots" = "usedSlots" + 1`);
    expect(sql).toContain(`CASE WHEN "usedSlots" + 1 >= "totalSlots" THEN 'full'`);
    expect(params).toEqual([3, 12.5, TODAY, 5, 8]);
    expect(placeholders(sql)).toBe(params.length);
  });

  it('with NO expected route the UPDATE adds no route clause at all (no route requirement is invented); placeholder count == parameter count', async () => {
    const { manager, query } = managerReturning([{ id: 3 }]);
    await reserveSlotAtomic(manager, 3, 1, { today: TODAY, providerId: 5 });
    const [sql, params] = query.mock.calls[0] as unknown as [string, any[]];
    expect(sql).not.toContain('"routeId"');
    expect(params).toEqual([3, 1, TODAY, 5]);
    expect(placeholders(sql)).toBe(params.length);
  });

  it('an expected route is asserted by equality, so a route-less (NULL) slot can never satisfy it', async () => {
    const { manager, query } = managerReturning([{ id: 3 }]);
    await reserveSlotAtomic(manager, 3, 1, { today: TODAY, providerId: 5, routeId: 8 });
    const [sql] = query.mock.calls[0] as unknown as [string, any[]];
    expect(sql).toContain('AND "routeId" = $5');
    expect(sql).not.toContain('IS NULL');
    expect(sql).not.toContain('IS NOT DISTINCT');
  });

  it('non-strict (legacy createAssignment path) keeps only its previous condition: a free slot', async () => {
    const { manager, query } = managerReturning([{ id: 3 }]);
    await reserveSlotAtomic(manager, 3, 4);
    const [sql, params] = query.mock.calls[0] as unknown as [string, any[]];
    expect(sql).toContain(`id = $1 AND "usedSlots" < "totalSlots"`);
    expect(sql).not.toContain(`"status" = 'open'`);
    expect(sql).not.toContain('"providerId"');
    expect(params).toEqual([3, 4]);
    expect(placeholders(sql)).toBe(2);
  });

  it.each([
    ['[]', []],
    ['[[], 0]', [[], 0]],
  ])('reports false when no row was updated (%s)', async (_n, rows) => {
    const { manager } = managerReturning(rows as any);
    expect(await reserveSlotAtomic(manager, 3, 1, { today: TODAY, providerId: 5 })).toBe(false);
  });

  it('understands the [rows, affected] result shape too', async () => {
    const { manager } = managerReturning([[{ id: 3 }], 1] as any);
    expect(await reserveSlotAtomic(manager, 3, 1)).toBe(true);
  });

  it('release never underflows and only ever reopens a FULL slot (DEPARTED/CANCELLED stay as they are)', async () => {
    const { manager, query } = managerReturning([{ id: 3 }]);
    expect(await releaseSlotAtomic(manager, 3, 2)).toBe(true);
    const [sql, params] = query.mock.calls[0] as unknown as [string, any[]];
    expect(sql).toContain(`"usedSlots" > 0`);
    expect(sql).toContain(`GREATEST(0, "usedCapacityKg" - $2::numeric)`);
    expect(sql).toContain(`CASE WHEN "status" = 'full' AND "usedSlots" - 1 < "totalSlots" THEN 'open' ELSE "status" END`);
    expect(sql).not.toMatch(/'departed'|'cancelled'/);
    expect(params).toEqual([3, 2]);
  });
});

describe('TransportService.reserveSlot — validated, fail-closed attach', () => {
  const slot = (o: Partial<ProviderAvailability> = {}): ProviderAvailability =>
    ({
      id: 3, providerId: 5, routeId: null, status: AvailabilityStatus.OPEN, date: TODAY, totalSlots: 5, usedSlots: 0,
      totalCapacityKg: 100, usedCapacityKg: 0, ...o,
    }) as any;

  const build = (opts: { slot?: any; provider?: any; updateRows?: any[] } = {}) => {
    const query = jest.fn(async () => opts.updateRows ?? [{ id: 3 }]);
    const availRepo = { findOne: jest.fn(async () => (opts.slot === undefined ? slot() : opts.slot)) };
    const providerRepo = {
      findOne: jest.fn(async () => (opts.provider === undefined ? { id: 5, status: ProviderStatus.VERIFIED } : opts.provider)),
    };
    const manager: any = {
      query,
      getRepository: (cls: any) => (cls === ProviderAvailability ? availRepo : cls === TransportProvider ? providerRepo : {}),
    };
    const args: any[] = new Array(14).fill({});
    args[2] = { manager }; // availabilityRepo (only .manager is used by the default path)
    const svc = new (TransportService as any)(...args) as TransportService;
    return { svc, query, availRepo, providerRepo, manager };
  };

  it('reserves a valid slot, and the UPDATE is bound to the identity read from the SAME slot row', async () => {
    const { svc, query, manager } = build({ slot: slot({ providerId: 5, routeId: 8 }) });
    await svc.reserveSlot(3, 2, { providerId: 5, routeId: 8 }, manager);
    expect(query).toHaveBeenCalledTimes(1);
    const params = (query.mock.calls[0] as unknown as [string, any[]])[1];
    expect(params).toEqual([3, 2, TODAY, 5, 8]);
  });

  it('the UPDATE is bound to the EXPECTED contract (selected provider/route), not to values read back from the slot row', async () => {
    const { svc, query, manager } = build({ slot: slot({ providerId: 5, routeId: 8 }) });
    await svc.reserveSlot(3, 2, { providerId: 5, routeId: 8 }, manager);
    expect((query.mock.calls[0] as unknown as [string, any[]])[1]).toEqual([3, 2, TODAY, 5, 8]);
  });

  it('no route selected: NO route requirement is invented, whether the slot has a route or not (deliberate, preserved behaviour)', async () => {
    for (const routeId of [null, 8]) {
      const { svc, query, manager } = build({ slot: slot({ routeId }) });
      await svc.reserveSlot(3, 2, { providerId: 5 }, manager);
      const [sql, params] = query.mock.calls[0] as unknown as [string, any[]];
      expect(sql).not.toContain('"routeId"');
      expect(params).toEqual([3, 2, TODAY, 5]);
    }
  });

  it("no provider selected: the slot's own (eligibility-checked) provider is pinned in the UPDATE", async () => {
    const { svc, query, manager } = build({ slot: slot({ providerId: 5 }) });
    await svc.reserveSlot(3, 2, {}, manager);
    expect((query.mock.calls[0] as unknown as [string, any[]])[1][3]).toBe(5);
  });

  it.each([
    ['a missing slot', { slot: null }, {}, NotFoundException],
    ['a slot of another provider', {}, { providerId: 6 }, BadRequestException],
    ['a slot of another route', { slot: slot({ routeId: 2 }) }, { routeId: 9 }, BadRequestException],
    ['a ROUTE-LESS slot when the shipment selected a route', { slot: slot({ routeId: null }) }, { routeId: 9 }, BadRequestException],
    ['a CANCELLED slot', { slot: slot({ status: AvailabilityStatus.CANCELLED }) }, {}, BadRequestException],
    ['a DEPARTED slot', { slot: slot({ status: AvailabilityStatus.DEPARTED }) }, {}, BadRequestException],
    ['a FULL-status slot', { slot: slot({ status: AvailabilityStatus.FULL }) }, {}, BadRequestException],
    ['a past-dated slot', { slot: slot({ date: YESTERDAY }) }, {}, BadRequestException],
    ['a slot with no free slots', { slot: slot({ usedSlots: 5 }) }, {}, ConflictException],
    ['an ineligible provider', { provider: { id: 5, status: ProviderStatus.SUSPENDED } }, {}, BadRequestException],
    ['a nonexistent provider', { provider: null }, {}, NotFoundException],
  ])('rejects %s BEFORE any write', async (_n, opts: any, ctx: any, errClass: any) => {
    const { svc, query, manager } = build(opts);
    await expect(svc.reserveSlot(3, 2, ctx, manager)).rejects.toThrow(errClass);
    expect(query).not.toHaveBeenCalled();
  });

  it('when the conditional UPDATE matches nothing (lost the race / kg bound) it fails closed with 409', async () => {
    const { svc, manager } = build({ updateRows: [] });
    await expect(svc.reserveSlot(3, 2, {}, manager)).rejects.toThrow(ConflictException);
  });

  it('rejects a non-finite / negative weight before doing anything', async () => {
    const { svc, availRepo, query, manager } = build();
    await expect(svc.reserveSlot(3, NaN, {}, manager)).rejects.toThrow(BadRequestException);
    await expect(svc.reserveSlot(3, -2, {}, manager)).rejects.toThrow(BadRequestException);
    expect(availRepo.findOne).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('assertHeldSlotMatches: same provider/route rules, FULL is fine, DEPARTED/CANCELLED are not, and no capacity SQL runs', async () => {
    const full = build({ slot: slot({ status: AvailabilityStatus.FULL }) });
    await expect(full.svc.assertHeldSlotMatches(3, { providerId: 5 }, full.manager)).resolves.toBeUndefined();
    const other = build();
    await expect(other.svc.assertHeldSlotMatches(3, { providerId: 6 }, other.manager)).rejects.toThrow(BadRequestException);
    const routeless = build({ slot: slot({ routeId: null }) });
    await expect(routeless.svc.assertHeldSlotMatches(3, { providerId: 5, routeId: 8 }, routeless.manager)).rejects.toThrow(BadRequestException);
    await expect(routeless.svc.assertHeldSlotMatches(3, { providerId: 5 }, routeless.manager)).resolves.toBeUndefined(); // no route selected => no requirement
    const wrongRoute = build({ slot: slot({ routeId: 2 }) });
    await expect(wrongRoute.svc.assertHeldSlotMatches(3, { providerId: 5, routeId: 8 }, wrongRoute.manager)).rejects.toThrow(BadRequestException);
    const rightRoute = build({ slot: slot({ routeId: 8 }) });
    await expect(rightRoute.svc.assertHeldSlotMatches(3, { providerId: 5, routeId: 8 }, rightRoute.manager)).resolves.toBeUndefined();
    const gone = build({ slot: slot({ status: AvailabilityStatus.DEPARTED }) });
    await expect(gone.svc.assertHeldSlotMatches(3, { providerId: 5 }, gone.manager)).rejects.toThrow(BadRequestException);
    expect(full.query).not.toHaveBeenCalled();
  });

  it('legacy reserveCapacity (createAssignment path) is now atomic non-strict SQL and keeps its no-throw contract', async () => {
    const { svc, query } = build({ updateRows: [] });
    await expect(svc.reserveCapacity(3, 2)).resolves.toBeUndefined();
    const [sql, params] = query.mock.calls[0] as unknown as [string, any[]];
    expect(sql).not.toContain(`"status" = 'open'`);
    expect(params).toEqual([3, 2]);
  });

  it('releaseCapacity delegates to the atomic release with the canonical weight rule', async () => {
    const { svc, query } = build();
    await svc.releaseCapacity(3, 0);
    const params = (query.mock.calls[0] as unknown as [string, any[]])[1];
    expect(params).toEqual([3, 1]);
  });
});

describe('TransportService.findAvailableForRoute — published slots only from VERIFIED/ACTIVE providers', () => {
  it('constrains the published-availability query by provider status', async () => {
    const andWhere = jest.fn();
    const chain: any = {};
    for (const m of ['leftJoinAndSelect', 'where', 'orderBy', 'addOrderBy', 'innerJoin', 'leftJoin']) chain[m] = jest.fn(() => chain);
    chain.andWhere = andWhere.mockImplementation(() => chain);
    chain.getMany = jest.fn(async () => []);
    const args: any[] = new Array(14).fill({});
    args[0] = { createQueryBuilder: () => chain };
    args[2] = { createQueryBuilder: () => chain };
    const svc = new (TransportService as any)(...args) as TransportService;

    await svc.findAvailableForRoute('Dar es Salaam', 'Mwanza');

    const statusFilter = andWhere.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('p.status IN (:...publishedProviderStatuses)'));
    expect(statusFilter).toBeDefined();
    expect(statusFilter![1]).toEqual({ publishedProviderStatuses: [ProviderStatus.VERIFIED, ProviderStatus.ACTIVE] });
  });
});
