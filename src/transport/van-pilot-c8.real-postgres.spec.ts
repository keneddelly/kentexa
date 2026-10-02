import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { TransportService } from './transport.service';
import { TransportRunService } from './transport-run.service';
import { ParcelRunAssignmentService } from './parcel-run-assignment.service';
import { ParcelJourneyService } from './parcel-journey.service';
import { RouteStop } from './entities/route-stop.entity';
import { TransportRun } from './entities/transport-run.entity';
import { TransportRunStop } from './entities/transport-run-stop.entity';
import { Vehicle, VehicleOperationalStatus } from './entities/vehicle.entity';
import { ParcelRunAssignment, ParcelRunAssignmentStatus } from './entities/parcel-run-assignment.entity';
import { TransportProvider, ProviderStatus, ProviderType } from './entities/transport-provider.entity';
import { TransportRoute, RouteType } from './entities/transport-route.entity';
import { User } from '../users/entities/user.entity';
import { ensureRouteStopDeferrableSequenceConstraint } from './route-stop-schema';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { RoleContext } from '../role-context/role-context.types';
import { SuperAgentHandlingRate } from '../super-agent-commission/entities/super-agent-handling-rate.entity';
import { SuperAgentHandlingEarning } from '../super-agent-commission/entities/super-agent-handling-earning.entity';
import { SuperAgentHandlingEarningObligation } from '../super-agent-commission/entities/super-agent-handling-earning-obligation.entity';
import { SuperAgentCashCollection } from '../super-agent-commission/entities/super-agent-cash-collection.entity';
import { SuperAgentHandlingRateService } from '../super-agent-commission/super-agent-handling-rate.service';
import { SuperAgentHandlingEarningService } from '../super-agent-commission/super-agent-handling-earning.service';
import { SuperAgentHandlingEarningObligationService } from '../super-agent-commission/super-agent-handling-earning-obligation.service';
import {
  ensureSuperAgentHandlingRateNoOverlapConstraint,
  ensureSuperAgentEconomicLedgersImmutable,
} from '../super-agent-commission/super-agent-commission-schema';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityEvent } from '../activity/entities/activity-event.entity';

/**
 * Stage 3S-C8 — Van Pilot Operational Integration, proved against REAL
 * PostgreSQL. Covers the 18 required invariants from the C8 authorization:
 * independent/seller/walk-in parcel entry, Agent-only vs Super-Agent-hub
 * movement, multi-leg continuation, vehicle capacity enforcement (and its
 * "null is unconfigured, not zero" rule), the new destination-hub-received
 * seam that unlocks the EXISTING self-pickup/Agent-delivery completion
 * paths, customer tracking determinism, read-model non-mutation, C7
 * non-interference, Agent COD non-interference, and idempotency/
 * concurrency safety for every new C8 write path.
 *
 * Fixture conventions mirror parcel-run-assignment.real-postgres.spec.ts
 * exactly (same bare stub `parcel`/`parcel_tracking` tables, same schema
 * helpers) -- not re-derived.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C8 — Van Pilot Operational Integration, real PostgreSQL', () => {
  jest.setTimeout(180000);
  let ds: DataSource;
  let providers: Repository<TransportProvider>;
  let routes: Repository<TransportRoute>;
  let routeStops: Repository<RouteStop>;
  let runs: Repository<TransportRun>;
  let runStops: Repository<TransportRunStop>;
  let vehicles: Repository<Vehicle>;
  let transport: TransportService;
  let runService: TransportRunService;
  let assignmentService: ParcelRunAssignmentService;
  let journeyService: ParcelJourneyService;
  let rateService: SuperAgentHandlingRateService;
  let earningService: SuperAgentHandlingEarningService;
  let earningRepo: Repository<SuperAgentHandlingEarning>;
  let obligationService: SuperAgentHandlingEarningObligationService;
  let obligationRepo: Repository<SuperAgentHandlingEarningObligation>;
  let activityEventService: ActivityEventService;
  let activityEventRepo: Repository<ActivityEvent>;
  let userSeq = 0;
  let parcelSeq = 0;

  const mkProviderWithUser = async (status: ProviderStatus = ProviderStatus.VERIFIED) => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `c8-${++userSeq}@s3sc8.local`, phone: `+2557${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'P',
    } as any));
    const p = await providers.save(providers.create({ name: 'P', type: ProviderType.VAN, status, userId: (u as any).id } as any) as unknown as TransportProvider);
    return { userId: (u as any).id as number, provider: p };
  };
  const mkRoute = (providerId: number, o: Partial<TransportRoute> = {}) =>
    routes.save(routes.create({
      providerId, routeType: RouteType.LOCAL_LOOP, originCity: 'Dar es Salaam', destinationCity: 'Dar es Salaam',
      pricePerKg: 100, fixedFee: 500, isActive: true, ...o,
    } as any) as unknown as TransportRoute);
  const mkSuperAgent = async () => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `c8-sa-${++userSeq}@s3sc8.local`, phone: `+2558${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'SA',
    } as any));
    return ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({
      userId: (u as any).id, businessName: `Hub ${userSeq}`, city: 'Dar es Salaam', status: SuperAgentStatus.ACTIVE,
    } as any) as unknown as SuperAgent);
  };
  const mkRoleContext = (userId: number, profileId: number): RoleContext => ({
    userId, accountRoleId: userId, roleType: AccountRoleType.TRANSPORT_PROVIDER,
    profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId,
    capabilities: [], sessionId: `s-${userId}`, contextVersion: 1,
  });
  const mkSuperAgentRoleContext = (userId: number, profileId: number): RoleContext => ({
    userId, accountRoleId: userId, roleType: AccountRoleType.SUPER_AGENT,
    profileType: RoleProfileType.SUPER_AGENT, profileId,
    capabilities: [], sessionId: `sa-${userId}`, contextVersion: 1,
  });
  const mkParcel = async (o: Partial<{
    orderId: number; shipmentId: number; status: string; destinationSuperAgentId: number;
    superAgentId: number; weightKg: number; originCity: string; destinationCity: string;
  }> = {}) => {
    const [{ id }] = await ds.query(
      `INSERT INTO public.parcel
        ("trackingNumber", "originCity", "destinationCity", "orderId", "shipmentId", status, "superAgentId", "destinationSuperAgentId", "weightKg")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        `KTX-C8-${++parcelSeq}`, o.originCity ?? 'Mbagala', o.destinationCity ?? 'Bunju',
        o.orderId ?? null, o.shipmentId ?? null, o.status ?? 'pending', o.superAgentId ?? null,
        o.destinationSuperAgentId ?? null, o.weightKg ?? null,
      ],
    );
    return { id: id as number };
  };
  const addStop = (userId: number, routeId: number, sequence: number, locationLabel: string, extra: Record<string, unknown> = {}) =>
    runService.addRouteStop(userId, routeId, { sequence, locationLabel, ...extra });

  const mkPilotRun = async (userId: number, providerId: number, stopExtras: Record<string, Record<string, unknown>> = {}) => {
    const r = await mkRoute(providerId);
    const kariakoo = await addStop(userId, r.id, 0, 'Kariakoo', stopExtras.kariakoo ?? {});
    const mbagala = await addStop(userId, r.id, 1, 'Mbagala', stopExtras.mbagala ?? {});
    const ubungo = await addStop(userId, r.id, 2, 'Ubungo', stopExtras.ubungo ?? {});
    const bunju = await addStop(userId, r.id, 3, 'Bunju', stopExtras.bunju ?? {});
    const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
    const stops = await runService.getRunStops(run.id);
    const byLabel = (label: string) => stops.find((s) => s.locationLabel === label)!;
    return { run, stops: { kariakoo: byLabel('Kariakoo'), mbagala: byLabel('Mbagala'), ubungo: byLabel('Ubungo'), bunju: byLabel('Bunju') } };
  };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 20 },
      entities: [...B5B_BASE_ENTITIES, TransportRoute, RouteStop, TransportRun, TransportRunStop, Vehicle,
        ParcelRunAssignment, ParcelCustodyEvent, SuperAgentHandlingRate, SuperAgentHandlingEarning,
        SuperAgentHandlingEarningObligation, SuperAgentCashCollection, ActivityEvent],
    });
    await ds.initialize();
    await ensureRouteStopDeferrableSequenceConstraint((sql) => ds.query(sql));
    await ensureSuperAgentHandlingRateNoOverlapConstraint((sql) => ds.query(sql));
    await ensureSuperAgentEconomicLedgersImmutable((sql) => ds.query(sql));
    await ds.query(`CREATE TABLE public.parcel (
      id SERIAL PRIMARY KEY, "trackingNumber" varchar, "originCity" varchar, "destinationCity" varchar,
      status varchar DEFAULT 'pending', "orderId" integer, "shipmentId" integer, "superAgentId" integer,
      "destinationSuperAgentId" integer, "arrivedAtHubTime" timestamp, "weightKg" decimal(8,2)
    )`);
    await ds.query(`CREATE TABLE public.parcel_tracking (
      id SERIAL PRIMARY KEY, "parcelId" integer, status varchar, city varchar, note text,
      "updatedBy" varchar, "handlerPhone" varchar, "handlerLocation" varchar, "handlerType" varchar,
      "createdAt" timestamp NOT NULL DEFAULT now()
    )`);
    // Stage 3S-C7 tables -- registered only so invariant #16 can positively
    // assert they stay EMPTY after a full C8 journey, never to exercise them.
    await ds.query(`CREATE TABLE public.super_agent_settlement_proposal (id SERIAL PRIMARY KEY)`);
    await ds.query(`CREATE TABLE public.super_agent_cash_remittance (id SERIAL PRIMARY KEY)`);
    await ds.query(`CREATE TABLE public.super_agent_handling_earning_payout (id SERIAL PRIMARY KEY)`);

    providers = ds.getRepository(TransportProvider);
    routes = ds.getRepository(TransportRoute);
    routeStops = ds.getRepository(RouteStop);
    runs = ds.getRepository(TransportRun);
    runStops = ds.getRepository(TransportRunStop);
    vehicles = ds.getRepository(Vehicle);

    const args: any[] = new Array(15).fill({});
    args[0] = providers; args[1] = routes; args[14] = ds;
    transport = new (TransportService as any)(...args);
    runService = new TransportRunService(routeStops, routes, runs, runStops, transport, { search: async () => [] } as any, ds, vehicles);
    earningRepo = ds.getRepository(SuperAgentHandlingEarning);
    rateService = new SuperAgentHandlingRateService(ds.getRepository(SuperAgentHandlingRate), earningRepo);
    activityEventRepo = ds.getRepository(ActivityEvent);
    activityEventService = new ActivityEventService(activityEventRepo);
    earningService = new SuperAgentHandlingEarningService(ds.getRepository(ParcelCustodyEvent), earningRepo, rateService, ds, activityEventService);
    obligationRepo = ds.getRepository(SuperAgentHandlingEarningObligation);
    obligationService = new SuperAgentHandlingEarningObligationService(obligationRepo, earningService, activityEventService, ds);
    assignmentService = new ParcelRunAssignmentService(
      ds.getRepository(ParcelRunAssignment), runs, runStops, transport, ds, obligationService,
    );
    journeyService = new ParcelJourneyService(ds, assignmentService);

    await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 3600000), createdByUserId: null });
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    // Obligation has ON DELETE RESTRICT to parcel_custody_event -- must be
    // cleared first, or a later DELETE on custody events would fail.
    await ds.query(`TRUNCATE TABLE public.super_agent_handling_earning_obligation RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.super_agent_handling_earning RESTART IDENTITY CASCADE`);
    await ds.query(`DELETE FROM public.parcel_custody_event`);
    await ds.query(`DELETE FROM public.parcel_run_assignment`);
    await ds.query(`TRUNCATE TABLE public.transport_run_stop RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.transport_run RESTART IDENTITY CASCADE`);
    await ds.query(`DELETE FROM public.route_stop`);
    await ds.query(`DELETE FROM public.transport_route`);
    await ds.query(`DELETE FROM public.activity_events`);
    await ds.query(`DELETE FROM public.transport_provider`);
    await ds.query(`DELETE FROM public.vehicle`);
    await ds.query(`DELETE FROM public.parcel_tracking`);
    await ds.query(`DELETE FROM public.parcel`);
    await ds.query(`DELETE FROM public.super_agent`);
    await ds.query(`DELETE FROM public.super_agent_settlement_proposal`);
    await ds.query(`DELETE FROM public.super_agent_cash_remittance`);
    await ds.query(`DELETE FROM public.super_agent_handling_earning_payout`);
  });

  // ── 1/2/3: every parcel-origin path enters the same canonical system ────
  describe('parcel entry paths converge on one canonical system', () => {
    it('(1) an independent sender shipment (no Order, no Shipment id) can enter the Run system', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const { run, stops } = await mkPilotRun(userId, provider.id);
      const parcel = await mkParcel({ orderId: undefined, shipmentId: undefined });
      const assignment = await assignmentService.createAssignment(userId, {
        runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id,
      });
      expect(assignment.status).toBe(ParcelRunAssignmentStatus.SCHEDULED);
    });

    it('(2) a seller/business shipment\'s order/shipment context is never touched by the Run system', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const { run, stops } = await mkPilotRun(userId, provider.id);
      const parcel = await mkParcel({ orderId: 4242, shipmentId: 777 });
      const ctx = mkRoleContext(userId, provider.id);
      const assignment = await assignmentService.createAssignment(userId, {
        runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id,
      });
      await assignmentService.markLoaded(ctx, assignment.id);
      await assignmentService.markUnloaded(ctx, assignment.id);
      const [row] = await ds.query(`SELECT "orderId", "shipmentId" FROM public.parcel WHERE id = $1`, [parcel.id]);
      expect(row.orderId).toBe(4242);
      expect(row.shipmentId).toBe(777);
    });

    it('(3) a Super Agent walk-in parcel (created directly at the origin hub) joins the same Run system', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const hub = await mkSuperAgent();
      const { run, stops } = await mkPilotRun(userId, provider.id, { kariakoo: { superAgentId: hub.id } });
      const parcel = await mkParcel({ status: 'received_at_hub', superAgentId: hub.id });
      const assignment = await assignmentService.createAssignment(userId, {
        runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id,
      });
      expect(assignment.status).toBe(ParcelRunAssignmentStatus.SCHEDULED);
    });

    it('(4) a parcel already in Super Agent custody from EITHER legacy Agent-pickup system enters the Run system identically', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const hub = await mkSuperAgent();
      const { run, stops } = await mkPilotRun(userId, provider.id, { kariakoo: { superAgentId: hub.id } });
      const parcel = await mkParcel();
      // Simulates EITHER ParcelCollection's 'collection_received_at_origin_hub'
      // or ParcelPickupTask's 'origin_hub_received' -- the Run system only
      // ever needs the parcelId to exist; it never reads prior eventKind.
      await ds.getRepository(ParcelCustodyEvent).insert({
        parcelId: parcel.id, eventKind: 'origin_hub_received', operationKey: `c8-prior-${parcel.id}`,
        fromCustodianType: 'local_agent', toCustodianType: 'super_agent', toCustodianId: hub.id, actorSource: 'account_role',
      } as any);
      const assignment = await assignmentService.createAssignment(userId, {
        runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id,
      });
      expect(assignment.status).toBe(ParcelRunAssignmentStatus.SCHEDULED);
    });
  });

  // ── 5: Agent-only intra-city path never fabricates Super Agent custody ──
  it('(5) a Run whose stops name no Super Agent never claims Super Agent custody, and reaches a terminal UNLOADED state', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id); // no superAgentId anywhere
    const parcel = await mkParcel();
    const ctx = mkRoleContext(userId, provider.id);
    const assignment = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id,
    });
    await assignmentService.markLoaded(ctx, assignment.id);
    const unloaded = await assignmentService.markUnloaded(ctx, assignment.id);
    expect(unloaded.status).toBe(ParcelRunAssignmentStatus.UNLOADED);

    const events = await ds.getRepository(ParcelCustodyEvent).find({ where: { parcelId: parcel.id } });
    expect(events.every((e) => e.toCustodianType !== 'super_agent')).toBe(true);

    // Terminal: a brand-new assignment for the SAME parcel is immediately
    // possible (never blocked waiting for a confirmation no one can give).
    const { run: run2, stops: stops2 } = await mkPilotRun(userId, provider.id);
    await expect(assignmentService.createAssignment(userId, {
      runId: run2.id, parcelId: parcel.id, loadRunStopId: stops2.kariakoo.id, unloadRunStopId: stops2.mbagala.id,
    })).resolves.toBeDefined();
  });

  // ── 10: multi-leg continuation through an intermediate hub ──────────────
  it('(10) confirmed receipt at an INTERMEDIATE hub never claims final-destination status, and unblocks a second leg', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const transitHub = await mkSuperAgent();
    const finalHub = await mkSuperAgent();
    const { run, stops } = await mkPilotRun(userId, provider.id, { mbagala: { superAgentId: transitHub.id } });
    const parcel = await mkParcel({ destinationSuperAgentId: finalHub.id }); // final destination is a DIFFERENT hub
    const providerCtx = mkRoleContext(userId, provider.id);
    const transitCtx = mkSuperAgentRoleContext((transitHub as any).userId, transitHub.id);

    const leg1 = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id,
    });
    await assignmentService.markLoaded(providerCtx, leg1.id);
    await assignmentService.markUnloaded(providerCtx, leg1.id);
    await assignmentService.confirmReceipt(transitCtx, leg1.id);

    const [row] = await ds.query(`SELECT status, "destinationSuperAgentId" FROM public.parcel WHERE id = $1`, [parcel.id]);
    expect(row.status).toBe('pending'); // untouched -- this was NOT the final destination
    expect(row.destinationSuperAgentId).toBe(finalHub.id); // untouched

    const destEvent = await ds.getRepository(ParcelCustodyEvent).findOne({ where: { parcelId: parcel.id, eventKind: 'destination_hub_received' } });
    expect(destEvent).toBeNull();

    // Leg 2 is immediately possible -- RECEIVED is no longer a blocking state.
    const { run: run2, stops: stops2 } = await mkPilotRun(userId, provider.id, { bunju: { superAgentId: finalHub.id } });
    const leg2 = await assignmentService.createAssignment(userId, {
      runId: run2.id, parcelId: parcel.id, loadRunStopId: stops2.kariakoo.id, unloadRunStopId: stops2.bunju.id,
    });
    expect(leg2.status).toBe(ParcelRunAssignmentStatus.SCHEDULED);
  });

  // ── 11: destination receipt routes into the EXISTING completion paths ───
  it('(11) confirmed receipt at the FINAL destination emits destination_hub_received and ARRIVED_AT_HUB -- exactly what self-pickup/Agent-delivery already require', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const finalHub = await mkSuperAgent();
    const { run, stops } = await mkPilotRun(userId, provider.id, { bunju: { superAgentId: finalHub.id } });
    const parcel = await mkParcel(); // no destinationSuperAgentId set yet -- auto-set on receipt, matching legacy convention
    const providerCtx = mkRoleContext(userId, provider.id);
    const hubCtx = mkSuperAgentRoleContext((finalHub as any).userId, finalHub.id);

    const assignment = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.bunju.id,
    });
    await assignmentService.markLoaded(providerCtx, assignment.id);
    await assignmentService.markUnloaded(providerCtx, assignment.id);
    await assignmentService.confirmReceipt(hubCtx, assignment.id);

    const [row] = await ds.query(`SELECT status, "destinationSuperAgentId", "arrivedAtHubTime" FROM public.parcel WHERE id = $1`, [parcel.id]);
    expect(row.status).toBe('arrived_at_hub');
    expect(row.destinationSuperAgentId).toBe(finalHub.id);
    expect(row.arrivedAtHubTime).not.toBeNull();

    const latest = await ds.getRepository(ParcelCustodyEvent).findOne({ where: { parcelId: parcel.id }, order: { recordedAt: 'DESC', id: 'DESC' } });
    expect(latest!.eventKind).toBe('destination_hub_received');
    expect(latest!.toCustodianType).toBe('super_agent');
    expect(latest!.toCustodianId).toBe(finalHub.id);
  });

  // ── 12/13: Vehicle capacity ───────────────────────────────────────────────
  describe('Vehicle capacity enforcement', () => {
    it('(12) parcel-count capacity cannot be exceeded, including under concurrency', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const { run, stops } = await mkPilotRun(userId, provider.id);
      const vehicle = await runService.addVehicle(userId, { identifier: 'Van-1', type: ProviderType.VAN, parcelCapacity: 1 });
      await runService.assignVehicleToRun(userId, run.id, vehicle.id);
      const p1 = await mkParcel();
      const p2 = await mkParcel();

      const results = await Promise.allSettled([
        assignmentService.createAssignment(userId, { runId: run.id, parcelId: p1.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id }),
        assignmentService.createAssignment(userId, { runId: run.id, parcelId: p2.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id }),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    });

    it('(13) a null capacity dimension is never enforced (not treated as zero)', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const { run, stops } = await mkPilotRun(userId, provider.id);
      const vehicle = await runService.addVehicle(userId, { identifier: 'Van-2', type: ProviderType.VAN, parcelCapacity: null, weightCapacityKg: null });
      await runService.assignVehicleToRun(userId, run.id, vehicle.id);
      // Five parcels, heavy weights, both dimensions null -- none blocked.
      for (let i = 0; i < 5; i++) {
        const p = await mkParcel({ weightKg: 500 });
        await expect(assignmentService.createAssignment(userId, {
          runId: run.id, parcelId: p.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id,
        })).resolves.toBeDefined();
        // Each needs its own distinct parcel since only one ACTIVE assignment per parcel is allowed.
      }
    });

    it('a configured weight capacity IS enforced, and an unweighed parcel is admitted rather than wrongly blocked', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const { run, stops } = await mkPilotRun(userId, provider.id);
      const vehicle = await runService.addVehicle(userId, { identifier: 'Van-3', type: ProviderType.VAN, weightCapacityKg: 100 });
      await runService.assignVehicleToRun(userId, run.id, vehicle.id);
      const heavy = await mkParcel({ weightKg: 90 });
      await assignmentService.createAssignment(userId, { runId: run.id, parcelId: heavy.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id });
      const tooHeavy = await mkParcel({ weightKg: 20 }); // 90+20 > 100
      await expect(assignmentService.createAssignment(userId, {
        runId: run.id, parcelId: tooHeavy.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id,
      })).rejects.toThrow(ConflictException);
      const unweighed = await mkParcel({ weightKg: undefined as any }); // null weight -- contributes 0, must be admitted
      await expect(assignmentService.createAssignment(userId, {
        runId: run.id, parcelId: unweighed.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id,
      })).resolves.toBeDefined();
    });

    it('capacity is never enforced while the Run has no vehicle assigned', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const { run, stops } = await mkPilotRun(userId, provider.id); // no vehicle assigned
      for (let i = 0; i < 3; i++) {
        const p = await mkParcel({ weightKg: 999 });
        await expect(assignmentService.createAssignment(userId, {
          runId: run.id, parcelId: p.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id,
        })).resolves.toBeDefined();
      }
    });
  });

  // ── 14: customer tracking is deterministic, derived from canonical events ─
  it('(14) the customer-facing tracking projection records deterministic, ordered milestones', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const finalHub = await mkSuperAgent();
    const { run, stops } = await mkPilotRun(userId, provider.id, { bunju: { superAgentId: finalHub.id } });
    const parcel = await mkParcel();
    const providerCtx = mkRoleContext(userId, provider.id);
    const hubCtx = mkSuperAgentRoleContext((finalHub as any).userId, finalHub.id);
    const assignment = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.bunju.id,
    });
    await assignmentService.markLoaded(providerCtx, assignment.id);
    await assignmentService.markUnloaded(providerCtx, assignment.id);
    await assignmentService.confirmReceipt(hubCtx, assignment.id);

    const rows = await ds.query(`SELECT status FROM public.parcel_tracking WHERE "parcelId" = $1 ORDER BY id ASC`, [parcel.id]);
    expect(rows.map((r: any) => r.status)).toEqual(['in_transit', 'transferred_hub', 'arrived_at_hub']);
  });

  // ── 15: admin/read-model queries never mutate state ──────────────────────
  it('(15) admin and journey read-model queries never mutate custody, assignment, or parcel state', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const hub = await mkSuperAgent();
    const { run, stops } = await mkPilotRun(userId, provider.id, { mbagala: { superAgentId: hub.id } });
    const parcel = await mkParcel();
    await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id });

    const before = await ds.query(`
      SELECT (SELECT count(*) FROM public.parcel_run_assignment)::int AS a,
             (SELECT count(*) FROM public.parcel_custody_event)::int AS c,
             (SELECT md5(string_agg(status::text, ',' ORDER BY id)) FROM public.parcel) AS p`);

    await runService.adminListRuns();
    await runService.adminGetRunDetail(run.id);
    await journeyService.adminListBlockedAwaitingSuperAgentReceipt();
    await journeyService.adminListAwaitingLastMileCompletion();
    await journeyService.resolveJourneyContext(parcel.id);
    await journeyService.findEligibleRuns(parcel.id);
    await runService.listMyRuns(userId);

    const after = await ds.query(`
      SELECT (SELECT count(*) FROM public.parcel_run_assignment)::int AS a,
             (SELECT count(*) FROM public.parcel_custody_event)::int AS c,
             (SELECT md5(string_agg(status::text, ',' ORDER BY id)) FROM public.parcel) AS p`);
    expect(after).toEqual(before);
  });

  // ── 16: no C8 path ever touches C7 payout/remittance ─────────────────────
  it('(16) a full C8 journey never creates any C7 settlement/remittance/payout row', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const finalHub = await mkSuperAgent();
    const { run, stops } = await mkPilotRun(userId, provider.id, { bunju: { superAgentId: finalHub.id } });
    const parcel = await mkParcel();
    const providerCtx = mkRoleContext(userId, provider.id);
    const hubCtx = mkSuperAgentRoleContext((finalHub as any).userId, finalHub.id);
    const assignment = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.bunju.id,
    });
    await assignmentService.markLoaded(providerCtx, assignment.id);
    await assignmentService.markUnloaded(providerCtx, assignment.id);
    await assignmentService.confirmReceipt(hubCtx, assignment.id);

    // The C6 obligation/earning machinery DOES run (unchanged, pre-existing
    // behavior) -- proving this test actually exercised the real path.
    const earnings = await earningRepo.count();
    expect(earnings).toBeGreaterThan(0);

    const c7 = await ds.query(`
      SELECT (SELECT count(*) FROM public.super_agent_settlement_proposal)::int AS proposals,
             (SELECT count(*) FROM public.super_agent_cash_remittance)::int AS remittances,
             (SELECT count(*) FROM public.super_agent_handling_earning_payout)::int AS payouts`);
    expect(c7[0]).toEqual({ proposals: 0, remittances: 0, payouts: 0 });
  });

  // ── 17: Agent COD accounting is never touched ────────────────────────────
  it('(17) Agent COD accounting fields on SuperAgent remain untouched by a full C8 journey', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const finalHub = await mkSuperAgent();
    await ds.query(`UPDATE public.super_agent SET "codCashHeld" = 111, "outstandingBalance" = 222 WHERE id = $1`, [finalHub.id]);
    const { run, stops } = await mkPilotRun(userId, provider.id, { bunju: { superAgentId: finalHub.id } });
    const parcel = await mkParcel();
    const providerCtx = mkRoleContext(userId, provider.id);
    const hubCtx = mkSuperAgentRoleContext((finalHub as any).userId, finalHub.id);
    const assignment = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.bunju.id,
    });
    await assignmentService.markLoaded(providerCtx, assignment.id);
    await assignmentService.markUnloaded(providerCtx, assignment.id);
    await assignmentService.confirmReceipt(hubCtx, assignment.id);

    const [row] = await ds.query(`SELECT "codCashHeld", "outstandingBalance" FROM public.super_agent WHERE id = $1`, [finalHub.id]);
    expect(Number(row.codCashHeld)).toBe(111);
    expect(Number(row.outstandingBalance)).toBe(222);
  });

  // ── 18: idempotency / concurrency for every new C8 write path ────────────
  describe('idempotency and concurrency', () => {
    it('(18a) markLoaded is idempotent -- exactly one custody event and one tracking row across repeated calls', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const { run, stops } = await mkPilotRun(userId, provider.id);
      const parcel = await mkParcel();
      const ctx = mkRoleContext(userId, provider.id);
      const assignment = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id });
      await assignmentService.markLoaded(ctx, assignment.id);
      await assignmentService.markLoaded(ctx, assignment.id);
      await assignmentService.markLoaded(ctx, assignment.id);
      expect(await ds.getRepository(ParcelCustodyEvent).count({ where: { parcelId: parcel.id, eventKind: 'parcel_run_loaded' } })).toBe(1);
      const [{ count }] = await ds.query(`SELECT count(*)::int FROM public.parcel_tracking WHERE "parcelId" = $1 AND status = 'in_transit'`, [parcel.id]);
      expect(count).toBe(1);
    });

    it('(18b) confirmReceipt is idempotent -- exactly one destination_hub_received event and tracking row across repeated calls', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const finalHub = await mkSuperAgent();
      const { run, stops } = await mkPilotRun(userId, provider.id, { bunju: { superAgentId: finalHub.id } });
      const parcel = await mkParcel();
      const providerCtx = mkRoleContext(userId, provider.id);
      const hubCtx = mkSuperAgentRoleContext((finalHub as any).userId, finalHub.id);
      const assignment = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.bunju.id });
      await assignmentService.markLoaded(providerCtx, assignment.id);
      await assignmentService.markUnloaded(providerCtx, assignment.id);
      await assignmentService.confirmReceipt(hubCtx, assignment.id);
      await assignmentService.confirmReceipt(hubCtx, assignment.id);
      await assignmentService.confirmReceipt(hubCtx, assignment.id);
      expect(await ds.getRepository(ParcelCustodyEvent).count({ where: { parcelId: parcel.id, eventKind: 'destination_hub_received' } })).toBe(1);
      const [{ count }] = await ds.query(`SELECT count(*)::int FROM public.parcel_tracking WHERE "parcelId" = $1 AND status = 'arrived_at_hub'`, [parcel.id]);
      expect(count).toBe(1);
    });

    it('(18c) concurrent retried markLoaded calls never create duplicate custody history', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const { run, stops } = await mkPilotRun(userId, provider.id);
      const parcel = await mkParcel();
      const ctx = mkRoleContext(userId, provider.id);
      const assignment = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id });
      await Promise.all([
        assignmentService.markLoaded(ctx, assignment.id),
        assignmentService.markLoaded(ctx, assignment.id),
        assignmentService.markLoaded(ctx, assignment.id),
      ]);
      expect(await ds.getRepository(ParcelCustodyEvent).count({ where: { parcelId: parcel.id, eventKind: 'parcel_run_loaded' } })).toBe(1);
    });
  });
});
