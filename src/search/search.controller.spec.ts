import { SearchController } from './search.controller';

describe('SearchController community discovery', () => {
  const makeController = (rows: any[][] = [[], []]) => {
    const controller = Object.create(SearchController.prototype) as SearchController;
    const query = jest.fn()
      .mockResolvedValueOnce(rows[0] || [])
      .mockResolvedValueOnce(rows[1] || []);
    (controller as any).dataSource = { query };
    return { controller, query };
  };

  it('returns matching active communities and published public discussions', async () => {
    const { controller, query } = makeController([
      [{ id: 4, name: 'Business & Entrepreneurship', purpose: 'Business ideas', topicKey: 'biashara', memberCount: 12, joinPolicy: 'open' }],
      [{ id: 19, title: 'How to grow a small shop', body: 'Share ideas', communityId: 4, communityName: 'Business & Entrepreneurship' }],
    ]);

    const result = await controller.searchCommunities('business', { user: { id: 8 } });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1]).toEqual([['%business%', '%busines%'], 8]);
    expect(query.mock.calls[0][0]).toContain("c.status = 'active'");
    expect(query.mock.calls[0][0]).toContain("c.\"joinPolicy\" = 'open' OR EXISTS");
    expect(query.mock.calls[1][0]).toContain("f.status::text = 'published'");
    expect(query.mock.calls[1][0]).toContain("f.visibility::text = 'public'");
    expect(result.communities[0]).toMatchObject({ id: 4, _type: 'community', intentRef: { destination: 'Community-4' } });
    expect(result.discussions[0]).toMatchObject({ id: 19, _type: 'community_post', communityId: 4 });
  });

  it('keyword-searches public Moments while excluding hidden, muted and community-only posts', async () => {
    const controller = Object.create(SearchController.prototype) as SearchController;
    const query = jest.fn().mockResolvedValue([{ id: 27, title: 'Business update' }]);
    (controller as any).dataSource = { query };

    const result = await controller.searchMoments('business', { user: { id: 11 } });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([['%business%', '%busines%'], 11]);
    expect(query.mock.calls[0][0]).toContain('f."communityId" IS NULL');
    expect(query.mock.calls[0][0]).toContain("f.visibility::text = 'public'");
    expect(query.mock.calls[0][0]).toContain('public.commerce_profile hp');
    expect(query.mock.calls[0][0]).toContain('public.profile_mute pm');
    expect(result[0]).toMatchObject({ id: 27, _type: 'moment', intentRef: { destination: 'Home' } });
  });

  it('returns empty results without querying for short input', async () => {
    const { controller, query } = makeController();
    await expect(controller.searchCommunities('a', { user: null })).resolves.toEqual({ communities: [], discussions: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps request-only community content behind active membership checks', async () => {
    const { controller, query } = makeController();
    await controller.searchCommunities('kilimo', { user: null });
    for (const [sql] of query.mock.calls) {
      expect(sql).toContain('public.community_member');
      expect(sql).toContain('cm.status = \'active\'');
      expect(sql).toContain("c.\"joinPolicy\" = 'open' OR EXISTS");
    }
  });
});
