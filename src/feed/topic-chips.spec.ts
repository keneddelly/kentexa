import { CvsService } from './cvs.service';

/**
 * Owner 2026-11-16: "Zote, Usafiri, Biashara... show zero posts while posts are tagged with them".
 * For You hides posts the viewer has already seen (so it keeps rotating); a chosen topic is a
 * place to look, like a tag page, so it shows all its posts, seen or not.
 */
const build = () => {
  const svc: any = Object.create(CvsService.prototype);
  const wheres: string[] = [];
  const qb: any = {};
  const selects: string[] = [];
  for (const m of ['leftJoin', 'orderBy', 'addOrderBy', 'setParameter', 'skip', 'take']) qb[m] = jest.fn(() => qb);
  qb.addSelect = jest.fn((x: any) => { selects.push(String(x)); return qb; });
  qb.where = jest.fn((w: any) => { wheres.push(String(w)); return qb; });
  qb.andWhere = jest.fn((w: any) => { wheres.push(String(w)); return qb; });
  qb.getManyAndCount = jest.fn().mockResolvedValue([[{ id: 7 }], 1]);
  qb.getMany = jest.fn().mockResolvedValue([]);
  svc.feedRepo = { createQueryBuilder: jest.fn(() => qb) };
  svc.getFollowedSellerIds = jest.fn().mockResolvedValue(new Set());
  svc.followedTopicKeys = jest.fn().mockResolvedValue([]);
  svc.getSavedPostIds = jest.fn().mockResolvedValue([]);
  svc.presentRealItems = jest.fn(async (items: any[]) => items);
  svc.talkDecayExpr = () => '1';
  svc.cvsDecayExpr = () => '1';
  return { svc, wheres, selects };
};
const hidesSeen = (wheres: string[]) => wheres.some((w) => w.includes("pe.type = 'view'"));

describe('topic chips on Home', () => {
  it('For You ranks what the viewer saw before this visit lower, never removes it (owner 2026-11-16)', async () => {
    const { svc, wheres, selects } = build();
    await svc.getFilteredFeed({ filter: 'for_you', userId: 5, page: 1, limit: 15, topic: null });
    expect(wheres.some((w) => w.includes("INTERVAL '30 minutes'"))).toBe(false); // not left out (the explore extras still skip seen ones)
    const rank = selects.find((x) => x.includes("pe.type = 'view'")) || '';
    expect(rank).toContain("INTERVAL '30 minutes'");
    expect(rank).toContain('THEN 0.35 ELSE 1 END');
  });

  it('the other tabs still leave out what was seen before this visit', async () => {
    const { svc, wheres } = build();
    await svc.getFilteredFeed({ filter: 'communities', userId: 5, page: 1, limit: 15, topic: null, communityIds: [3] });
    expect(hidesSeen(wheres)).toBe(true);
  });

  it('a chosen topic shows all its posts, seen or not', async () => {
    const { svc, wheres } = build();
    const out = await svc.getFilteredFeed({ filter: 'for_you', userId: 5, page: 1, limit: 15, topic: 'biashara' });
    expect(wheres).toContain('f.topic = :feedTopic');
    expect(hidesSeen(wheres)).toBe(false);
    expect(out.items).toHaveLength(1);
  });

  it('the same on the other tabs (Nearby, Bidhaa...)', async () => {
    const { svc, wheres } = build();
    await svc.getFilteredFeed({ filter: 'nearby', userId: 5, page: 1, limit: 15, topic: 'usafiri' });
    expect(hidesSeen(wheres)).toBe(false);
  });
});
