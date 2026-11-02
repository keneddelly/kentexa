import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PollService, assertPollInput } from './poll.service';

/** Home Feed phase E, "Kura" (owner approved 2026-11-02). */
describe('poll input', () => {
  it('2 to 6 options of at most 80 characters, no two alike, closing after 1, 3 or 7 days', () => {
    expect(assertPollInput({ options: [' Ndiyo ', 'Hapana'], durationDays: 3 })).toEqual({ options: ['Ndiyo', 'Hapana'], durationDays: 3 });
    for (const bad of [
      null, { options: ['Moja'], durationDays: 1 }, { options: Array(7).fill(0).map((_, i) => `c${i}`), durationDays: 1 },
      { options: ['a', ''], durationDays: 1 }, { options: ['a', 'x'.repeat(81)], durationDays: 1 },
      { options: ['Ndiyo', 'ndiyo'], durationDays: 1 }, { options: ['a', 'b'], durationDays: 2 },
    ]) expect(() => assertPollInput(bad)).toThrow(BadRequestException);
  });
});

const now = new Date('2026-11-02T10:00:00Z');
const build = (o: { visible?: boolean; closesAt?: Date; mine?: number | null; inserted?: boolean; author?: number } = {}) => {
  const state = { mine: o.mine ?? null };
  const options = [{ id: 11, label: 'Ndiyo', voteCount: 3 }, { id: 12, label: 'Hapana', voteCount: 1 }];
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM public.post_poll WHERE')) return [{ id: 5, question: 'Tufungue Jumapili?', closesAt: o.closesAt ?? new Date('2026-11-05T10:00:00Z') }];
    if (sql.includes('FROM public.post_poll_option WHERE id')) return options.some((x) => x.id === params[0]) ? [{ id: params[0] }] : [];
    if (sql.includes('FROM public.post_poll_option')) return options;
    if (sql.includes('FROM public.post_poll_vote')) return state.mine ? [{ optionId: state.mine }] : [];
    if (sql.includes('INSERT INTO public.post_poll_vote')) { if (o.inserted === false) return []; state.mine = params[1]; return [{ id: 1 }]; }
    if (sql.includes('UPDATE public.post_poll_option')) { options.find((x) => x.id === params[0])!.voteCount += 1; return []; }
    return [];
  });
  const qb: any = { select: () => qb, from: () => qb, where: () => qb, andWhere: () => qb,
    getRawMany: async () => (o.visible === false ? [] : [{ id: 7, businessId: o.author ?? 3, commerceProfileId: 9 }]) };
  const ds: any = { query, createQueryBuilder: () => qb, transaction: async (fn: any) => fn({ query }) };
  const events = { record: jest.fn() };
  return { svc: new PollService(ds, events as any), events, query };
};

describe('voting', () => {
  it('before voting: options and the total only, no counts', async () => {
    const v = await build().svc.view(7, 20, now);
    expect(v.totalVotes).toBe(4);
    expect(v.showResults).toBe(false);
    expect(v.options).toEqual([{ id: 11, label: 'Ndiyo' }, { id: 12, label: 'Hapana' }]);
  });

  it('a vote counts once, shows the results and records POLL_VOTED', async () => {
    const { svc, events } = build();
    const v = await svc.vote(7, 20, 12, now);
    expect(v.myOptionId).toBe(12);
    expect(v.showResults).toBe(true);
    expect(v.options).toEqual([{ id: 11, label: 'Ndiyo', votes: 3, percent: 60 }, { id: 12, label: 'Hapana', votes: 2, percent: 40 }]);
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'POLL_VOTED', targetId: 7 }));
  });

  it('a second vote is refused and changes nothing', async () => {
    const { svc, events, query } = build({ inserted: false });
    await expect(svc.vote(7, 20, 11, now)).rejects.toThrow(BadRequestException);
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE public.post_poll_option'))).toBe(false);
    expect(events.record).not.toHaveBeenCalled();
  });

  it('a closed poll takes no votes but shows results to everyone; the author always sees them', async () => {
    const closed = build({ closesAt: new Date('2026-11-01T10:00:00Z') });
    await expect(closed.svc.vote(7, 20, 11, now)).rejects.toThrow(ForbiddenException);
    expect((await closed.svc.view(7, null, now)).showResults).toBe(true);
    expect((await build({ author: 20 }).svc.view(7, 20, now)).showResults).toBe(true);
  });

  it('an option of another poll, or a post the person may not see, is refused', async () => {
    await expect(build().svc.vote(7, 20, 99, now)).rejects.toThrow(BadRequestException);
    await expect(build({ visible: false }).svc.view(7, 20, now)).rejects.toThrow(NotFoundException);
  });
});
