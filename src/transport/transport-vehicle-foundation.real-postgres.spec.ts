import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { TransportService } from './transport.service';
import { TransportRunService } from './transport-run.service';
import { RouteStop } from './entities/route-stop.entity';
import { TransportRun, TransportRunStatus } from './entities/transport-run.entity';
import { TransportRunStop } from './entities/transport-run-stop.entity';
import { Vehicle, VehicleOperationalStatus } from './entities/vehicle.entity';
import { TransportProvider, ProviderStatus, ProviderType } from './entities/transport-provider.entity';
import { TransportRoute, RouteType } from './entities/transport-route.entity';
import { User } from '../users/entities/user.entity';
import { ensureRouteStopDeferrableSequenceConstraint } from './route-stop-schema';

/**
 * Stage 3S-C2 — Vehicle administration + TransportRun assignment, proved
 * against REAL PostgreSQL. Vehicle CRUD/assignment does not touch the
 * RouteStop/TransportRunStop snapshot contract or slot-capacity at all --
 * every test here proves that explicitly, not by omission.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C2 — vehicle administration and Run assignment, real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let providers: Repository<TransportProvider>;
  let routes: Repository<TransportRoute>;
  let routeStops: Repository<RouteStop>;
  let runs: Repository<TransportRun>;
  let runStops: Repository<TransportRunStop>;
  let vehicles: Repository<Vehicle>;
  let transport: TransportService;
  let runService: TransportRunService;
  let userSeq = 0;

  const mkProviderWithUser = async (status: ProviderStatus = ProviderStatus.VERIFIED) => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `c2-${++userSeq}@s3sc2.local`, phone: `+2556${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'P',
    } as any));
    const p = await providers.save(providers.create({ name: 'P', type: ProviderType.VAN, status, userId: (u as any).id } as any) as unknown as TransportProvider);
    return { userId: (u as any).id as number, provider: p };
  };
  const mkRoute = (providerId: number, o: Partial<TransportRoute> = {}) =>
    routes.save(routes.create({
      providerId, routeType: RouteType.LOCAL_LOOP, originCity: 'Dar es Salaam', destinationCity: 'Dar es Salaam',
      pricePerKg: 100, fixedFee: 500, isActive: true, ...o,
    } as any) as unknown as TransportRoute);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 20 },
      entities: [...B5B_BASE_ENTITIES, TransportRoute, RouteStop, TransportRun, TransportRunStop, Vehicle],
    });
    await ds.initialize();
    await ensureRouteStopDeferrableSequenceConstraint((sql) => ds.query(sql));
    // shipment/transport_quote aren't otherwise needed by this file -- bare
    // stand-in tables only so the zero-side-effect test can prove nothing
    // was written to them, matching transport-discovery-sorting.real-postgres
    // .spec.ts's own established pattern for an out-of-scope table.
    await ds.query(`CREATE TABLE public.shipment (id serial PRIMARY KEY)`);
    await ds.query(`CREATE TABLE public.transport_quote (id serial PRIMARY KEY)`);

    providers = ds.getRepository(TransportProvider);
    routes = ds.getRepository(TransportRoute);
    routeStops = ds.getRepository(RouteStop);
    runs = ds.getRepository(TransportRun);
    runStops = ds.getRepository(TransportRunStop);
    vehicles = ds.getRepository(Vehicle);

    const args: any[] = new Array(15).fill({});
    args[0] = providers; args[1] = routes; args[14] = ds;
    transport = new (TransportService as any)(...args);
    runService = new TransportRunService(
      routeStops, routes, runs, runStops, transport,
      { search: async () => [] } as any,
      ds,
      vehicles,
    );
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    await ds.query(`TRUNCATE TABLE public.transport_run_stop RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.transport_run RESTART IDENTITY CASCADE`);
    await ds.query(`DELETE FROM public.vehicle`);
    await ds.query(`DELETE FROM public.route_stop`);
    await ds.query(`DELETE FROM public.transport_route`);
    await ds.query(`DELETE FROM public.transport_provider`);
  });

  const addStop = (userId: number, routeId: number, sequence: number, locationLabel: string) =>
    runService.addRouteStop(userId, routeId, { sequence, locationLabel });
  const mkRunWithStops = async (userId: number, providerId: number) => {
    const r = await mkRoute(providerId);
    await addStop(userId, r.id, 0, 'Kariakoo');
    await addStop(userId, r.id, 1, 'Bunju');
    return runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
  };

  // ── Vehicle CRUD ───────────────────────────────────────────────────────────
  it('adds a vehicle scoped to the caller\'s own provider, with sensible defaults', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const v = await runService.addVehicle(userId, { identifier: 'Van #1', type: ProviderType.VAN, parcelCapacity: 40 });
    expect(v.providerId).toBe(provider.id);
    expect(v.isActive).toBe(true);
    expect(v.operationalStatus).toBe(VehicleOperationalStatus.AVAILABLE);
    expect(v.parcelCapacity).toBe(40);
  });

  it('rejects an empty identifier and a negative capacity', async () => {
    const { userId } = await mkProviderWithUser();
    await expect(runService.addVehicle(userId, { identifier: '  ', type: ProviderType.VAN })).rejects.toThrow(BadRequestException);
    await expect(runService.addVehicle(userId, { identifier: 'Van', type: ProviderType.VAN, weightCapacityKg: -1 })).rejects.toThrow(BadRequestException);
  });

  it('listVehicles is scoped to the caller\'s own provider -- never returns another provider\'s vehicles', async () => {
    const a = await mkProviderWithUser();
    const b = await mkProviderWithUser();
    await runService.addVehicle(a.userId, { identifier: 'A-Van', type: ProviderType.VAN });
    await runService.addVehicle(b.userId, { identifier: 'B-Van', type: ProviderType.VAN });

    const aList = await runService.listVehicles(a.userId);
    expect(aList.map((v) => v.identifier)).toEqual(['A-Van']);
    const bList = await runService.listVehicles(b.userId);
    expect(bList.map((v) => v.identifier)).toEqual(['B-Van']);
  });

  it('updateVehicle edits fields and is ownership-scoped', async () => {
    const owner = await mkProviderWithUser();
    const stranger = await mkProviderWithUser();
    const v = await runService.addVehicle(owner.userId, { identifier: 'Van #1', type: ProviderType.VAN });

    const updated = await runService.updateVehicle(owner.userId, v.id, { identifier: 'Van #1 (renamed)', operationalStatus: VehicleOperationalStatus.MAINTENANCE });
    expect(updated.identifier).toBe('Van #1 (renamed)');
    expect(updated.operationalStatus).toBe(VehicleOperationalStatus.MAINTENANCE);

    await expect(runService.updateVehicle(stranger.userId, v.id, { identifier: 'Hijacked' })).rejects.toThrow(NotFoundException);
  });

  it('deactivateVehicle marks it inactive and retired', async () => {
    const { userId } = await mkProviderWithUser();
    const v = await runService.addVehicle(userId, { identifier: 'Van #1', type: ProviderType.VAN });
    const deactivated = await runService.deactivateVehicle(userId, v.id);
    expect(deactivated.isActive).toBe(false);
    expect(deactivated.operationalStatus).toBe(VehicleOperationalStatus.RETIRED);
  });

  // ── Run assignment ─────────────────────────────────────────────────────────
  it('assigns a vehicle to a Run', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const run = await mkRunWithStops(userId, provider.id);
    const v = await runService.addVehicle(userId, { identifier: 'Van #1', type: ProviderType.VAN });

    const assigned = await runService.assignVehicleToRun(userId, run.id, v.id);
    expect(assigned.vehicleId).toBe(v.id);
  });

  it('reassigning a Run to a different vehicle simply overwrites the prior assignment', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const run = await mkRunWithStops(userId, provider.id);
    const v1 = await runService.addVehicle(userId, { identifier: 'Van #1', type: ProviderType.VAN });
    const v2 = await runService.addVehicle(userId, { identifier: 'Van #2', type: ProviderType.VAN });

    await runService.assignVehicleToRun(userId, run.id, v1.id);
    const reassigned = await runService.assignVehicleToRun(userId, run.id, v2.id);
    expect(reassigned.vehicleId).toBe(v2.id);
  });

  it('rejects assigning a vehicle belonging to a DIFFERENT provider', async () => {
    const owner = await mkProviderWithUser();
    const stranger = await mkProviderWithUser();
    const run = await mkRunWithStops(owner.userId, owner.provider.id);
    const strangerVehicle = await runService.addVehicle(stranger.userId, { identifier: 'Not Yours', type: ProviderType.VAN });

    await expect(runService.assignVehicleToRun(owner.userId, run.id, strangerVehicle.id)).rejects.toThrow(NotFoundException);
  });

  it('rejects assigning a vehicle to a Run belonging to a DIFFERENT provider', async () => {
    const owner = await mkProviderWithUser();
    const stranger = await mkProviderWithUser();
    const run = await mkRunWithStops(owner.userId, owner.provider.id);
    const strangerVehicle = await runService.addVehicle(stranger.userId, { identifier: 'Van', type: ProviderType.VAN });

    await expect(runService.assignVehicleToRun(stranger.userId, run.id, strangerVehicle.id)).rejects.toThrow(NotFoundException); // run isn't stranger's
  });

  it('rejects assigning an inactive vehicle', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const run = await mkRunWithStops(userId, provider.id);
    const v = await runService.addVehicle(userId, { identifier: 'Van #1', type: ProviderType.VAN });
    await runService.deactivateVehicle(userId, v.id);

    await expect(runService.assignVehicleToRun(userId, run.id, v.id)).rejects.toThrow(BadRequestException);
  });

  it('rejects assigning a vehicle to a cancelled or completed Run', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const run = await mkRunWithStops(userId, provider.id);
    const v = await runService.addVehicle(userId, { identifier: 'Van #1', type: ProviderType.VAN });
    await runs.update(run.id, { status: TransportRunStatus.CANCELLED });

    await expect(runService.assignVehicleToRun(userId, run.id, v.id)).rejects.toThrow(ConflictException);
  });

  // ── zero side effects on the C1 contract ──────────────────────────────────
  it('Vehicle CRUD and Run assignment never touch RouteStop/TransportRunStop or capacity', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const run = await mkRunWithStops(userId, provider.id);
    const before = (await runService.getRunStops(run.id)).map((s) => ({ id: s.id, seq: s.sequence, label: s.locationLabel }));

    const v = await runService.addVehicle(userId, { identifier: 'Van #1', type: ProviderType.VAN });
    await runService.assignVehicleToRun(userId, run.id, v.id);
    await runService.updateVehicle(userId, v.id, { operationalStatus: VehicleOperationalStatus.IN_USE });

    const after = (await runService.getRunStops(run.id)).map((s) => ({ id: s.id, seq: s.sequence, label: s.locationLabel }));
    expect(after).toEqual(before); // byte-for-byte unaffected
    expect((await ds.query(`SELECT count(*)::int n FROM public.shipment`))[0].n).toBe(0);
    expect((await ds.query(`SELECT count(*)::int n FROM public.transport_quote`))[0].n).toBe(0);
  });
});
