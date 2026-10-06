import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { Shipment, ShipmentStatus } from './entities/shipment.entity';
import { TransportService } from '../transport/transport.service';
import { TransportQuoteService } from '../transport/transport-quote.service';
import { JourneySelectionService, assertClientAuthoredJourney } from '../transport/journey-selection.service';
import { JourneyComposerService } from '../transport/journey-composer.service';
import { JourneyLeg, JourneySelection, JourneySelectionStatus } from '../transport/entities/journey-selection.entity';
import { TransportQuote, TransportQuoteStatus } from '../transport/entities/transport-quote.entity';
import { TransportRoutePriceHistory } from '../transport/entities/transport-route-price-history.entity';
import { ProviderAvailability, AvailabilityStatus } from '../transport/entities/provider-availability.entity';
import { TransportProvider, ProviderStatus, ProviderType } from '../transport/entities/transport-provider.entity';
import { TransportRoute, RouteType } from '../transport/entities/transport-route.entity';
import { Parcel } from '../super-agents/entities/parcel.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';

/**
 * Logistics repair Gate 1 — the booking entry contract, proved against REAL
 * PostgreSQL with the EXACT requests the send form makes.
 *
 * The October 2026 audit found the form and the API individually reasonable
 * and incompatible together. So this spec does not invent its own inputs: it
 * reads /contracts/send-shipment-requests.json, the same file the frontend
 * test (bishoo-frontend/src/api/shipmentRequests.test.js) pins the form's
 * request builders to, and drives the real controller and services with
 * those query strings and bodies:
 *
 *   route search -> hub search -> journey selection -> quote -> accept ->
 *   shipment -> confirmation
 *
 * Acceptance (Gate 1): one COMMITTED Journey and exactly ONE Parcel.
 *
 * Real: ShipmentsController, ShipmentsService, TransportService,
 * JourneyComposerService, JourneySelectionService, TransportQuoteService,
 * and every table they touch. Two things are stand-ins, as in this
 * codebase's other real-PostgreSQL specs: the place resolver (a fixed map in
 * the shape LocationIntelligenceService.resolve returns) and the Parcel
 * repository (raw SQL over a minimal `parcel` table, because the Parcel
 * entity drags in the whole Order graph).
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

const contract = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../contracts/send-shipment-requests.json'), 'utf8'),
);
const requests = contract.requests;

// What Express 5's default ("simple") query parser hands a controller: flat
// string values, bracketed keys left literal.
const parseQuery = (qs: string): Record<string, string> => Object.fromEntries(new URLSearchParams(qs));

const PLACES: Record<string, any> = {
  'ward:6': {
    displayLabel: 'Kariakoo, Ilala, Dar es Salaam', regionId: 1, regionName: 'Dar es Salaam',
    districtId: 10, districtName: 'Ilala', wardId: 6, wardName: 'Kariakoo',
    providerKey: 'tz_seed', providerPlaceId: 'ward:6', resolutionMethod: 'admin_seed',
  },
  'ward:20': {
    displayLabel: 'Mbagala, Temeke, Dar es Salaam', regionId: 1, regionName: 'Dar es Salaam',
    districtId: 11, districtName: 'Temeke', wardId: 20, wardName: 'Mbagala',
    providerKey: 'tz_seed', providerPlaceId: 'ward:20', resolutionMethod: 'admin_seed',
  },
  'region:2': {
    displayLabel: 'Mwanza', regionId: 2, regionName: 'Mwanza',
    providerKey: 'tz_seed', providerPlaceId: 'region:2', resolutionMethod: 'admin_seed',
  },
};
const locations: any = {
  resolve: async (ref: any) => (ref?.providerKey === 'tz_seed' ? PLACES[ref.providerPlaceId] ?? null : null),
};

suite('Gate 1 — booking entry contract, real PostgreSQL', () => {
  jest.setTimeout(120000);
  const SENDER = 7;
  const user: any = { id: SENDER };
  let ds: DataSource;
  let controller: ShipmentsController;
  let shipments: ShipmentsService;
  let transport: TransportService;
  let composer: JourneyComposerService;
  let journeys: JourneySelectionService;
  let quotes: TransportQuoteService;
  let provider: TransportProvider;
  let route: TransportRoute;
  let slot: ProviderAvailability;
  let userSeq = 0;

  const TODAY = new Date().toISOString().slice(0, 10);

  // Parcel stand-in: the three repository calls ShipmentsService makes.
  const parcelRepo = (manager: EntityManager | DataSource): any => ({
    findOne: async (opts: any) => {
      const id = opts?.where?.shipment?.id;
      const rows = await manager.query('SELECT * FROM public.parcel WHERE "shipmentId" = $1', [id]);
      return rows[0] ?? null;
    },
    create: (value: any) => value,
    save: async (value: any) => {
      if (value.id) {
        await manager.query('UPDATE public.parcel SET "trackingNumber" = $1 WHERE id = $2', [value.trackingNumber, value.id]);
        return value;
      }
      const rows = await manager.query(
        `INSERT INTO public.parcel ("shipmentId", "journeySelectionId", status, "originCity", "destinationCity", "weightKg", source)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [value.shipment.id, value.journeySelectionId ?? null, value.status, value.originCity, value.destinationCity, value.weightKg, value.source],
      );
      return { ...value, ...rows[0] };
    },
  });

  const parcelsOf = (shipmentId: number) =>
    ds.query('SELECT * FROM public.parcel WHERE "shipmentId" = $1', [shipmentId]);
  const slotRow = async () =>
    (await ds.query('SELECT "usedSlots"::int AS used, "usedCapacityKg"::text AS kg FROM public.provider_availability WHERE id = $1', [slot.id]))[0];

  // The requests exactly as the form sends them, with the fixture's
  // placeholder ids swapped for the rows this run created.
  const selectJourneyBody = () => ({ ...requests.selectJourney.body, availabilityId: slot.id });
  const quoteBody = (journeySelectionId: number) => ({
    ...requests.quote.body, journeySelectionId, providerId: provider.id, routeId: route.id, availabilityId: slot.id,
  });
  const shipmentBody = (quoteId: number) => ({ ...requests.shipment.body, quoteId });

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 20 },
      entities: [...B5B_BASE_ENTITIES, ProviderAvailability, TransportRoute, TransportRoutePriceHistory,
        Shipment, TransportQuote, JourneySelection, JourneyLeg],
    });
    await ds.initialize();
    await ds.query(`CREATE TABLE public.parcel (
      id SERIAL PRIMARY KEY, "shipmentId" integer UNIQUE, "journeySelectionId" integer,
      "trackingNumber" varchar, status varchar, "originCity" varchar, "destinationCity" varchar,
      "weightKg" decimal(8,2), source varchar
    )`);

    const providers = ds.getRepository(TransportProvider);
    const routes = ds.getRepository(TransportRoute);
    const slots = ds.getRepository(ProviderAvailability);
    const args: any[] = new Array(15).fill({});
    args[0] = providers; args[1] = routes; args[2] = slots; args[14] = ds;
    transport = new (TransportService as any)(...args);

    journeys = new JourneySelectionService(ds.getRepository(JourneySelection), ds, transport);
    composer = new JourneyComposerService(transport, journeys, locations);
    quotes = new TransportQuoteService(
      ds.getRepository(TransportQuote), routes, slots, ds.getRepository(JourneySelection), transport, ds, journeys,
    );

    // ShipmentsService with its Shipment repository's manager wrapped so that
    // getRepository(Parcel) -- inside or outside a transaction -- is the stand-in.
    const realShipmentRepo = ds.getRepository(Shipment);
    const managerProxy: any = Object.create(ds.manager);
    managerProxy.transaction = (fn: any) =>
      ds.manager.transaction(async (em) => {
        const proxy: any = Object.create(em);
        proxy.getRepository = (entity: any) => (entity === Parcel ? parcelRepo(em) : em.getRepository(entity));
        return fn(proxy);
      });
    const shipmentRepo: any = Object.create(realShipmentRepo);
    Object.defineProperty(shipmentRepo, 'manager', { value: managerProxy });
    shipments = new ShipmentsService(
      shipmentRepo as Repository<Shipment>, routes, parcelRepo(ds), ds.getRepository(SuperAgent),
      transport, { search: async () => [] } as any, locations, ds.getRepository(TransportQuote),
    );
    controller = new ShipmentsController(shipments);
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    await ds.query('DELETE FROM public.parcel');
    await ds.query('DELETE FROM public.shipment');
    await ds.query('DELETE FROM public.transport_quote');
    await ds.query('DELETE FROM public.journey_leg');
    await ds.query('DELETE FROM public.journey_selection');
    await ds.query('DELETE FROM public.provider_availability');
    await ds.query('DELETE FROM public.transport_route_price_history');
    await ds.query('DELETE FROM public.transport_route');
    await ds.query('DELETE FROM public.transport_provider');

    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `van-${++userSeq}@gate1.local`, phone: `+2555${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'Van',
    } as any));
    provider = await ds.getRepository(TransportProvider).save(ds.getRepository(TransportProvider).create({
      name: 'Kentexa Van', type: ProviderType.VAN, status: ProviderStatus.VERIFIED, userId: (u as any).id,
    } as any) as unknown as TransportProvider);
    // An intracity loop described ONLY by its stops -- no coverage city. The
    // region ("Dar es Salaam") does not appear anywhere on the route, so it
    // can only be found through the ward-level routing keys.
    route = await ds.getRepository(TransportRoute).save(ds.getRepository(TransportRoute).create({
      providerId: provider.id, routeType: RouteType.LOCAL_LOOP, loopStops: ['Kariakoo', 'Mbagala'],
      pricePerKg: 500, fixedFee: 2000, isActive: true,
    } as any) as unknown as TransportRoute);
    slot = await ds.getRepository(ProviderAvailability).save(ds.getRepository(ProviderAvailability).create({
      providerId: provider.id, routeId: route.id, date: TODAY, departureTime: '06:00', totalSlots: 5, usedSlots: 0,
      totalCapacityKg: 100, usedCapacityKg: 0, status: AvailabilityStatus.OPEN,
    } as any) as unknown as ProviderAvailability);
  });

  // ── Route search ────────────────────────────────────────────────────────
  describe('route search — GET /shipments/routes', () => {
    const search = (qs: string) => {
      const q = parseQuery(qs);
      return controller.findRoutes(q.origin, q.destination, q.originPlace, q.destinationPlace, q.weightKg, q.providerId, q);
    };

    it('the form\'s request (two selected places) finds the trip', async () => {
      const result: any = await search(requests.routeSearch.queryString);
      expect(result.availableTrips).toHaveLength(1);
      expect(result.availableTrips[0]).toMatchObject({ availabilityId: slot.id, providerId: provider.id, routeId: route.id });
      expect(result.availability.reason).toBe('available');
      expect(result.origin).toMatchObject({ source: 'place', resolved: true });
    });

    it('typed text finds the same trip', async () => {
      const result: any = await search(requests.routeSearchTyped.queryString);
      expect(result.availableTrips).toHaveLength(1);
      expect(result.availability.reason).toBe('available');
    });

    it('the object form an already-installed app still sends is accepted, not a 400', async () => {
      const result: any = await search(
        'originPlace[providerKey]=tz_seed&originPlace[providerPlaceId]=ward:6' +
        '&destinationPlace[providerKey]=tz_seed&destinationPlace[providerPlaceId]=ward:20&weightKg=2',
      );
      expect(result.availableTrips).toHaveLength(1);
    });

    it('says WHY nothing is bookable: providers but no open trip', async () => {
      await ds.query(`UPDATE public.provider_availability SET status = 'cancelled' WHERE id = $1`, [slot.id]);
      const result: any = await search(requests.routeSearch.queryString);
      expect(result.availableTrips).toHaveLength(0);
      expect(result.providers).toHaveLength(1);
      expect(result.availability.reason).toBe('no_open_trip');
    });

    it('says WHY nothing is bookable: no capacity for this weight', async () => {
      await ds.query(`UPDATE public.transport_provider SET "defaultMaxWeightKg" = 50 WHERE id = $1`, [provider.id]);
      const result: any = await search(requests.routeSearch.queryString.replace('weightKg=2', 'weightKg=500'));
      expect(result.availableTrips).toHaveLength(0);
      expect(result.providers).toHaveLength(0);
      expect(result.availability.reason).toBe('no_capacity_for_weight');
    });

    it('says WHY nothing is bookable: nobody covers the route', async () => {
      const result: any = await search('originPlace=tz_seed:ward:6&destinationPlace=tz_seed:region:2&weightKg=2');
      expect(result.availableTrips).toHaveLength(0);
      expect(result.availability.reason).toBe('no_route');
    });

    it('says WHY nothing is bookable: the chosen transporter does not serve it', async () => {
      const result: any = await search(`${requests.routeSearch.queryString}&providerId=${provider.id + 999}`);
      expect(result.availableTrips).toHaveLength(0);
      expect(result.availability.reason).toBe('provider_does_not_serve_route');
    });

    it('an unknown place is a 400, never an empty result', async () => {
      await expect(search('originPlace=tz_seed:ward:99999&destination=Mbagala')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── Hub search ──────────────────────────────────────────────────────────
  describe('hub search — GET /shipments/hubs', () => {
    it('the form\'s request is accepted and answers with a list', async () => {
      const q = parseQuery(requests.hubSearchOrigin.queryString);
      const result = await controller.hubsForPlace(q.place, q.side, q);
      expect(result.side).toBe('origin');
      expect(Array.isArray(result.hubs)).toBe(true);
    });
  });

  // ── The whole booking ───────────────────────────────────────────────────
  describe('journey selection -> quote -> shipment -> confirmation', () => {
    it('ends with one COMMITTED Journey and exactly ONE Parcel', async () => {
      // 1. Journey: the client names the offered trip; the server composes the leg.
      const journey = await composer.selectComposed(SENDER, selectJourneyBody());
      expect(journey.status).toBe(JourneySelectionStatus.SELECTED);
      const legs = await ds.getRepository(JourneyLeg).find({ where: { journeySelectionId: journey.id } });
      expect(legs).toHaveLength(1);
      expect(legs[0]).toMatchObject({ type: 'transport', providerId: provider.id, routeId: route.id, availabilityId: slot.id });
      // Server-authored nodes: the routing key that matched, and the place it came from.
      expect(legs[0].fromNode).toMatchObject({ city: 'Kariakoo', source: 'place', placeRef: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' } });
      expect(legs[0].toNode).toMatchObject({ city: 'Mbagala', source: 'place' });
      expect(journey.originSnapshot).toMatchObject({ label: 'Kariakoo, Ilala, Dar es Salaam', regionName: 'Dar es Salaam' });

      // 2. Quote: ids and weight only; the cities come from the stored leg.
      const offered = await quotes.createQuote(user, quoteBody(journey.id));
      expect(offered.status).toBe(TransportQuoteStatus.OFFERED);
      expect(offered).toMatchObject({ originCity: 'Kariakoo', destinationCity: 'Mbagala', journeySelectionId: journey.id });
      expect(Number(offered.totalAmount)).toBe(2000); // max(500 x 2kg, fixed fee 2000)

      // 3. Accept: the Journey becomes commercially committed.
      const accepted = await quotes.acceptQuote(user, offered.id);
      expect(accepted.status).toBe(TransportQuoteStatus.ACCEPTED);
      expect((await ds.getRepository(JourneySelection).findOneBy({ id: journey.id }))!.status)
        .toBe(JourneySelectionStatus.COMMITTED);

      // 4. Shipment: PENDING, bound to the Journey, capacity reserved once.
      const created = await shipments.createShipment(SENDER, shipmentBody(accepted.id) as any);
      expect(created.status).toBe(ShipmentStatus.PENDING);
      expect(created).toMatchObject({
        journeySelectionId: journey.id, quoteId: accepted.id, providerId: provider.id, routeId: route.id,
        availabilityId: slot.id, originCity: 'Dar es Salaam', destinationCity: 'Dar es Salaam',
      });
      expect(Number(created.priceQuoted)).toBe(2000);
      expect(created.trackingNumber).toBe(`KTX-SHP-${created.id}`);
      expect(await slotRow()).toMatchObject({ used: 1 });

      // 5. Confirm with the form's (empty) body.
      const confirmed = await shipments.confirmShipment(SENDER, created.id, requests.confirm.body);
      expect(confirmed.shipment.status).toBe(ShipmentStatus.CONFIRMED);
      expect(confirmed.parcel).toMatchObject({ journeySelectionId: journey.id, status: 'pending', source: 'shipment' });

      // Acceptance: one committed Journey, exactly one Parcel -- and a retried
      // confirmation changes neither, nor reserves capacity again.
      const again = await shipments.confirmShipment(SENDER, created.id, requests.confirm.body);
      expect(again.parcel.id).toBe(confirmed.parcel.id);
      expect(await parcelsOf(created.id)).toHaveLength(1);
      expect(await ds.getRepository(JourneySelection).count()).toBe(1);
      expect((await ds.getRepository(JourneySelection).findOneBy({ id: journey.id }))!.status)
        .toBe(JourneySelectionStatus.COMMITTED);
      expect(await slotRow()).toMatchObject({ used: 1 });
    });

    it('typed text on both sides books the same way', async () => {
      const body = { ...selectJourneyBody(), origin: { text: 'Kariakoo' }, destination: { text: 'Mbagala' } };
      const journey = await composer.selectComposed(SENDER, body);
      const offered = await quotes.createQuote(user, quoteBody(journey.id));
      const accepted = await quotes.acceptQuote(user, offered.id);
      const { originPlace, destinationPlace, ...rest } = shipmentBody(accepted.id);
      const created = await shipments.createShipment(SENDER, { ...rest, originCity: 'Kariakoo', destinationCity: 'Mbagala' } as any);
      const confirmed = await shipments.confirmShipment(SENDER, created.id, {});
      expect(confirmed.shipment.status).toBe(ShipmentStatus.CONFIRMED);
      expect(await parcelsOf(created.id)).toHaveLength(1);
    });

    it('a shipment that names different places than its priced journey is refused, and reserves nothing', async () => {
      const journey = await composer.selectComposed(SENDER, selectJourneyBody());
      const accepted = await quotes.acceptQuote(user, (await quotes.createQuote(user, quoteBody(journey.id))).id);
      await expect(shipments.createShipment(SENDER, {
        ...shipmentBody(accepted.id), destinationPlace: { providerKey: 'tz_seed', providerPlaceId: 'region:2' },
      } as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(await ds.getRepository(Shipment).count()).toBe(0);
      expect(await slotRow()).toMatchObject({ used: 0 });
    });

    it('a trip that does not serve the journey cannot be selected', async () => {
      await expect(composer.selectComposed(SENDER, {
        ...selectJourneyBody(), destination: { place: { providerKey: 'tz_seed', providerPlaceId: 'region:2' } },
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(await ds.getRepository(JourneySelection).count()).toBe(0);
    });
  });

  // ── What the client may NOT do ──────────────────────────────────────────
  describe('the client cannot write authoritative journey legs', () => {
    const cargo = requests.selectJourney.body.cargoRequirements;
    const node = { displayLabel: 'Kariakoo' };
    const leg = (extra: Record<string, unknown> = {}) => ({
      type: 'transport', fromNode: node, toNode: node, providerId: 1, routeId: 1, ...extra,
    });

    it('a leg naming a Super Agent (and so the cash collector) is a 400', () => {
      expect(() => assertClientAuthoredJourney({
        originSnapshot: node, destinationSnapshot: node, cargoRequirements: cargo, paymentMethod: 'cash',
        legs: [leg({ superAgentId: 12 })],
      } as any)).toThrow(BadRequestException);
    });
    it('a leg naming an Agent is a 400', () => {
      expect(() => assertClientAuthoredJourney({
        originSnapshot: node, destinationSnapshot: node, cargoRequirements: cargo, legs: [leg({ agentId: 3 })],
      } as any)).toThrow(BadRequestException);
    });
    it.each(['first_mile', 'hub_intake', 'last_mile', 'customer_pickup', 'transfer'])('a %s leg is a 400', (type) => {
      expect(() => assertClientAuthoredJourney({
        originSnapshot: node, destinationSnapshot: node, cargoRequirements: cargo, legs: [leg({ type })],
      } as any)).toThrow(BadRequestException);
    });
    it.each([[undefined], [null], [{}], [{ legs: 'x' }], [{ legs: [] }]])('a malformed journey %p is a 400, not a crash', (dto) => {
      expect(() => assertClientAuthoredJourney(dto as any)).toThrow(BadRequestException);
    });
  });

  // ── Invalid cargo is the sender's error, not the server's ───────────────
  describe('invalid cargo is a 400', () => {
    const base = () => selectJourneyBody();
    it.each([
      ['a blank description', { description: '   ' }],
      ['a missing description', { description: undefined }],
      ['zero quantity', { quantity: 0 }],
      ['a fractional quantity', { quantity: 1.5 }],
      ['a negative weight', { weightKg: -1 }],
      ['a non-numeric weight', { weightKg: 'heavy' }],
    ])('%s', async (_label, patch) => {
      const body = base();
      await expect(composer.selectComposed(SENDER, {
        ...body, cargoRequirements: { ...body.cargoRequirements, ...patch },
      } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('missing cargo altogether', async () => {
      const { cargoRequirements, ...rest } = base();
      await expect(composer.selectComposed(SENDER, rest as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
