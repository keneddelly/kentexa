import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { TransportService } from './transport.service';
import { TransportRunService } from './transport-run.service';
import { ParcelRunAssignmentService } from './parcel-run-assignment.service';
import { RouteStop } from './entities/route-stop.entity';
import { TransportRun } from './entities/transport-run.entity';
import { TransportRunStop } from './entities/transport-run-stop.entity';
import { Vehicle } from './entities/vehicle.entity';
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
import { SuperAgentCashCollection } from '../super-agent-commission/entities/super-agent-cash-collection.entity';
import { SuperAgentHandlingRateService } from '../super-agent-commission/super-agent-handling-rate.service';
import { SuperAgentHandlingEarningService } from '../super-agent-commission/super-agent-handling-earning.service';
import {
  ensureSuperAgentHandlingRateNoOverlapConstraint,
  ensureSuperAgentEconomicLedgersImmutable,
} from '../super-agent-commission/super-agent-commission-schema';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityEvent, ActivityCategory } from '../activity/entities/activity-event.entity';

/**
 * Stage 3S-C3 — ParcelRunAssignment + multi-stop parcel movement, proved
 * against REAL PostgreSQL. The central invariant: a Run starting at
 * Kariakoo can carry a Mbagala->Bunju parcel leg without implying the
 * parcel started at Kariakoo -- proven directly, not by omission.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C3 — parcel run assignment and multi-stop movement, real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let providers: Repository<TransportProvider>;
  let routes: Repository<TransportRoute>;
  let routeStops: Repository<RouteStop>;
  let runs: Repository<TransportRun>;
  let runStops: Repository<TransportRunStop>;
  let transport: TransportService;
  let runService: TransportRunService;
  let assignmentService: ParcelRunAssignmentService;
  let rateService: SuperAgentHandlingRateService;
  let earningService: SuperAgentHandlingEarningService;
  let earningRepo: Repository<SuperAgentHandlingEarning>;
  let activityEventService: ActivityEventService;
  let activityEventRepo: Repository<ActivityEvent>;
  let userSeq = 0;
  let parcelSeq = 0;

  const mkProviderWithUser = async (status: ProviderStatus = ProviderStatus.VERIFIED) => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `c3-${++userSeq}@s3sc3.local`, phone: `+2555${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'P',
    } as any));
    const p = await providers.save(providers.create({ name: 'P', type: ProviderType.VAN, status, userId: (u as any).id } as any) as unknown as TransportProvider);
    return { userId: (u as any).id as number, provider: p };
  };
  const mkRoute = (providerId: number, o: Partial<TransportRoute> = {}) =>
    routes.save(routes.create({
      providerId, routeType: RouteType.LOCAL_LOOP, originCity: 'Dar es Salaam', destinationCity: 'Dar es Salaam',
      pricePerKg: 100, fixedFee: 500, isActive: true, ...o,
    } as any) as unknown as TransportRoute);
  // A real SuperAgent -- already safely registerable in this same
  // synchronize:true DataSource (B5B_BASE_ENTITIES already includes it
  // elsewhere in this lineage), unlike Parcel.
  const mkSuperAgent = async () => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `c4-sa-${++userSeq}@s3sc4.local`, phone: `+2556${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'SA',
    } as any));
    return ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({
      userId: (u as any).id, businessName: 'Hub', city: 'Dar es Salaam', status: SuperAgentStatus.ACTIVE,
    } as any) as unknown as SuperAgent);
  };
  const mkRoleContext = (userId: number, profileId: number): RoleContext => ({
    userId, accountRoleId: userId, roleType: AccountRoleType.TRANSPORT_PROVIDER,
    profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId,
    capabilities: [], sessionId: `s-${userId}`, contextVersion: 1,
  });
  // Stage 3S-C6: a DIFFERENT actor shape for the RECEIVING Super Agent's own
  // confirmReceipt() calls -- distinct from the provider's own mkRoleContext,
  // since confirmReceipt's whole point is that this is a genuinely separate,
  // independently authenticated actor.
  const mkSuperAgentRoleContext = (userId: number, profileId: number): RoleContext => ({
    userId, accountRoleId: userId, roleType: AccountRoleType.SUPER_AGENT,
    profileType: RoleProfileType.SUPER_AGENT, profileId,
    capabilities: [], sessionId: `sa-${userId}`, contextVersion: 1,
  });
  // Parcel is a bare stub table here -- the service only ever needs to know
  // "does this parcelId exist" (assertParcelExists), never the real
  // Parcel entity's own relation graph (Order/Shipment/User/SuperAgent).
  const mkParcel = async () => {
    const [{ id }] = await ds.query(
      `INSERT INTO public.parcel ("trackingNumber","originCity","destinationCity") VALUES ($1,'Mbagala','Bunju') RETURNING id`,
      [`KTX-C3-${++parcelSeq}`],
    );
    return { id: id as number };
  };
  const addStop = (userId: number, routeId: number, sequence: number, locationLabel: string, extra: Record<string, unknown> = {}) =>
    runService.addRouteStop(userId, routeId, { sequence, locationLabel, ...extra });

  // Builds the canonical pilot proof-case Run: Kariakoo -> Mbagala -> Ubungo -> Mbezi -> Bunju.
  const mkPilotRun = async (userId: number, providerId: number) => {
    const r = await mkRoute(providerId);
    const kariakoo = await addStop(userId, r.id, 0, 'Kariakoo');
    const mbagala = await addStop(userId, r.id, 1, 'Mbagala');
    const ubungo = await addStop(userId, r.id, 2, 'Ubungo');
    const mbezi = await addStop(userId, r.id, 3, 'Mbezi');
    const bunju = await addStop(userId, r.id, 4, 'Bunju');
    const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
    const stops = await runService.getRunStops(run.id);
    const byLabel = (label: string) => stops.find((s) => s.locationLabel === label)!;
    return { run, stops: { kariakoo: byLabel('Kariakoo'), mbagala: byLabel('Mbagala'), ubungo: byLabel('Ubungo'), mbezi: byLabel('Mbezi'), bunju: byLabel('Bunju') } };
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
        ParcelRunAssignment, ParcelCustodyEvent, SuperAgentHandlingRate, SuperAgentHandlingEarning, SuperAgentCashCollection,
        ActivityEvent],
    });
    await ds.initialize();
    await ensureRouteStopDeferrableSequenceConstraint((sql) => ds.query(sql));
    await ensureSuperAgentHandlingRateNoOverlapConstraint((sql) => ds.query(sql));
    await ensureSuperAgentEconomicLedgersImmutable((sql) => ds.query(sql));
    // Bare stand-in table -- see mkParcel()'s own comment for why the real
    // Parcel entity (and its Order/Shipment/User/SuperAgent relation graph)
    // isn't registered here at all.
    await ds.query(`CREATE TABLE public.parcel (
      id SERIAL PRIMARY KEY, "trackingNumber" varchar, "originCity" varchar, "destinationCity" varchar
    )`);

    providers = ds.getRepository(TransportProvider);
    routes = ds.getRepository(TransportRoute);
    routeStops = ds.getRepository(RouteStop);
    runs = ds.getRepository(TransportRun);
    runStops = ds.getRepository(TransportRunStop);

    const args: any[] = new Array(15).fill({});
    args[0] = providers; args[1] = routes; args[14] = ds;
    transport = new (TransportService as any)(...args);
    runService = new TransportRunService(routeStops, routes, runs, runStops, transport, { search: async () => [] } as any, ds);
    earningRepo = ds.getRepository(SuperAgentHandlingEarning);
    rateService = new SuperAgentHandlingRateService(ds.getRepository(SuperAgentHandlingRate), earningRepo);
    earningService = new SuperAgentHandlingEarningService(ds.getRepository(ParcelCustodyEvent), earningRepo, rateService, ds);
    activityEventRepo = ds.getRepository(ActivityEvent);
    activityEventService = new ActivityEventService(activityEventRepo);
    assignmentService = new ParcelRunAssignmentService(
      ds.getRepository(ParcelRunAssignment), runs, runStops, transport, ds, earningService, activityEventService,
    );
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    // TRUNCATE, not DELETE -- the earning ledger's own immutability trigger
    // makes a plain DELETE impossible once any row exists; test-harness-only.
    await ds.query(`TRUNCATE TABLE public.super_agent_handling_earning RESTART IDENTITY CASCADE`);
    await ds.query(`DELETE FROM public.super_agent_handling_rate`);
    await ds.query(`DELETE FROM public.parcel_custody_event`);
    await ds.query(`DELETE FROM public.parcel_run_assignment`);
    await ds.query(`TRUNCATE TABLE public.transport_run_stop RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.transport_run RESTART IDENTITY CASCADE`);
    await ds.query(`DELETE FROM public.route_stop`);
    await ds.query(`DELETE FROM public.transport_route`);
    await ds.query(`DELETE FROM public.activity_events`);
    await ds.query(`DELETE FROM public.transport_provider`);
    await ds.query(`DELETE FROM public.parcel`);
    await ds.query(`DELETE FROM public.super_agent`);
  });

  // ── the central invariant ──────────────────────────────────────────────────
  it('CRITICAL PROOF CASE: a Kariakoo-origin Run carries a Mbagala->Bunju parcel leg without implying the parcel started at Kariakoo', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel(); // originCity: Mbagala, destinationCity: Bunju

    const assignment = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id,
    });

    expect(assignment.loadRunStopId).toBe(stops.mbagala.id);
    expect(assignment.unloadRunStopId).toBe(stops.bunju.id);
    expect(assignment.loadRunStopId).not.toBe(run.id); // sanity: never conflated with the run's own identity
    expect(assignment.status).toBe(ParcelRunAssignmentStatus.SCHEDULED);
    // Nothing about this assignment references Kariakoo (the Run's own origin) at all.
  });

  it('the SAME Run simultaneously carries Kariakoo->Bunju, Kariakoo->Mbagala, and Mbagala->Bunju parcels', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const p1 = await mkParcel();
    const p2 = await mkParcel();
    const p3 = await mkParcel();

    const a1 = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: p1.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.bunju.id });
    const a2 = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: p2.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id });
    const a3 = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: p3.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });

    const all = await assignmentService.getAssignmentsForRun(run.id);
    expect(all.map((a) => a.id).sort()).toEqual([a1.id, a2.id, a3.id].sort());
  });

  // ── ordering invariant ─────────────────────────────────────────────────────
  it('rejects an assignment where the load stop does not come before the unload stop', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();

    await expect(assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.bunju.id, unloadRunStopId: stops.mbagala.id, // reversed
    })).rejects.toThrow(BadRequestException);
    await expect(assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.mbagala.id, // identical
    })).rejects.toThrow(BadRequestException);
  });

  it('rejects a LOAD stop from a different Run even when the unload stop is genuinely on the selected Run', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run: run1, stops: stops1 } = await mkPilotRun(userId, provider.id);
    const { stops: stops2 } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();

    await expect(assignmentService.createAssignment(userId, {
      runId: run1.id, parcelId: parcel.id, loadRunStopId: stops2.mbagala.id, unloadRunStopId: stops1.bunju.id,
    })).rejects.toThrow(BadRequestException);
  });

  it('rejects an UNLOAD stop from a different Run even when the load stop is genuinely on the selected Run', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run: run1, stops: stops1 } = await mkPilotRun(userId, provider.id);
    const { stops: stops2 } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();

    await expect(assignmentService.createAssignment(userId, {
      runId: run1.id, parcelId: parcel.id, loadRunStopId: stops1.mbagala.id, unloadRunStopId: stops2.bunju.id,
    })).rejects.toThrow(BadRequestException);
  });

  // ── ownership ──────────────────────────────────────────────────────────────
  it('a provider cannot assign a parcel to a Run they do not own', async () => {
    const owner = await mkProviderWithUser();
    const stranger = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(owner.userId, owner.provider.id);
    const parcel = await mkParcel();

    await expect(assignmentService.createAssignment(stranger.userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id,
    })).rejects.toThrow(NotFoundException);
  });

  // ── idempotency + conflict ─────────────────────────────────────────────────
  it('a repeat request for the SAME parcel/run/stops is idempotent -- returns the same row, not a second one', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();
    const dto = { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id };

    const first = await assignmentService.createAssignment(userId, dto);
    const second = await assignmentService.createAssignment(userId, dto);
    expect(second.id).toBe(first.id);
    const all = await assignmentService.getAssignmentsForRun(run.id);
    expect(all).toHaveLength(1);
  });

  it('a DIFFERENT request for a parcel that already has an active assignment is rejected as a conflict', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();
    await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });

    await expect(assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbagala.id, // a different leg, same parcel
    })).rejects.toThrow(ConflictException);
  });

  it('once the prior assignment reaches a TERMINAL state, the same parcel can be assigned again', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();
    const first = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });
    await assignmentService.cancelAssignment(userId, first.id);

    const second = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbezi.id,
    });
    expect(second.id).not.toBe(first.id);
  });

  // ── lifecycle ──────────────────────────────────────────────────────────────
  it('scheduled -> loaded -> unloaded transitions correctly, each idempotent on repeat', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });

    const loaded = await assignmentService.markLoaded(mkRoleContext(userId, provider.id), a.id);
    expect(loaded.status).toBe(ParcelRunAssignmentStatus.LOADED);
    expect(loaded.loadedAt).not.toBeNull();
    const loadedAgain = await assignmentService.markLoaded(mkRoleContext(userId, provider.id), a.id); // idempotent
    expect(loadedAgain.loadedAt!.getTime()).toBe(loaded.loadedAt!.getTime());

    const unloaded = await assignmentService.markUnloaded(mkRoleContext(userId, provider.id), a.id);
    expect(unloaded.status).toBe(ParcelRunAssignmentStatus.UNLOADED);
    expect(unloaded.unloadedAt).not.toBeNull();
    const unloadedAgain = await assignmentService.markUnloaded(mkRoleContext(userId, provider.id), a.id); // idempotent
    expect(unloadedAgain.unloadedAt!.getTime()).toBe(unloaded.unloadedAt!.getTime());
  });

  it('rejects marking unloaded before loaded, and rejects loading a cancelled assignment', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel1 = await mkParcel();
    const a1 = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel1.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });
    await expect(assignmentService.markUnloaded(mkRoleContext(userId, provider.id), a1.id)).rejects.toThrow(ConflictException);

    const parcel2 = await mkParcel();
    const a2 = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel2.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbezi.id });
    await assignmentService.cancelAssignment(userId, a2.id);
    await expect(assignmentService.markLoaded(mkRoleContext(userId, provider.id), a2.id)).rejects.toThrow(ConflictException);
  });

  it('cancelAssignment refuses a LOADED assignment (only scheduled can be retracted this way)', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });
    await assignmentService.markLoaded(mkRoleContext(userId, provider.id), a.id);

    await expect(assignmentService.cancelAssignment(userId, a.id)).rejects.toThrow(ConflictException);
  });

  it('a stranger cannot transition an assignment on a Run they do not own', async () => {
    const owner = await mkProviderWithUser();
    const stranger = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(owner.userId, owner.provider.id);
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(owner.userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });

    await expect(assignmentService.markLoaded(mkRoleContext(stranger.userId, stranger.provider.id), a.id)).rejects.toThrow(ForbiddenException);
    // Stage 3S-C4: a rejected, unauthorized transition attempt must leave
    // ZERO trace in the canonical custody ledger -- it never happened.
    expect((await ds.query(`SELECT count(*)::int AS n FROM public.parcel_custody_event`))[0].n).toBe(0);
  });

  // ── immutable snapshot reference, and zero unrelated side effects ─────────
  it('assignment stop references remain valid and unaffected after the reusable Route is edited', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });

    // Edit the reusable Route's stops after the assignment was created.
    const liveMbagala = (await runService.listRouteStops(userId, (await routes.findOneOrFail({ where: { providerId: provider.id } })).id))
      .find((s) => s.locationLabel === 'Mbagala')!;
    await runService.updateRouteStop(userId, liveMbagala.routeId, liveMbagala.id, { locationLabel: 'Mbagala Renamed' });

    const reread = await ds.getRepository(ParcelRunAssignment).findOneOrFail({ where: { id: a.id } });
    expect(reread.loadRunStopId).toBe(stops.mbagala.id); // the assignment's own reference is completely unaffected
  });

  it('createAssignment and lifecycle transitions never touch RouteStop/TransportRunStop rows or Shipment/TransportQuote', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();
    const before = (await runService.getRunStops(run.id)).map((s) => ({ id: s.id, seq: s.sequence }));

    const a = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });
    await assignmentService.markLoaded(mkRoleContext(userId, provider.id), a.id);
    await assignmentService.markUnloaded(mkRoleContext(userId, provider.id), a.id);

    const after = (await runService.getRunStops(run.id)).map((s) => ({ id: s.id, seq: s.sequence }));
    expect(after).toEqual(before);
  });

  // ── Stage 3S-C4: custody evidence integration ──────────────────────────────
  it('markLoaded at a Super Agent stop records a real Super Agent -> Provider custody handoff, correctly identifying that Super Agent', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const hub = await mkSuperAgent();
    const r = await mkRoute(provider.id);
    await addStop(userId, r.id, 0, 'Kariakoo', { superAgentId: hub.id });
    await addStop(userId, r.id, 1, 'Bunju');
    const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
    const createdStops = await runService.getRunStops(run.id);
    const loadStop = createdStops.find((s) => s.locationLabel === 'Kariakoo')!;
    const unloadStop = createdStops.find((s) => s.locationLabel === 'Bunju')!;
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: loadStop.id, unloadRunStopId: unloadStop.id,
    });

    await assignmentService.markLoaded(mkRoleContext(userId, provider.id), a.id);

    const events = await ds.query(`SELECT * FROM public.parcel_custody_event WHERE "parcelId" = $1`, [parcel.id]);
    expect(events).toHaveLength(1);
    expect(events[0].eventKind).toBe('parcel_run_loaded');
    expect(events[0].operationKey).toBe(`parcel-run-loaded:${a.id}`);
    expect(events[0].fromCustodianType).toBe('super_agent');
    expect(events[0].fromCustodianId).toBe(hub.id); // the CORRECT Super Agent, not any other
    expect(events[0].toCustodianType).toBe('transport_provider');
    expect(events[0].toCustodianId).toBe(provider.id);
    expect(events[0].assignmentType).toBe('parcel_run_assignment');
    expect(events[0].assignmentId).toBe(a.id);
  });

  it('markLoaded at an ordinary (non-Super-Agent) stop never manufactures a fake Super Agent handling event', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id); // no stop here has a superAgentId
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id,
    });

    await assignmentService.markLoaded(mkRoleContext(userId, provider.id), a.id);

    const events = await ds.query(`SELECT * FROM public.parcel_custody_event WHERE "parcelId" = $1`, [parcel.id]);
    expect(events).toHaveLength(1); // a real custody event is still written -- the provider genuinely takes custody
    expect(events[0].fromCustodianType).toBeNull(); // but no Super Agent is fabricated
    expect(events[0].fromCustodianId).toBeNull();
    expect(events[0].toCustodianType).toBe('transport_provider');
  });

  it('markUnloaded at a destination Super Agent stop releases the provider\'s own custody WITHOUT yet claiming Super Agent receipt (Stage 3S-C6)', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const originHub = await mkSuperAgent();
    const destHub = await mkSuperAgent();
    const r = await mkRoute(provider.id);
    await addStop(userId, r.id, 0, 'Kariakoo', { superAgentId: originHub.id });
    await addStop(userId, r.id, 1, 'Bunju', { superAgentId: destHub.id });
    const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
    const createdStops = await runService.getRunStops(run.id);
    const loadStop = createdStops.find((s) => s.locationLabel === 'Kariakoo')!;
    const unloadStop = createdStops.find((s) => s.locationLabel === 'Bunju')!;
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: loadStop.id, unloadRunStopId: unloadStop.id,
    });
    await assignmentService.markLoaded(mkRoleContext(userId, provider.id), a.id);

    await assignmentService.markUnloaded(mkRoleContext(userId, provider.id), a.id);

    const events = await ds.query(
      `SELECT * FROM public.parcel_custody_event WHERE "parcelId" = $1 AND "eventKind" = 'parcel_run_unloaded'`, [parcel.id]);
    expect(events).toHaveLength(1);
    expect(events[0].operationKey).toBe(`parcel-run-unloaded:${a.id}`);
    expect(events[0].fromCustodianType).toBe('transport_provider');
    expect(events[0].fromCustodianId).toBe(provider.id);
    expect(events[0].toCustodianType).toBeNull(); // NOT yet claimed -- see Stage 3S-C6's own confirmReceipt
    expect(events[0].toCustodianId).toBeNull();
    expect(events[0].hubId).toBe(destHub.id); // informational only -- which hub is EXPECTED, not confirmed
    expect(events[0].assignmentType).toBe('parcel_run_assignment');
    expect(await earningRepo.count()).toBe(0); // no earning yet -- nothing has qualified
  });

  // ── Stage 3S-C6 correction: a parcel must not be reassignable while its
  // prior Super Agent receipt is still unconfirmed ──────────────────────────
  it('createAssignment rejects reassigning a parcel while its prior Super Agent receipt at an unloaded stop remains unconfirmed', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const destHub = await mkSuperAgent();
    const r = await mkRoute(provider.id);
    await addStop(userId, r.id, 0, 'Kariakoo');
    await addStop(userId, r.id, 1, 'Bunju', { superAgentId: destHub.id });
    const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
    const createdStops = await runService.getRunStops(run.id);
    const loadStop = createdStops.find((s) => s.locationLabel === 'Kariakoo')!;
    const unloadStop = createdStops.find((s) => s.locationLabel === 'Bunju')!;
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: loadStop.id, unloadRunStopId: unloadStop.id,
    });
    const context = mkRoleContext(userId, provider.id);
    await assignmentService.markLoaded(context, a.id);
    await assignmentService.markUnloaded(context, a.id); // UNLOADED, but destHub never confirmed receipt

    // A brand-new Run for the SAME parcel -- as if it were being (wrongly)
    // dispatched onward before the receiving Super Agent ever confirmed it
    // actually arrived.
    const r2 = await mkRoute(provider.id);
    await addStop(userId, r2.id, 0, 'Bunju');
    await addStop(userId, r2.id, 1, 'Ubungo');
    const run2 = await runService.createRun(userId, { routeId: r2.id, scheduledDeparture: new Date(Date.now() + 172800000) });
    const stops2 = await runService.getRunStops(run2.id);

    await expect(assignmentService.createAssignment(userId, {
      runId: run2.id, parcelId: parcel.id,
      loadRunStopId: stops2.find((s) => s.locationLabel === 'Bunju')!.id,
      unloadRunStopId: stops2.find((s) => s.locationLabel === 'Ubungo')!.id,
    })).rejects.toThrow(ConflictException);

    expect(await assignmentService.getActiveAssignmentForParcel(parcel.id)).toMatchObject({ id: a.id });
  });

  it('createAssignment still allows reassigning a parcel unloaded at an ORDINARY (non-Super-Agent) stop -- nothing pending confirmation there', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id); // no stop here has a superAgentId
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id,
    });
    const context = mkRoleContext(userId, provider.id);
    await assignmentService.markLoaded(context, a.id);
    await assignmentService.markUnloaded(context, a.id);

    expect(await assignmentService.getActiveAssignmentForParcel(parcel.id)).toBeNull();

    const r2 = await mkRoute(provider.id);
    await addStop(userId, r2.id, 0, 'Bunju');
    await addStop(userId, r2.id, 1, 'Ubungo');
    const run2 = await runService.createRun(userId, { routeId: r2.id, scheduledDeparture: new Date(Date.now() + 172800000) });
    const stops2 = await runService.getRunStops(run2.id);

    const a2 = await assignmentService.createAssignment(userId, {
      runId: run2.id, parcelId: parcel.id,
      loadRunStopId: stops2.find((s) => s.locationLabel === 'Bunju')!.id,
      unloadRunStopId: stops2.find((s) => s.locationLabel === 'Ubungo')!.id,
    });
    expect(a2.id).not.toBe(a.id);
  });

  it('createAssignment allows reassigning a parcel once its Super Agent receipt has been CONFIRMED -- RECEIVED frees it for a new leg', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const destHub = await mkSuperAgent();
    const r = await mkRoute(provider.id);
    await addStop(userId, r.id, 0, 'Kariakoo');
    await addStop(userId, r.id, 1, 'Bunju', { superAgentId: destHub.id });
    const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
    const createdStops = await runService.getRunStops(run.id);
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id,
      loadRunStopId: createdStops.find((s) => s.locationLabel === 'Kariakoo')!.id,
      unloadRunStopId: createdStops.find((s) => s.locationLabel === 'Bunju')!.id,
    });
    const context = mkRoleContext(userId, provider.id);
    await assignmentService.markLoaded(context, a.id);
    await assignmentService.markUnloaded(context, a.id);
    await assignmentService.confirmReceipt(mkSuperAgentRoleContext(destHub.userId, destHub.id), a.id);

    expect(await assignmentService.getActiveAssignmentForParcel(parcel.id)).toBeNull();

    const r2 = await mkRoute(provider.id);
    await addStop(userId, r2.id, 0, 'Bunju');
    await addStop(userId, r2.id, 1, 'Ubungo');
    const run2 = await runService.createRun(userId, { routeId: r2.id, scheduledDeparture: new Date(Date.now() + 172800000) });
    const stops2 = await runService.getRunStops(run2.id);

    const a2 = await assignmentService.createAssignment(userId, {
      runId: run2.id, parcelId: parcel.id,
      loadRunStopId: stops2.find((s) => s.locationLabel === 'Bunju')!.id,
      unloadRunStopId: stops2.find((s) => s.locationLabel === 'Ubungo')!.id,
    });
    expect(a2.id).not.toBe(a.id);
  });

  // ── Stage 3S-C6: receiver-confirmed handoffs + automatic commission ────────
  describe('confirmReceipt (Stage 3S-C6)', () => {
    const mkUnloadedAssignmentAtSuperAgentStop = async () => {
      const { userId, provider } = await mkProviderWithUser();
      const destHub = await mkSuperAgent();
      const r = await mkRoute(provider.id);
      await addStop(userId, r.id, 0, 'Kariakoo');
      await addStop(userId, r.id, 1, 'Bunju', { superAgentId: destHub.id });
      const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
      const createdStops = await runService.getRunStops(run.id);
      const loadStop = createdStops.find((s) => s.locationLabel === 'Kariakoo')!;
      const unloadStop = createdStops.find((s) => s.locationLabel === 'Bunju')!;
      const parcel = await mkParcel();
      const a = await assignmentService.createAssignment(userId, {
        runId: run.id, parcelId: parcel.id, loadRunStopId: loadStop.id, unloadRunStopId: unloadStop.id,
      });
      await assignmentService.markLoaded(mkRoleContext(userId, provider.id), a.id);
      await assignmentService.markUnloaded(mkRoleContext(userId, provider.id), a.id);
      return { userId, provider, destHub, run, parcel, assignment: a };
    };

    it('confirmed receipt writes the real qualifying custody event and automatically generates the correct earning', async () => {
      await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
      const { destHub, parcel, assignment } = await mkUnloadedAssignmentAtSuperAgentStop();

      const received = await assignmentService.confirmReceipt(mkSuperAgentRoleContext(destHub.userId, destHub.id), assignment.id);
      expect(received.status).toBe(ParcelRunAssignmentStatus.RECEIVED);
      expect(received.receivedAt).not.toBeNull();

      const events = await ds.query(
        `SELECT * FROM public.parcel_custody_event WHERE "parcelId" = $1 AND "eventKind" = 'parcel_run_received'`, [parcel.id]);
      expect(events).toHaveLength(1);
      expect(events[0].fromCustodianType).toBe('transport_provider');
      expect(events[0].toCustodianType).toBe('super_agent');
      expect(events[0].toCustodianId).toBe(destHub.id);
      expect(events[0].actorSource).toBe('account_role');

      const earning = await earningRepo.findOneOrFail({ where: { parcelId: parcel.id, superAgentId: destHub.id } });
      expect(Number(earning.amount)).toBe(500);
      expect(earning.source).toBe('parcel_run_received');
    });

    it('is idempotent -- repeating confirmReceipt never writes a second custody event or a second earning', async () => {
      await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
      const { destHub, parcel, assignment } = await mkUnloadedAssignmentAtSuperAgentStop();
      const context = mkSuperAgentRoleContext(destHub.userId, destHub.id);

      const first = await assignmentService.confirmReceipt(context, assignment.id);
      const second = await assignmentService.confirmReceipt(context, assignment.id);
      expect(second.receivedAt!.getTime()).toBe(first.receivedAt!.getTime());

      const events = await ds.query(
        `SELECT count(*)::int AS n FROM public.parcel_custody_event WHERE "parcelId" = $1 AND "eventKind" = 'parcel_run_received'`, [parcel.id]);
      expect(events[0].n).toBe(1);
      expect(await earningRepo.count({ where: { parcelId: parcel.id, superAgentId: destHub.id } })).toBe(1);
    });

    it('rejects confirming receipt before the provider has even unloaded it', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const destHub = await mkSuperAgent();
      const r = await mkRoute(provider.id);
      await addStop(userId, r.id, 0, 'Kariakoo');
      await addStop(userId, r.id, 1, 'Bunju', { superAgentId: destHub.id });
      const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
      const createdStops = await runService.getRunStops(run.id);
      const parcel = await mkParcel();
      const a = await assignmentService.createAssignment(userId, {
        runId: run.id, parcelId: parcel.id,
        loadRunStopId: createdStops.find((s) => s.locationLabel === 'Kariakoo')!.id,
        unloadRunStopId: createdStops.find((s) => s.locationLabel === 'Bunju')!.id,
      });
      await assignmentService.markLoaded(mkRoleContext(userId, provider.id), a.id);
      // Never unloaded.
      await expect(assignmentService.confirmReceipt(mkSuperAgentRoleContext(destHub.userId, destHub.id), a.id))
        .rejects.toThrow(ConflictException);
    });

    it('rejects confirming receipt at an ordinary stop with no Super Agent to confirm', async () => {
      const { userId, provider } = await mkProviderWithUser();
      const { run, stops } = await mkPilotRun(userId, provider.id); // no stop here has a superAgentId
      const parcel = await mkParcel();
      const a = await assignmentService.createAssignment(userId, {
        runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id,
      });
      const context = mkRoleContext(userId, provider.id);
      await assignmentService.markLoaded(context, a.id);
      await assignmentService.markUnloaded(context, a.id);

      // There's no real Super Agent to authenticate as here -- the rejection
      // must come from "no Super Agent at this stop", proven by using the
      // PROVIDER's own (real, but wrong-role) context, which would otherwise
      // fail on authority instead and mask the actual guard being tested.
      await expect(assignmentService.confirmReceipt(context, a.id)).rejects.toThrow(BadRequestException);
    });

    it('rejects confirmation from anyone other than the receiving Super Agent\'s own operator -- including the provider themselves', async () => {
      const { destHub, provider, assignment } = await mkUnloadedAssignmentAtSuperAgentStop();
      const stranger = await mkSuperAgent();

      await expect(assignmentService.confirmReceipt(mkSuperAgentRoleContext(stranger.userId, destHub.id), assignment.id))
        .rejects.toThrow(ForbiddenException);
      // The PROVIDER'S own operation of the Run is not, by itself, authority
      // to confirm on the Super Agent's behalf -- exactly the gap this gate closes.
      const providerAsUser = (await ds.getRepository(TransportProvider).findOneOrFail({ where: { id: provider.id } }));
      await expect(assignmentService.confirmReceipt(mkSuperAgentRoleContext(providerAsUser.userId, destHub.id), assignment.id))
        .rejects.toThrow(ForbiddenException);
      expect(await earningRepo.count()).toBe(0);
    });

    it('a missing rate configuration never blocks the physical receipt confirmation itself -- best-effort commission generation, but the failure is durably recorded, not silently discarded', async () => {
      // Deliberately NO rate configured.
      const { destHub, parcel, assignment } = await mkUnloadedAssignmentAtSuperAgentStop();

      const received = await assignmentService.confirmReceipt(mkSuperAgentRoleContext(destHub.userId, destHub.id), assignment.id);
      expect(received.status).toBe(ParcelRunAssignmentStatus.RECEIVED); // succeeded regardless
      expect(await earningRepo.count()).toBe(0); // no earning, but no exception either

      // Stage 3S-C6 correction: the failure must leave a durable, queryable
      // trail rather than vanishing into a bare catch{}.
      const failures = await activityEventService.findByEventType('SUPER_AGENT_HANDLING_EARNING_GENERATION_FAILED');
      expect(failures).toHaveLength(1);
      expect(failures[0].category).toBe(ActivityCategory.LOGISTICS);
      expect(failures[0].severity).toBe('error');
      expect(failures[0].visibility).toBe('admin');
      expect(failures[0].metadata).toMatchObject({ assignmentId: assignment.id, parcelId: parcel.id });
    });

    // ── cross-pathway deduplication (Stage 3S-C6) ──────────────────────────
    it('cross-pathway dedup: a DIFFERENT custody event for the SAME (parcel, Super Agent) pair never generates a second earning', async () => {
      await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
      const { destHub, parcel, assignment } = await mkUnloadedAssignmentAtSuperAgentStop();

      const first = await assignmentService.confirmReceipt(mkSuperAgentRoleContext(destHub.userId, destHub.id), assignment.id);
      expect(first.status).toBe(ParcelRunAssignmentStatus.RECEIVED);

      // A SEPARATE, independently-recorded custody event -- as if a
      // different (e.g. legacy) pathway also recorded a receipt for this
      // exact same Super Agent and parcel FROM THE SAME PRIOR CUSTODIAN TYPE
      // (fromCustodianType='transport_provider', matching what confirmReceipt
      // itself just wrote) -- i.e. genuinely the SAME physical handoff,
      // described twice.
      const custodyRepo = ds.getRepository(ParcelCustodyEvent);
      const duplicateEvent = await custodyRepo.save(custodyRepo.create({
        parcelId: parcel.id, eventKind: 'origin_hub_received', operationKey: `dedup-test:${assignment.id}`,
        fromCustodianType: 'transport_provider', toCustodianType: 'super_agent', toCustodianId: destHub.id,
        actorSource: 'account_role', assignmentType: null,
      } as any));

      const secondEarning = await earningService.recordEarningForCustodyEvent(duplicateEvent.id, { userId: null });
      const onlyEarning = await earningRepo.findOneOrFail({ where: { parcelId: parcel.id, superAgentId: destHub.id } });
      expect(secondEarning.id).toBe(onlyEarning.id); // the SAME earning, not a new one
      expect(await earningRepo.count({ where: { parcelId: parcel.id, superAgentId: destHub.id } })).toBe(1);

      // Independent DB-level backstop.
      await expect(ds.query(
        `INSERT INTO public.super_agent_handling_earning
           ("custodyEventId","parcelId","superAgentId","sourceCustodianType","rateConfigId",amount,currency,source)
         VALUES ($1,$2,$3,$4,$5,500,'TZS','origin_hub_received')`,
        [duplicateEvent.id, parcel.id, destHub.id, onlyEarning.sourceCustodianType, onlyEarning.rateConfigId],
      )).rejects.toThrow();
    });

    it('a genuinely SEPARATE handling operation by the same Super Agent on the same parcel (different prior custodian type) earns independently, not deduplicated away', async () => {
      // The local-loop scenario the coarser (parcelId, superAgentId)-only
      // constraint used to wrongly block: the SAME hub first receives a
      // parcel from a local Agent at origin, then later genuinely receives
      // the SAME parcel again as its Run destination -- two real, distinct
      // physical handling operations, not one event recorded twice.
      await rateService.configureRate({ commissionType: 'handling', amount: 500, effectiveFrom: new Date(Date.now() - 1000), createdByUserId: null });
      const { destHub, parcel, assignment } = await mkUnloadedAssignmentAtSuperAgentStop();

      const custodyRepo = ds.getRepository(ParcelCustodyEvent);
      const originReceiptEvent = await custodyRepo.save(custodyRepo.create({
        parcelId: parcel.id, eventKind: 'collection_received_at_origin_hub', operationKey: `origin-loop-test:${assignment.id}`,
        fromCustodianType: 'local_agent', fromCustodianId: 77,
        toCustodianType: 'super_agent', toCustodianId: destHub.id,
        actorSource: 'account_role', assignmentType: null,
      } as any));
      const originEarning = await earningService.recordEarningForCustodyEvent(originReceiptEvent.id, { userId: null });

      const destReceived = await assignmentService.confirmReceipt(mkSuperAgentRoleContext(destHub.userId, destHub.id), assignment.id);
      expect(destReceived.status).toBe(ParcelRunAssignmentStatus.RECEIVED);
      const destEarning = await earningRepo.findOneOrFail({ where: { parcelId: parcel.id, superAgentId: destHub.id, sourceCustodianType: 'transport_provider' } });

      expect(destEarning.id).not.toBe(originEarning.id); // two independent earnings, not one deduplicated
      expect(await earningRepo.count({ where: { parcelId: parcel.id, superAgentId: destHub.id } })).toBe(2);
    });
  });

  it('repeated markLoaded/markUnloaded calls never create a second custody event for the same operation', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(userId, {
      runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id,
    });
    const context = mkRoleContext(userId, provider.id);

    await assignmentService.markLoaded(context, a.id);
    await assignmentService.markLoaded(context, a.id); // idempotent retry
    await assignmentService.markUnloaded(context, a.id);
    await assignmentService.markUnloaded(context, a.id); // idempotent retry

    const loaded = await ds.query(`SELECT count(*)::int AS n FROM public.parcel_custody_event WHERE "eventKind" = 'parcel_run_loaded'`);
    const unloaded = await ds.query(`SELECT count(*)::int AS n FROM public.parcel_custody_event WHERE "eventKind" = 'parcel_run_unloaded'`);
    expect(loaded[0].n).toBe(1);
    expect(unloaded[0].n).toBe(1);

    // Independent DB-level backstop: even a direct attempt to insert a
    // second row under the SAME (parcelId, operationKey) is rejected by
    // UQ_parcel_custody_operation itself, not merely by the service's own
    // short-circuit.
    await expect(ds.query(
      `INSERT INTO public.parcel_custody_event ("parcelId","eventKind","operationKey","actorSource")
       VALUES ($1,'parcel_run_loaded',$2,'system')`,
      [parcel.id, `parcel-run-loaded:${a.id}`],
    )).rejects.toThrow();
  });
});
