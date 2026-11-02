import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CommunitiesService } from './communities.service';

/** Social Home part 3: Jumuiya. Owner approved 2026-11-02. */
type Member = { role: string; status: string };
const build = (o: { verified?: boolean; owned?: number; taken?: boolean; community?: any; members?: Record<number, Member> } = {}) => {
  const members: Record<number, Member> = { ...(o.members || {}) };
  const community = o.community === undefined ? { id: 3, name: 'Wakulima Mwanza', topicKey: 'kilimo', joinPolicy: 'open', memberCount: 1, status: 'active' } : o.community;
  const query = jest.fn(async (sql: string, p: any[] = []) => {
    if (sql.includes('FROM public."user" WHERE id')) return [{ isVerified: o.verified !== false }];
    if (sql.includes('FROM public.feed_topic')) return p[0] === 'kilimo' ? [{ key: 'kilimo' }] : [];
    if (sql.includes('COUNT(*)::int AS n FROM public.community')) return [{ n: o.owned ?? 0 }];
    if (sql.includes('WHERE lower(name) = lower($1)')) return o.taken ? [{}] : [];
    if (sql.startsWith('INSERT INTO public.community (')) return [{ id: 3 }];
    if (sql.includes('FROM public.community WHERE id = $1 AND status')) return community ? [community] : [];
    if (sql.includes('SELECT role, status FROM public.community_member')) return members[p[1]] ? [members[p[1]]] : [];
    if (sql.includes('INSERT INTO public.community_member')) { members[p[1]] = { role: sql.includes("'admin'") ? 'admin' : 'member', status: p[2] || 'active' }; return []; }
    if (sql.includes('DELETE FROM public.community_member')) { delete members[p[1]]; return []; }
    if (sql.includes(`SET status = 'active'`)) { members[p[1]].status = 'active'; return []; }
    return [];
  });
  const events = { record: jest.fn() };
  const ds: any = { query, transaction: async (fn: any) => fn({ query }) };
  return { svc: new CommunitiesService(ds, events as any), members, events, query };
};
const good = { name: 'Wakulima Mwanza', purpose: 'Mazao na bei', topicKey: 'kilimo', joinPolicy: 'request' };

describe('opening a community', () => {
  it('needs a verified phone, a topic, a free name, and at most 5 per person', async () => {
    await expect(build({ verified: false }).svc.create(5, good)).rejects.toThrow(ForbiddenException);
    await expect(build().svc.create(5, { ...good, topicKey: 'siasa' })).rejects.toThrow(BadRequestException);
    await expect(build({ taken: true }).svc.create(5, good)).rejects.toThrow(BadRequestException);
    await expect(build({ owned: 5 }).svc.create(5, good)).rejects.toThrow(BadRequestException);
    await expect(build().svc.create(5, { ...good, name: '  ' })).rejects.toThrow(BadRequestException);
  });

  it('the opener becomes its admin and COMMUNITY_CREATED is recorded', async () => {
    const { svc, members, events } = build();
    await svc.create(5, good);
    expect(members[5]).toEqual({ role: 'admin', status: 'active' });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'COMMUNITY_CREATED', targetId: 3 }));
  });
});

describe('joining and posting', () => {
  it('an open community: joined at once', async () => {
    const { svc, members } = build();
    await svc.join(3, 7);
    expect(members[7].status).toBe('active');
  });

  it('a request community: pending until a moderator approves; pending cannot post', async () => {
    const { svc, members } = build({ community: { id: 3, topicKey: 'kilimo', joinPolicy: 'request', status: 'active' }, members: { 5: { role: 'admin', status: 'active' } } });
    await svc.join(3, 7);
    expect(members[7].status).toBe('pending');
    await expect(svc.assertCanPost(3, 7)).rejects.toThrow(ForbiddenException);
    await expect(svc.decide(3, 8, 7, true)).rejects.toThrow(ForbiddenException); // not a moderator
    await svc.decide(3, 5, 7, true);
    expect(members[7].status).toBe('active');
    expect(await svc.assertCanPost(3, 7)).toEqual({ id: 3, topicKey: 'kilimo' });
  });

  it('the admin cannot leave; a member can', async () => {
    const { svc, members } = build({ members: { 5: { role: 'admin', status: 'active' }, 7: { role: 'member', status: 'active' } } });
    await expect(svc.leave(3, 5)).rejects.toThrow(BadRequestException);
    await svc.leave(3, 7);
    expect(members[7]).toBeUndefined();
  });

  it('only the admin names helpers', async () => {
    const { svc } = build({ members: { 5: { role: 'admin', status: 'active' }, 6: { role: 'helper', status: 'active' }, 7: { role: 'member', status: 'active' } } });
    await expect(svc.setHelper(3, 6, 7, true)).rejects.toThrow(ForbiddenException);
    expect(await svc.setHelper(3, 5, 7, true)).toEqual({ ok: true });
  });

  it('no community chosen means a Home post', async () => {
    expect(await build().svc.assertCanPost(undefined, 7)).toBeNull();
  });
});
