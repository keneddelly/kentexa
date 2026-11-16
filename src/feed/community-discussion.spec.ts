import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommunitiesService } from './communities.service';

/** #374 D: communities built for discussion: pin, close replies, "Jibu bora", last visit. */
type Member = { role: string; status: string };
const build = (o: { members?: Record<number, Member>; post?: any; pinnedOthers?: number; comment?: boolean; prevSeen?: string | null } = {}) => {
  const members: Record<number, Member> = { ...(o.members || {}) };
  const post = o.post === undefined ? { id: 7, businessId: 5, pinnedAt: null, repliesLocked: false, bestCommentId: null } : o.post;
  const updates: { sql: string; p: any[] }[] = [];
  const query = jest.fn(async (sql: string, p: any[] = []) => {
    if (sql.includes('FROM public.community WHERE id = $1 AND status')) return [{ id: 3, joinPolicy: 'open', status: 'active' }];
    if (sql.includes('SELECT role, status FROM public.community_member')) return members[p[1]] ? [members[p[1]]] : [];
    if (sql.includes('FROM public.business_feed_item\n        WHERE id = $1 AND "communityId" = $2')) return post ? [post] : [];
    if (sql.includes('COUNT(*)::int AS n FROM public.business_feed_item')) return [{ n: o.pinnedOthers ?? 0 }];
    if (sql.includes('FROM public.post_comment WHERE id = $1')) return o.comment === false ? [] : [{ id: p[0] }];
    if (sql.includes('UPDATE public.community_member m SET "lastSeenAt"')) return [[{ prev: o.prevSeen ?? null }], 1];
    if (sql.startsWith('UPDATE')) { updates.push({ sql, p }); return []; }
    return [];
  });
  const events = { record: jest.fn() };
  const svc = new CommunitiesService({ query, transaction: async (fn: any) => fn({ query }) } as any, events as any);
  return { svc, updates, events };
};
const admin = { 9: { role: 'admin', status: 'active' } };
const helper = { 8: { role: 'helper', status: 'active' } };

describe('pinning', () => {
  it('a moderator pins and unpins; a member cannot', async () => {
    const { svc, updates, events } = build({ members: { ...helper, 4: { role: 'member', status: 'active' } } });
    await expect(svc.pinPost(3, 8, 7, true)).resolves.toEqual({ pinned: true });
    expect(updates[0].sql).toContain('"pinnedAt" = COALESCE("pinnedAt", now())');
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'COMMUNITY_POST_PINNED' }));
    await svc.pinPost(3, 8, 7, false);
    expect(updates[1].sql).toContain('"pinnedAt" = NULL');
    await expect(svc.pinPost(3, 4, 7, true)).rejects.toThrow(ForbiddenException);
  });

  it('at most 3 pinned at a time', async () => {
    const { svc } = build({ members: admin, pinnedOthers: 3 });
    await expect(svc.pinPost(3, 9, 7, true)).rejects.toThrow(BadRequestException);
  });

  it('only a post of this community', async () => {
    const { svc } = build({ members: admin, post: null });
    await expect(svc.pinPost(3, 9, 7, true)).rejects.toThrow(NotFoundException);
  });
});

describe('closing replies', () => {
  it('a moderator closes and opens replies, recorded', async () => {
    const { svc, updates, events } = build({ members: admin });
    await expect(svc.lockReplies(3, 9, 7, true)).resolves.toEqual({ repliesLocked: true });
    expect(updates[0].p).toEqual([7, true]);
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'COMMUNITY_REPLIES_LOCKED' }));
  });
});

describe('Jibu bora', () => {
  it('the writer chooses a reply of the post', async () => {
    const { svc, updates } = build();
    await expect(svc.setBestAnswer(3, 5, 7, 11)).resolves.toEqual({ bestCommentId: 11 });
    expect(updates[0].p).toEqual([7, 11]);
  });

  it('a moderator may choose; anyone else may not', async () => {
    await expect(build({ members: helper }).svc.setBestAnswer(3, 8, 7, 11)).resolves.toEqual({ bestCommentId: 11 });
    await expect(build({ members: { 4: { role: 'member', status: 'active' } } }).svc.setBestAnswer(3, 4, 7, 11)).rejects.toThrow(ForbiddenException);
  });

  it('a reply from another post is refused; null clears it', async () => {
    await expect(build({ comment: false }).svc.setBestAnswer(3, 5, 7, 99)).rejects.toThrow(BadRequestException);
    await expect(build().svc.setBestAnswer(3, 5, 7, null)).resolves.toEqual({ bestCommentId: null });
  });
});

describe('last visit', () => {
  it('returns the previous visit for a member; nothing for a guest', async () => {
    expect(await build({ prevSeen: '2026-11-15T10:00:00Z' }).svc.markSeen(3, 5)).toEqual(new Date('2026-11-15T10:00:00Z'));
    expect(await build().svc.markSeen(3, null)).toBeNull();
    expect(await build({ prevSeen: null }).svc.markSeen(3, 5)).toBeNull();
  });
});
