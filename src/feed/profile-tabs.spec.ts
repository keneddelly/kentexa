import { CvsService } from './cvs.service';
import { CommunitiesService } from './communities.service';

/** New profiles part 2 (owner approved 2026-11-02): Majibu and Jumuiya on a person's profile. */
describe('Majibu', () => {
  const build = (type: string) => {
    const wheres: any[] = [];
    const qb: any = { innerJoin: () => qb, select: () => qb, orderBy: () => qb, limit: () => qb,
      where: (...a: any[]) => { wheres.push(a); return qb; }, andWhere: (...a: any[]) => { wheres.push(a); return qb; },
      getRawMany: async () => [{ id: 5, body: 'Ndiyo', createdAt: 'x', postId: 12, postTitle: 'T', postBody: 'Mnapata  wateja\nwapi?' }] };
    const svc: any = Object.create(CvsService.prototype);
    svc.feedRepo = { query: async () => [{ id: 76, ownerId: 47, type }], createQueryBuilder: () => qb };
    return { svc, wheres };
  };

  it('a person: replies made as the profile, and older ones by its owner without a profile; only on posts the viewer may see', async () => {
    const { svc, wheres } = build('personal');
    expect(await svc.getProfileReplies(76, 9)).toEqual([{ id: 5, body: 'Ndiyo', createdAt: 'x', post: { id: 12, text: 'Mnapata wateja wapi?' } }]);
    expect(wheres.some(([sql, p]) => /"authorId" = :rowner/.test(sql) && p.rowner === 47)).toBe(true);
    expect(wheres.some(([sql, p]) => /visibility = 'public'/.test(sql) && p?.feedViewerId === 9)).toBe(true);
  });

  it('a business: only replies made as that business', async () => {
    const { svc, wheres } = build('business');
    await svc.getProfileReplies(76, 9);
    expect(wheres.some(([sql]) => sql === 'pc."commerceProfileId" = :rpid')).toBe(true);
  });
});

describe('Jumuiya on a profile', () => {
  it('a business profile lists no communities; a person only open ones', async () => {
    const query = jest.fn(async (sql: string) => (sql.includes('FROM public.commerce_profile') ? [{ ownerId: 47, type: 'business' }] : []));
    const svc = new CommunitiesService({ query } as any, { record: jest.fn() } as any);
    expect(await svc.listForProfile(76)).toEqual([]);
    const q2 = jest.fn(async (sql: string) => (sql.includes('FROM public.commerce_profile') ? [{ ownerId: 47, type: 'personal' }] : []));
    await new CommunitiesService({ query: q2 } as any, { record: jest.fn() } as any).listForProfile(76);
    expect(q2.mock.calls[1][0]).toContain(`c."joinPolicy" = 'open'`);
  });
});
