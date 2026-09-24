import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  B5B_BASE_ENTITIES,
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
} from '../../business/b5b-closure-test-db';
import {
  AddShipmentHubDecision1788274800000,
  SHIPMENT_HUB_DECISION_COLUMNS,
} from './1788274800000-AddShipmentHubDecision';
import { Shipment } from '../../shipments/entities/shipment.entity';
import { User } from '../../users/entities/user.entity';
import { SuperAgent } from '../../super-agents/entities/super-agent.entity';

/**
 * Stage 2F — executes the ACTUAL committed migration against a real
 * PostgreSQL (the dedicated kentexa_b5b_test database behind the existing
 * safety gate; never production). The genuinely pre-migration `shipment`
 * table is the real entity table with exactly the 5 hub-decision columns
 * removed. Skipped (not failed) when B5B_TEST_DB_PASSWORD is not configured.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('AddShipmentHubDecision1788274800000 — real PostgreSQL execution proof', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const up = async () => { const r = ds.createQueryRunner(); await new AddShipmentHubDecision1788274800000().up(r); await r.release(); };
  const down = async () => { const r = ds.createQueryRunner(); await new AddShipmentHubDecision1788274800000().down(r); await r.release(); };
  const columnInfo = async () => new Map<string, any>(
    (await ds.query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
         FROM information_schema.columns WHERE table_schema='public' AND table_name='shipment'`,
    )).map((r: any) => [r.column_name, r]),
  );
  const constraints = async () => (await ds.query(
    `SELECT conname, contype::text AS t, confdeltype::text AS del FROM pg_constraint WHERE conrelid='public.shipment'::regclass ORDER BY conname`,
  )) as Array<{ conname: string; t: string; del: string }>;
  const indexes = async () => (await ds.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='shipment' AND indexname LIKE 'IDX_shipment_%HubId'`,
  )) as Array<{ indexname: string; indexdef: string }>;
  const insertShipment = (extra: Record<string, unknown> = {}) => {
    const base: Record<string, unknown> = {
      requestedByUserId: 2, receiverName: 'R', receiverPhone: '0700', originCity: 'A', destinationCity: 'B', itemDescription: 'x', ...extra,
    };
    const cols = Object.keys(base);
    return ds.query(
      `INSERT INTO public.shipment (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
      Object.values(base),
    );
  };
  const rejects = async (p: Promise<unknown>, re: RegExp) => { await expect(p).rejects.toThrow(re); };

  let legacyBefore: any[];
  let hubId: number;

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, entities: [...B5B_BASE_ENTITIES, Shipment],
    });
    await ds.initialize();
    await ds.query(`ALTER TABLE public.shipment ${SHIPMENT_HUB_DECISION_COLUMNS.map((c) => `DROP COLUMN "${c}"`).join(', ')}`);

    const user = await ds.getRepository(User).save(ds.getRepository(User).create({ email: 'h@s2f.local', phone: '+255700000900', password: 'x', name: 'Hub' } as any));
    const hub = await ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({ userId: (user as any).id, businessName: 'H1', city: 'Dar es Salaam', status: 'active' } as any) as any) as any;
    hubId = hub.id;

    await ds.query(
      `INSERT INTO public.shipment ("requestedByUserId","receiverName","receiverPhone","originCity","destinationCity","itemDescription","weightKg","providerId","status","trackingNumber")
       VALUES (2,'Amina','0700000001','Dar es Salaam','Mwanza','Clothes',2,NULL,'pending','KTX-SHP-L1'),
              (2,'Juma','0700000002','Arusha','Dodoma','Box',1,5,'confirmed','KTX-SHP-L2')`,
    );
    legacyBefore = await ds.query(`SELECT * FROM public.shipment ORDER BY id`);
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  it('pre-migration: none of the 5 columns exist; legacy rows present', async () => {
    const cols = await columnInfo();
    for (const c of SHIPMENT_HUB_DECISION_COLUMNS) expect(cols.has(c)).toBe(false);
    expect(legacyBefore).toHaveLength(2);
  });

  it('UP adds exactly 5 nullable, default-less columns of the specified types; pre-existing columns untouched', async () => {
    const before = await columnInfo();
    await up();
    const after = await columnInfo();
    expect([...after.keys()].filter((k) => !before.has(k)).sort()).toEqual([...SHIPMENT_HUB_DECISION_COLUMNS].sort());
    expect(after.get('originHubId')).toMatchObject({ data_type: 'integer', is_nullable: 'YES', column_default: null });
    expect(after.get('destinationHubId')).toMatchObject({ data_type: 'integer', is_nullable: 'YES', column_default: null });
    expect(after.get('originHubSource')).toMatchObject({ data_type: 'character varying', character_maximum_length: 24, is_nullable: 'YES', column_default: null });
    expect(after.get('destinationHubSource')).toMatchObject({ data_type: 'character varying', character_maximum_length: 24, is_nullable: 'YES', column_default: null });
    expect(after.get('hubDecidedAt')).toMatchObject({ data_type: 'timestamp without time zone', is_nullable: 'YES', column_default: null });
    for (const [name, info] of before) expect(after.get(name)).toEqual(info);
  });

  it('UP creates the two FKs with ON DELETE SET NULL, the two partial indexes and the three CHECKs', async () => {
    const cs = await constraints();
    const byName = new Map(cs.map((c) => [c.conname, c]));
    for (const side of ['origin', 'destination']) {
      expect(byName.get(`FK_shipment_${side}_hub`)).toMatchObject({ t: 'f', del: 'n' });
      expect(byName.get(`CHK_shipment_${side}_hub_decision`)).toMatchObject({ t: 'c' });
    }
    expect(byName.get('CHK_shipment_hub_decision_atomic')).toMatchObject({ t: 'c' });
    const idx = await indexes();
    expect(idx.map((i) => i.indexname).sort()).toEqual(['IDX_shipment_destinationHubId', 'IDX_shipment_originHubId']);
    for (const i of idx) expect(i.indexdef).toMatch(/WHERE \(?"?(origin|destination)HubId"? IS NOT NULL\)?/);
  });

  it('after UP: legacy rows are byte-for-byte unchanged and NULL in every new field (no backfill)', async () => {
    const rows = await ds.query(`SELECT * FROM public.shipment ORDER BY id`);
    expect(rows).toHaveLength(2);
    rows.forEach((row: any, i: number) => {
      for (const c of SHIPMENT_HUB_DECISION_COLUMNS) { expect(row[c]).toBeNull(); delete row[c]; }
      expect(row).toEqual(legacyBefore[i]);
    });
  });

  it('UP is idempotent (a second run changes nothing and does not fail)', async () => {
    const before = JSON.stringify([await constraints(), await indexes(), [...(await columnInfo()).keys()].sort()]);
    await up();
    expect(JSON.stringify([await constraints(), await indexes(), [...(await columnInfo()).keys()].sort()])).toBe(before);
  });

  describe('constraint behaviour', () => {
    const ok = (extra: Record<string, unknown>) => insertShipment(extra);
    const at = new Date();
    it('accepts every valid decision shape', async () => {
      await ok({}); // undecided
      await ok({ originHubSource: 'not_required', destinationHubSource: 'not_required', hubDecidedAt: at });
      await ok({ originHubSource: 'none_available', destinationHubSource: 'not_required', hubDecidedAt: at });
      await ok({ originHubSource: 'sender_selected', originHubId: hubId, destinationHubSource: 'auto_single_candidate', destinationHubId: hubId, hubDecidedAt: at });
      // a naming source whose hub row is gone (id NULL) is legitimate history
      await ok({ originHubSource: 'sender_selected', originHubId: null, destinationHubSource: 'not_required', hubDecidedAt: at });
    });
    it('rejects an unknown source value', async () => {
      await rejects(ok({ originHubSource: 'bogus', destinationHubSource: 'not_required', hubDecidedAt: at }), /CHK_shipment_origin_hub_decision/);
    });
    it('rejects a hub id without a source, and a hub id with a non-naming source', async () => {
      await rejects(ok({ originHubId: hubId }), /CHK_shipment_origin_hub_decision/);
      await rejects(ok({ originHubSource: 'not_required', originHubId: hubId, destinationHubSource: 'not_required', hubDecidedAt: at }), /CHK_shipment_origin_hub_decision/);
      await rejects(ok({ originHubSource: 'not_required', destinationHubSource: 'none_available', destinationHubId: hubId, hubDecidedAt: at }), /CHK_shipment_destination_hub_decision/);
    });
    it('rejects a half-decided shipment (one side, or the timestamp, missing)', async () => {
      await rejects(ok({ originHubSource: 'not_required' }), /CHK_shipment_hub_decision_atomic/);
      await rejects(ok({ originHubSource: 'not_required', destinationHubSource: 'not_required' }), /CHK_shipment_hub_decision_atomic/);
      await rejects(ok({ hubDecidedAt: at }), /CHK_shipment_hub_decision_atomic/);
    });
    it('FK: rejects a hub that does not exist; deleting a hub NULLs the id and KEEPS the source', async () => {
      await rejects(ok({ originHubSource: 'sender_selected', originHubId: 999999, destinationHubSource: 'not_required', hubDecidedAt: at }), /FK_shipment_origin_hub/);
      const u = await ds.getRepository(User).save(ds.getRepository(User).create({ email: 'h2@s2f.local', phone: '+255700000901', password: 'x', name: 'Hub2' } as any));
      const h2: any = await ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({ userId: (u as any).id, businessName: 'H2', city: 'Arusha', status: 'active' } as any) as any);
      const [{ id }] = await ok({ originHubSource: 'sender_selected', originHubId: h2.id, destinationHubSource: 'auto_single_candidate', destinationHubId: h2.id, hubDecidedAt: at });
      await ds.query(`DELETE FROM public.super_agent WHERE id = $1`, [h2.id]);
      const [row] = await ds.query(`SELECT "originHubId","originHubSource","destinationHubId","destinationHubSource" FROM public.shipment WHERE id=$1`, [id]);
      expect(row).toEqual({ originHubId: null, originHubSource: 'sender_selected', destinationHubId: null, destinationHubSource: 'auto_single_candidate' });
    });
  });

  it('DOWN drops exactly the columns, constraints and indexes UP added and leaves legacy data intact; UP works again', async () => {
    await ds.query(`DELETE FROM public.shipment WHERE "trackingNumber" IS NULL`);
    await down();
    const cols = await columnInfo();
    for (const c of SHIPMENT_HUB_DECISION_COLUMNS) expect(cols.has(c)).toBe(false);
    expect((await constraints()).filter((c) => /hub/i.test(c.conname))).toEqual([]);
    expect(await indexes()).toEqual([]);
    expect(await ds.query(`SELECT * FROM public.shipment ORDER BY id`)).toEqual(legacyBefore);
    await down(); // idempotent
    await up();
    expect((await columnInfo()).has('originHubSource')).toBe(true);
  });
});
