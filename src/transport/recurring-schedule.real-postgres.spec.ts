import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { TransportService } from './transport.service';
import { TransportRunService, isValidDepartureTime } from './transport-run.service';
import { RouteStop } from './entities/route-stop.entity';
import { TransportRun } from './entities/transport-run.entity';
import { TransportRunStop } from './entities/transport-run-stop.entity';
import { Vehicle } from './entities/vehicle.entity';
import { ProviderAvailability } from './entities/provider-availability.entity';
import { TransportProvider, ProviderStatus, ProviderType } from './entities/transport-provider.entity';
import { TransportRoute, RouteType } from './entities/transport-route.entity';
import { Shipment } from '../shipments/entities/shipment.entity';
import { TransportQuote } from './entities/transport-quote.entity';
import { User } from '../users/entities/user.entity';
import { ensureRouteStopDeferrableSequenceConstraint } from './route-stop-schema';
import { AddTransportRecurringSchedule1788291600000 } from '../database/migrations/1788291600000-AddTransportRecurringSchedule';

/**
 * Logistics repair Gate 1 — a recurring schedule can actually be saved.
 *
 * The audit (finding 4) found that createRecurringSchedule rejected EVERY
 * valid time: its HH:mm pattern doubled the backslashes inside a regex
 * literal. The pure check is pinned first (no database needed); the rest
 * proves, on real PostgreSQL with the real migration, that a 06:00 daily
 * schedule saves and produces dated Runs.
 */
describe('recurring schedule departure time (Gate 1)', () => {
  it.each(['06:00', '18:30', '23:59', '00:00', '09:05', '06:00:00'])('accepts %s', (t) => {
    expect(isValidDepartureTime(t)).toBe(true);
  });
  it.each(['6:00', '24:00', '06:60', '0600', '06.00', ' 06:00', '06:00 ', '', '0\\d:0\\d', null, undefined, 600])(
    'rejects %p',
    (t) => { expect(isValidDepartureTime(t as any)).toBe(false); },
  );
});

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('recurring schedule save — real PostgreSQL (Gate 1)', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let providers: Repository<TransportProvider>;
  let routes: Repository<TransportRoute>;
  let runService: TransportRunService;
  let userSeq = 0;

  const mkProviderWithUser = async () => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: `g1-${++userSeq}@gate1.local`, phone: `+2556${String(userSeq).padStart(8, '0')}`, password: 'x', name: 'P',
    } as any));
    const p = await providers.save(providers.create({
      name: 'Kentexa Van', type: ProviderType.VAN, status: ProviderStatus.VERIFIED, userId: (u as any).id,
    } as any) as unknown as TransportProvider);
    return { userId: (u as any).id as number, provider: p };
  };
  const mkRoute = (providerId: number) =>
    routes.save(routes.create({
      providerId, routeType: RouteType.LOCAL_LOOP, loopStops: ['Kariakoo', 'Mbagala'],
      pricePerKg: 500, fixedFee: 2000, isActive: true,
    } as any) as unknown as TransportRoute);
  const schedules = () => ds.query(`SELECT * FROM public.transport_route_schedule ORDER BY id`);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 10 },
      entities: [...B5B_BASE_ENTITIES, ProviderAvailability, TransportRoute, RouteStop, TransportRun, TransportRunStop, Vehicle, Shipment, TransportQuote],
    });
    await ds.initialize();
    await ensureRouteStopDeferrableSequenceConstraint((sql) => ds.query(sql));
    // The schedule table has no entity: it exists only through the real migration.
    const runner = ds.createQueryRunner();
    try { await new AddTransportRecurringSchedule1788291600000().up(runner); } finally { await runner.release(); }

    providers = ds.getRepository(TransportProvider);
    routes = ds.getRepository(TransportRoute);
    const args: any[] = new Array(15).fill({});
    args[0] = providers; args[1] = routes; args[14] = ds;
    const transport = new (TransportService as any)(...args);
    runService = new TransportRunService(
      ds.getRepository(RouteStop), routes, ds.getRepository(TransportRun), ds.getRepository(TransportRunStop),
      transport, { search: async () => [] } as any, ds, ds.getRepository(Vehicle),
    );
  });
  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });
  beforeEach(async () => {
    await ds.query(`DELETE FROM public.transport_route_schedule`);
    await ds.query(`TRUNCATE TABLE public.transport_run_stop RESTART IDENTITY CASCADE`);
    await ds.query(`TRUNCATE TABLE public.transport_run RESTART IDENTITY CASCADE`);
    await ds.query(`DELETE FROM public.route_stop`);
    await ds.query(`DELETE FROM public.transport_route`);
    await ds.query(`DELETE FROM public.transport_provider`);
  });

  it('saves a daily 06:00 schedule and materialises its dated Runs', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const route = await mkRoute(provider.id);
    await runService.addRouteStop(userId, route.id, { sequence: 0, locationLabel: 'Kariakoo' });
    await runService.addRouteStop(userId, route.id, { sequence: 1, locationLabel: 'Mbagala' });

    const saved = await runService.createRecurringSchedule(userId, {
      routeId: route.id, scheduleType: 'daily', departureTime: '06:00',
    } as any);

    expect(saved.id).toBeGreaterThan(0);
    const rows = await schedules();
    expect(rows).toHaveLength(1);
    expect(String(rows[0].departureTime).slice(0, 5)).toBe('06:00');
    expect(rows[0].isActive).toBe(true);

    const runs = await ds.query(
      `SELECT id, "scheduleId", "autoGenerated", "scheduledDeparture" FROM public.transport_run ORDER BY "scheduledDeparture"`,
    );
    // The default horizon is 14 days ahead; today's 06:00 may already be past.
    expect(runs.length).toBeGreaterThanOrEqual(14);
    expect(runs.every((r: any) => r.scheduleId === rows[0].id && r.autoGenerated === true)).toBe(true);
    // No two Runs of one schedule share a departure.
    expect(new Set(runs.map((r: any) => new Date(r.scheduledDeparture).toISOString())).size).toBe(runs.length);

    // Materialising again creates nothing new.
    const again = await runService.materializeRecurringRuns(userId, rows[0].id);
    expect(again.created).toBe(0);
  });

  it.each(['18:30', '23:59'])('also saves %s', async (time) => {
    const { userId, provider } = await mkProviderWithUser();
    const route = await mkRoute(provider.id);
    await runService.addRouteStop(userId, route.id, { sequence: 0, locationLabel: 'Kariakoo' });
    await runService.addRouteStop(userId, route.id, { sequence: 1, locationLabel: 'Mbagala' });
    await runService.createRecurringSchedule(userId, { routeId: route.id, scheduleType: 'daily', departureTime: time } as any);
    expect(await schedules()).toHaveLength(1);
  });

  it('still rejects a malformed time with a 400 and saves nothing', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const route = await mkRoute(provider.id);
    await runService.addRouteStop(userId, route.id, { sequence: 0, locationLabel: 'Kariakoo' });
    await runService.addRouteStop(userId, route.id, { sequence: 1, locationLabel: 'Mbagala' });
    await expect(runService.createRecurringSchedule(userId, {
      routeId: route.id, scheduleType: 'daily', departureTime: '6am',
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(await schedules()).toHaveLength(0);
  });

  it('refuses a route without a stop plan BEFORE saving, so a retry cannot duplicate the schedule', async () => {
    const { userId, provider } = await mkProviderWithUser();
    const route = await mkRoute(provider.id); // no stops
    await expect(runService.createRecurringSchedule(userId, {
      routeId: route.id, scheduleType: 'daily', departureTime: '06:00',
    } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(await schedules()).toHaveLength(0);
  });
});
