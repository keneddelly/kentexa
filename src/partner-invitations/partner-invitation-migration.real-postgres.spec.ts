import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AddPartnerInvitation1792100000000 } from '../database/migrations/1792100000000-AddPartnerInvitation';

/**
 * Migration 1792100000000-AddPartnerInvitation against the owner's release test
 * database, kentexa_releasef_test, and ONLY that database. Everything runs inside one
 * transaction that is always rolled back, so the database is left exactly as found.
 *
 * Runs only when RELEASEF_TEST_DB_PASSWORD and RELEASEF_TEST_DB_USER are set
 * (host/port: RELEASEF_TEST_DB_HOST / RELEASEF_TEST_DB_PORT, default localhost:5432).
 */
const DB_NAME = 'kentexa_releasef_test';
const password = process.env.RELEASEF_TEST_DB_PASSWORD;
const user = process.env.RELEASEF_TEST_DB_USER;
const suite = password && user ? describe : describe.skip;

suite('AddPartnerInvitation migration on kentexa_releasef_test (rolled back)', () => {
  jest.setTimeout(60000);
  let ds: DataSource;

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres', host: process.env.RELEASEF_TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.RELEASEF_TEST_DB_PORT || '5432', 10),
      username: user, password, database: DB_NAME, synchronize: false, entities: [],
    });
    await ds.initialize();
    const [{ db }] = await ds.query('SELECT current_database() AS db');
    // Hard gate: never touch any other database.
    if (db !== DB_NAME) throw new Error(`Refusing to run: connected to ${db}, expected ${DB_NAME}`);
  });
  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  it('creates exactly the planned table, enums, keys and indexes; runs twice safely; leaves nothing behind', async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    const exists = async () => (await qr.query(`SELECT to_regclass('public.partner_invitation') AS t`))[0].t;
    expect(await exists()).toBeNull(); // not there before (and never applied to this database by this test)
    await qr.startTransaction();
    try {
      const migration = new AddPartnerInvitation1792100000000();
      await migration.up(qr);
      await migration.up(qr); // idempotent

      const cols = await qr.query(`
        SELECT column_name, is_nullable, udt_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'partner_invitation' ORDER BY ordinal_position`);
      expect(cols.map((c: any) => c.column_name)).toEqual([
        'id', 'invitedBySuperAgentId', 'invitedByUserId', 'parcelId', 'waybillNumber', 'invitedPhone', 'invitedName',
        'roleOffered', 'channel', 'tokenHash', 'status', 'expiresAt', 'openedAt', 'joinedAt', 'joinedUserId',
        'joinedApplicationId', 'createdAt', 'updatedAt',
      ]);
      const notNull = cols.filter((c: any) => c.is_nullable === 'NO').map((c: any) => c.column_name);
      expect(notNull).toEqual(expect.arrayContaining(['invitedBySuperAgentId', 'parcelId', 'waybillNumber', 'invitedPhone', 'roleOffered', 'channel', 'tokenHash', 'status', 'expiresAt']));

      const enumValues = async (t: string) => (await qr.query(
        `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`, [t],
      )).map((r: any) => r.enumlabel);
      expect(await enumValues('partner_invitation_status_enum')).toEqual(['sent', 'opened', 'joined', 'confirmed', 'expired']);
      expect(await enumValues('partner_invitation_role_enum')).toEqual(['transport_provider', 'super_agent']);
      expect(await enumValues('partner_invitation_channel_enum')).toEqual(['whatsapp', 'own_sms']);

      const fks = await qr.query(`
        SELECT kcu.column_name, ccu.table_name AS ref FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'partner_invitation' AND tc.constraint_type = 'FOREIGN KEY' ORDER BY kcu.column_name`);
      expect(fks.map((f: any) => `${f.column_name}->${f.ref}`)).toEqual([
        'invitedBySuperAgentId->super_agent', 'invitedByUserId->user', 'joinedUserId->user', 'parcelId->parcel',
      ]);
      const indexes = (await qr.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'partner_invitation'`)).map((r: any) => r.indexname);
      expect(indexes).toEqual(expect.arrayContaining(['UQ_partner_invitation_tokenHash', 'IDX_partner_invitation_inviter_status', 'IDX_partner_invitation_joined_user']));
    } finally {
      await qr.rollbackTransaction();
    }
    expect(await exists()).toBeNull();
    await qr.release();
  });
});
