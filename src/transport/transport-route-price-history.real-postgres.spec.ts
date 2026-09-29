import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { TransportService } from './transport.service';
import { TransportQuoteService } from './transport-quote.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { Shipment } from '../shipments/entities/shipment.entity';
import { TransportQuote } from './entities/transport-quote.entity';
import { ProviderAvailability, AvailabilityStatus } from './entities/provider-availability.entity';
import { TransportProvider, ProviderStatus, ProviderType } from './entities/transport-provider.entity';
import { TransportRoute, RouteType } from './entities/transport-route.entity';
import { TransportRoutePriceHistory } from './entities/transport-route-price-history.entity';
import { ensureRoutePriceHistoryNoOverlapConstraint } from './route-price-history-schema';
import { User } from '../users/entities/user.entity';

/**
 * Stage 3S-B4 — Route Price History + Effective Pricing, proved against REAL
 * PostgreSQL: the actual TransportService.setRoutePrice()/updateRoute()
 * write path, getEffectiveRoutePrice() resolver, discovery's cheapest sort,
 * and quote creation, all against real tables and real transactions.
 *
 * Runs only against the dedicated kentexa_b5b_test database (resetB5BTestSchema's
 * own safety gate); skipped, never failed, when B5B_TEST_DB_PASSWORD is not
 * configured. Never touches production or the isolated Stage3KR environment.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;
const TODAY = new Date().toISOString().slice(0, 10);

suite('Stage 3S-B4 — route price history and effective pricing, real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let providers: Repository<TransportProvider>;
  let routes: Repository<TransportRoute>;
  let slots: Repository<ProviderAvailability>;
  let history: Repository<TransportRoutePriceHistory>;
  let quotes: Repository<TransportQuote>;
  let shipmentsRepo: Repository<Shipment>;
  let transport: TransportService;
  let quoteService: TransportQuoteService;
  let shipmentService: ShipmentsService;
  let userSeq = 0;

  const mkProviderWithUser = async (status: ProviderStatus = ProviderStatus.VERIFIED) => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `p4-${++userSeq}@s3sb4.local`, phone: `+2557${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'P',
    } as any));
    const p = await providers.save(providers.create({ name: 'P', type: ProviderType.BUS, status, userId: (u as any).id } as any) as unknown as TransportProvider);
    return { userId: (u as any).id as number, provider: p };
  };
  const mkRoute = (providerId: number, o: Partial<TransportRoute> = {}) =>
    routes.save(routes.create({
      providerId, routeType: RouteType.INTERCITY, originCity: 'Dar es Salaam', destinationCity: 'Mwanza',
      pricePerKg: 200, fixedFee: 1000, isActive: true, ...o,
    } as any) as unknown as TransportRoute);
  const mkSlot = (providerId: number, routeId: number | null, o: Partial<ProviderAvailability> = {}) =>
    slots.save(slots.create({
      providerId, routeId, date: TODAY, totalSlots: 5, usedSlots: 0, totalCapacityKg: 100, usedCapacityKg: 0,
      status: AvailabilityStatus.OPEN, fromCity: 'Dar es Salaam', toCity: 'Mwanza', ...o,
    } as any) as unknown as ProviderAvailability);
  const openVersion = async (routeId: number) =>
    (await ds.query(`SELECT "pricePerKg"::text pk, "fixedFee"::text ff, "effectiveFrom" ef FROM public.transport_route_price_history WHERE "routeId"=$1 AND "effectiveTo" IS NULL`, [routeId]))[0];
  const closedVersions = async (routeId: number) =>
    ds.query(`SELECT "pricePerKg"::text pk, "fixedFee"::text ff, "effectiveFrom" ef, "effectiveTo" et FROM public.transport_route_price_history WHERE "routeId"=$1 AND "effectiveTo" IS NOT NULL ORDER BY "effectiveFrom"`, [routeId]);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 20 },
      entities: [...B5B_BASE_ENTITIES, ProviderAvailability, TransportRoute, TransportRoutePriceHistory, Shipment, TransportQuote],
    });
    await ds.initialize();
    // synchronize:true only builds from entity decorators, which cannot
    // express a range-EXCLUDE constraint -- apply the exact same one the
    // real migration applies (route-price-history-schema.ts), so this
    // spec's schema enforces non-overlap identically to a real deployment.
    await ensureRoutePriceHistoryNoOverlapConstraint((sql) => ds.query(sql));

    providers = ds.getRepository(TransportProvider);
    routes = ds.getRepository(TransportRoute);
    slots = ds.getRepository(ProviderAvailability);
    history = ds.getRepository(TransportRoutePriceHistory);
    quotes = ds.getRepository(TransportQuote);
    shipmentsRepo = ds.getRepository(Shipment);

    const args: any[] = new Array(15).fill({});
    args[0] = providers; args[1] = routes; args[2] = slots; args[14] = ds;
    transport = new (TransportService as any)(...args);
    quoteService = new TransportQuoteService(quotes, routes, slots, transport, ds);
    const parcelRepoFake: any = { create: (v: any) => v, findOne: async () => null, save: async (v: any) => v };
    shipmentService = new (ShipmentsService as any)(
      shipmentsRepo, routes, parcelRepoFake, { findOne: async () => null }, transport,
      { search: async () => [] }, { resolve: async () => null }, quotes,
    );
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    await ds.query(`TRUNCATE TABLE public.transport_quote RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.shipment RESTART IDENTITY`);
    await ds.query(`DELETE FROM public.transport_route_price_history`);
    await ds.query(`DELETE FROM public.provider_availability`);
    await ds.query(`DELETE FROM public.transport_route`);
    await ds.query(`DELETE FROM public.transport_provider`);
  });

  // ── a fresh route's price is always resolvable, even before any edit ─────
  it('a freshly created route has a canonical, immediately resolvable effective price with no history row yet', async () => {
    const { provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 300, fixedFee: 900 });
    expect(await openVersion(r.id)).toBeUndefined(); // no history row exists yet
    const eff = await transport.getEffectiveRoutePrice(r.id);
    expect(eff).toEqual({ pricePerKg: 300, fixedFee: 900 }); // resolved from the route's own plain columns
  });

  // ── a price update creates history, never overwrites it ──────────────────
  it('updateRoute() with a price change creates a new version and preserves the old one as closed history, not deleted', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 200, fixedFee: 1000 });

    const updated = await transport.updateRoute(userId, r.id, { pricePerKg: 350, fixedFee: 1500 });
    expect(Number(updated.pricePerKg)).toBe(350);
    expect(Number(updated.fixedFee)).toBe(1500);

    const open = await openVersion(r.id);
    expect(Number(open.pk)).toBe(350);
    expect(Number(open.ff)).toBe(1500);

    const closed = await closedVersions(r.id);
    expect(closed).toHaveLength(1); // the backfilled "version zero" of the pre-B4 route, now closed
    expect(Number(closed[0].pk)).toBe(200);
    expect(Number(closed[0].ff)).toBe(1000);
    expect(closed[0].et.getTime()).toBe(open.ef.getTime()); // closed exactly where the new one opens -- no gap, no overlap

    expect(await transport.getEffectiveRoutePrice(r.id)).toEqual({ pricePerKg: 350, fixedFee: 1500 });
  });

  it('a second price update closes the SECOND version too, keeping both prior versions as readable history', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 100, fixedFee: 100 });
    await transport.updateRoute(userId, r.id, { pricePerKg: 200, fixedFee: 200 });
    await transport.updateRoute(userId, r.id, { pricePerKg: 300, fixedFee: 300 });

    const closed = await closedVersions(r.id);
    expect(closed).toHaveLength(2);
    expect(closed.map((c: any) => Number(c.pk))).toEqual([100, 200]);
    expect(await transport.getEffectiveRoutePrice(r.id)).toEqual({ pricePerKg: 300, fixedFee: 300 });
  });

  // ── other route fields keep their existing simple path, unaffected ───────
  it('editing a non-price field (notes) does not touch price history at all', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    await transport.updateRoute(userId, r.id, { notes: 'Sunday off' });
    expect(await openVersion(r.id)).toBeUndefined(); // still no history row -- untouched
    const saved = await routes.findOneOrFail({ where: { id: r.id } });
    expect(saved.notes).toBe('Sunday off');
  });

  // ── discovery cheapest ordering resolves the CURRENT effective price ─────
  it('discovery cheapest ordering re-resolves after a price update -- not cached at query build time', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const cheap = await mkRoute(provider.id, { pricePerKg: 0, fixedFee: 1000 });
    const pricier = await mkRoute(provider.id, { pricePerKg: 0, fixedFee: 5000 });
    await mkSlot(provider.id, cheap.id);
    await mkSlot(provider.id, pricier.id);

    const before = await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 0, { sortBy: 'cheapest' });
    expect(before.published.map((a) => (a as any).route.id)).toEqual([cheap.id, pricier.id]);

    // The route that WAS cheaper becomes the pricier one after an edit.
    await transport.updateRoute(userId, cheap.id, { fixedFee: 9000 });

    const after = await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 0, { sortBy: 'cheapest' });
    expect(after.published.map((a) => (a as any).route.id)).toEqual([pricier.id, cheap.id]);
  });

  // ── quote creation uses the effective price AT CREATION TIME ──────────────
  it('quote creation resolves the price effective at the moment it is created, not a stale route column', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 100, fixedFee: 100 });

    const before = await quoteService.createQuote({ id: 50 } as any, { providerId: provider.id, routeId: r.id, weightKg: 10 });
    expect(Number(before.totalAmount)).toBe(1000); // 10*100 = 1000

    await transport.updateRoute(userId, r.id, { pricePerKg: 500, fixedFee: 100 });

    const after = await quoteService.createQuote({ id: 50 } as any, { providerId: provider.id, routeId: r.id, weightKg: 10 });
    expect(Number(after.totalAmount)).toBe(5000); // 10*500 = 5000, the NEW effective price
    expect(Number(before.totalAmount)).toBe(1000); // the earlier quote's frozen total is untouched
  });

  // ── a future-scheduled price does not apply before its effective time ────
  it('a future-scheduled price change does not leak early into getEffectiveRoutePrice, discovery, or the route\'s own denormalized columns', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 100, fixedFee: 100 });
    const future = new Date(Date.now() + 3600_000); // one hour from now

    await transport.updateRoute(userId, r.id, { pricePerKg: 999, fixedFee: 999, priceEffectiveFrom: future });

    // Not yet effective "now": resolver still returns the OLD price.
    expect(await transport.getEffectiveRoutePrice(r.id)).toEqual({ pricePerKg: 100, fixedFee: 100 });
    // The route's own denormalized columns must NOT have flipped early either.
    const saved = await routes.findOneOrFail({ where: { id: r.id } });
    expect(Number(saved.pricePerKg)).toBe(100);
    expect(Number(saved.fixedFee)).toBe(100);

    // But it genuinely takes effect once that time actually arrives.
    expect(await transport.getEffectiveRoutePrice(r.id, new Date(future.getTime() + 1000))).toEqual({ pricePerKg: 999, fixedFee: 999 });
  });

  // ── a price for the past is always rejected -- no rewriting history ──────
  it('rejects an effectiveFrom in the past', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 100, fixedFee: 100 });
    const past = new Date(Date.now() - 3600_000);
    await expect(
      transport.setRoutePrice(userId, r.id, { pricePerKg: 200, effectiveFrom: past }),
    ).rejects.toThrow(BadRequestException);
    expect(await transport.getEffectiveRoutePrice(r.id)).toEqual({ pricePerKg: 100, fixedFee: 100 }); // nothing mutated
  });

  // ── the model's central fix: current + multiple future schedules + an
  // immediate correction that does NOT disturb an already-scheduled future
  // price, all on one timeline ──────────────────────────────────────────────
  it('supports current price + multiple future scheduled versions, resolving each in its own window', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 100, fixedFee: 100 });
    const inOneHour = new Date(Date.now() + 3600_000);
    const inTwoHours = new Date(Date.now() + 7200_000);

    await transport.setRoutePrice(userId, r.id, { pricePerKg: 200, fixedFee: 200, effectiveFrom: inOneHour });
    await transport.setRoutePrice(userId, r.id, { pricePerKg: 300, fixedFee: 300, effectiveFrom: inTwoHours });

    expect(await transport.getEffectiveRoutePrice(r.id, new Date())).toEqual({ pricePerKg: 100, fixedFee: 100 });
    expect(await transport.getEffectiveRoutePrice(r.id, new Date(inOneHour.getTime() + 1000))).toEqual({ pricePerKg: 200, fixedFee: 200 });
    expect(await transport.getEffectiveRoutePrice(r.id, new Date(inTwoHours.getTime() + 1000))).toEqual({ pricePerKg: 300, fixedFee: 300 });

    const all = await ds.query(
      `SELECT "pricePerKg"::text pk, "effectiveFrom" ef, "effectiveTo" et FROM public.transport_route_price_history WHERE "routeId"=$1 ORDER BY "effectiveFrom"`,
      [r.id],
    );
    expect(all).toHaveLength(3); // current (now closed at +1h) + the two scheduled versions
    expect(Number(all[0].pk)).toBe(100);
    expect(all[0].et.getTime()).toBe(inOneHour.getTime());
    expect(Number(all[1].pk)).toBe(200);
    expect(all[1].et.getTime()).toBe(inTwoHours.getTime());
    expect(Number(all[2].pk)).toBe(300);
    expect(all[2].et).toBeNull(); // the last one is open-ended
  });

  it('an immediate correction to today\'s price does not disturb an already-scheduled future price', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 100, fixedFee: 100 });
    const future = new Date(Date.now() + 3600_000);
    await transport.setRoutePrice(userId, r.id, { pricePerKg: 999, fixedFee: 999, effectiveFrom: future });

    // Correct TODAY's price -- the future schedule must survive untouched.
    const corrected = await transport.setRoutePrice(userId, r.id, { pricePerKg: 150, fixedFee: 150 });
    expect(Number(corrected.pricePerKg)).toBe(150); // takes effect immediately

    expect(await transport.getEffectiveRoutePrice(r.id, new Date())).toEqual({ pricePerKg: 150, fixedFee: 150 });
    expect(await transport.getEffectiveRoutePrice(r.id, new Date(future.getTime() + 1000))).toEqual({ pricePerKg: 999, fixedFee: 999 }); // untouched
  });

  it('rescheduling (setRoutePrice at the SAME future effectiveFrom) updates that version in place, not a new split', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 100, fixedFee: 100 });
    const future = new Date(Date.now() + 3600_000);
    await transport.setRoutePrice(userId, r.id, { pricePerKg: 500, fixedFee: 500, effectiveFrom: future });
    await transport.setRoutePrice(userId, r.id, { pricePerKg: 777, fixedFee: 777, effectiveFrom: future }); // same instant -- reschedule

    const rows = await ds.query(`SELECT count(*)::int n FROM public.transport_route_price_history WHERE "routeId"=$1 AND "effectiveFrom"=$2`, [r.id, future]);
    expect(rows[0].n).toBe(1); // still exactly one version at that instant, not two
    expect(await transport.getEffectiveRoutePrice(r.id, new Date(future.getTime() + 1000))).toEqual({ pricePerKg: 777, fixedFee: 777 });
    expect(await transport.getEffectiveRoutePrice(r.id, new Date())).toEqual({ pricePerKg: 100, fixedFee: 100 }); // today's price still untouched
  });

  it('cancelScheduledRoutePrice merges a future version back into its predecessor', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 100, fixedFee: 100 });
    const future = new Date(Date.now() + 3600_000);
    await transport.setRoutePrice(userId, r.id, { pricePerKg: 999, fixedFee: 999, effectiveFrom: future });

    await transport.cancelScheduledRoutePrice(userId, r.id, future);

    expect(await transport.getEffectiveRoutePrice(r.id, new Date(future.getTime() + 1000))).toEqual({ pricePerKg: 100, fixedFee: 100 }); // reverted
    const open = await openVersion(r.id);
    expect(Number(open.pk)).toBe(100); // the surviving (predecessor) row is open-ended again
    const all = await ds.query(`SELECT count(*)::int n FROM public.transport_route_price_history WHERE "routeId"=$1`, [r.id]);
    expect(all[0].n).toBe(1); // the future row is gone, merged back -- not left as orphaned dead data
  });

  it('cancelScheduledRoutePrice refuses to cancel an already-effective (current or past) version', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 100, fixedFee: 100 });
    await transport.setRoutePrice(userId, r.id, { pricePerKg: 200, fixedFee: 200 }); // immediate -- already effective
    const current = await routes.findOneOrFail({ where: { id: r.id } });
    const currentVersionRow = (await ds.query(
      `SELECT "effectiveFrom" ef FROM public.transport_route_price_history WHERE "routeId"=$1 AND "effectiveTo" IS NULL`, [r.id],
    ))[0];
    await expect(
      transport.cancelScheduledRoutePrice(userId, r.id, currentVersionRow.ef),
    ).rejects.toThrow(ConflictException);
    expect(await transport.getEffectiveRoutePrice(r.id)).toEqual({ pricePerKg: 200, fixedFee: 200 }); // unaffected
  });

  // ── overlap fails closed under genuine concurrency, through the SERVICE ──
  it('two concurrent setRoutePrice calls for the SAME route never both succeed with overlapping windows', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 100, fixedFee: 100 });
    const future = new Date(Date.now() + 3600_000); // the SAME target instant from two callers at once

    const results = await Promise.allSettled([
      transport.setRoutePrice(userId, r.id, { pricePerKg: 111, effectiveFrom: future }),
      transport.setRoutePrice(userId, r.id, { pricePerKg: 222, effectiveFrom: future }),
    ]);
    // The route-row pessimistic lock serializes these -- the second call
    // observes the first's committed row and reschedules it in place (same
    // effectiveFrom = update, not a conflicting insert), so both may
    // legitimately succeed; what must NEVER happen is two overlapping rows.
    const rejected = results.filter((r2) => r2.status === 'rejected');
    expect(rejected.length).toBeLessThanOrEqual(1);
    const rows = await ds.query(
      `SELECT "effectiveFrom" ef, "effectiveTo" et FROM public.transport_route_price_history WHERE "routeId"=$1 ORDER BY "effectiveFrom"`,
      [r.id],
    );
    for (let i = 1; i < rows.length; i++) {
      const prevEnd = rows[i - 1].et ? new Date(rows[i - 1].et).getTime() : Infinity;
      expect(prevEnd).toBeLessThanOrEqual(new Date(rows[i].ef).getTime()); // never overlapping
    }
  });

  it('rejects a negative price and an invalid effectiveFrom', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    await expect(transport.setRoutePrice(userId, r.id, { pricePerKg: -1 })).rejects.toThrow(BadRequestException);
    await expect(transport.setRoutePrice(userId, r.id, { fixedFee: -1 })).rejects.toThrow(BadRequestException);
    await expect(transport.setRoutePrice(userId, r.id, { pricePerKg: 1, effectiveFrom: 'not-a-date' as any })).rejects.toThrow(BadRequestException);
  });

  // ── unauthorized provider/route update fails closed ───────────────────────
  it('a provider cannot set the price of a route they do not own', async () => {
    const owner = await mkProviderWithUser();
    const stranger = await mkProviderWithUser();
    const r = await mkRoute(owner.provider.id);
    await expect(transport.setRoutePrice(stranger.userId, r.id, { pricePerKg: 1 })).rejects.toThrow(NotFoundException);
    await expect(transport.updateRoute(stranger.userId, r.id, { pricePerKg: 1 })).rejects.toThrow(NotFoundException);
    expect(await transport.getEffectiveRoutePrice(r.id)).toEqual({ pricePerKg: 200, fixedFee: 1000 }); // untouched -- mkRoute's own defaults
  });

  // ── already-accepted quote/Shipment economics stay frozen regardless ──────
  it('an accepted quote and the Shipment bound to it are unaffected by ANY later price-history change', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { pricePerKg: 100, fixedFee: 100 });
    const slot = await mkSlot(provider.id, r.id);
    const quote = await quoteService.createQuote({ id: 21 } as any, { providerId: provider.id, routeId: r.id, availabilityId: slot.id, weightKg: 10 });
    await quoteService.acceptQuote({ id: 21 } as any, quote.id);

    await transport.updateRoute(userId, r.id, { pricePerKg: 9999, fixedFee: 9999 });

    const reread = await quotes.findOneOrFail({ where: { id: quote.id } });
    expect(Number(reread.totalAmount)).toBe(1000); // still the original frozen total

    const shipment = await shipmentService.createShipment(21, {
      receiverName: 'Amina', receiverPhone: '0700000000', originCity: 'Dar es Salaam',
      destinationCity: 'Mwanza', itemDescription: 'Clothes', quoteId: quote.id,
    } as any);
    expect(Number(shipment.priceQuoted)).toBe(1000); // bound to the quote's frozen total, not the new route price
  });

  // ── discovery stays independent of Shipment creation ──────────────────────
  it('discovery and price resolution never create a Shipment or touch capacity', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    const slot = await mkSlot(provider.id, r.id);
    await transport.updateRoute(userId, r.id, { pricePerKg: 400 });
    await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 0, { sortBy: 'cheapest' });
    await transport.getEffectiveRoutePrice(r.id);

    expect((await ds.query(`SELECT count(*)::int n FROM public.shipment`))[0].n).toBe(0);
    const s = await slots.findOneOrFail({ where: { id: slot.id } });
    expect(s.usedSlots).toBe(0);
  });
});
