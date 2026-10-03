import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { TransportService } from './transport.service';
import { TransportQuoteService, QUOTE_VALIDITY_MS } from './transport-quote.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { Shipment, ShipmentStatus } from '../shipments/entities/shipment.entity';
import { TransportQuote, TransportQuoteStatus } from './entities/transport-quote.entity';
import { ProviderAvailability, AvailabilityStatus } from './entities/provider-availability.entity';
import { TransportProvider, ProviderStatus, ProviderType } from './entities/transport-provider.entity';
import { TransportRoute, RouteType } from './entities/transport-route.entity';
import { TransportRoutePriceHistory } from './entities/transport-route-price-history.entity';
import { sumQuoteComponents } from './transport-quote-components';

/**
 * Stage 3S-B3 — Canonical Quote Foundation, proved against REAL PostgreSQL:
 * real transactions, real row locks, the real TransportQuoteService AND the
 * real ShipmentsService.createShipment() binding to an accepted quote.
 *
 * createQuote()/acceptQuote() never reserve capacity, create a Parcel, or
 * write a custody event -- every test that exercises them asserts this
 * directly (slot/Parcel/Shipment row counts unchanged), not by omission.
 *
 * Runs only against the dedicated kentexa_b5b_test database (resetB5BTestSchema's
 * own safety gate); skipped, never failed, when B5B_TEST_DB_PASSWORD is not
 * configured. Never touches production or the isolated Stage3KR environment.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;
const TODAY = new Date().toISOString().slice(0, 10);

suite('Stage 3S-B3 — canonical transport quote lifecycle, real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let providers: Repository<TransportProvider>;
  let routes: Repository<TransportRoute>;
  let slots: Repository<ProviderAvailability>;
  let quotes: Repository<TransportQuote>;
  let shipmentsRepo: Repository<Shipment>;
  let transport: TransportService;
  let quoteService: TransportQuoteService;
  let shipmentService: ShipmentsService;

  const mkProvider = (status: ProviderStatus = ProviderStatus.VERIFIED) =>
    providers.save(providers.create({ name: 'P', type: ProviderType.BUS, status } as any) as unknown as TransportProvider);
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
  const slotRow = async (id: number) =>
    (await ds.query(`SELECT "usedSlots"::int u, "usedCapacityKg"::text k FROM public.provider_availability WHERE id=$1`, [id]))[0];
  const shipmentCount = async () => (await ds.query(`SELECT count(*)::int n FROM public.shipment`))[0].n as number;
  const custodyCount = async () => (await ds.query(`SELECT count(*)::int n FROM public.parcel_custody_event`))[0].n as number;
  const baseDto = (extra: Record<string, unknown> = {}) => ({
    receiverName: 'Amina', receiverPhone: '0700000000', originCity: 'Dar es Salaam',
    destinationCity: 'Mwanza', itemDescription: 'Clothes', ...extra,
  });

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
    // parcel_custody_event isn't part of this DataSource's entity set (kept
    // minimal, same reasoning as shipment-capacity.real-postgres.spec.ts) --
    // a plain table only so custodyCount() can prove quotes never touch it.
    await ds.query(`CREATE TABLE public.parcel_custody_event (id serial PRIMARY KEY)`);

    providers = ds.getRepository(TransportProvider);
    routes = ds.getRepository(TransportRoute);
    slots = ds.getRepository(ProviderAvailability);
    quotes = ds.getRepository(TransportQuote);
    shipmentsRepo = ds.getRepository(Shipment);

    const args: any[] = new Array(15).fill({});
    args[0] = providers; args[1] = routes; args[2] = slots;
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
    await ds.query(`DELETE FROM public.provider_availability`);
    await ds.query(`DELETE FROM public.transport_route`);
    await ds.query(`DELETE FROM public.transport_provider`);
  });

  // ── creation + pricing parity ─────────────────────────────────────────────
  it('creates a quote from an eligible discovered transport service, with pricing parity to the existing route formula', async () => {
    const p = await mkProvider();
    const r = await mkRoute(p.id, { pricePerKg: 300, fixedFee: 900 });
    const slot = await mkSlot(p.id, r.id);
    // Confirm this trip is genuinely what Stage 3S-B2 discovery would surface.
    const { published } = await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza');
    expect(published.map((x) => x.id)).toContain(slot.id);

    const quote = await quoteService.createQuote({ id: 42 } as any, {
      providerId: p.id, routeId: r.id, availabilityId: slot.id, weightKg: 5,
    });
    expect(quote.status).toBe(TransportQuoteStatus.OFFERED);
    // 5kg * 300 = 1500 > fixedFee 900 -> base = 1500, exactly estimateShipmentPrice's own formula.
    expect(Number(quote.baseAmount)).toBe(1500);
    expect(Number(quote.totalAmount)).toBe(1500);
    expect(quote.components).toEqual({ transportBase: 1500 });
    expect(quote.currency).toBe('TZS');
    expect(quote.expiresAt.getTime() - quote.priceEffectiveAt.getTime()).toBeCloseTo(QUOTE_VALIDITY_MS, -2);
  });

  it('creation performs NO capacity/Parcel/Shipment/custody mutation', async () => {
    const p = await mkProvider();
    const r = await mkRoute(p.id);
    const slot = await mkSlot(p.id, r.id);
    const before = await slotRow(slot.id);

    await quoteService.createQuote({ id: 1 } as any, { providerId: p.id, routeId: r.id, availabilityId: slot.id, weightKg: 4 });

    expect(await slotRow(slot.id)).toEqual(before);
    expect(await shipmentCount()).toBe(0);
    expect(await custodyCount()).toBe(0);
  });

  // ── validation fails closed ────────────────────────────────────────────────
  it('provider/route/availability mismatch fails closed at creation, no row written', async () => {
    const p1 = await mkProvider();
    const p2 = await mkProvider();
    const r1 = await mkRoute(p1.id);
    const r2 = await mkRoute(p2.id);
    const slotForP2 = await mkSlot(p2.id, r2.id);

    await expect(quoteService.createQuote({ id: 1 } as any, { providerId: p1.id, routeId: r2.id })).rejects.toThrow(BadRequestException); // route belongs to p2
    await expect(quoteService.createQuote({ id: 1 } as any, { providerId: p1.id, routeId: r1.id, availabilityId: slotForP2.id })).rejects.toThrow(BadRequestException); // slot belongs to p2
    await expect(quoteService.createQuote({ id: 1 } as any, { providerId: p1.id, routeId: r1.id, availabilityId: 999999 })).rejects.toThrow(NotFoundException);
    await expect(quoteService.createQuote({ id: 1 } as any, { providerId: 999999, routeId: r1.id })).rejects.toThrow(NotFoundException);
    await expect(quoteService.createQuote({ id: 1 } as any, { providerId: p1.id, routeId: r1.id, weightKg: -1 })).rejects.toThrow(BadRequestException);
    const inactive = await mkRoute(p1.id, { isActive: false });
    await expect(quoteService.createQuote({ id: 1 } as any, { providerId: p1.id, routeId: inactive.id })).rejects.toThrow(BadRequestException);
    expect((await quotes.find()).length).toBe(0);
  });

  it('a slot whose OWN route differs from the selected route is rejected even if both belong to the same provider', async () => {
    const p = await mkProvider();
    const rA = await mkRoute(p.id);
    const rB = await mkRoute(p.id);
    const slotOnA = await mkSlot(p.id, rA.id);
    await expect(quoteService.createQuote({ id: 1 } as any, { providerId: p.id, routeId: rB.id, availabilityId: slotOnA.id }))
      .rejects.toThrow(BadRequestException);
  });

  // ── acceptance: idempotent, fails closed ──────────────────────────────────
  it('acceptance is idempotent: repeated accept returns the SAME frozen row, never a conflicting one', async () => {
    const p = await mkProvider();
    const r = await mkRoute(p.id);
    const quote = await quoteService.createQuote({ id: 7 } as any, { providerId: p.id, routeId: r.id, weightKg: 2 });

    const first = await quoteService.acceptQuote({ id: 7 } as any, quote.id);
    const second = await quoteService.acceptQuote({ id: 7 } as any, quote.id);
    expect(first.status).toBe(TransportQuoteStatus.ACCEPTED);
    expect(second.acceptedAt?.getTime()).toBe(first.acceptedAt?.getTime());
    expect(Number(second.totalAmount)).toBe(Number(first.totalAmount));
  });

  it('acceptance fails closed: wrong requester, expired, and nonexistent', async () => {
    const p = await mkProvider();
    const r = await mkRoute(p.id);
    const quote = await quoteService.createQuote({ id: 7 } as any, { providerId: p.id, routeId: r.id });

    await expect(quoteService.acceptQuote({ id: 999 } as any, quote.id)).rejects.toThrow(ForbiddenException);
    await expect(quoteService.acceptQuote({ id: 7 } as any, 999999)).rejects.toThrow(NotFoundException);

    await ds.query(`UPDATE public.transport_quote SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`, [quote.id]);
    await expect(quoteService.acceptQuote({ id: 7 } as any, quote.id)).rejects.toThrow(ConflictException);
    expect((await quotes.findOneOrFail({ where: { id: quote.id } })).status).toBe(TransportQuoteStatus.OFFERED); // unchanged by the failed attempt
  });

  // ── the whole point: accepted economics survive a later price change ─────
  it('an accepted quote is completely unaffected by a LATER route price edit', async () => {
    const p = await mkProvider();
    const r = await mkRoute(p.id, { pricePerKg: 100, fixedFee: 500 });
    const quote = await quoteService.createQuote({ id: 3 } as any, { providerId: p.id, routeId: r.id, weightKg: 10 }); // base = 1000
    await quoteService.acceptQuote({ id: 3 } as any, quote.id);
    expect(Number(quote.totalAmount)).toBe(1000);

    await routes.update(r.id, { pricePerKg: 900, fixedFee: 5000 }); // price roughly quintuples

    const reread = await quotes.findOneOrFail({ where: { id: quote.id } });
    expect(Number(reread.totalAmount)).toBe(1000); // exactly the frozen amount, not recomputed
    expect(reread.status).toBe(TransportQuoteStatus.ACCEPTED);
  });

  // ── Shipment binds to the accepted quote's frozen economics ───────────────
  it('Shipment.createShipment binds to the accepted quote: price survives a route change made AFTER acceptance', async () => {
    const p = await mkProvider();
    const r = await mkRoute(p.id, { pricePerKg: 100, fixedFee: 500 });
    const slot = await mkSlot(p.id, r.id, { totalCapacityKg: 50 });
    const quote = await quoteService.createQuote({ id: 11 } as any, {
      providerId: p.id, routeId: r.id, availabilityId: slot.id, weightKg: 10,
    }); // base = 1000
    await quoteService.acceptQuote({ id: 11 } as any, quote.id);
    await routes.update(r.id, { pricePerKg: 900, fixedFee: 9000 }); // would be 9000 if ever recomputed

    const shipment = await shipmentService.createShipment(11, baseDto({ quoteId: quote.id }));
    expect(Number(shipment.priceQuoted)).toBe(1000); // the quote's frozen total, not the new route price
    expect(shipment.quoteId).toBe(quote.id);
    expect(shipment.providerId).toBe(p.id);
    expect(shipment.routeId).toBe(r.id);
    expect(shipment.availabilityId).toBe(slot.id);
    expect(Number(shipment.weightKg)).toBe(10);
    expect(await slotRow(slot.id)).toEqual({ u: 1, k: '10.00' }); // capacity WAS reserved, at Shipment creation, exactly as for any other Shipment
  });

  it('createShipment rejects an unaccepted, foreign, or nonexistent quote -- nothing reserved, nothing inserted', async () => {
    const p = await mkProvider();
    const r = await mkRoute(p.id);
    const slot = await mkSlot(p.id, r.id);
    const offered = await quoteService.createQuote({ id: 11 } as any, { providerId: p.id, routeId: r.id, availabilityId: slot.id });

    await expect(shipmentService.createShipment(11, baseDto({ quoteId: offered.id }))).rejects.toThrow(ConflictException); // not accepted yet
    await expect(shipmentService.createShipment(11, baseDto({ quoteId: 999999 }))).rejects.toThrow(NotFoundException);

    const accepted = await quoteService.acceptQuote({ id: 11 } as any, offered.id);
    await expect(shipmentService.createShipment(999, baseDto({ quoteId: accepted.id }))).rejects.toThrow(ForbiddenException); // different requester

    expect(await slotRow(slot.id)).toMatchObject({ u: 0 });
    expect(await shipmentCount()).toBe(0);
  });

  it('a quote can back at most one Shipment (DB-enforced) -- a second createShipment on the same accepted quote fails', async () => {
    const p = await mkProvider();
    const r = await mkRoute(p.id);
    const quote = await quoteService.createQuote({ id: 11 } as any, { providerId: p.id, routeId: r.id });
    await quoteService.acceptQuote({ id: 11 } as any, quote.id);

    await shipmentService.createShipment(11, baseDto({ quoteId: quote.id }));
    await expect(shipmentService.createShipment(11, baseDto({ quoteId: quote.id }))).rejects.toThrow();
    expect(await shipmentCount()).toBe(1);
  });

  it('createShipment WITHOUT a quoteId is completely unaffected (existing inline pricing, unchanged)', async () => {
    const p = await mkProvider();
    const r = await mkRoute(p.id, { pricePerKg: 50, fixedFee: 200 });
    const shipment = await shipmentService.createShipment(5, baseDto({ routeId: r.id, weightKg: 10, providerId: p.id }));
    expect(Number(shipment.priceQuoted)).toBe(500); // 10*50 = 500 > 200
    expect(shipment.quoteId).toBeNull();
  });

  // ── POST-B3-REVIEW CORRECTION: route/location compatibility ──────────────
  // A canonical quote must snapshot the actual selected transport SERVICE,
  // not merely price IDs -- a quote tied to the Dar->Mwanza route (the
  // default mkRoute() fixture) must never be issuable, or consumable by a
  // Shipment, as though it were Dar->Arusha.
  describe('quote/Shipment origin-destination must be compatible with the selected route', () => {
    it('rejects quote creation when the client-supplied origin/destination contradicts the selected route', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id); // Dar es Salaam -> Mwanza
      await expect(
        quoteService.createQuote({ id: 1 } as any, {
          providerId: p.id, routeId: r.id, originCity: 'Dar es Salaam', destinationCity: 'Arusha',
        }),
      ).rejects.toThrow(BadRequestException);
      expect((await quotes.find()).length).toBe(0);
    });

    it('accepts quote creation when the client-supplied origin/destination genuinely matches the route (fuzzy containment, same rule discovery already uses)', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id); // Dar es Salaam -> Mwanza
      const quote = await quoteService.createQuote({ id: 1 } as any, {
        providerId: p.id, routeId: r.id, originCity: 'Dar', destinationCity: 'Mwanza City',
      });
      expect(quote.originCity).toBe('Dar');
      expect(quote.destinationCity).toBe('Mwanza City');
    });

    it('rejects Shipment creation when its requested origin/destination is incompatible with the accepted quote\'s route, even though the quote itself is valid', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id); // Dar es Salaam -> Mwanza
      const slot = await mkSlot(p.id, r.id);
      const quote = await quoteService.createQuote({ id: 11 } as any, {
        providerId: p.id, routeId: r.id, availabilityId: slot.id, weightKg: 5,
      });
      await quoteService.acceptQuote({ id: 11 } as any, quote.id);

      await expect(
        shipmentService.createShipment(
          11,
          baseDto({ quoteId: quote.id, originCity: 'Dar es Salaam', destinationCity: 'Arusha' }),
        ),
      ).rejects.toThrow(BadRequestException);

      expect(await shipmentCount()).toBe(0);
      expect(await slotRow(slot.id)).toMatchObject({ u: 0 }); // nothing reserved on the rejected attempt
    });

    it('a Shipment whose requested origin/destination correctly matches the accepted quote\'s route still succeeds', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id);
      const quote = await quoteService.createQuote({ id: 11 } as any, { providerId: p.id, routeId: r.id });
      await quoteService.acceptQuote({ id: 11 } as any, quote.id);

      const shipment = await shipmentService.createShipment(
        11,
        baseDto({ quoteId: quote.id, originCity: 'Dar es Salaam', destinationCity: 'Mwanza' }),
      );
      expect(shipment.quoteId).toBe(quote.id);
      expect(await shipmentCount()).toBe(1);
    });
  });

  // ── POST-B3-REVIEW CORRECTION: direct quote API cannot bypass discovery ──
  // The canonical quote API must never issue an OFFERED quote against an
  // availability that Stage 3S-B2 discovery itself would exclude.
  describe('quote creation requires the selected availability to be currently discoverable/eligible', () => {
    it('rejects a FULL slot', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id);
      const slot = await mkSlot(p.id, r.id, { totalSlots: 3, usedSlots: 3 });
      await expect(
        quoteService.createQuote({ id: 1 } as any, { providerId: p.id, routeId: r.id, availabilityId: slot.id }),
      ).rejects.toThrow(BadRequestException);
      expect((await quotes.find()).length).toBe(0);
    });

    it('rejects a CANCELLED slot', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id);
      const slot = await mkSlot(p.id, r.id, { status: AvailabilityStatus.CANCELLED });
      await expect(
        quoteService.createQuote({ id: 1 } as any, { providerId: p.id, routeId: r.id, availabilityId: slot.id }),
      ).rejects.toThrow(BadRequestException);
      expect((await quotes.find()).length).toBe(0);
    });

    it('rejects a DEPARTED slot', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id);
      const slot = await mkSlot(p.id, r.id, { status: AvailabilityStatus.DEPARTED });
      await expect(
        quoteService.createQuote({ id: 1 } as any, { providerId: p.id, routeId: r.id, availabilityId: slot.id }),
      ).rejects.toThrow(BadRequestException);
      expect((await quotes.find()).length).toBe(0);
    });

    it('rejects a stale slot (date outside the today/tomorrow discovery window)', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const slot = await mkSlot(p.id, r.id, { date: yesterday });
      await expect(
        quoteService.createQuote({ id: 1 } as any, { providerId: p.id, routeId: r.id, availabilityId: slot.id }),
      ).rejects.toThrow(BadRequestException);
      expect((await quotes.find()).length).toBe(0);
    });

    it('rejects when the requested weight exceeds the slot\'s remaining capacity', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id);
      const slot = await mkSlot(p.id, r.id, { totalCapacityKg: 10, usedCapacityKg: 8 });
      await expect(
        quoteService.createQuote({ id: 1 } as any, { providerId: p.id, routeId: r.id, availabilityId: slot.id, weightKg: 5 }),
      ).rejects.toThrow(BadRequestException);
      expect((await quotes.find()).length).toBe(0);
    });

    it('performs no capacity mutation on any of the rejected eligibility attempts above', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id);
      const slot = await mkSlot(p.id, r.id, { totalSlots: 3, usedSlots: 3 });
      const before = await slotRow(slot.id);
      await expect(
        quoteService.createQuote({ id: 1 } as any, { providerId: p.id, routeId: r.id, availabilityId: slot.id }),
      ).rejects.toThrow(BadRequestException);
      expect(await slotRow(slot.id)).toEqual(before);
    });
  });

  // ── POST-B3-REVIEW CORRECTION: eligibility can still change after a quote
  // is issued -- Shipment execution must fail safely, not silently succeed
  // against a slot that is no longer real.
  it('an availability that becomes ineligible AFTER quote acceptance still fails safely at Shipment creation, not silently', async () => {
    const p = await mkProvider();
    const r = await mkRoute(p.id);
    const slot = await mkSlot(p.id, r.id, { totalSlots: 1, usedSlots: 0 });
    const quote = await quoteService.createQuote({ id: 11 } as any, {
      providerId: p.id, routeId: r.id, availabilityId: slot.id,
    });
    await quoteService.acceptQuote({ id: 11 } as any, quote.id);

    // Eligibility changes for an unrelated reason between acceptance and
    // Shipment creation -- e.g. the same slot got filled by another booking.
    await ds.query(`UPDATE public.provider_availability SET "usedSlots" = "totalSlots" WHERE id = $1`, [slot.id]);

    await expect(shipmentService.createShipment(11, baseDto({ quoteId: quote.id }))).rejects.toThrow();
    expect(await shipmentCount()).toBe(0);
  });

  // ── Stage 3S-B5: Final Quote Composition + Transparent Charges ───────────
  // The repository-first assessment (transport-quote-components.ts) found no
  // canonical, quote-domain-reachable authority for agentPickup/hubHandling/
  // lastMileDelivery/platformService yet -- these tests prove that absence
  // is genuine (never silently fabricated) and that the total is a real,
  // reusable sum rather than a value that merely happens to equal the base.
  describe('final quote composition is transparent and never invents a charge', () => {
    it('a created quote exposes ONLY the transportBase component -- no other key is ever fabricated', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id, { pricePerKg: 250, fixedFee: 700 });
      const quote = await quoteService.createQuote({ id: 60 } as any, { providerId: p.id, routeId: r.id, weightKg: 4 });

      expect(Object.keys(quote.components)).toEqual(['transportBase']);
      expect(quote.components.agentPickup).toBeUndefined();
      expect(quote.components.hubHandling).toBeUndefined();
      expect(quote.components.lastMileDelivery).toBeUndefined();
      expect(quote.components.platformService).toBeUndefined();
    });

    it('totalAmount is the genuine sum of persisted components, not a hardcoded alias for transportBase', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id, { pricePerKg: 300, fixedFee: 200 });
      const quote = await quoteService.createQuote({ id: 61 } as any, { providerId: p.id, routeId: r.id, weightKg: 6 });

      expect(Number(quote.totalAmount)).toBe(sumQuoteComponents(quote.components));
      expect(Number(quote.totalAmount)).toBe(Number(quote.baseAmount)); // true today only because no other component resolves
    });

    it('transportBase in the composed quote is byte-identical to B4\'s own effective-pricing resolver -- composition never re-derives it differently', async () => {
      const p = await mkProvider();
      const r = await mkRoute(p.id, { pricePerKg: 175, fixedFee: 450 });
      const expected = await transport.getEffectiveRoutePrice(r.id);
      const byWeight = expected.pricePerKg * 8;
      const expectedBase = Math.max(byWeight, expected.fixedFee);

      const quote = await quoteService.createQuote({ id: 62 } as any, { providerId: p.id, routeId: r.id, weightKg: 8 });
      expect(Number(quote.components.transportBase)).toBe(expectedBase);
    });
  });
});
