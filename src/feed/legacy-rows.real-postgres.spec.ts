import { Client } from 'pg';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { UNSTAMPED_FOR } from '../commerce-profiles/legacy-rows';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';

/**
 * Owner 2026-11-02: a second business (ABC hotel) on the account of BIS showed BIS's orders.
 * Unstamped rows belong to the account's original identities only, never to a business
 * profile opened later. Runs the exact SQL condition against real PostgreSQL.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('unstamped rows and a second business: real PostgreSQL', () => {
  jest.setTimeout(60000);
  let client: Client;
  const ordersFor = async (cpid: number) => {
    const sql = `SELECT o.id FROM public."order" o WHERE o."sellerId" = 10 AND (o."commerceProfileId" = $1 OR ${UNSTAMPED_FOR('o', 'cpid').replace(/:cpid/g, '$1')}) ORDER BY o.id`;
    return (await client.query(sql, [cpid])).rows.map((r) => Number(r.id));
  };

  beforeAll(async () => {
    client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.query('CREATE TABLE public.commerce_profile (id int PRIMARY KEY, "ownerId" int NOT NULL, type text NOT NULL)');
    await client.query('CREATE TABLE public."order" (id int PRIMARY KEY, "sellerId" int NOT NULL, "commerceProfileId" int)');
    // Account 10: personal 100, BIS business 200 (first), ABC hotel 300 (opened later).
    await client.query(`INSERT INTO public.commerce_profile VALUES (100, 10, 'personal'), (200, 10, 'business'), (300, 10, 'business')`);
    // 1: old BIS order without a stamp; 2: stamped BIS; 3: stamped ABC.
    await client.query('INSERT INTO public."order" VALUES (1, 10, NULL), (2, 10, 200), (3, 10, 300)');
  });
  afterAll(async () => { if (client) await client.end(); });

  it('the first business keeps its old unstamped orders', async () => {
    expect(await ordersFor(200)).toEqual([1, 2]);
  });

  it('a business opened later sees only its own orders', async () => {
    expect(await ordersFor(300)).toEqual([3]);
  });

  it('the personal profile keeps seeing unstamped rows as before', async () => {
    expect(await ordersFor(100)).toEqual([1]);
  });
});

describe('the business profile of a Business', () => {
  const build = (linked: any, oldest: any) => {
    const svc: any = Object.create(CommerceProfilesService.prototype);
    svc.repo = { findOne: jest.fn(async ({ where }: any) => (where.businessId ? linked : oldest)) };
    return svc;
  };
  it('is the profile linked to it', async () => {
    expect(await build({ id: 300, businessId: 7 }, { id: 200, businessId: 5 }).findByBusinessId(10, 7)).toEqual({ id: 300, businessId: 7 });
  });
  it('never borrows the profile of another Business on the same account', async () => {
    expect(await build(null, { id: 200, businessId: 5 }).findByBusinessId(10, 7)).toBeNull();
  });
  it('an old Business without a link still gets the account\'s unlinked business profile', async () => {
    expect(await build(null, { id: 200, businessId: null }).findByBusinessId(10, 5)).toEqual({ id: 200, businessId: null });
  });
});
