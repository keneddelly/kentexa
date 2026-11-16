import { CvsService } from './cvs.service';

/** D2 community redesign (owner approved 2026-11-16): sort, search, unanswered, who is talking, poll bars. */
describe('community threads D2', () => {
  const now = new Date();
  const build = (opts: { voted?: boolean; policy?: string; closed?: boolean } = {}) => {
    const svc: any = Object.create(CvsService.prototype);
    const wheres: string[] = [];
    const orders: string[] = [];
    const params: any[] = [];
    const makeQb = (): any => {
      const qb: any = {};
      for (const m of ['leftJoin', 'addSelect', 'skip', 'take', 'where']) qb[m] = jest.fn(() => qb);
      qb.andWhere = jest.fn((w: string, p?: any) => { wheres.push(String(w)); if (p) params.push(p); return qb; });
      qb.orderBy = jest.fn((o: string) => { orders.push(o); return qb; });
      qb.addOrderBy = jest.fn((o: string) => { orders.push(o); return qb; });
      qb.clone = jest.fn(() => { const c = makeQb(); c.getCount = jest.fn().mockResolvedValue(2); return c; });
      qb.getManyAndCount = jest.fn().mockResolvedValue([[{ id: 9 }, { id: 10 }], 2]);
      return qb;
    };
    svc.feedRepo = {
      createQueryBuilder: jest.fn(() => makeQb()),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)::int AS n')) return [{ postId: 9, n: 3, last: now }];
        if (sql.includes('FROM public.post_poll p')) {
          return [{
            postId: 10, closesAt: new Date(Date.now() + (opts.closed ? -1 : 1) * 86400000), resultPolicy: opts.policy || 'after_vote',
            votes: 10, voted: !!opts.voted, options: [{ label: 'Jumamosi', votes: 6 }, { label: 'Jumatatu', votes: 4 }],
          }];
        }
        if (sql.includes('GROUP BY pc."postId", pc."authorId"')) {
          return [
            { postId: 9, authorId: 1, name: 'Bob', photo: 'b.png', last: now },
            { postId: 9, authorId: 2, name: 'Asha', photo: null, last: now },
            { postId: 9, authorId: 3, name: 'Juma', photo: null, last: now },
            { postId: 9, authorId: 4, name: 'Neema', photo: null, last: now },
          ];
        }
        return [];
      }),
    };
    svc.getFollowedSellerIds = jest.fn().mockResolvedValue(new Set());
    svc.getSavedPostIds = jest.fn().mockResolvedValue([]);
    svc.presentRealItems = jest.fn(async () => [
      { id: 9, intent: 'question', createdAt: new Date(Date.now() - 86400000), business: { id: 4 } },
      { id: 10, intent: 'poll', createdAt: new Date(Date.now() - 86400000), business: { id: 5 } },
    ]);
    return { svc, wheres, orders, params };
  };

  it('latest: pinned first, then activity; carries who is talking (3 at most) and the unanswered count', async () => {
    const { svc, orders } = build();
    const r = await svc.getCommunityThreads(3, 7, 1);
    expect(orders.slice(0, 2)).toEqual(['pin_rank', 'activity_at']);
    expect(r.unanswered).toBe(2);
    expect(r.items[0].replyCount).toBe(3);
    expect(r.items[0].participants.map((p: any) => p.name)).toEqual(['Bob', 'Asha', 'Juma']);
    expect(r.items[0].lastReplyBy).toBe('Bob');
    expect(r.items[1].participants).toEqual([]);
  });

  it('top sorts by talk in the last 14 days; unanswered keeps only posts with no reply (not polls)', async () => {
    const top = build();
    await top.svc.getCommunityThreads(3, 7, 1, null, null, 'top');
    expect(top.orders[0]).toBe('talk_14d');
    const un = build();
    await un.svc.getCommunityThreads(3, 7, 1, null, null, 'unanswered');
    expect(un.wheres.filter((w) => w.includes('NOT EXISTS')).length).toBeGreaterThan(0);
    expect(un.wheres.some((w) => w.includes("IS DISTINCT FROM 'poll'"))).toBe(true);
    expect(un.orders[0]).toBe('f.createdAt');
  });

  it('search looks in title and body, with % and _ taken as plain letters', async () => {
    const { svc, wheres, params } = build();
    await svc.getCommunityThreads(3, 7, 1, null, null, 'latest', 'bei 50%');
    expect(wheres).toContain('(f.title ILIKE :cq OR f.body ILIKE :cq)');
    expect(params.find((p) => p.cq)?.cq).toBe('%bei 50\\%%');
  });

  it('poll bars: percentages only where the poll shows results (after the viewer voted)', async () => {
    const hidden = (await build().svc.getCommunityThreads(3, 7, 1)).items[1].poll;
    expect(hidden.showResults).toBe(false);
    expect(hidden.options).toEqual([{ label: 'Jumamosi', pct: null }, { label: 'Jumatatu', pct: null }]);
    const voted = (await build({ voted: true }).svc.getCommunityThreads(3, 7, 1)).items[1].poll;
    expect(voted.options.map((o: any) => o.pct)).toEqual([60, 40]);
    expect(voted.voted).toBe(true);
    const closed = (await build({ closed: true }).svc.getCommunityThreads(3, 7, 1)).items[1].poll;
    expect(closed.closed).toBe(true);
    expect(closed.showResults).toBe(true);
  });
});
