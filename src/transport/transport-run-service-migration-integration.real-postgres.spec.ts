import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { AddTransportRunFoundation1788285000000 } from '../database/migrations/1788285000000-AddTransportRunFoundation';
import { TransportService } from './transport.service';
import { TransportRunService } from './transport-run.service';
import { RouteStop } from './entities/route-stop.entity';
import { TransportRun } from './entities/transport-run.entity';
import { TransportRunStop } from './entities/transport-run-stop.entity';
import { TransportProvider, ProviderStatus, ProviderType } from './entities/transport-provider.entity';
import { TransportRoute, RouteType } from './entities/transport-route.entity';
import { User } from '../users/entities/user.entity';

/**
 * Stage 3S-C1 — second post-review correction. Unlike
 * transport-run-foundation.real-postgres.spec.ts (which proves the SERVICE
 * against a synchronize:true schema made constraint-equivalent to the
 * migration via ensureRouteStopDeferrableSequenceConstraint), THIS file
 * proves the real TransportRunService.reorderRouteStop() end to end against
 * a schema built by literally RUNNING 1788285000000-AddTransportRunFoundation's
 * own up() -- exactly what the review required: schema through the
 * migration, the actual service wired against it, the actual method called,
 * not a raw-SQL reproduction.
 *
 * Three DataSources against the SAME physical database, in sequence:
 *   1. A throwaway synchronize:true DataSource creates the tables this gate
 *      DEPENDS ON but does not own (User, TransportProvider, TransportRoute)
 *      -- unrelated to what this correction needs to prove, and already
 *      covered the same way by every other Stage 3S real-PG spec.
 *   2. A throwaway synchronize:false DataSource runs the REAL migration's
 *      up() to create route_stop/transport_run/transport_run_stop for real.
 *   3. The long-lived synchronize:false DataSource the test/service actually
 *      uses -- every table already exists physically from steps 1-2; this
 *      DataSource only supplies entity metadata for working repositories.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C1 — TransportRunService against a migration-created schema, real PostgreSQL', () => {
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
      email: `c1mig-${++userSeq}@s3sc1.local`, phone: `+2559${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'P',
    } as any));
    const p = await providers.save(providers.create({ name: 'P', type: ProviderType.VAN, status, userId: (u as any).id } as any) as unknown as TransportProvider);
    return { userId: (u as any).id as number, provider: p };
  };
  const mkRoute = (providerId: number, o: Partial<TransportRoute> = {}) =>
    routes.save(routes.create({
      providerId, routeType: RouteType.LOCAL_LOOP, originCity: 'Dar es Salaam', destinationCity: 'Dar es Salaam',
      pricePerKg: 100, fixedFee: 500, isActive: true, ...o,
    } as any) as unknown as TransportRoute);
  const addStop = (userId: number, routeId: number, sequence: number, locationLabel: string) =>
    runService.addRouteStop(userId, routeId, { sequence, locationLabel });

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    // Step 1: tables this gate depends on but does not own.
    const bootstrap = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true,
      entities: [...B5B_BASE_ENTITIES, TransportRoute],
    });
    await bootstrap.initialize();
    await bootstrap.destroy();

    // Step 2: this gate's OWN tables, created by literally running the migration.
    const migrationDs = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: false, entities: [],
    });
    await migrationDs.initialize();
    const runner = migrationDs.createQueryRunner();
    await new AddTransportRunFoundation1788285000000().up(runner);
    await runner.release();
    await migrationDs.destroy();

    // Step 3: the real DataSource the test/service exercises.
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: false, extra: { max: 20 },
      entities: [...B5B_BASE_ENTITIES, TransportRoute, RouteStop, TransportRun, TransportRunStop],
    });
    await ds.initialize();

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
      { search: async () => [] } as any,
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

  it('sanity: route_stop was created by the migration, with the real deferrable constraint and CHECK in place', async () => {
    const [{ conname, condeferrable }] = await ds.query(
      `SELECT conname, condeferrable FROM pg_constraint WHERE conname = 'UQ_route_stop_sequence'`,
    );
    expect(conname).toBe('UQ_route_stop_sequence');
    expect(condeferrable).toBe(true);
    const [{ conname: chkName }] = await ds.query(
      `SELECT conname FROM pg_constraint WHERE conname = 'CHK_route_stop_sequence'`,
    );
    expect(chkName).toBe('CHK_route_stop_sequence');
  });

  it('the REAL reorderRouteStop() succeeds against the migration-created schema, with the swap fully applied', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    const a = await addStop(userId, r.id, 0, 'Kariakoo');
    const b = await addStop(userId, r.id, 1, 'Bunju');

    await runService.reorderRouteStop(userId, r.id, b.id, 0);

    const list = await runService.listRouteStops(userId, r.id);
    expect(list.map((s) => ({ id: s.id, sequence: s.sequence }))).toEqual([
      { id: b.id, sequence: 0 },
      { id: a.id, sequence: 1 },
    ]);
  });

  it('a case that would have collided with the old 1_000_000_000 + id sentinel no longer matters at all', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    const a = await addStop(userId, r.id, 0, 'Kariakoo');
    const b = await addStop(userId, r.id, 1, 'Bunju');
    // A third, legitimately persisted stop deliberately occupies the EXACT
    // value the old buggy sentinel would have used for `a` --
    // 1_000_000_000 + a.id. Under the old approach this would have made the
    // sentinel UPDATE itself fail with a duplicate-key error. The current
    // deferred-constraint approach never computes or assigns any such value
    // at all, so this row's existence is completely irrelevant.
    await ds.query(
      `INSERT INTO public.route_stop ("routeId", sequence, "locationLabel") VALUES ($1, $2, 'Collision-bait')`,
      [r.id, 1_000_000_000 + a.id],
    );

    await expect(runService.reorderRouteStop(userId, r.id, b.id, 0)).resolves.toBeUndefined();
    const list = await runService.listRouteStops(userId, r.id);
    expect(list.find((s) => s.id === a.id)!.sequence).toBe(1);
    expect(list.find((s) => s.id === b.id)!.sequence).toBe(0);
  });

  it('end to end: schedule a Run, reorder the reusable Route afterward, and prove the Run snapshot is unaffected', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const r = await mkRoute(provider.id);
    const kariakoo = await addStop(userId, r.id, 0, 'Kariakoo');
    await addStop(userId, r.id, 1, 'Mbagala');
    const bunju = await addStop(userId, r.id, 2, 'Bunju');

    const run = await runService.createRun(userId, { routeId: r.id, scheduledDeparture: new Date(Date.now() + 86400000) });
    const before = (await runService.getRunStops(run.id)).map((s) => ({ seq: s.sequence, label: s.locationLabel }));
    expect(before.map((s) => s.label)).toEqual(['Kariakoo', 'Mbagala', 'Bunju']);

    // Reorder the REUSABLE route via the real service method under test.
    await runService.reorderRouteStop(userId, r.id, bunju.id, 0);
    const liveAfterReorder = await runService.listRouteStops(userId, r.id);
    expect(liveAfterReorder.find((s) => s.id === bunju.id)!.sequence).toBe(0); // the live plan genuinely changed

    // The already-created Run's own itinerary is untouched.
    const after = (await runService.getRunStops(run.id)).map((s) => ({ seq: s.sequence, label: s.locationLabel }));
    expect(after).toEqual(before);
    expect(kariakoo.id).not.toBe(bunju.id); // sanity: distinct stops throughout
  });
});
