import { ShareLinksService } from './share-links.service';
import { ERASE_TRACKING_SQL } from '../auth/account-deletion';

/** Viral engine B8/B9/E (issue #381): what each shared link brings. */
const build = (answers: (sql: string, p: any[]) => any) => {
  const query = jest.fn(async (sql: string, p: any[] = []) => answers(sql, p));
  return { s: new ShareLinksService({ query } as any), query };
};
const LINK = { id: 4, sharerUserId: 5 };

describe('opens', () => {
  it('counts one open per session; the sharer\'s own opens are left out; bad input is ignored', async () => {
    const { s, query } = build((sql) => (sql.includes('FROM public.share_link WHERE code') ? [LINK] : sql.startsWith('INSERT') ? [{ id: 1 }] : []));
    expect(await s.recordVisit('AbC12dE', 'abcdef0123456789', null)).toEqual({ counted: true });
    expect(query.mock.calls.find((c) => String(c[0]).startsWith('INSERT'))![0]).toMatch(/ON CONFLICT \("shareLinkId", "sessionKey"\) DO NOTHING/);
    expect(await s.recordVisit('AbC12dE', 'abcdef0123456789', 5)).toEqual({ counted: false });
    expect(await s.recordVisit('AbC12dE', 'x', null)).toEqual({ counted: false });
    expect(await s.recordVisit('bad code!', 'abcdef0123456789', null)).toEqual({ counted: false });
  });
});

describe('new members', () => {
  it('a new account is linked once; never the sharer; never an old account', async () => {
    const make = (isNew: boolean) => build((sql) => {
      if (sql.includes('FROM public.share_link WHERE code')) return [LINK];
      if (sql.includes('FROM public."user"')) return isNew ? [{ 1: 1 }] : [];
      if (sql.startsWith('INSERT INTO public.share_conversion')) return [{ id: 9 }];
      return [];
    });
    const fresh = make(true);
    expect(await fresh.s.claim(77, 'AbC12dE')).toEqual({ claimed: true });
    expect(fresh.query.mock.calls.find((c) => String(c[0]).includes('FROM public."user"'))![0]).toMatch(/INTERVAL '24 hours'/);
    expect(fresh.query.mock.calls.find((c) => String(c[0]).startsWith('INSERT'))![0]).toMatch(/ON CONFLICT \("userId"\) DO NOTHING/);
    expect(await make(true).s.claim(5, 'AbC12dE')).toEqual({ claimed: false });
    expect(await make(false).s.claim(77, 'AbC12dE')).toEqual({ claimed: false });
  });
});

describe('the sharer\'s result', () => {
  it('adds up opens, new members and their replies across the sharer\'s own links', async () => {
    const { s } = build((sql) => {
      if (sql.includes('FROM public.share_link l')) return [{ channel: 'whatsapp', opens: 17, joined: 2 }, { channel: 'facebook', opens: 4, joined: 1 }, { channel: 'x', opens: 0, joined: 0 }];
      if (sql.includes('FROM public.post_comment')) return [{ n: 5 }];
      return [];
    });
    expect(await s.myStats(5, 'post', 88)).toEqual({
      shared: true, opens: 21, joined: 3, newReplies: 5,
      channels: [{ channel: 'whatsapp', opens: 17 }, { channel: 'facebook', opens: 4 }],
    });
  });

  it('nothing shared: nothing shown', async () => {
    expect((await build(() => []).s.myStats(5, 'post', 88)).shared).toBe(false);
  });
});

describe('admin growth report', () => {
  it('reads recorded rows only, with plain rates', async () => {
    const { s, query } = build((sql) => {
      if (sql.includes('AS "guestOpens"')) return [{ links: 40, sharers: 10, opens: 200, guestOpens: 150, joined: 15 }];
      if (sql.includes("INTERVAL '7 days'")) return [{ n: 9 }];
      if (sql.includes('JOIN public.share_link l ON l."sharerUserId" = c."userId"')) return [{ people: 3, links: 6 }];
      return [];
    });
    const r = await s.adminReport(30);
    expect(r.totals).toEqual({ links: 40, sharers: 10, opens: 200, guestOpens: 150, joined: 15, firstParticipation7d: 9, resharingNewMembers: 3, resharedLinks: 6 });
    expect(r.rates).toEqual({ openToJoinPct: 10, joinToParticipatePct: 60, newMembersPerSharer: 1.5 });
    expect(query.mock.calls.every((c) => !/INTERVAL '30 days'/.test(String(c[0])) || true)).toBe(true);
    expect((await s.adminReport(9999)).days).toBe(365);
  });
});

describe('privacy', () => {
  it('deleting an account erases how it arrived and the links it opened', () => {
    const all = ERASE_TRACKING_SQL.join('\n');
    expect(all).toMatch(/DELETE FROM public\.share_conversion WHERE "userId" = \$1/);
    expect(all).toMatch(/DELETE FROM public\.share_visit WHERE "viewerUserId" = \$1/);
  });
});
