import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';

/** Owner 2026-11-02: Home's "Biashara" tab lists every public business on KenteXa. */
describe('business directory', () => {
  it('public, active businesses only, verified and most followed first, at most 60', async () => {
    const svc: any = Object.create(CommerceProfilesService.prototype);
    svc.repo = { findAndCount: jest.fn().mockResolvedValue([[{ id: 75, ownerId: 9, displayName: 'Bishoo', isVerified: true, followersCount: 3 }], 1]) };
    const out = await svc.businessDirectory(500, -3);
    expect(svc.repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: 'business', status: 'active', hiddenFromPublic: false },
      order: { isVerified: 'DESC', followersCount: 'DESC', id: 'ASC' },
      take: 60, skip: 0,
    }));
    expect(out).toEqual({ total: 1, items: [expect.objectContaining({ id: 75, ownerId: 9, displayName: 'Bishoo' })] });
  });
});

describe('feed trays (owner approved 2026-11-16)', () => {
  it('the directory also lists offices, agents, service providers and transporters; never personal profiles', async () => {
    const svc: any = Object.create(CommerceProfilesService.prototype);
    svc.repo = { findAndCount: jest.fn().mockResolvedValue([[], 0]) };
    await svc.businessDirectory(10, 0, 'hub');
    expect(svc.repo.findAndCount.mock.calls[0][0].where.type).toBe('hub');
    await svc.businessDirectory(10, 0, 'personal');
    expect(svc.repo.findAndCount.mock.calls[1][0].where.type).toBe('business');
  });

  it('conversation trays come from public content only, and empty lists stay empty', async () => {
    const { TraysService } = require('./trays.service');
    const sqls: string[] = [];
    const query = jest.fn(async (sql: string) => {
      sqls.push(sql);
      if (sql.includes("intent::text = 'article'")) return [{ id: 4, title: 'Jinsi ya kuanza', body: '## Utangulizi\nManeno **mazito**', media: [{ url: 'c.jpg' }], owner: 'Asha', replies: 3, likes: 2 }];
      return [];
    });
    const out = await new TraysService({ query }).trays(new Date('2026-11-16T10:00:00Z'));
    expect(out.articles[0]).toEqual(expect.objectContaining({ id: 4, cover: 'c.jpg', excerpt: 'Utangulizi Maneno mazito', minutes: 1 }));
    expect(out.questions).toEqual([]);
    expect(out.polls).toEqual([]);
    expect(sqls.filter((s) => s.includes('business_feed_item x')).every((s) => s.includes("visibility::text = 'public'"))).toBe(true);
  });
});
