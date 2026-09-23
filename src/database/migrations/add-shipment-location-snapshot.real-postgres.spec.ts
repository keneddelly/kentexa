import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
} from '../../business/b5b-closure-test-db';
import {
  AddShipmentLocationSnapshot1788271200000,
  SHIPMENT_LOCATION_SNAPSHOT_COLUMNS,
} from './1788271200000-AddShipmentLocationSnapshot';
import { Shipment } from '../../shipments/entities/shipment.entity';

/**
 * Stage 2B — executes the ACTUAL committed migration against a real
 * PostgreSQL, using the repository's dedicated kentexa_b5b_test database and
 * its hard safety gate (resetB5BTestSchema refuses to run against anything
 * but that exact database/role). Never touches production or any other
 * database.
 *
 * The genuinely pre-migration `shipment` table is built from the real
 * Shipment entity and then has exactly the 14 snapshot columns removed, so
 * every legacy column/enum keeps its true shape. Skipped (not failed) when
 * B5B_TEST_DB_PASSWORD is not configured on the machine, like the other
 * closure specs that need this database.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('AddShipmentLocationSnapshot1788271200000 — real PostgreSQL execution proof', () => {
  let ds: DataSource;

  const columnInfo = async () => {
    const rows = await ds.query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'shipment'`,
    );
    return new Map<string, any>(rows.map((r: any) => [r.column_name, r]));
  };

  const legacyRowIds: number[] = [];
  let legacyBefore: any[];

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user,
      password: config!.password, database: config!.database, synchronize: true, entities: [Shipment],
    });
    await ds.initialize();

    // Turn the current-entity table into the true PRE-migration shape.
    const drops = SHIPMENT_LOCATION_SNAPSHOT_COLUMNS.map((c) => `DROP COLUMN "${c}"`).join(', ');
    await ds.query(`ALTER TABLE public.shipment ${drops}`);

    // Representative legacy rows: pending + confirmed, with and without ward/region ids.
    const inserted = await ds.query(
      `INSERT INTO public.shipment
         ("requestedByUserId","receiverName","receiverPhone","originCity","originRegionId","originWard","originWardId",
          "destinationCity","destinationRegionId","itemDescription","weightKg","providerId","status","trackingNumber")
       VALUES
         (2,'Amina','0700000001','Dar es Salaam',1,'Mbezi',12,'Mwanza',9,'Clothes',2,NULL,'pending','KTX-SHP-L1'),
         (2,'Juma','0700000002','Arusha',NULL,NULL,NULL,'Dodoma',NULL,'Box',1,5,'confirmed','KTX-SHP-L2')
       RETURNING id`,
    );
    legacyRowIds.push(...inserted.map((r: any) => r.id));
    legacyBefore = await ds.query(`SELECT * FROM public.shipment ORDER BY id`);
  }, 60000);

  afterAll(async () => {
    if (ds) await ds.destroy().catch(() => {});
  });

  it('pre-migration: none of the 14 snapshot columns exist, legacy rows are present', async () => {
    const cols = await columnInfo();
    for (const c of SHIPMENT_LOCATION_SNAPSHOT_COLUMNS) expect(cols.has(c)).toBe(false);
    expect(legacyRowIds).toHaveLength(2);
  });

  it('UP adds exactly the 14 columns, all nullable, no default, with the expected types/lengths', async () => {
    const before = await columnInfo();
    const runner = ds.createQueryRunner();
    await new AddShipmentLocationSnapshot1788271200000().up(runner);
    await runner.release();
    const after = await columnInfo();

    const added = [...after.keys()].filter((k) => !before.has(k)).sort();
    expect(added).toEqual([...SHIPMENT_LOCATION_SNAPSHOT_COLUMNS].sort());

    for (const side of ['origin', 'destination']) {
      const c = (s: string) => after.get(`${side}${s}`);
      expect(c('LocationLabel')).toMatchObject({ data_type: 'character varying', character_maximum_length: 200 });
      expect(c('Latitude')).toMatchObject({ data_type: 'double precision' });
      expect(c('Longitude')).toMatchObject({ data_type: 'double precision' });
      expect(c('RegionName')).toMatchObject({ data_type: 'character varying', character_maximum_length: 120 });
      expect(c('DistrictName')).toMatchObject({ data_type: 'character varying', character_maximum_length: 120 });
      expect(c('ProviderKey')).toMatchObject({ data_type: 'character varying', character_maximum_length: 40 });
      expect(c('ResolutionMethod')).toMatchObject({ data_type: 'character varying', character_maximum_length: 40 });
    }
    for (const name of SHIPMENT_LOCATION_SNAPSHOT_COLUMNS) {
      expect(after.get(name).is_nullable).toBe('YES');
      expect(after.get(name).column_default).toBeNull();
    }
    // Pre-existing columns untouched (same nullability/type as before).
    for (const [name, info] of before) expect(after.get(name)).toEqual(info);
  });

  it('after UP: legacy rows are byte-for-byte unchanged and NULL in every new field (no backfill)', async () => {
    const rows = await ds.query(`SELECT * FROM public.shipment ORDER BY id`);
    expect(rows).toHaveLength(2);
    rows.forEach((row: any, i: number) => {
      for (const name of SHIPMENT_LOCATION_SNAPSHOT_COLUMNS) expect(row[name]).toBeNull();
      const { ...legacyPart } = row;
      for (const name of SHIPMENT_LOCATION_SNAPSHOT_COLUMNS) delete legacyPart[name];
      expect(legacyPart).toEqual(legacyBefore[i]);
    });
  });

  it('after UP: the real Shipment entity reads legacy rows and round-trips a snapshot', async () => {
    const repo = ds.getRepository(Shipment);
    const legacy = await repo.findOneByOrFail({ trackingNumber: 'KTX-SHP-L1' });
    expect(legacy.originCity).toBe('Dar es Salaam');
    expect(legacy.originLatitude).toBeNull();
    expect(legacy.originLocationLabel).toBeNull();

    const fresh = await repo.save(repo.create({
      requestedByUserId: 2, receiverName: 'R', receiverPhone: '0', originCity: 'A', destinationCity: 'B',
      itemDescription: 'x', originLocationLabel: 'Mbezi, Kinondoni', originLatitude: -6.75, originLongitude: 39.2,
      originProviderKey: 'tz_seed', originResolutionMethod: 'admin_seed',
    }));
    const reread = await repo.findOneByOrFail({ id: fresh.id });
    expect(reread.originLatitude).toBe(-6.75); // double precision -> number, no string coercion
    expect(reread.originLongitude).toBe(39.2);
    expect(reread.destinationLocationLabel).toBeNull();
    await repo.delete(fresh.id);
  });

  it('after UP: entity metadata and the real schema agree (no pending schema diff for shipment)', async () => {
    const sqlInMemory = await ds.driver.createSchemaBuilder().log();
    const shipmentDiffs = sqlInMemory.upQueries.filter((q) => /"?shipment"?\b/.test(q.query) && !/"?shipment_/.test(q.query));
    expect(shipmentDiffs.map((q) => q.query)).toEqual([]);
  });

  it('DOWN removes exactly the 14 new columns and nothing else; legacy rows survive intact', async () => {
    const withColumns = await columnInfo();
    const runner = ds.createQueryRunner();
    await new AddShipmentLocationSnapshot1788271200000().down(runner);
    await runner.release();
    const after = await columnInfo();

    const removed = [...withColumns.keys()].filter((k) => !after.has(k)).sort();
    expect(removed).toEqual([...SHIPMENT_LOCATION_SNAPSHOT_COLUMNS].sort());
    expect(after.size).toBe(withColumns.size - 14);

    const rows = await ds.query(`SELECT * FROM public.shipment ORDER BY id`);
    expect(rows).toEqual(legacyBefore);
  });
});
