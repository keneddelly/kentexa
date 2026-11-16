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
  for (const m of ['leftJoin', 'addSelect', 'orderBy', 'addOrderBy', 'setParameter', 'skip', 'take']) qb[m] = jest.fn(() => qb);
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
  return { svc, wheres };
};
const hidesSeen = (wheres: string[]) => wheres.some((w) => w.includes("pe.type = 'view'"));

describe('topic chips on Home', () => {
  it('For You without a topic hides what the viewer has seen', async () => {
    const { svc, wheres } = build();
    await svc.getFilteredFeed({ filter: 'for_you', userId: 5, page: 1, limit: 15, topic: null });
    expect(hidesSeen(wheres)).toBe(true);
    // Owner 2026-11-16: only what was seen before this visit (over 30 minutes ago) leaves, so a
    // second read never swaps the posts on screen for older ones.
    expect(wheres.find((w) => w.includes("pe.type = 'view'"))).toContain("INTERVAL '30 minutes'");
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
