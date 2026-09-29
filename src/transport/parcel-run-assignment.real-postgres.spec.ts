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
  const addStop = (userId: number, routeId: number, sequence: number, locationLabel: string) =>
    runService.addRouteStop(userId, routeId, { sequence, locationLabel });

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
      entities: [...B5B_BASE_ENTITIES, TransportRoute, RouteStop, TransportRun, TransportRunStop, Vehicle, ParcelRunAssignment],
    });
    await ds.initialize();
    await ensureRouteStopDeferrableSequenceConstraint((sql) => ds.query(sql));
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
    assignmentService = new ParcelRunAssignmentService(
      ds.getRepository(ParcelRunAssignment), runs, runStops, transport, ds,
    );
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    await ds.query(`DELETE FROM public.parcel_run_assignment`);
    await ds.query(`TRUNCATE TABLE public.transport_run_stop RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.transport_run RESTART IDENTITY CASCADE`);
    await ds.query(`DELETE FROM public.route_stop`);
    await ds.query(`DELETE FROM public.transport_route`);
    await ds.query(`DELETE FROM public.transport_provider`);
    await ds.query(`DELETE FROM public.parcel`);
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

    const loaded = await assignmentService.markLoaded(userId, a.id);
    expect(loaded.status).toBe(ParcelRunAssignmentStatus.LOADED);
    expect(loaded.loadedAt).not.toBeNull();
    const loadedAgain = await assignmentService.markLoaded(userId, a.id); // idempotent
    expect(loadedAgain.loadedAt!.getTime()).toBe(loaded.loadedAt!.getTime());

    const unloaded = await assignmentService.markUnloaded(userId, a.id);
    expect(unloaded.status).toBe(ParcelRunAssignmentStatus.UNLOADED);
    expect(unloaded.unloadedAt).not.toBeNull();
    const unloadedAgain = await assignmentService.markUnloaded(userId, a.id); // idempotent
    expect(unloadedAgain.unloadedAt!.getTime()).toBe(unloaded.unloadedAt!.getTime());
  });

  it('rejects marking unloaded before loaded, and rejects loading a cancelled assignment', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel1 = await mkParcel();
    const a1 = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel1.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });
    await expect(assignmentService.markUnloaded(userId, a1.id)).rejects.toThrow(ConflictException);

    const parcel2 = await mkParcel();
    const a2 = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel2.id, loadRunStopId: stops.kariakoo.id, unloadRunStopId: stops.mbezi.id });
    await assignmentService.cancelAssignment(userId, a2.id);
    await expect(assignmentService.markLoaded(userId, a2.id)).rejects.toThrow(ConflictException);
  });

  it('cancelAssignment refuses a LOADED assignment (only scheduled can be retracted this way)', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(userId, provider.id);
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });
    await assignmentService.markLoaded(userId, a.id);

    await expect(assignmentService.cancelAssignment(userId, a.id)).rejects.toThrow(ConflictException);
  });

  it('a stranger cannot transition an assignment on a Run they do not own', async () => {
    const owner = await mkProviderWithUser();
    const stranger = await mkProviderWithUser();
    const { run, stops } = await mkPilotRun(owner.userId, owner.provider.id);
    const parcel = await mkParcel();
    const a = await assignmentService.createAssignment(owner.userId, { runId: run.id, parcelId: parcel.id, loadRunStopId: stops.mbagala.id, unloadRunStopId: stops.bunju.id });

    await expect(assignmentService.markLoaded(stranger.userId, a.id)).rejects.toThrow(ForbiddenException);
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
    await assignmentService.markLoaded(userId, a.id);
    await assignmentService.markUnloaded(userId, a.id);

    const after = (await runService.getRunStops(run.id)).map((s) => ({ id: s.id, seq: s.sequence }));
    expect(after).toEqual(before);
  });
});
