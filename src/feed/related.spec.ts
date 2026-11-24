import { CvsService } from './cvs.service';
import { CommunitiesService } from './communities.service';
import { ForbiddenException } from '@nestjs/common';

/** Viral engine C (issue #381): what to read next, and what invitations brought. */
describe('related discussions', () => {
  const build = (post: any) => {
    const svc: any = Object.create(CvsService.prototype);
    const wheres: string[] = [];
    const qb: any = {};
    for (const m of ['leftJoin', 'addSelect', 'orderBy', 'addOrderBy', 'take']) qb[m] = jest.fn(() => qb);
    qb.where = jest.fn((w: string) => { wheres.push(w); return qb; });
    qb.andWhere = jest.fn((w: string) => { wheres.push(String(w)); return qb; });
    qb.getMany = jest.fn().mockResolvedValue([{ id: 9 }]);
    svc.assertCanSeePost = jest.fn().mockResolvedValue(undefined);
    svc.feedRepo = {
      createQueryBuilder: jest.fn(() => qb),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT "communityId", topic')) return post ? [post] : [];
        if (sql.includes('FROM public.post_comment')) return [{ postId: 9, n: 4, last: null }];
        if (sql.includes('FROM public.community')) return [{ id: 4, name: 'Wakulima', memberCount: 12 }];
        return [];
      }),
    };
    svc.getFollowedSellerIds = jest.fn().mockResolvedValue(new Set());
    svc.presentRealItems = jest.fn(async (items: any[]) => items);
    return { svc, wheres };
  };

  it('same community first, then same topic, under the viewer\\'s visibility rules', async () => {
    const { svc, wheres } = build({ communityId: 3, topic: 'kilimo' });
    const r = await svc.getRelated(7, null);
    expect(svc.assertCanSeePost).toHaveBeenCalledWith(7, null);
    expect(wheres).toContain('(f."communityId" = :rc OR f.topic = :rt)');
    expect(wheres.some((w) => w.includes('feedViewerId') || w.length > 0)).toBe(true);
    expect(r.discussions).toEqual([{ id: 9, replyCount: 4, lastReplyAt: null }]);
    expect(r.communities).toEqual([{ id: 4, name: 'Wakulima', memberCount: 12 }]);
  });

  it('a post with no community and no topic returns empty recommendation collections', async () => {
    expect(await build({ communityId: null, topic: null }).svc.getRelated(7, null))
      .toEqual({ discussions: [], communities: [], businesses: [] });
  });
});

describe('invitation results', () => {
  it('moderators see what invitations brought; members do not', async () => {
    const query = jest.fn(async (sql: string, p: any[] = []) => {
      if (sql.includes('FROM public.community WHERE id = $1 AND status')) return [{ id: 3, joinPolicy: 'open', status: 'active' }];
      if (sql.includes('SELECT role, status FROM public.community_member')) return p[1] === 9 ? [{ role: 'admin', status: 'active' }] : [{ role: 'member', status: 'active' }];
      if (sql.includes('FROM public.share_link l')) return [{ links: 6, opens: 40, joined: 5 }];
      return [];
    });
    const svc = new CommunitiesService({ query } as any, { record: jest.fn() } as any);
    expect(await svc.invitationStats(3, 9)).toEqual({ links: 6, opens: 40, joined: 5 });
    await expect(svc.invitationStats(3, 4)).rejects.toThrow(ForbiddenException);
  });
});
