import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { Shipment, ShipmentStatus } from './entities/shipment.entity';
import { TransportService } from '../transport/transport.service';
import { TransportRunService } from '../transport/transport-run.service';
import { TransportQuoteService } from '../transport/transport-quote.service';
import { JourneySelectionService, assertClientAuthoredJourney } from '../transport/journey-selection.service';
import { JourneyComposerService } from '../transport/journey-composer.service';
import { JourneyLeg, JourneySelection, JourneySelectionStatus } from '../transport/entities/journey-selection.entity';
import { TransportQuote, TransportQuoteStatus } from '../transport/entities/transport-quote.entity';
import { TransportRoutePriceHistory } from '../transport/entities/transport-route-price-history.entity';
import { ProviderAvailability } from '../transport/entities/provider-availability.entity';
import { TransportProvider, ProviderStatus, ProviderType } from '../transport/entities/transport-provider.entity';
import { TransportRoute, RouteType } from '../transport/entities/transport-route.entity';
import { RouteStop } from '../transport/entities/route-stop.entity';
import { TransportRun } from '../transport/entities/transport-run.entity';
import { TransportRunStop } from '../transport/entities/transport-run-stop.entity';
import { Vehicle } from '../transport/entities/vehicle.entity';
import { ParcelRunAssignment } from '../transport/entities/parcel-run-assignment.entity';
import { ensureRouteStopDeferrableSequenceConstraint } from '../transport/route-stop-schema';
import { eatDateTime, runLoad } from '../transport/run-supply';
import { ParcelRunAssignmentService } from '../transport/parcel-run-assignment.service';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { AddParcelMovementTender1788288600000 } from '../database/migrations/1788288600000-AddParcelMovementTender';
import { MakeShipmentProviderTenderGenerationSafe1788289200000 } from '../database/migrations/1788289200000-MakeShipmentProviderTenderGenerationSafe';
import { projectShipmentForParcel } from './shipment-projection';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AddTransportRecurringSchedule1788291600000 } from '../database/migrations/1788291600000-AddTransportRecurringSchedule';
import { Parcel } from '../super-agents/entities/parcel.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';

/**
 * Logistics repair Gates 1 and 2 — the booking contract, proved against REAL
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
 * Gate 1 acceptance: one COMMITTED Journey and exactly ONE Parcel.
 *
 * Gate 2 acceptance: the supply is the transporter's own schedule. A
 * Kariakoo -> Mbagala safari scheduled "every day at 06:00" through the real
 * TransportRunService is what the search finds and what gets booked --
 * tomorrow and twenty days out -- and room on the Run is taken exactly once.
 * No test here creates a provider_availability row; the table stays empty.
 *
 * Real: ShipmentsController, ShipmentsService, TransportService,
 * TransportRunService, JourneyComposerService, JourneySelectionService,
 * TransportQuoteService, the recurring-schedule migration, and every table
 * they touch. Two things are stand-ins, as in this codebase's other
 * real-PostgreSQL specs: the place resolver (a fixed map in the shape
 * LocationIntelligenceService.resolve returns) and the Parcel repository
 * (raw SQL over a minimal `parcel` table, because the Parcel entity drags in
 * the whole Order graph).
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

const DAY = 86400000;
/** The Tanzania calendar day `days` from now. */
const eatDay = (days: number) => eatDateTime(new Date(Date.now() + days * DAY)).date;

suite('Gates 1-2 — booking contract on Transport Runs, real PostgreSQL', () => {
  jest.setTimeout(180000);
  const SENDER = 7;
  const user: any = { id: SENDER };
  let ds: DataSource;
  let controller: ShipmentsController;
  let shipments: ShipmentsService;
  let transport: TransportService;
  let runService: TransportRunService;
  let composer: JourneyComposerService;
  let journeys: JourneySelectionService;
  let quotes: TransportQuoteService;
  let pra: ParcelRunAssignmentService;
  let provider: TransportProvider;
  let providerUserId: number;
  let route: TransportRoute;
  let vehicle: Vehicle;
  let scheduleId: number;
  /** The earliest Run on sale (today's 06:00 if it has not left yet, else tomorrow's). */
  let run: { id: number; scheduledDeparture: Date };
  let userSeq = 0;

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
        `INSERT INTO public.parcel ("shipmentId", "journeySelectionId", status, "originCity", "destinationCity", "weightKg", source,
           "superAgentId", "destinationSuperAgentId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [value.shipment.id, value.journeySelectionId ?? null, value.status, value.originCity, value.destinationCity, value.weightKg, value.source,
          value.superAgent?.id ?? null, value.destinationSuperAgent?.id ?? null],
      );
      return { ...value, ...rows[0] };
    },
  });

  const parcelsOf = (shipmentId: number) =>
    ds.query('SELECT * FROM public.parcel WHERE "shipmentId" = $1', [shipmentId]);
  const runs = (): Promise<Array<{ id: number; status: string; scheduledDeparture: Date; vehicleId: number | null }>> =>
    ds.query(`SELECT id, status, "scheduledDeparture", "vehicleId" FROM public.transport_run ORDER BY "scheduledDeparture", id`);
  const runOn = async (day: string) => {
    const match = (await runs()).find((r) => eatDateTime(new Date(r.scheduledDeparture)).date === day);
    if (!match) throw new Error(`no Run on ${day}`);
    return match;
  };
  const legacySlots = async () => Number((await ds.query('SELECT count(*)::int AS n FROM public.provider_availability'))[0].n);

  // The requests exactly as the form sends them, with the fixture's
  // placeholder ids swapped for the rows this run created.
  const selectJourneyBody = (runId = run.id) => ({ ...requests.selectJourney.body, runId });
  const quoteBody = (journeySelectionId: number) => ({
    ...requests.quote.body, journeySelectionId, providerId: provider.id, routeId: route.id,
  });
  const shipmentBody = (quoteId: number) => ({ ...requests.shipment.body, quoteId });
  const search = async (qs: string): Promise<any> => {
    const q = parseQuery(qs);
    return controller.findRoutes(q.origin, q.destination, q.originPlace, q.destinationPlace, q.weightKg, q.providerId, q);
  };
  /** Journey -> quote -> accept, for one more parcel on `runId`. */
  const price = async (runId = run.id) => {
    const journey = await composer.selectComposed(SENDER, selectJourneyBody(runId));
    const offered = await quotes.createQuote(user, quoteBody(journey.id));
    const accepted = await quotes.acceptQuote(user, offered.id);
    return { journey, accepted };
  };
  /** The whole booking the form performs, up to a CONFIRMED Shipment with its Parcel. */
  const book = async (runId = run.id) => {
    const { journey, accepted } = await price(runId);
    const created = await shipments.createShipment(SENDER, shipmentBody(accepted.id) as any);
    const confirmed = await shipments.confirmShipment(SENDER, created.id, requests.confirm.body);
    return { journey, accepted, shipment: confirmed.shipment, parcel: confirmed.parcel };
  };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 30 },
      entities: [...B5B_BASE_ENTITIES, ProviderAvailability, TransportRoute, TransportRoutePriceHistory,
        RouteStop, TransportRun, TransportRunStop, Vehicle, ParcelRunAssignment, ParcelCustodyEvent,
        Shipment, TransportQuote, JourneySelection, JourneyLeg],
    });
    await ds.initialize();
    await ensureRouteStopDeferrableSequenceConstraint((sql) => ds.query(sql));
    // The schedule table has no entity: it exists only through the real migration.
    const runner = ds.createQueryRunner();
    try { await new AddTransportRecurringSchedule1788291600000().up(runner); } finally { await runner.release(); }
    await ds.query(`CREATE TABLE public.parcel (
      id SERIAL PRIMARY KEY, "shipmentId" integer UNIQUE, "journeySelectionId" integer,
      "trackingNumber" varchar, status varchar, "originCity" varchar, "destinationCity" varchar,
      "weightKg" decimal(8,2), source varchar,
      "superAgentId" integer, "destinationSuperAgentId" integer, "arrivedAtHubTime" timestamp
    )`);
    await ds.query(`CREATE TABLE public.parcel_tracking (id SERIAL PRIMARY KEY, "parcelId" integer NOT NULL, status text NOT NULL,
      city text, note text, "updatedBy" text, "handlerPhone" text, "handlerLocation" text, "handlerType" text,
      "createdAt" timestamp NOT NULL DEFAULT now())`);
    // Gate 5: the real movement-tender table and its generation trigger.
    const tenderRunner = ds.createQueryRunner();
    try {
      await new AddParcelMovementTender1788288600000().up(tenderRunner);
      await new MakeShipmentProviderTenderGenerationSafe1788289200000().up(tenderRunner);
    } finally { await tenderRunner.release(); }

    const providers = ds.getRepository(TransportProvider);
    const routes = ds.getRepository(TransportRoute);
    const slots = ds.getRepository(ProviderAvailability);
    // Positional, as the constructor declares them: repositories 0-2, the
    // DataSource last (index 15). Everything between is unused here.
    const args: any[] = new Array(16).fill({});
    args[0] = providers; args[1] = routes; args[2] = slots; args[15] = ds;
    transport = new (TransportService as any)(...args);
    runService = new TransportRunService(
      ds.getRepository(RouteStop), routes, ds.getRepository(TransportRun), ds.getRepository(TransportRunStop),
      transport, { search: async () => [] } as any, ds, ds.getRepository(Vehicle),
    );

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
    // The real Run assignment service. Only the Super Agent commission
    // obligation it records on receipt is a stand-in (Gate 6's subject).
    pra = new ParcelRunAssignmentService(
      ds.getRepository(ParcelRunAssignment), ds.getRepository(TransportRun), ds.getRepository(TransportRunStop),
      transport, ds, { createObligation: async () => ({ id: 1 }), attemptResolve: async () => undefined } as any,
    );
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    await ds.query('DELETE FROM public.parcel_movement_tender');
    await ds.query('DELETE FROM public.parcel_run_assignment');
    await ds.query('DELETE FROM public.parcel_custody_event');
    await ds.query('DELETE FROM public.parcel_tracking');
    await ds.query('DELETE FROM public.parcel');
    await ds.query('DELETE FROM public.shipment');
    await ds.query('DELETE FROM public.transport_quote');
    await ds.query('DELETE FROM public.journey_leg');
    await ds.query('DELETE FROM public.journey_selection');
    await ds.query('DELETE FROM public.provider_availability');
    await ds.query('DELETE FROM public.transport_route_schedule');
    await ds.query('TRUNCATE TABLE public.transport_run_stop RESTART IDENTITY CASCADE');
    await ds.query('TRUNCATE TABLE public.transport_run RESTART IDENTITY CASCADE');
    await ds.query('DELETE FROM public.route_stop');
    await ds.query('DELETE FROM public.vehicle');
    await ds.query('DELETE FROM public.transport_route_price_history');
    await ds.query('DELETE FROM public.transport_route');
    await ds.query('DELETE FROM public.transport_provider');

    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `van-${++userSeq}@gate2.local`, phone: `+2555${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'Van',
    } as any));
    providerUserId = (u as any).id;
    provider = await ds.getRepository(TransportProvider).save(ds.getRepository(TransportProvider).create({
      name: 'Kentexa Van', type: ProviderType.VAN, status: ProviderStatus.VERIFIED, userId: providerUserId,
    } as any) as unknown as TransportProvider);
    // An intracity loop described ONLY by its stops -- no coverage city. The
    // region ("Dar es Salaam") does not appear anywhere on the route, so it
    // can only be found through the ward-level routing keys.
    route = await ds.getRepository(TransportRoute).save(ds.getRepository(TransportRoute).create({
      providerId: provider.id, routeType: RouteType.LOCAL_LOOP, loopStops: ['Kariakoo', 'Mbagala'],
      pricePerKg: 500, fixedFee: 2000, isActive: true,
    } as any) as unknown as TransportRoute);

    // Supply exactly as a transporter creates it: stops, a vehicle, and
    // "every day at 06:00". Nothing below writes a Run or a slot by hand.
    await runService.addRouteStop(providerUserId, route.id, { sequence: 0, locationLabel: 'Kariakoo' });
    await runService.addRouteStop(providerUserId, route.id, { sequence: 1, locationLabel: 'Mbagala' });
    vehicle = await runService.addVehicle(providerUserId, {
      identifier: 'Van 1', type: ProviderType.VAN, parcelCapacity: 2, weightCapacityKg: 100,
    });
    const schedule = await runService.createRecurringSchedule(providerUserId, {
      routeId: route.id, scheduleType: 'daily', departureTime: '06:00', defaultVehicleId: vehicle.id,
    } as any);
    scheduleId = schedule.id;
    const future = (await runs()).filter((r) => new Date(r.scheduledDeparture).getTime() > Date.now() + 60000);
    run = { id: future[0].id, scheduledDeparture: new Date(future[0].scheduledDeparture) };
  });

  // ── The schedule is the supply ──────────────────────────────────────────
  describe('a daily 06:00 schedule is what senders can book (Gate 2)', () => {
    it('is on sale tomorrow and twenty days out, at 06:00 Tanzania time, open, with its vehicle', async () => {
      const all = await runs();
      for (const day of [eatDay(1), eatDay(20)]) {
        const r = all.find((x) => eatDateTime(new Date(x.scheduledDeparture)).date === day)!;
        expect(r).toBeDefined();
        expect(eatDateTime(new Date(r.scheduledDeparture)).time).toBe('06:00');
        expect(r.status).toBe('open');
        expect(r.vehicleId).toBe(vehicle.id);
      }
      expect(await legacySlots()).toBe(0);
    });

    it('the rolling materializer keeps it on sale: twenty days later the window has moved forward, once', async () => {
      const before = (await runs()).length;
      const later = new Date(Date.now() + 20 * DAY);
      // System-level: no user, every active schedule.
      const first = await runService.materializeSchedules({}, later);
      expect(first.created).toBeGreaterThanOrEqual(19);
      expect(first.skipped).toEqual([]);
      const all = await runs();
      expect(all.length).toBe(before + first.created);
      expect(all.some((r) => eatDateTime(new Date(r.scheduledDeparture)).date === eatDay(41))).toBe(true);
      // Idempotent, and safe when two instances fire at once.
      const [a, b] = await Promise.all([
        runService.materializeSchedules({}, later), runService.materializeSchedules({}, later),
      ]);
      expect(a.created + b.created).toBe(0);
      const departures = (await runs()).map((r) => new Date(r.scheduledDeparture).getTime());
      expect(new Set(departures).size).toBe(departures.length);
    });

    it('two instances topping up at the same moment create each Run once', async () => {
      const later = new Date(Date.now() + 30 * DAY);
      const [a, b] = await Promise.all([
        runService.materializeSchedules({}, later), runService.materializeSchedules({}, later),
      ]);
      expect(a.created + b.created).toBeGreaterThan(0);
      const departures = (await runs()).map((r) => new Date(r.scheduledDeparture).getTime());
      expect(new Set(departures).size).toBe(departures.length);
      expect(a.skipped.concat(b.skipped)).toEqual([]);
    });

    it('a stopped schedule, or a suspended provider, produces nothing -- and says why', async () => {
      const later = new Date(Date.now() + 20 * DAY);
      await ds.query(`UPDATE public.transport_provider SET status = 'suspended' WHERE id = $1`, [provider.id]);
      const suspended = await runService.materializeSchedules({}, later);
      expect(suspended.created).toBe(0);
      expect(suspended.skipped).toEqual([{ scheduleId, reason: 'provider is not verified' }]);
      await ds.query(`UPDATE public.transport_provider SET status = 'verified' WHERE id = $1`, [provider.id]);
      await runService.deactivateRecurringSchedule(providerUserId, scheduleId);
      expect(await runService.materializeSchedules({}, later)).toEqual({ created: 0, skipped: [] });
    });
  });

  // ── Route search ────────────────────────────────────────────────────────
  describe('route search — GET /shipments/routes', () => {
    it('the form\'s request (two selected places) finds the scheduled trips, earliest first', async () => {
      const result = await search(requests.routeSearch.queryString);
      expect(result.availability.reason).toBe('available');
      expect(result.availableTrips.length).toBeGreaterThanOrEqual(21);
      expect(result.availableTrips[0]).toMatchObject({
        runId: run.id, availabilityId: null, providerId: provider.id, routeId: route.id, providerName: 'Kentexa Van',
        departureTime: '06:00', loadStop: 'Kariakoo', unloadStop: 'Mbagala', slotsAvailable: 2, capacityAvailableKg: 100,
        pricePerKg: 500, fixedFee: 2000,
      });
      expect(result.availableTrips[0].matchedOn[0]).toMatchObject({ originKey: 'Kariakoo', destinationKey: 'Mbagala' });
      const times = result.availableTrips.map((t: any) => Date.parse(t.departureAt));
      expect([...times].sort((x, y) => x - y)).toEqual(times);
      expect(result.origin).toMatchObject({ source: 'place', resolved: true });
    });

    it('a travel day narrows it to that day: tomorrow, and twenty days out', async () => {
      for (const day of [eatDay(1), eatDay(20)]) {
        const result = await search(`${requests.routeSearch.queryString}&date=${day}`);
        expect(result.availableTrips).toHaveLength(1);
        expect(result.availableTrips[0]).toMatchObject({ date: day, departureTime: '06:00', runId: (await runOn(day)).id });
      }
      await expect(search(`${requests.routeSearch.queryString}&date=soon`)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('typed text finds the same trips', async () => {
      const result = await search(requests.routeSearchTyped.queryString);
      expect(result.availableTrips[0]).toMatchObject({ runId: run.id });
      expect(result.availability.reason).toBe('available');
    });

    it('the object form an already-installed app still sends is accepted, not a 400', async () => {
      const result = await search(
        'originPlace[providerKey]=tz_seed&originPlace[providerPlaceId]=ward:6' +
        '&destinationPlace[providerKey]=tz_seed&destinationPlace[providerPlaceId]=ward:20&weightKg=2',
      );
      expect(result.availableTrips[0]).toMatchObject({ runId: run.id });
    });

    it('a Run only carries in the direction it travels', async () => {
      const result = await search('originPlace=tz_seed:ward:20&destinationPlace=tz_seed:ward:6&weightKg=2');
      expect(result.availableTrips).toHaveLength(0);
      expect(result.availability.reason).toBe('no_open_trip');
    });

    it('a trip that has left, or that the transporter has not opened, is not offered', async () => {
      await ds.query(`UPDATE public.transport_run SET "scheduledDeparture" = $2 WHERE id = $1`, [run.id, new Date(Date.now() - 3600000)]);
      const next = (await runOn(eatDay(2))).id;
      await ds.query(`UPDATE public.transport_run SET status = 'scheduled' WHERE id = $1`, [next]);
      const ids = (await search(requests.routeSearch.queryString)).availableTrips.map((t: any) => t.runId);
      expect(ids).not.toContain(run.id);
      expect(ids).not.toContain(next);
      expect(ids.length).toBeGreaterThan(0);
    });

    it('says WHY nothing is bookable: providers but no open trip', async () => {
      await ds.query(`UPDATE public.transport_run SET status = 'closed'`);
      const result = await search(requests.routeSearch.queryString);
      expect(result.availableTrips).toHaveLength(0);
      expect(result.providers).toHaveLength(1);
      expect(result.availability.reason).toBe('no_open_trip');
    });

    it('says WHY nothing is bookable: no capacity for this weight', async () => {
      await ds.query(`UPDATE public.transport_provider SET "defaultMaxWeightKg" = 50 WHERE id = $1`, [provider.id]);
      const result = await search(requests.routeSearch.queryString.replace('weightKg=2', 'weightKg=500'));
      expect(result.availableTrips).toHaveLength(0);
      expect(result.providers).toHaveLength(0);
      expect(result.availability.reason).toBe('no_capacity_for_weight');
    });

    it('says WHY nothing is bookable: nobody covers the route', async () => {
      const result = await search('originPlace=tz_seed:ward:6&destinationPlace=tz_seed:region:2&weightKg=2');
      expect(result.availableTrips).toHaveLength(0);
      expect(result.availability.reason).toBe('no_route');
    });

    it('says WHY nothing is bookable: the chosen transporter does not serve it', async () => {
      const result = await search(`${requests.routeSearch.queryString}&providerId=${provider.id + 999}`);
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
    it('ends with one COMMITTED Journey and exactly ONE Parcel, booked on the Run', async () => {
      const stops = await ds.getRepository(TransportRunStop).find({ where: { runId: run.id }, order: { sequence: 'ASC' } });

      // 1. Journey: the client names the offered trip; the server composes the leg.
      const journey = await composer.selectComposed(SENDER, selectJourneyBody());
      expect(journey.status).toBe(JourneySelectionStatus.SELECTED);
      const legs = await ds.getRepository(JourneyLeg).find({ where: { journeySelectionId: journey.id } });
      expect(legs).toHaveLength(1);
      expect(legs[0]).toMatchObject({
        type: 'transport', providerId: provider.id, routeId: route.id, runId: run.id, availabilityId: null,
        loadRouteStopId: stops[0].sourceRouteStopId, unloadRouteStopId: stops[1].sourceRouteStopId,
        commitmentLevel: 'run_confirmed', agentId: null, superAgentId: null,
      });
      expect(legs[0].executionRequirements).toMatchObject({
        composedByServer: true, loadRunStopId: stops[0].id, unloadRunStopId: stops[1].id,
      });
      // Server-authored nodes: the routing key that matched, and the place it came from.
      expect(legs[0].fromNode).toMatchObject({ city: 'Kariakoo', stop: 'Kariakoo', source: 'place', placeRef: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' } });
      expect(legs[0].toNode).toMatchObject({ city: 'Mbagala', stop: 'Mbagala', source: 'place' });
      expect(journey.originSnapshot).toMatchObject({ label: 'Kariakoo, Ilala, Dar es Salaam', regionName: 'Dar es Salaam' });
      // Selecting is not booking.
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 0, kg: 0 });

      // 2. Quote: ids and weight only; the cities come from the stored leg.
      const offered = await quotes.createQuote(user, quoteBody(journey.id));
      expect(offered.status).toBe(TransportQuoteStatus.OFFERED);
      expect(offered).toMatchObject({ originCity: 'Kariakoo', destinationCity: 'Mbagala', journeySelectionId: journey.id, availabilityId: null });
      expect(Number(offered.totalAmount)).toBe(2000); // max(500 x 2kg, fixed fee 2000)

      // 3. Accept: the Journey becomes commercially committed.
      const accepted = await quotes.acceptQuote(user, offered.id);
      expect(accepted.status).toBe(TransportQuoteStatus.ACCEPTED);
      expect((await ds.getRepository(JourneySelection).findOneBy({ id: journey.id }))!.status)
        .toBe(JourneySelectionStatus.COMMITTED);
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 0, kg: 0 });

      // 4. Shipment: PENDING, bound to the Journey; its place on the Run is taken now.
      const created = await shipments.createShipment(SENDER, shipmentBody(accepted.id) as any);
      expect(created.status).toBe(ShipmentStatus.PENDING);
      expect(created).toMatchObject({
        journeySelectionId: journey.id, quoteId: accepted.id, providerId: provider.id, routeId: route.id,
        availabilityId: null, originCity: 'Dar es Salaam', destinationCity: 'Dar es Salaam',
      });
      expect(Number(created.priceQuoted)).toBe(2000);
      expect(created.trackingNumber).toBe(`KTX-SHP-${created.id}`);
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 1, kg: 2 });

      // 5. Confirm with the form's (empty) body.
      const confirmed = await shipments.confirmShipment(SENDER, created.id, requests.confirm.body);
      expect(confirmed.shipment.status).toBe(ShipmentStatus.CONFIRMED);
      expect(confirmed.parcel).toMatchObject({ journeySelectionId: journey.id, status: 'pending', source: 'shipment' });

      // Acceptance: one committed Journey, exactly one Parcel, one place on the
      // Run -- and a retried confirmation changes none of them.
      const again = await shipments.confirmShipment(SENDER, created.id, requests.confirm.body);
      expect(again.parcel.id).toBe(confirmed.parcel.id);
      expect(await parcelsOf(created.id)).toHaveLength(1);
      expect(await ds.getRepository(JourneySelection).count()).toBe(1);
      expect((await ds.getRepository(JourneySelection).findOneBy({ id: journey.id }))!.status)
        .toBe(JourneySelectionStatus.COMMITTED);
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 1, kg: 2 });
      // The search now shows one place fewer on that trip, and no legacy slot was ever involved.
      const trip = (await search(requests.routeSearch.queryString)).availableTrips.find((t: any) => t.runId === run.id);
      expect(trip).toMatchObject({ slotsAvailable: 1, capacityAvailableKg: 98 });
      expect(await legacySlots()).toBe(0);
    });

    it('books the 06:00 safari tomorrow and the one twenty days out', async () => {
      for (const day of [eatDay(1), eatDay(20)]) {
        const target = await runOn(day);
        const booked = await book(target.id);
        expect(booked.shipment.status).toBe(ShipmentStatus.CONFIRMED);
        expect(await parcelsOf(booked.shipment.id)).toHaveLength(1);
        expect(await runLoad(ds.manager, target.id)).toEqual({ parcels: 1, kg: 2 });
      }
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

    it('a shipment that names different places than its priced journey is refused, and holds no place', async () => {
      const { accepted } = await price();
      await expect(shipments.createShipment(SENDER, {
        ...shipmentBody(accepted.id), destinationPlace: { providerKey: 'tz_seed', providerPlaceId: 'region:2' },
      } as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(await ds.getRepository(Shipment).count()).toBe(0);
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 0, kg: 0 });
    });

    it('a trip that does not serve the journey cannot be selected', async () => {
      await expect(composer.selectComposed(SENDER, {
        ...selectJourneyBody(), destination: { place: { providerKey: 'tz_seed', providerPlaceId: 'region:2' } },
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(await ds.getRepository(JourneySelection).count()).toBe(0);
    });

    it('a pre-Gate-2 request naming a slot instead of a trip is a 400', async () => {
      const { runId, ...rest } = selectJourneyBody();
      await expect(composer.selectComposed(SENDER, { ...rest, availabilityId: 501 } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── Room on the Run is taken exactly once ───────────────────────────────
  describe('capacity is reserved exactly once, on the Run (Gate 2)', () => {
    it('a van with two places sells two: the third sender is told it is full, and the trip leaves the search', async () => {
      await book();
      await book();
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 2, kg: 4 });
      await expect(composer.selectComposed(SENDER, selectJourneyBody())).rejects.toBeInstanceOf(ConflictException);
      const ids = (await search(requests.routeSearch.queryString)).availableTrips.map((t: any) => t.runId);
      expect(ids).not.toContain(run.id);
    });

    it('three senders racing for two places: exactly two get one, whatever the order', async () => {
      // All three are priced while there is still room; the race is at booking.
      const priced = [await price(), await price(), await price()];
      const results = await Promise.allSettled(
        priced.map((p) => shipments.createShipment(SENDER, shipmentBody(p.accepted.id) as any)),
      );
      const won = results.filter((r) => r.status === 'fulfilled');
      const lost = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(won).toHaveLength(2);
      expect(lost).toHaveLength(1);
      expect(lost[0].reason).toBeInstanceOf(ConflictException);
      expect(await ds.getRepository(Shipment).count()).toBe(2);
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 2, kg: 4 });
    });

    it('weight counts too', async () => {
      await ds.query(`UPDATE public.vehicle SET "parcelCapacity" = NULL, "weightCapacityKg" = 3 WHERE id = $1`, [vehicle.id]);
      await book(); // 2 kg of 3
      await expect(composer.selectComposed(SENDER, selectJourneyBody())).rejects.toBeInstanceOf(ConflictException);
    });

    it('a Run with no vehicle is not capped (a vehicle can be assigned later)', async () => {
      await ds.query(`UPDATE public.transport_run SET "vehicleId" = NULL WHERE id = $1`, [run.id]);
      await book(); await book(); await book();
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 3, kg: 6 });
      const trip = (await search(requests.routeSearch.queryString)).availableTrips.find((t: any) => t.runId === run.id);
      expect(trip).toMatchObject({ slotsAvailable: null, capacityAvailableKg: null });
    });

    it('cancelling gives the place back once -- there is nothing to release twice', async () => {
      const first = await price();
      const kept = await shipments.createShipment(SENDER, shipmentBody(first.accepted.id) as any);
      const second = await price();
      const dropped = await shipments.createShipment(SENDER, shipmentBody(second.accepted.id) as any);
      expect((await runLoad(ds.manager, run.id)).parcels).toBe(2);

      await shipments.cancelShipment(SENDER, dropped.id);
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 1, kg: 2 });
      await expect(shipments.cancelShipment(SENDER, dropped.id)).rejects.toBeInstanceOf(BadRequestException);
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 1, kg: 2 });

      // The freed place can be sold again; the kept booking is untouched.
      const third = await book();
      expect(third.shipment.status).toBe(ShipmentStatus.CONFIRMED);
      expect((await ds.getRepository(Shipment).findOneBy({ id: kept.id }))!.status).toBe(ShipmentStatus.PENDING);
      expect((await runLoad(ds.manager, run.id)).parcels).toBe(2);
    });

    it('a booked parcel still counts once after it is assigned to the Run; an unbooked one adds one', async () => {
      const booked = await book();
      const stops = await ds.getRepository(TransportRunStop).find({ where: { runId: run.id }, order: { sequence: 'ASC' } });
      const assign = (parcelId: number) => ds.query(
        `INSERT INTO public.parcel_run_assignment ("runId", "parcelId", "loadRunStopId", "unloadRunStopId", status, "createdByUserId")
         VALUES ($1, $2, $3, $4, 'scheduled', $5)`, [run.id, parcelId, stops[0].id, stops[1].id, providerUserId]);

      await assign(booked.parcel.id);
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 1, kg: 2 });
      // What the assignment-time check asks: "everything except this parcel".
      expect(await runLoad(ds.manager, run.id, booked.parcel.id)).toEqual({ parcels: 0, kg: 0 });

      // A walk-in parcel tendered straight onto the Run, with no booking.
      const [walkIn] = await ds.query(`INSERT INTO public.parcel (status, "weightKg", source) VALUES ('pending', 5, 'super_agent') RETURNING id`);
      await assign(walkIn.id);
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 2, kg: 7 });
      // Full: the next sender cannot book it.
      await expect(composer.selectComposed(SENDER, selectJourneyBody())).rejects.toBeInstanceOf(ConflictException);
    });

    it('a priced journey cannot be booked once the trip has left', async () => {
      const { accepted } = await price();
      await ds.query(`UPDATE public.transport_run SET "scheduledDeparture" = $2 WHERE id = $1`, [run.id, new Date(Date.now() - 60000)]);
      await expect(shipments.createShipment(SENDER, shipmentBody(accepted.id) as any)).rejects.toBeInstanceOf(ConflictException);
      expect(await ds.getRepository(Shipment).count()).toBe(0);
    });

    it('a booking on a trip the transporter then cancels cannot be confirmed', async () => {
      const { accepted } = await price();
      const created = await shipments.createShipment(SENDER, shipmentBody(accepted.id) as any);
      await ds.query(`UPDATE public.transport_run SET status = 'cancelled' WHERE id = $1`, [run.id]);
      await expect(shipments.confirmShipment(SENDER, created.id, requests.confirm.body)).rejects.toBeInstanceOf(ConflictException);
      expect((await ds.getRepository(Shipment).findOneBy({ id: created.id }))!.status).toBe(ShipmentStatus.PENDING);
      expect(await parcelsOf(created.id)).toHaveLength(0);
    });

    it('a quote for another transporter\'s trip is refused', async () => {
      const journey = await composer.selectComposed(SENDER, selectJourneyBody());
      await expect(quotes.createQuote(user, { ...quoteBody(journey.id), providerId: provider.id + 1 }))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── Gate 5: Shipment -> hub -> Run ──────────────────────────────────────
  describe('a booked Shipment reaches its Run through the hubs the Run stops at (Gate 5)', () => {
    let originHub: { id: number; userId: number };
    let destinationHub: { id: number; userId: number };
    const providerCtx = () => ({ userId: providerUserId, accountRoleId: 501, roleType: 'transport_provider', workspaceId: null } as any);
    const hubCtx = (hub: { id: number; userId: number }) =>
      ({ userId: hub.userId, profileId: hub.id, accountRoleId: 600 + hub.id, roleType: 'super_agent', workspaceId: null } as any);
    const mkHub = async (name: string) => {
      const u = await ds.getRepository(User).save(ds.getRepository(User).create({
        email: `hub-${++userSeq}@gate5.local`, phone: `+2558${String(userSeq).padStart(8, '0')}`, password: 'x', name,
      } as any));
      const hub: any = await ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({
        userId: (u as any).id, businessName: name, city: 'Dar es Salaam', address: `${name} Street`, status: 'active',
      } as any) as any);
      return { id: hub.id as number, userId: (u as any).id as number };
    };
    /** What the desk does when the parcel is put on its counter (SuperAgentsService writes exactly this). */
    const deskReceive = async (parcelId: number, hub: { id: number; userId: number }) => {
      await ds.getRepository(ParcelCustodyEvent).insert({
        parcelId, eventKind: 'origin_hub_received', operationKey: `origin-hub-received:${hub.id}`,
        fromCustodianType: null, fromCustodianId: null, toCustodianType: 'super_agent', toCustodianId: hub.id,
        actorSource: 'account_role', actorUserId: hub.userId, actorAccountRoleId: 600 + hub.id, actorRoleType: 'super_agent', hubId: hub.id,
      } as any);
      await ds.query(`UPDATE public.parcel SET status = 'received_at_hub' WHERE id = $1`, [parcelId]);
      await projectShipmentForParcel(ds.manager, parcelId);
    };
    const shipmentRow = async (id: number) => (await ds.getRepository(Shipment).findOneBy({ id }))!;
    const custodyKinds = async (parcelId: number) =>
      (await ds.query('SELECT "eventKind" FROM public.parcel_custody_event WHERE "parcelId" = $1 ORDER BY "recordedAt", id', [parcelId]))
        .map((r: any) => r.eventKind);

    // The transporter binds the route's stops to Kentexa hubs and reschedules:
    // every Run from then on loads at one hub and unloads at the other.
    beforeEach(async () => {
      originHub = await mkHub('Kariakoo Hub');
      destinationHub = await mkHub('Mbagala Hub');
      const stops = await runService.listRouteStops(providerUserId, route.id);
      await runService.updateRouteStop(providerUserId, route.id, stops[0].id, { superAgentId: originHub.id });
      await runService.updateRouteStop(providerUserId, route.id, stops[1].id, { superAgentId: destinationHub.id });
      await runService.deactivateRecurringSchedule(providerUserId, scheduleId);
      await ds.query('TRUNCATE TABLE public.transport_run_stop RESTART IDENTITY CASCADE');
      await ds.query('TRUNCATE TABLE public.transport_run RESTART IDENTITY CASCADE');
      const schedule = await runService.createRecurringSchedule(providerUserId, {
        routeId: route.id, scheduleType: 'daily', departureTime: '06:00', defaultVehicleId: vehicle.id,
      } as any);
      scheduleId = schedule.id;
      const future = (await runs()).filter((r) => new Date(r.scheduledDeparture).getTime() > Date.now() + 60000);
      run = { id: future[0].id, scheduledDeparture: new Date(future[0].scheduledDeparture) };
    });
    afterEach(async () => {
      await ds.query('DELETE FROM public.parcel_movement_tender');
      await ds.query('DELETE FROM public.parcel_run_assignment');
      await ds.query('DELETE FROM public.parcel');
      await ds.query('DELETE FROM public.shipment');
      await ds.query('DELETE FROM public.transport_route_schedule');
      await ds.query('TRUNCATE TABLE public.transport_run_stop RESTART IDENTITY CASCADE');
      await ds.query('TRUNCATE TABLE public.transport_run RESTART IDENTITY CASCADE');
      await ds.query('DELETE FROM public.route_stop');
      await ds.query('DELETE FROM public.super_agent');
    });

    it('the search shows which hubs the trip uses', async () => {
      const trip = (await search(requests.routeSearch.queryString)).availableTrips[0];
      expect(trip).toMatchObject({
        runId: run.id,
        loadHub: { id: originHub.id, name: 'Kariakoo Hub', address: 'Kariakoo Hub Street', city: 'Dar es Salaam' },
        unloadHub: { id: destinationHub.id, name: 'Mbagala Hub' },
      });
    });

    it('sender -> origin hub -> transporter -> Run -> destination hub -> recipient: one story, one place on the Run', async () => {
      // Booking with the form's (empty) confirmation: the hubs are the trip's, decided by the server.
      const { shipment, parcel, journey } = await book();
      expect(shipment).toMatchObject({
        status: ShipmentStatus.CONFIRMED, originHubId: originHub.id, originHubSource: 'sender_selected',
        destinationHubId: destinationHub.id, destinationHubSource: 'sender_selected',
      });
      const parcelRow = async () => (await ds.query('SELECT * FROM public.parcel WHERE id = $1', [parcel.id]))[0];
      expect(await parcelRow()).toMatchObject({ superAgentId: originHub.id, destinationSuperAgentId: destinationHub.id });
      // One customer number for all of it.
      expect((await parcelRow()).trackingNumber).toBe(shipment.trackingNumber);

      // The transporter sees it booked on their Run -- not yet at the hub.
      const stops = await ds.getRepository(TransportRunStop).find({ where: { runId: run.id }, order: { sequence: 'ASC' } });
      expect(await pra.listBookingsForRun(providerUserId, run.id)).toEqual([{
        shipmentId: shipment.id, trackingNumber: shipment.trackingNumber, itemDescription: 'Nguo za watoto', weightKg: 2,
        parcelId: parcel.id, loadRunStopId: stops[0].id, unloadRunStopId: stops[1].id, loadStop: 'Kariakoo', unloadStop: 'Mbagala',
        assignmentId: null, state: 'awaiting_parcel',
      }]);
      // It cannot be put on the manifest while the hub does not hold it.
      await expect(pra.assignBooking(providerUserId, run.id, parcel.id)).rejects.toBeInstanceOf(ForbiddenException);

      // The sender drops it at the trip's origin hub; the desk receives it.
      await deskReceive(parcel.id, originHub);
      expect((await shipmentRow(shipment.id)).status).toBe(ShipmentStatus.COLLECTED);
      expect((await pra.listBookingsForRun(providerUserId, run.id))[0].state).toBe('ready_to_assign');

      // The transporter accepts it: onto THIS Run, at the committed stops, under the booking's own tender.
      const assignment = await pra.assignBooking(providerUserId, run.id, parcel.id);
      expect(assignment).toMatchObject({
        runId: run.id, parcelId: parcel.id, loadRunStopId: stops[0].id, unloadRunStopId: stops[1].id, status: 'scheduled',
      });
      const tenders = await ds.query('SELECT source, status, "runId", "consumedByParcelRunAssignmentId" FROM public.parcel_movement_tender WHERE "parcelId" = $1', [parcel.id]);
      expect(tenders).toEqual([{ source: 'shipment_provider_booking', status: 'consumed', runId: run.id, consumedByParcelRunAssignmentId: assignment.id }]);
      // A second tap is the same assignment; and the booking still holds ONE place, not two.
      expect((await pra.assignBooking(providerUserId, run.id, parcel.id)).id).toBe(assignment.id);
      expect(await runLoad(ds.manager, run.id)).toEqual({ parcels: 1, kg: 2 });
      expect((await pra.listBookingsForRun(providerUserId, run.id))[0]).toMatchObject({ state: 'assigned', assignmentId: assignment.id });

      // Loaded: custody passes hub -> transporter; the Shipment is in transit.
      await pra.markLoaded(providerCtx(), assignment.id);
      expect((await shipmentRow(shipment.id)).status).toBe(ShipmentStatus.IN_TRANSIT);
      expect(await shipments.trackShipment(shipment.trackingNumber!)).toMatchObject({ status: 'in_transit', holder: 'carrier', location: null });

      // Off-loaded, then the destination hub confirms receipt.
      await pra.markUnloaded(providerCtx(), assignment.id);
      await expect(pra.confirmReceipt(hubCtx(originHub), assignment.id)).rejects.toBeInstanceOf(ForbiddenException);
      await pra.confirmReceipt(hubCtx(destinationHub), assignment.id);
      expect((await parcelRow()).status).toBe('arrived_at_hub');
      expect(await shipments.trackShipment(shipment.trackingNumber!)).toMatchObject({
        status: 'in_transit', holder: 'hub', location: { name: 'Mbagala Hub', city: 'Dar es Salaam' },
      });
      expect((await pra.listBookingsForRun(providerUserId, run.id))[0].state).toBe('received');

      // The recipient collects (the desk's verified handover writes exactly this).
      await ds.getRepository(ParcelCustodyEvent).insert({
        parcelId: parcel.id, eventKind: 'recipient_self_pickup', operationKey: `recipient-self-pickup:${destinationHub.id}`,
        fromCustodianType: 'super_agent', fromCustodianId: destinationHub.id, toCustodianType: 'recipient_contact', toCustodianId: null,
        actorSource: 'account_role', actorUserId: destinationHub.userId, actorAccountRoleId: 600 + destinationHub.id, actorRoleType: 'super_agent',
        hubId: destinationHub.id,
      } as any);
      await ds.query(`UPDATE public.parcel SET status = 'self_pickup' WHERE id = $1`, [parcel.id]);
      await projectShipmentForParcel(ds.manager, parcel.id);

      // The same story for everyone: the ledger, the Shipment, the Run.
      expect(await custodyKinds(parcel.id)).toEqual([
        'origin_hub_received', 'parcel_run_loaded', 'parcel_run_unloaded', 'parcel_run_received',
        'destination_hub_received', 'recipient_self_pickup',
      ]);
      const done = await shipmentRow(shipment.id);
      expect(done.status).toBe(ShipmentStatus.COMPLETED);
      expect(done.collectedAt).toBeInstanceOf(Date);
      expect(done.deliveredAt).toBeInstanceOf(Date);
      expect(done.completedAt).toBeInstanceOf(Date);
      expect((await ds.getRepository(JourneySelection).findOneBy({ id: journey.id }))!.status).toBe(JourneySelectionStatus.COMMITTED);
      expect(await ds.query('SELECT count(*)::int AS n FROM public.parcel_run_assignment WHERE "parcelId" = $1', [parcel.id])).toEqual([{ n: 1 }]);
    });

    it('the hubs are the trip\'s: a different hub is refused, and a suspended trip hub stops the confirmation', async () => {
      const other = await mkHub('Other Hub');
      const first = await price();
      const created = await shipments.createShipment(SENDER, shipmentBody(first.accepted.id) as any);
      await expect(shipments.confirmShipment(SENDER, created.id, { originHubId: other.id, requestOriginHub: true }))
        .rejects.toBeInstanceOf(ConflictException);
      expect((await shipmentRow(created.id)).status).toBe(ShipmentStatus.PENDING);

      await ds.query(`UPDATE public.super_agent SET status = 'suspended' WHERE id = $1`, [destinationHub.id]);
      await expect(shipments.confirmShipment(SENDER, created.id, requests.confirm.body)).rejects.toBeInstanceOf(ConflictException);
      expect((await shipmentRow(created.id)).status).toBe(ShipmentStatus.PENDING);
      expect(await parcelsOf(created.id)).toHaveLength(0);

      // Naming the trip's own hub is the same as naming none.
      await ds.query(`UPDATE public.super_agent SET status = 'active' WHERE id = $1`, [destinationHub.id]);
      const confirmed = await shipments.confirmShipment(SENDER, created.id, { originHubId: originHub.id, requestOriginHub: true });
      expect(confirmed.shipment).toMatchObject({ originHubId: originHub.id, destinationHubId: destinationHub.id });
    });

    it('a booking is accepted only by its own transporter, onto its own Run', async () => {
      const { parcel } = await book();
      await deskReceive(parcel.id, originHub);
      const other = await runOn(eatDay(3));

      // Someone else's account sees nothing of this Run.
      await expect(pra.listBookingsForRun(providerUserId + 9999, run.id)).rejects.toBeInstanceOf(NotFoundException);
      // Not booked on that other trip: nothing to accept there...
      await expect(pra.assignBooking(providerUserId, other.id, parcel.id)).rejects.toBeInstanceOf(NotFoundException);
      // ...and the raw assignment door refuses a Run the Journey did not commit to.
      const otherStops = await ds.getRepository(TransportRunStop).find({ where: { runId: other.id }, order: { sequence: 'ASC' } });
      await expect(pra.createAssignment(providerUserId, {
        runId: other.id, parcelId: parcel.id, loadRunStopId: otherStops[0].id, unloadRunStopId: otherStops[1].id,
      })).rejects.toBeInstanceOf(ForbiddenException);
      expect(await ds.query('SELECT count(*)::int AS n FROM public.parcel_run_assignment')).toEqual([{ n: 0 }]);
      expect(await pra.listBookingsForRun(providerUserId, other.id)).toEqual([]);
    });

    it('an unconfirmed booking is shown as such and cannot be accepted', async () => {
      const { accepted } = await price();
      const created = await shipments.createShipment(SENDER, shipmentBody(accepted.id) as any);
      expect(await pra.listBookingsForRun(providerUserId, run.id)).toMatchObject([
        { shipmentId: created.id, parcelId: null, state: 'not_confirmed' },
      ]);
      await shipments.cancelShipment(SENDER, created.id);
      expect(await pra.listBookingsForRun(providerUserId, run.id)).toEqual([]);
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
    it.each([
      ['a Run', { runId: 5 }],
      ['a load stop', { loadRouteStopId: 5 }],
      ['an unload stop', { unloadRouteStopId: 5 }],
      ['a commitment level', { commitmentLevel: 'vehicle_confirmed' }],
    ])('a leg naming %s is a 400: trips are selected through select-composed', (_label, extra) => {
      expect(() => assertClientAuthoredJourney({
        originSnapshot: node, destinationSnapshot: node, cargoRequirements: cargo, legs: [leg(extra)],
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
