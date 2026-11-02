import { Client } from 'pg';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { VISIBLE_TO_VIEWER, NOT_MUTED_BY_VIEWER } from '../commerce-profiles/public-visibility';

/**
 * Social Engagement phase A (owner 2026-11-01): a followers-only post is seen only by its
 * author and the followers of the identity that posted it, on every feed read. This runs the
 * exact SQL condition every feed query uses against real PostgreSQL.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('feed post visibility: real PostgreSQL', () => {
  jest.setTimeout(60000);
  let client: Client;
  const visibleTo = async (viewer: number) => {
    const sql = `SELECT f.id FROM public.business_feed_item f WHERE ${VISIBLE_TO_VIEWER('f').replace(/:feedViewerId/g, '$1')} ORDER BY f.id`;
    return (await client.query(sql, [viewer])).rows.map((r) => Number(r.id));
  };

  beforeAll(async () => {
    client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.query(`CREATE TABLE public.business_feed_item (id int PRIMARY KEY, "businessId" int NOT NULL,
      "commerceProfileId" int, visibility text NOT NULL DEFAULT 'public')`);
    await client.query('CREATE TABLE public.commerce_profile (id int PRIMARY KEY, type text NOT NULL)');
    await client.query('CREATE TABLE public.commerce_profile_follow (id serial PRIMARY KEY, "followerId" int NOT NULL, "commerceProfileId" int NOT NULL)');
    await client.query('CREATE TABLE public.follow (id serial PRIMARY KEY, "followerId" int, "sellerId" int)');
    await client.query('CREATE TABLE public.profile_mute (id serial PRIMARY KEY, "userId" int NOT NULL, "mutedProfileId" int, "mutedUserId" int)');
    // Owner 10 has a personal profile (100) and a business (200).
    await client.query("INSERT INTO public.commerce_profile VALUES (100, 'personal'), (200, 'business')");
    await client.query(`INSERT INTO public.business_feed_item VALUES
      (1, 10, 200, 'public'),
      (2, 10, 200, 'followers'),
      (3, 10, 100, 'followers'),
      (4, 10, 200, 'limited'),
      (5, 10, NULL, 'followers')`);
    // 21 follows the business profile; 22 follows the personal profile; 23 has a legacy account follow.
    await client.query('INSERT INTO public.commerce_profile_follow ("followerId","commerceProfileId") VALUES (21, 200), (22, 100)');
    await client.query('INSERT INTO public.follow ("followerId","sellerId") VALUES (23, 10)');
  });
  afterAll(async () => { if (client) await client.end(); });

  it('a stranger and a logged-out viewer see public posts only', async () => {
    expect(await visibleTo(99)).toEqual([1]);
    expect(await visibleTo(0)).toEqual([1]);
  });

  it('the author sees every own post', async () => {
    expect(await visibleTo(10)).toEqual([1, 2, 3, 4, 5]);
  });

  it('a follower of the business sees its followers-only posts, never the owner\'s personal ones', async () => {
    expect(await visibleTo(21)).toEqual([1, 2, 4]);
  });

  it('a follower of the personal profile sees that profile\'s posts only', async () => {
    expect(await visibleTo(22)).toEqual([1, 3]);
  });

  it('a legacy account follow counts for business and untagged posts, not personal ones', async () => {
    expect(await visibleTo(23)).toEqual([1, 2, 4, 5]);
  });

  it('phase F: a mute hides that identity from the person who muted only', async () => {
    // 31 mutes the business profile 200; 32 mutes the legacy account 10 (posts without a profile).
    await client.query('INSERT INTO public.profile_mute ("userId","mutedProfileId","mutedUserId") VALUES (31, 200, NULL), (32, NULL, 10)');
    const notMuted = async (viewer: number) => {
      const sql = `SELECT f.id FROM public.business_feed_item f WHERE ${NOT_MUTED_BY_VIEWER('f').replace(/:feedViewerId/g, '$1')} ORDER BY f.id`;
      return (await client.query(sql, [viewer])).rows.map((r) => Number(r.id));
    };
    expect(await notMuted(31)).toEqual([3, 5]);
    expect(await notMuted(32)).toEqual([1, 2, 3, 4]);
    expect(await notMuted(99)).toEqual([1, 2, 3, 4, 5]);
  });
});
