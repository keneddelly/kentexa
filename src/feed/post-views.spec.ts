import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PostViewsService } from './post-views.service';

/** Post views (owner approved 2026-11-16: "count readers like Reels views"). */
describe('post views', () => {
  it('a guest read counts once per post per browser, public posts only, with a random key', async () => {
    const query = jest.fn(async (sql: string) => (sql.includes('INSERT INTO public.post_guest_view') ? [{ id: 1 }] : []));
    const svc = new PostViewsService({ query } as any);
    await expect(svc.guestView(7, 'bad key!', false)).rejects.toThrow(BadRequestException);
    expect(await svc.guestView(7, 'abcdef0123456789', true)).toEqual({ counted: true });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('ON CONFLICT ("postId", "sessionKey") DO NOTHING');
    expect(sql).toContain("visibility::text = 'public'");
    expect(query.mock.calls[0][1]).toEqual([7, 'abcdef0123456789', true]);
  });

  it('only the writer sees the numbers: total = signed-in readers + guests', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM public.business_feed_item WHERE id = $1')) return [{ id: 7, businessId: 5, viewCount: 12 }];
      if (sql.includes("FROM public.post_engagement WHERE")) return [{ n: 12 }];
      if (sql.includes('FROM public.post_guest_view WHERE "postId" = $1')) return [{ n: 30, shared: 21 }];
      if (sql.includes('generate_series')) return [{ day: '2026-11-16', views: 9 }];
      return [];
    });
    const svc = new PostViewsService({ query } as any);
    await expect(svc.stats(7, 6)).rejects.toThrow(ForbiddenException);
    expect(await svc.stats(7, 5)).toEqual({ total: 42, members: 12, guests: 30, fromShares: 21, days: [{ day: '2026-11-16', views: 9 }] });
  });

  it('guest counts for a page of posts in one query', async () => {
    const query = jest.fn(async () => [{ postId: 7, n: 4 }]);
    const map = await new PostViewsService({ query } as any).guestCounts([7, 8]);
    expect(map.get(7)).toBe(4);
    expect(map.get(8)).toBeUndefined();
  });
});
