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
import { ProviderAvailability } from './entities/provider-availability.entity';
import { TransportProvider, ProviderStatus, ProviderType } from './entities/transport-provider.entity';
import { TransportRoute, RouteType } from './entities/transport-route.entity';
import { Shipment } from '../shipments/entities/shipment.entity';
import { TransportQuote } from './entities/transport-quote.entity';
import { User } from '../users/entities/user.entity';
import { ensureRouteStopDeferrableSequenceConstraint } from './route-stop-schema';

/**
 * Stage 3S-C1 — Ordered Route Stops + Immutable Run Itinerary Foundation,
 * proved against REAL PostgreSQL: the actual TransportRunService against
 * real tables and real transactions.
 *
 * Runs only against the dedicated kentexa_b5b_test database (resetB5BTestSchema's
 * own safety gate); skipped, never failed, when B5B_TEST_DB_PASSWORD is not
 * configured. Never touches production or the isolated Stage3KR environment.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C1 — route stop / transport run foundation, real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let providers: Repository<TransportProvider>;
  let routes: Repository<TransportRoute>;
  let routeStops: Repository<RouteStop>;
  let runs: Repository<TransportRun>;
  let runStops: Repository<TransportRunStop>;
  let transport: TransportService;
  let runService: TransportRunService;
  let userSeq = 0;

  const mkProviderWithUser = async (status: ProviderStatus = ProviderStatus.VERIFIED) => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `c1-${++userSeq}@s3sc1.local`, phone: `+2558${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'P',
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
      entities: [...B5B_BASE_ENTITIES, ProviderAvailability, TransportRoute, RouteStop, TransportRun, TransportRunStop, Shipment, TransportQuote],
    });
    await ds.initialize();
    // synchronize:true only builds from entity decorators, which cannot
    // express a DEFERRABLE unique constraint -- apply the exact same one
    // the real migration applies (route-stop-schema.ts), so this spec's
    // schema enforces (routeId, sequence) uniqueness identically to a real
    // deployment, including its deferrability.
    await ensureRouteStopDeferrableSequenceConstraint((sql) => ds.query(sql));

    providers = ds.getRepository(TransportProvider);
    routes = ds.getRepository(TransportRoute);
    routeStops = ds.getRepository(RouteStop);
    runs = ds.getRepository(TransportRun);
    runStops = ds.getRepository(TransportRunStop);

    const args: any[] = new Array(15).fill({});
    args[0] = providers; args[1] = routes; args[14] = ds;
    transport = new (TransportService as any)(...args);
    runService = new TransportRunService(
      routeStops, routes, runs, runStops, transport,
      { search: async () => [] } as any, // no tz-location seed data needed for these tests -- ward/region resolution just stays null, exactly the "never blocking" fallback path
      ds,
    );
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    await ds.query(`TRUNCATE TABLE public.transport_run_stop RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.transport_run RESTART IDENTITY CASCADE`);
    await ds.query(`DELETE FROM public.route_stop`);
    await ds.query(`DELETE FROM public.transport_route`);
    await ds.query(`DELETE FROM public.transport_provider`);
  });

  const addStop = (userId: number, routeId: number, sequence: number, locationLabel: string, extra: Record<string, unknown> = {}) =>
    runService.addRouteStop(userId, routeId, { sequence, locationLabel, ...extra });

  // ── ordered RouteStops persist in deterministic sequence ──────────────────
  it('ordered RouteStops persist in deterministic sequence', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    await addStop(userId, r.id, 3, 'Bunju');
    await addStop(userId, r.id, 0, 'Kariakoo');
    await addStop(userId, r.id, 1, 'Mbagala');
    await addStop(userId, r.id, 2, 'Ubungo');

    const list = await runService.listRouteStops(userId, r.id);
    expect(list.map((s) => s.locationLabel)).toEqual(['Kariakoo', 'Mbagala', 'Ubungo', 'Bunju']);
    expect(list.map((s) => s.sequence)).toEqual([0, 1, 2, 3]);
  });

  it('rejects a duplicate sequence for one Route, and accepts the same sequence number on a DIFFERENT route', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r1 = await mkRoute(provider.id);
    const r2 = await mkRoute(provider.id);
    await addStop(userId, r1.id, 0, 'Kariakoo');
    await expect(addStop(userId, r1.id, 0, 'Duplicate')).rejects.toThrow();
    await expect(addStop(userId, r2.id, 0, 'Kariakoo')).resolves.toBeDefined(); // different route, same sequence -- fine
  });

  it('rejects a negative sequence and an empty locationLabel', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    await expect(addStop(userId, r.id, -1, 'x')).rejects.toThrow(BadRequestException);
    await expect(addStop(userId, r.id, 0, '   ')).rejects.toThrow(BadRequestException);
  });

  it('a provider cannot manage stops on a route they do not own', async () => {
    const owner = await mkProviderWithUser();
    const stranger = await mkProviderWithUser();
    const r = await mkRoute(owner.provider.id);
    await expect(addStop(stranger.userId, r.id, 0, 'Kariakoo')).rejects.toThrow(NotFoundException);
  });

  // ── Run creation ------------------------------------------------------────
  it('rejects Run creation when the route has fewer than 2 active stops', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    await addStop(userId, r.id, 0, 'Kariakoo');
    await expect(runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) }))
      .rejects.toThrow(ConflictException);
  });

  it('Run creation snapshots stops transactionally, and RunStop IDs are stable/addressable', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    await addStop(userId, r.id, 0, 'Kariakoo');
    await addStop(userId, r.id, 1, 'Mbagala');
    await addStop(userId, r.id, 2, 'Ubungo');
    await addStop(userId, r.id, 3, 'Mbezi');
    await addStop(userId, r.id, 4, 'Bunju');

    const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
    expect(run.status).toBe(TransportRunStatus.SCHEDULED);

    const stops = await runService.getRunStops(run.id);
    expect(stops.map((s) => s.locationLabel)).toEqual(['Kariakoo', 'Mbagala', 'Ubungo', 'Mbezi', 'Bunju']);
    // Every RunStop has its own stable, distinct, queryable id -- a future
    // Parcel leg can address Mbagala -> Bunju directly by THESE ids, with no
    // implication the parcel started at the Run's own origin (Kariakoo).
    const ids = stops.map((s) => s.id);
    expect(new Set(ids).size).toBe(5);
    const mbagala = stops.find((s) => s.locationLabel === 'Mbagala')!;
    const bunju = stops.find((s) => s.locationLabel === 'Bunju')!;
    expect(mbagala.id).not.toBe(bunju.id);
    expect(mbagala.sequence).toBeLessThan(bunju.sequence); // still correctly ordered relative to each other
  });

  it('CRITICAL PROOF CASE: editing the reusable Route after a Run is created does not change that Run\'s snapshotted itinerary', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    const kariakoo = await addStop(userId, r.id, 0, 'Kariakoo');
    await addStop(userId, r.id, 1, 'Mbagala');
    await addStop(userId, r.id, 2, 'Ubungo');
    await addStop(userId, r.id, 3, 'Mbezi');
    const bunju = await addStop(userId, r.id, 4, 'Bunju');

    const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
    const before = (await runService.getRunStops(run.id)).map((s) => ({ seq: s.sequence, label: s.locationLabel }));
    expect(before.map((s) => s.label)).toEqual(['Kariakoo', 'Mbagala', 'Ubungo', 'Mbezi', 'Bunju']);

    // Admin now edits the REUSABLE route: reorder Bunju to the front, rename
    // Kariakoo, and deactivate Ubungo entirely.
    await runService.reorderRouteStop(userId, r.id, bunju.id, 0);
    await runService.updateRouteStop(userId, r.id, kariakoo.id, { locationLabel: 'Kariakoo Renamed' });
    const ubungo = (await runService.listRouteStops(userId, r.id)).find((s) => s.locationLabel === 'Ubungo')!;
    await runService.deactivateRouteStop(userId, r.id, ubungo.id);

    // The reusable plan genuinely changed...
    const liveStops = await runService.listRouteStops(userId, r.id);
    expect(liveStops.find((s) => s.id === bunju.id)!.sequence).toBe(0);
    expect(liveStops.find((s) => s.id === kariakoo.id)!.locationLabel).toBe('Kariakoo Renamed');
    expect(liveStops.find((s) => s.id === ubungo.id)!.isActive).toBe(false);

    // ...but the ALREADY-CREATED Run's own itinerary is byte-for-byte unchanged.
    const after = (await runService.getRunStops(run.id)).map((s) => ({ seq: s.sequence, label: s.locationLabel }));
    expect(after).toEqual(before);
  });

  it('different Runs created from the SAME reusable Route at different times snapshot different versions of it', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    await addStop(userId, r.id, 0, 'Kariakoo');
    await addStop(userId, r.id, 1, 'Mbagala');

    const run1 = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });

    // A stop is added to the reusable plan AFTER run1 was created.
    await addStop(userId, r.id, 2, 'Bunju');
    const run2 = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 172800000) });

    const run1Stops = (await runService.getRunStops(run1.id)).map((s) => s.locationLabel);
    const run2Stops = (await runService.getRunStops(run2.id)).map((s) => s.locationLabel);
    expect(run1Stops).toEqual(['Kariakoo', 'Mbagala']); // run1 never gains the later-added Bunju
    expect(run2Stops).toEqual(['Kariakoo', 'Mbagala', 'Bunju']);
  });

  it('Run creation excludes stops already deactivated BEFORE the Run is created', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    await addStop(userId, r.id, 0, 'Kariakoo');
    const ubungo = await addStop(userId, r.id, 1, 'Ubungo');
    await addStop(userId, r.id, 2, 'Bunju');
    await runService.deactivateRouteStop(userId, r.id, ubungo.id);

    const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
    const stops = (await runService.getRunStops(run.id)).map((s) => s.locationLabel);
    expect(stops).toEqual(['Kariakoo', 'Bunju']); // Ubungo was never active -- never snapshotted
  });

  it('a provider cannot schedule a Run on a route they do not own', async () => {
    const owner = await mkProviderWithUser();
    const stranger = await mkProviderWithUser();
    const r = await mkRoute(owner.provider.id);
    await addStop(owner.userId, r.id, 0, 'Kariakoo');
    await addStop(owner.userId, r.id, 1, 'Bunju');
    await expect(
      runService.createRun(stranger.userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects Run creation against an inactive route, and an invalid scheduledDeparture', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id, { isActive: false });
    await addStop(userId, r.id, 0, 'Kariakoo');
    await addStop(userId, r.id, 1, 'Bunju');
    await expect(runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date() })).rejects.toThrow(BadRequestException);

    const active = await mkRoute(provider.id);
    await addStop(userId, active.id, 0, 'Kariakoo');
    await addStop(userId, active.id, 1, 'Bunju');
    await expect(runService.createRun(userId, { routeId: active.id, scheduledDeparture: 'not-a-date' as any })).rejects.toThrow(BadRequestException);
  });

  // ── zero side effects ──────────────────────────────────────────────────────
  it('Run creation (and RouteStop management) has zero Parcel/custody/quote/payment side effects', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    await addStop(userId, r.id, 0, 'Kariakoo');
    await addStop(userId, r.id, 1, 'Bunju');
    await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });

    expect((await ds.query(`SELECT count(*)::int n FROM public.shipment`))[0].n).toBe(0);
    expect((await ds.query(`SELECT count(*)::int n FROM public.transport_quote`))[0].n).toBe(0);
    expect((await ds.query(`SELECT count(*)::int n FROM public.provider_availability`))[0].n).toBe(0);
  });
});
