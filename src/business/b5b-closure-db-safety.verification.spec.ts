import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  B5B_TEST_DB_NAME,
  B5B_TEST_DB_USER,
  B5B_ALL_ENTITIES,
  getB5BTestConnectionConfig,
  assertSafeB5BTestSession,
  resetB5BTestSchema,
  bootstrapB5BTestSchema,
} from './b5b-closure-test-db';

/**
 * B5B closure mission -- one-time connectivity + isolation verification
 * for the dedicated local kentexa_b5b_test database/role, run BEFORE any
 * real closure test logic is written against it (per the mission's own
 * explicit gate: "continue the B5B test implementation only if those
 * checks pass"). Proves the role is exactly as least-privileged as
 * intended (owns its own database, cannot CREATEDB) and that the safety
 * gate genuinely aborts rather than silently doing nothing.
 *
 * Never touches `kentexa` or `postgres` -- the connection itself is only
 * ever opened against B5B_TEST_DB_NAME, and the one destructive
 * statement in this file goes through resetB5BTestSchema's own
 * assertSafeB5BTestSession gate like every other closure test will.
 */
describe('B5B closure — dedicated test DB connectivity + isolation verification', () => {
  const config = getB5BTestConnectionConfig();
  let client: Client;
  const reachable = !!config;

  beforeAll(async () => {
    if (!config) {
      // eslint-disable-next-line no-console
      console.warn(
        'B5B_TEST_DB_PASSWORD not set -- skipping B5B DB safety verification. ' +
        'This is expected until the dedicated kentexa_b5b_test role/database has been created and its ' +
        'password exported for this shell; it is never hardcoded or committed in this repo.',
      );
      return;
    }
    client = new Client(config);
    await client.connect();
  }, 30000);

  afterAll(async () => {
    if (client) await client.end();
  });

  it('connects as the dedicated role, to the dedicated database, and nothing else', async () => {
    if (!reachable) return;
    const { rows } = await client.query('SELECT current_database() AS db, current_user AS usr');
    expect(rows[0].db).toBe(B5B_TEST_DB_NAME);
    expect(rows[0].usr).toBe(B5B_TEST_DB_USER);
  });

  it('the dedicated database is owned by the dedicated role', async () => {
    if (!reachable) return;
    const { rows } = await client.query(
      `SELECT pg_catalog.pg_get_userbyid(d.datdba) AS owner FROM pg_database d WHERE d.datname = $1`,
      [B5B_TEST_DB_NAME],
    );
    expect(rows[0]?.owner).toBe(B5B_TEST_DB_USER);
  });

  it('the public schema is owned by the dedicated role (Postgres 15+ does not imply this from DB ownership alone)', async () => {
    if (!reachable) return;
    const { rows } = await client.query(
      `SELECT pg_catalog.pg_get_userbyid(n.nspowner) AS owner FROM pg_namespace n WHERE n.nspname = 'public'`,
    );
    expect(rows[0]?.owner).toBe(B5B_TEST_DB_USER);
  });

  it('the dedicated role has none of the cluster-level attributes (superuser/createdb/createrole/replication/bypassrls)', async () => {
    if (!reachable) return;
    const { rows } = await client.query(
      `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
       FROM pg_roles WHERE rolname = $1`,
      [B5B_TEST_DB_USER],
    );
    expect(rows[0]).toEqual({
      rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false,
    });
  });

  it('CREATE DATABASE is correctly denied (insufficient_privilege, 42501) -- never grant CREATEDB to make this pass', async () => {
    if (!reachable) return;
    await expect(client.query('CREATE DATABASE b5b_should_never_exist')).rejects.toMatchObject({ code: '42501' });
  });

  it('the safety gate itself aborts when pointed at the wrong database/user, before any destructive statement runs', async () => {
    if (!reachable) return;
    let destructiveStatementReached = false;
    const fakeWrongSession = {
      query: async (sql: string) => {
        if (/current_database/.test(sql)) return { rows: [{ db: 'kentexa', usr: 'postgres', session_usr: 'postgres' }] };
        destructiveStatementReached = true; // would only be hit by a real DROP SCHEMA
        return { rows: [] };
      },
    } as unknown as Client;

    await expect(assertSafeB5BTestSession(fakeWrongSession)).rejects.toThrow('B5B SAFETY ABORT');
    expect(destructiveStatementReached).toBe(false);
  });

  it('resetB5BTestSchema succeeds against the real, verified-safe session and leaves public owned by the dedicated role', async () => {
    if (!reachable) return;
    await resetB5BTestSchema(client);
    const { rows } = await client.query(
      `SELECT pg_catalog.pg_get_userbyid(n.nspowner) AS owner FROM pg_namespace n WHERE n.nspname = 'public'`,
    );
    expect(rows[0]?.owner).toBe(B5B_TEST_DB_USER);
  });

  it('the Kentexa migration/bootstrap path required by B5B succeeds inside the dedicated database (tables/enums/FKs/indexes)', async () => {
    if (!reachable || !config) return;
    await resetB5BTestSchema(client);
    await bootstrapB5BTestSchema(config);

    const { rows: tableRows } = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const tableNames = tableRows.map((r: any) => r.table_name);
    expect(tableNames).toEqual(expect.arrayContaining([
      'business', 'operational_workspace', 'business_membership', 'workspace_assignment',
      'business_capability', 'account_role', 'business_capability_application',
      'seller_profile', 'transport_provider', 'super_agent', 'user',
    ]));

    const { rows: enumRows } = await client.query(
      `SELECT typname FROM pg_type WHERE typname IN ('business_capability_code_enum', 'role_profile_type_enum')`,
    );
    expect(enumRows.map((r: any) => r.typname).sort()).toEqual(['business_capability_code_enum', 'role_profile_type_enum']);

    // The real synchronize:false DataSource the closure tests will actually
    // use against this same bootstrapped schema -- proves the full
    // TypeORM-facing path (not just raw SQL) works end to end.
    const ds = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user, password: config.password,
      database: config.database, synchronize: false, entities: B5B_ALL_ENTITIES,
    });
    await ds.initialize();
    const userRepo = ds.getRepository(User);
    const count = await userRepo.count();
    expect(count).toBe(0);
    await ds.destroy();
  }, 60000);
});
