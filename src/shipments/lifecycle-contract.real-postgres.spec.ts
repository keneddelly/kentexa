import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { ShipmentsService } from './shipments.service';
import { Shipment, ShipmentStatus } from './entities/shipment.entity';
import { projectShipment, projectShipmentForParcel } from './shipment-projection';
import { resolveParcelTrackingNumber, customerTrackingNumberForParcel } from './customer-tracking';
import { linkIntakeShipment, linkIntakeShipmentWithin } from './intake-shipment';
import { TransportService } from '../transport/transport.service';
import { JourneySelectionService } from '../transport/journey-selection.service';
import { JourneyComposerService } from '../transport/journey-composer.service';
import { JourneyLeg, JourneySelection, JourneySelectionStatus } from '../transport/entities/journey-selection.entity';
import { TransportQuote } from '../transport/entities/transport-quote.entity';
import { ProviderAvailability } from '../transport/entities/provider-availability.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { TransportRun } from '../transport/entities/transport-run.entity';
import { Vehicle } from '../transport/entities/vehicle.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { Parcel } from '../super-agents/entities/parcel.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';
import { AddShipmentIntakeChannel1788292200000 } from '../database/migrations/1788292200000-AddShipmentIntakeChannel';

/**
 * Logistics repair Gate 3 — ONE lifecycle contract, on REAL PostgreSQL.
 *
 *   1. One projector: a Shipment's status and timestamps follow from its
 *      parcel and custody ledger, through every stage, forward only.
 *   2. Zero transport legs is a valid Journey: sender -> Agent -> recipient
 *      is composed by the server and confirmed without a transporter.
 *   3. Every intake converges: a desk walk-in gets its Shipment and Journey.
 *   4. One customer tracking number finds the parcel everywhere.
 *
 * Real: ShipmentsService, JourneyComposerService, JourneySelectionService,
 * the projector, the tracking resolver, the intake link, the custody ledger
 * entity and the Gate 3 migration. Stand-ins, as in this codebase's other
 * real-PostgreSQL specs: the place resolver, and minimal `parcel` / `order`
 * tables carrying the columns these functions read (the Parcel and Order
 * entities drag in the whole marketplace graph).
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

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
const KARIAKOO = { place: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' } };
const MBAGALA = { place: { providerKey: 'tz_seed', providerPlaceId: 'ward:20' } };
const MWANZA = { place: { providerKey: 'tz_seed', providerPlaceId: 'region:2' } };
const CARGO = { description: 'Nguo za watoto', cargoClass: 'normal', quantity: 1, weightKg: 2, evidenceLevel: 'declared', capturedAt: '2026-10-07T09:00:00.000Z' };

suite('Gate 3 — one lifecycle contract, real PostgreSQL', () => {
  jest.setTimeout(180000);
  const SENDER = 7;
  const DESK_USER = 21;
  let ds: DataSource;
  let shipments: ShipmentsService;
  let composer: JourneyComposerService;
  let hub: { id: number };
  let seq = 0;

  // Parcel stand-in: the repository calls ShipmentsService makes.
  const parcelRepo = (manager: EntityManager | DataSource): any => ({
    findOne: async (opts: any) => {
      const where = opts?.where ?? {};
      const rows = where.trackingNumber !== undefined
        ? await manager.query('SELECT * FROM public.parcel WHERE "trackingNumber" = $1', [where.trackingNumber])
        : await manager.query('SELECT * FROM public.parcel WHERE "shipmentId" = $1', [where.shipment?.id ?? null]);
      if (!rows[0]) return null;
      return { ...rows[0], shipment: rows[0].shipmentId ? { id: rows[0].shipmentId } : null };
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

  const shipmentRow = async (id: number) => (await ds.getRepository(Shipment).findOneBy({ id }))!;
  const parcelOf = async (shipmentId: number) =>
    (await ds.query('SELECT * FROM public.parcel WHERE "shipmentId" = $1', [shipmentId]))[0];
  const setParcel = (parcelId: number, status: string) =>
    ds.query('UPDATE public.parcel SET status = $2 WHERE id = $1', [parcelId, status]);
  const custody = (parcelId: number, eventKind: string, toCustodianType: string | null, toCustodianId: number | null = null) =>
    ds.getRepository(ParcelCustodyEvent).insert({
      parcelId, eventKind, operationKey: `${eventKind}:${++seq}`, fromCustodianType: null, fromCustodianId: null,
      toCustodianType, toCustodianId, actorSource: 'account_role', actorUserId: DESK_USER,
    } as any);
  const body = (extra: Record<string, unknown> = {}) => ({
    senderName: 'Baraka', senderPhone: '0713000002', receiverName: 'Amina Juma', receiverPhone: '0712000001',
    originCity: 'Kariakoo, Ilala, Dar es Salaam', originPlace: KARIAKOO.place,
    destinationCity: 'Mbagala, Temeke, Dar es Salaam', destinationPlace: MBAGALA.place,
    itemDescription: 'Nguo za watoto', weightKg: 2, pickupOption: 'agent', deliveryOption: 'agent', ...extra,
  });
  /** Sender -> Agent -> recipient: journey, Shipment, confirmation. No transporter anywhere. */
  const bookDirect = async () => {
    const journey = await composer.selectDirectDelivery(SENDER, { origin: KARIAKOO, destination: MBAGALA, cargoRequirements: CARGO as any });
    const created = await shipments.createShipment(SENDER, body({ journeySelectionId: journey.id }) as any);
    const confirmed = await shipments.confirmShipment(SENDER, created.id, {});
    return { journey, shipment: confirmed.shipment, parcel: confirmed.parcel as any };
  };
  /** A parcel as a desk registers it for a walk-in customer (the columns the intake link reads). */
  const deskParcel = async (trackingNumber: string, orderId: number | null = null) => (await ds.query(
    `INSERT INTO public.parcel
       ("trackingNumber", status, "orderId", "senderName", "senderPhone", "recipientName", "buyerPhone",
        "originCity", "destinationCity", "weightKg", description, "actualShippingFee", "declaredValue",
        "superAgentId", source)
     VALUES ($1, 'received_at_hub', $2, 'Juma', '0714000003', 'Neema', '0715000004',
             'Dar es Salaam', 'Mwanza', 3, 'Viatu', 8000, 60000, $3, 'super_agent') RETURNING *`,
    [trackingNumber, orderId, hub.id],
  ))[0];

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 20 },
      entities: [...B5B_BASE_ENTITIES, ProviderAvailability, TransportRoute, TransportRun, Vehicle, Shipment,
        TransportQuote, JourneySelection, JourneyLeg, ParcelCustodyEvent],
    });
    await ds.initialize();
    // The real Gate 3 migration, on top of the entity-built schema (idempotent).
    const runner = ds.createQueryRunner();
    try { await new AddShipmentIntakeChannel1788292200000().up(runner); } finally { await runner.release(); }
    await ds.query(`CREATE TABLE public."order" (id SERIAL PRIMARY KEY, status varchar, "sellerId" integer)`);
    await ds.query(`CREATE TABLE public.parcel (
      id SERIAL PRIMARY KEY, "shipmentId" integer UNIQUE, "orderId" integer, "journeySelectionId" integer,
      "trackingNumber" varchar UNIQUE, status varchar, "senderName" varchar, "senderPhone" varchar,
      "recipientName" varchar, "buyerPhone" varchar, "originCity" varchar, "destinationCity" varchar,
      "weightKg" decimal(8,2), description text, "estimatedShippingFee" decimal(10,2),
      "actualShippingFee" decimal(10,2), "declaredValue" decimal(12,2),
      "superAgentId" integer, "destinationSuperAgentId" integer, "sellerId" integer, source varchar
    )`);

    const args: any[] = new Array(16).fill({});
    args[0] = ds.getRepository(TransportProvider); args[1] = ds.getRepository(TransportRoute);
    args[2] = ds.getRepository(ProviderAvailability); args[15] = ds;
    const transport: TransportService = new (TransportService as any)(...args);
    const journeys = new JourneySelectionService(ds.getRepository(JourneySelection), ds, transport);
    composer = new JourneyComposerService(transport, journeys, locations);

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
      shipmentRepo as Repository<Shipment>, ds.getRepository(TransportRoute), parcelRepo(ds), ds.getRepository(SuperAgent),
      transport, { search: async () => [] } as any, locations, ds.getRepository(TransportQuote),
    );
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    await ds.query('DELETE FROM public.parcel_custody_event');
    await ds.query('DELETE FROM public.parcel');
    await ds.query('DELETE FROM public.shipment');
    await ds.query('DELETE FROM public.journey_leg');
    await ds.query('DELETE FROM public.journey_selection');
    await ds.query('DELETE FROM public."order"');
    await ds.query('DELETE FROM public.super_agent');
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `desk-${++seq}@gate3.local`, phone: `+2557${String(seq).padStart(8, '0')}`, password: 'x', name: 'Desk',
    } as any));
    hub = await ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({
      userId: (u as any).id, businessName: 'Kariakoo Desk', city: 'Dar es Salaam', status: 'active',
    } as any) as any) as any;
  });

  // ── 2. Zero transport legs ──────────────────────────────────────────────
  describe('a Journey with zero transport legs is valid: sender -> Agent -> recipient', () => {
    it('is composed by the server, committed by its Shipment, and confirmed without a transporter', async () => {
      const journey = await composer.selectDirectDelivery(SENDER, {
        origin: KARIAKOO, destination: MBAGALA, cargoRequirements: CARGO as any, paymentMethod: 'cash',
      });
      expect(journey.status).toBe(JourneySelectionStatus.SELECTED);
      // Cash follows custody: the Agent role at the first leg. No person is named.
      expect(journey).toMatchObject({ expectedCashCollectorType: 'agent', expectedCashCollectionLegSequence: 1 });
      const legs = await ds.getRepository(JourneyLeg).find({ where: { journeySelectionId: journey.id }, order: { sequence: 'ASC' } });
      expect(legs.map((l) => l.type)).toEqual(['first_mile', 'last_mile']);
      for (const leg of legs) {
        expect(leg).toMatchObject({
          providerId: null, routeId: null, runId: null, availabilityId: null, agentId: null, superAgentId: null,
          requiredActorCapability: 'local_agent',
        });
        expect(leg.executionRequirements).toMatchObject({ composedByServer: true, servicePath: 'direct_delivery' });
      }
      expect(legs[0].fromNode).toMatchObject({ source: 'place', placeRef: KARIAKOO.place });
      expect(legs[1].toNode).toMatchObject({ source: 'place', placeRef: MBAGALA.place });

      const created = await shipments.createShipment(SENDER, body({ journeySelectionId: journey.id, providerId: 999, routeId: 999 }) as any);
      expect(created).toMatchObject({
        status: ShipmentStatus.PENDING, journeySelectionId: journey.id, quoteId: null,
        providerId: null, routeId: null, availabilityId: null, intakeChannel: 'self_service',
      });
      expect((await ds.getRepository(JourneySelection).findOneBy({ id: journey.id }))!.status).toBe(JourneySelectionStatus.COMMITTED);

      const confirmed = await shipments.confirmShipment(SENDER, created.id, {});
      expect(confirmed.shipment).toMatchObject({ status: ShipmentStatus.CONFIRMED, providerId: null });
      expect(confirmed.parcel).toMatchObject({ journeySelectionId: journey.id, status: 'pending', source: 'shipment' });
      // Retried confirmation: still one Parcel, still no transporter needed.
      const again = await shipments.confirmShipment(SENDER, created.id, {});
      expect((again.parcel as any).id).toBe((confirmed.parcel as any).id);
      expect(await ds.query('SELECT count(*)::int AS n FROM public.parcel')).toEqual([{ n: 1 }]);
    });

    it('needs two selected places in one region', async () => {
      await expect(composer.selectDirectDelivery(SENDER, { origin: KARIAKOO, destination: MWANZA, cargoRequirements: CARGO as any }))
        .rejects.toThrow('within one region');
      await expect(composer.selectDirectDelivery(SENDER, { origin: { text: 'Kariakoo' }, destination: MBAGALA, cargoRequirements: CARGO as any }))
        .rejects.toThrow('Choose both places');
      expect(await ds.getRepository(JourneySelection).count()).toBe(0);
    });

    it('one Journey, one live Shipment; another sender cannot use it; the places must match', async () => {
      const journey = await composer.selectDirectDelivery(SENDER, { origin: KARIAKOO, destination: MBAGALA, cargoRequirements: CARGO as any });
      await expect(shipments.createShipment(SENDER + 1, body({ journeySelectionId: journey.id }) as any)).rejects.toBeInstanceOf(NotFoundException);
      await expect(shipments.createShipment(SENDER, body({ journeySelectionId: journey.id, destinationPlace: MWANZA.place }) as any))
        .rejects.toBeInstanceOf(BadRequestException);
      const first = await shipments.createShipment(SENDER, body({ journeySelectionId: journey.id }) as any);
      await expect(shipments.createShipment(SENDER, body({ journeySelectionId: journey.id }) as any)).rejects.toBeInstanceOf(ConflictException);
      // A cancelled booking frees the Journey for a fresh one.
      await shipments.cancelShipment(SENDER, first.id);
      const second = await shipments.createShipment(SENDER, body({ journeySelectionId: journey.id }) as any);
      expect(second.id).not.toBe(first.id);
    });

    it('a Journey WITH a transport leg cannot skip its quote this way', async () => {
      const journey = await composer.selectDirectDelivery(SENDER, { origin: KARIAKOO, destination: MBAGALA, cargoRequirements: CARGO as any });
      await ds.query(
        `INSERT INTO public.journey_leg ("journeySelectionId", sequence, type, "fromNode", "toNode", "providerId", "routeId")
         VALUES ($1, 3, 'transport', '{}'::jsonb, '{}'::jsonb, 1, 1)`, [journey.id]);
      await expect(shipments.createShipment(SENDER, body({ journeySelectionId: journey.id }) as any)).rejects.toThrow('accept its quote');
      expect(await ds.getRepository(Shipment).count()).toBe(0);
    });

    it('a Shipment with no Journey still has to name its transporter', async () => {
      const created = await shipments.createShipment(SENDER, body() as any);
      await expect(shipments.confirmShipment(SENDER, created.id, {})).rejects.toThrow('Select a provider');
      expect((await shipmentRow(created.id)).status).toBe(ShipmentStatus.PENDING);
    });
  });

  // ── 1. One projector ────────────────────────────────────────────────────
  describe('the ONE projector: Shipment status follows parcel and custody truth', () => {
    it('walks confirmed -> collected -> in transit -> completed, with real timestamps', async () => {
      const { shipment, parcel } = await bookDirect();
      expect(await projectShipment(ds.manager, shipment.id)).toMatchObject({ status: 'confirmed', holder: 'sender', changed: false });

      // The Agent collects from the sender.
      await custody(parcel.id, 'origin_agent_collected', 'local_agent', 3);
      await setParcel(parcel.id, 'collected_by_agent');
      expect(await projectShipmentForParcel(ds.manager, parcel.id)).toMatchObject({ status: 'collected', holder: 'agent', changed: true });
      let row = await shipmentRow(shipment.id);
      expect(row.status).toBe(ShipmentStatus.COLLECTED);
      expect(row.collectedAt).toBeInstanceOf(Date);
      expect(row.deliveredAt).toBeNull();
      const collectedAt = row.collectedAt!.getTime();

      // Hub, then a carrier: the stages no service used to write at all.
      await custody(parcel.id, 'origin_hub_received', 'super_agent', hub.id);
      await setParcel(parcel.id, 'received_at_hub');
      expect(await projectShipment(ds.manager, shipment.id)).toMatchObject({ status: 'collected', holder: 'hub', holderHubId: hub.id });
      await custody(parcel.id, 'parcel_run_loaded', 'transport_provider', 9); // the parcel row does not change on load
      expect(await projectShipment(ds.manager, shipment.id)).toMatchObject({ status: 'in_transit', holder: 'carrier', changed: true });
      await custody(parcel.id, 'destination_hub_received', 'super_agent', hub.id);
      await setParcel(parcel.id, 'arrived_at_hub');
      expect(await projectShipment(ds.manager, shipment.id)).toMatchObject({ status: 'in_transit', holder: 'hub', changed: false });

      // The recipient takes it: delivered and (no Order) completed, both timestamped.
      await custody(parcel.id, 'recipient_self_pickup', 'recipient_contact');
      await setParcel(parcel.id, 'self_pickup');
      expect(await projectShipment(ds.manager, shipment.id)).toMatchObject({ status: 'completed', holder: 'recipient', changed: true });
      row = await shipmentRow(shipment.id);
      expect(row.status).toBe(ShipmentStatus.COMPLETED);
      expect(row.collectedAt!.getTime()).toBe(collectedAt); // set once
      expect(row.deliveredAt).toBeInstanceOf(Date);
      expect(row.completedAt!.getTime()).toBe(row.deliveredAt!.getTime());

      // Idempotent, and nothing can move it backwards afterwards.
      await setParcel(parcel.id, 'in_transit');
      expect(await projectShipment(ds.manager, shipment.id)).toMatchObject({ status: 'completed', changed: false });
    });

    it('a legacy path that only changes the parcel row (no custody event) is still followed', async () => {
      const { shipment, parcel } = await bookDirect();
      await setParcel(parcel.id, 'dispatched');
      expect(await projectShipment(ds.manager, shipment.id)).toMatchObject({ status: 'in_transit', changed: true });
      expect((await shipmentRow(shipment.id)).collectedAt).toBeInstanceOf(Date);
    });

    it('never confirms a pending Shipment and never revives a cancelled one', async () => {
      const journey = await composer.selectDirectDelivery(SENDER, { origin: KARIAKOO, destination: MBAGALA, cargoRequirements: CARGO as any });
      const pending = await shipments.createShipment(SENDER, body({ journeySelectionId: journey.id }) as any);
      expect(await projectShipment(ds.manager, pending.id)).toMatchObject({ status: 'pending', changed: false });

      const { shipment, parcel } = await bookDirect();
      await shipments.cancelShipment(SENDER, shipment.id);
      await custody(parcel.id, 'recipient_self_pickup', 'recipient_contact');
      await setParcel(parcel.id, 'self_pickup');
      expect(await projectShipment(ds.manager, shipment.id)).toMatchObject({ status: 'cancelled', changed: false });
      expect((await shipmentRow(shipment.id)).deliveredAt).toBeNull();
    });

    it('reading is a safety net: tracking and "my shipments" answer from the ledger even if no write projected', async () => {
      const { shipment, parcel } = await bookDirect();
      await custody(parcel.id, 'origin_hub_received', 'super_agent', hub.id);
      await setParcel(parcel.id, 'received_at_hub');
      expect((await shipmentRow(shipment.id)).status).toBe(ShipmentStatus.CONFIRMED); // nothing projected yet

      const tracked = await shipments.trackShipment(shipment.trackingNumber!);
      expect(tracked).toMatchObject({
        status: 'collected', parcelStatus: 'received_at_hub', holder: 'hub',
        location: { name: 'Kariakoo Desk', city: 'Dar es Salaam' },
      });
      expect(tracked.collectedAt).toBeInstanceOf(Date);
      expect((await shipmentRow(shipment.id)).status).toBe(ShipmentStatus.COLLECTED);

      await custody(parcel.id, 'parcel_run_loaded', 'transport_provider', 9);
      const mine = await shipments.getMyShipments(SENDER);
      expect(mine.find((s) => s.id === shipment.id)!.status).toBe(ShipmentStatus.IN_TRANSIT);
    });
  });

  // ── 4. One customer tracking number ─────────────────────────────────────
  describe('one customer tracking number', () => {
    it('a new parcel carries its Shipment\'s own number', async () => {
      const { shipment, parcel } = await bookDirect();
      expect(shipment.trackingNumber).toBe(`KTX-SHP-${shipment.id}`);
      expect(parcel.trackingNumber).toBe(shipment.trackingNumber);
      expect(await resolveParcelTrackingNumber(ds.manager, shipment.trackingNumber)).toBe(shipment.trackingNumber);
      expect(await customerTrackingNumberForParcel(ds.manager, parcel.id)).toBe(shipment.trackingNumber);
    });

    it('a parcel numbered before Gate 3 (KTX-PCL) is found by the customer\'s number, and by its own', async () => {
      const { shipment, parcel } = await bookDirect();
      await ds.query('UPDATE public.parcel SET "trackingNumber" = $2 WHERE id = $1', [parcel.id, 'KTX-PCL-900']);
      expect(await resolveParcelTrackingNumber(ds.manager, shipment.trackingNumber)).toBe('KTX-PCL-900');
      expect(await resolveParcelTrackingNumber(ds.manager, 'KTX-PCL-900')).toBe('KTX-PCL-900');
      expect(await customerTrackingNumberForParcel(ds.manager, parcel.id)).toBe(shipment.trackingNumber);
      // Public tracking: either number, the same Shipment, always shown under the customer's number.
      for (const n of [shipment.trackingNumber!, 'KTX-PCL-900']) {
        expect(await shipments.trackShipment(n)).toMatchObject({ trackingNumber: shipment.trackingNumber, parcelTrackingNumber: 'KTX-PCL-900' });
      }
    });

    it('an unknown or malformed number is passed through untouched, never guessed', async () => {
      for (const n of ['KTX-SHP-999999', 'x', '', "'; DROP TABLE parcel; --", 'KTX SHP 1']) {
        expect(await resolveParcelTrackingNumber(ds.manager, n)).toBe(n);
      }
      expect(await resolveParcelTrackingNumber(ds.manager, undefined)).toBe('');
      await expect(shipments.trackShipment('KTX-SHP-999999')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('if an older parcel already holds that exact string, the new parcel falls back and is still found', async () => {
      const journey = await composer.selectDirectDelivery(SENDER, { origin: KARIAKOO, destination: MBAGALA, cargoRequirements: CARGO as any });
      const created = await shipments.createShipment(SENDER, body({ journeySelectionId: journey.id }) as any);
      await ds.query(`INSERT INTO public.parcel ("trackingNumber", status, source) VALUES ($1, 'delivered', 'seller_shipment')`, [created.trackingNumber]);
      const confirmed = await shipments.confirmShipment(SENDER, created.id, {});
      expect((confirmed.parcel as any).trackingNumber).toBe(`KTX-PCL-${(confirmed.parcel as any).id}`);
      expect(await shipments.trackShipment(created.trackingNumber!)).toMatchObject({
        trackingNumber: created.trackingNumber, parcelTrackingNumber: (confirmed.parcel as any).trackingNumber,
      });
    });
  });

  // ── 3. Every intake converges ───────────────────────────────────────────
  describe('a desk walk-in converges on Shipment -> Journey -> Parcel -> custody', () => {
    const link = (parcelId: number, manager: EntityManager = ds.manager) => manager.transaction((em) =>
      linkIntakeShipment(em, {
        parcelId, channel: 'walk_in', actorUserId: DESK_USER, deskHub: { superAgentId: hub.id, paymentMethod: 'cash' },
      }));

    it('gets a Shipment under the receipt\'s own number, and a committed Journey naming THAT desk', async () => {
      const parcel = await deskParcel('KTX-ORD-501');
      await custody(parcel.id, 'origin_hub_received', 'super_agent', hub.id);
      const linked = (await link(parcel.id))!;
      expect(linked).toMatchObject({ created: true, trackingNumber: 'KTX-ORD-501' });

      const shipment = await shipmentRow(linked.shipmentId);
      expect(shipment).toMatchObject({
        trackingNumber: 'KTX-ORD-501', intakeChannel: 'walk_in', requestedByUserId: DESK_USER,
        senderName: 'Juma', senderPhone: '0714000003', receiverName: 'Neema', receiverPhone: '0715000004',
        originCity: 'Dar es Salaam', destinationCity: 'Mwanza', itemDescription: 'Viatu',
        originHubId: hub.id, originHubSource: 'sender_selected', destinationHubId: null, destinationHubSource: 'not_required',
        providerId: null, journeySelectionId: linked.journeySelectionId,
        // Already at the desk when it was registered: projected, not left at 'confirmed'.
        status: ShipmentStatus.COLLECTED,
      });
      expect(Number(shipment.priceQuoted)).toBe(8000);
      expect(shipment.collectedAt).toBeInstanceOf(Date);

      const journey = (await ds.getRepository(JourneySelection).findOneBy({ id: linked.journeySelectionId! }))!;
      expect(journey).toMatchObject({
        status: JourneySelectionStatus.COMMITTED, requestedByUserId: DESK_USER,
        expectedCashCollectorType: 'super_agent', expectedCashCollectionLegSequence: 1,
      });
      const legs = await ds.getRepository(JourneyLeg).find({ where: { journeySelectionId: journey.id } });
      expect(legs).toHaveLength(1);
      expect(legs[0]).toMatchObject({ type: 'hub_intake', sequence: 1, superAgentId: hub.id, providerId: null, runId: null });

      expect(await parcelOf(linked.shipmentId)).toMatchObject({ id: parcel.id, journeySelectionId: journey.id, trackingNumber: 'KTX-ORD-501' });
      // One number: it tracks as a Shipment, and resolves to the parcel.
      expect(await shipments.trackShipment('KTX-ORD-501')).toMatchObject({ trackingNumber: 'KTX-ORD-501', status: 'collected', holder: 'hub' });
      expect(await resolveParcelTrackingNumber(ds.manager, 'KTX-ORD-501')).toBe('KTX-ORD-501');
    });

    it('is idempotent: linking again creates nothing', async () => {
      const parcel = await deskParcel('KTX-ORD-502');
      const first = (await link(parcel.id))!;
      const second = (await link(parcel.id))!;
      expect(second).toMatchObject({ created: false, shipmentId: first.shipmentId, journeySelectionId: first.journeySelectionId });
      expect(await ds.getRepository(Shipment).count()).toBe(1);
      expect(await ds.getRepository(JourneySelection).count()).toBe(1);
    });

    it('is the desk\'s work, not one of the operator\'s own shipments, and is not theirs to cancel', async () => {
      const parcel = await deskParcel('KTX-ORD-503');
      const linked = (await link(parcel.id))!;
      expect(await shipments.getMyShipments(DESK_USER)).toEqual([]);
      await expect(shipments.cancelShipment(DESK_USER, linked.shipmentId)).rejects.toThrow('managed through');
      expect((await shipmentRow(linked.shipmentId)).status).not.toBe(ShipmentStatus.CANCELLED);
    });

    it('an Order\'s parcel keeps its commerce context and completes only with the Order', async () => {
      const [order] = await ds.query(`INSERT INTO public."order" (status, "sellerId") VALUES ('in_transit', 44) RETURNING id`);
      const parcel = await deskParcel('KTX-ORD-504', order.id);
      const linked = (await ds.manager.transaction((em) =>
        linkIntakeShipment(em, { parcelId: parcel.id, channel: 'order', actorUserId: DESK_USER })))!;
      const shipment = await shipmentRow(linked.shipmentId);
      expect(shipment).toMatchObject({ orderId: order.id, intakeChannel: 'order', requestedByUserId: 44, journeySelectionId: null });

      await custody(parcel.id, 'recipient_self_pickup', 'recipient_contact');
      await setParcel(parcel.id, 'self_pickup');
      expect(await projectShipment(ds.manager, shipment.id)).toMatchObject({ status: 'delivered' });
      expect((await shipmentRow(shipment.id)).completedAt).toBeNull();
      await ds.query(`UPDATE public."order" SET status = 'completed' WHERE id = $1`, [order.id]);
      expect(await projectShipment(ds.manager, shipment.id)).toMatchObject({ status: 'completed', changed: true });
      expect((await shipmentRow(shipment.id)).completedAt).toBeInstanceOf(Date);
    });

    it('inside a caller\'s transaction a failed link is confined to a savepoint and reported, never fatal', async () => {
      const parcel = await deskParcel('KTX-ORD-505');
      const errors: unknown[] = [];
      await ds.manager.transaction(async (em) => {
        await em.query(`UPDATE public.parcel SET description = 'Viatu vipya' WHERE id = $1`, [parcel.id]);
        // Make the Shipment insert fail, after the Journey rows were already written.
        await em.query(`ALTER TABLE public.shipment ADD CONSTRAINT "TMP_block" CHECK ("intakeChannel" <> 'walk_in')`);
        const result = await linkIntakeShipmentWithin(em, {
          parcelId: parcel.id, channel: 'walk_in', actorUserId: DESK_USER, deskHub: { superAgentId: hub.id },
        }, (error) => errors.push(error));
        expect(result).toBeNull();
        await em.query(`ALTER TABLE public.shipment DROP CONSTRAINT "TMP_block"`);
      });
      expect(errors).toHaveLength(1);
      // The caller's own work committed; nothing of the failed link did.
      expect((await ds.query('SELECT description, "shipmentId" FROM public.parcel WHERE id = $1', [parcel.id]))[0])
        .toEqual({ description: 'Viatu vipya', shipmentId: null });
      expect(await ds.getRepository(Shipment).count()).toBe(0);
      expect(await ds.getRepository(JourneySelection).count()).toBe(0);
    });
  });
});
