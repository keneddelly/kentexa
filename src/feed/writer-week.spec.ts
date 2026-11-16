import { BadRequestException } from '@nestjs/common';
import { WriterWeekService, scoreWriters, shownWeek, weekLabel, WRITER_RULES } from './writer-week.service';
import { drawCard, PLAY_LINE } from '../share/cards/card';

/** Mwandishi wa Wiki (owner approved 2026-11-16). */
describe('Mwandishi wa Wiki', () => {
  it('the shown week is the one that ended last Sunday, in Dar es Salaam time', () => {
    // Tuesday 18 Nov 2026, 10:00 EAT -> week of Monday 9 Nov
    const w = shownWeek(new Date('2026-11-18T07:00:00Z'));
    expect(w.weekStart).toBe('2026-11-09');
    expect(w.from.toISOString()).toBe('2026-11-08T21:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-11-15T21:00:00.000Z');
    // Monday 16 Nov 00:30 EAT is already the new week
    expect(shownWeek(new Date('2026-11-15T21:30:00Z')).weekStart).toBe('2026-11-09');
    expect(shownWeek(new Date('2026-11-15T20:30:00Z')).weekStart).toBe('2026-11-02');
    expect(weekLabel('2026-11-09')).toBe('9–15 Nov');
    expect(weekLabel('2026-11-30', true)).toBe('30 Nov–6 Des 2026');
  });

  it('points: replies x3, different people x2, saves x2, likes x1, link opens x1, best answer x5; one owner counts once', () => {
    const out = scoreWriters([
      { id: 1, owner: 7, cp: 70, replies: 10, likes: 4, saves: 1, opens: 3 },
      { id: 2, owner: 7, cp: 71, replies: 2, likes: 0, saves: 0, opens: 0 },
      { id: 3, owner: 8, cp: null, replies: 5, likes: 20, saves: 0, opens: 0 },
    ], new Map([[7, 6], [8, 5]]), new Map([[8, 1]]));
    expect(out[0]).toEqual({ ownerUserId: 7, commerceProfileId: 70, topPostId: 1, score: 30 + 4 + 2 + 3 + 6 + 12, posts: 2, replies: 12, repliers: 6 });
    expect(out[1].score).toBe(15 + 20 + 10 + 5);
  });

  it('fair play: fewer than 5 people replied, too new or an upheld report: left out', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('WITH p AS')) return [{ id: 1, owner: 7, cp: null, replies: 9, likes: 0, saves: 0, opens: 0 }, { id: 2, owner: 8, cp: null, replies: 9, likes: 0, saves: 0, opens: 0 }, { id: 3, owner: 9, cp: null, replies: 30, likes: 0, saves: 0, opens: 0 }];
      if (sql.includes('COUNT(DISTINCT pc."authorId")')) return [{ owner: 7, n: 6 }, { owner: 8, n: 2 }, { owner: 9, n: 9 }];
      if (sql.includes('bestCommentId')) return [];
      if (sql.includes('FROM public."user" u')) return [{ id: 7 }]; // 9 is too new or reported
      return [];
    });
    const svc = new WriterWeekService({ query } as any);
    const picked = await svc.pick(new Date('2026-11-08T21:00:00Z'), new Date('2026-11-15T21:00:00Z'));
    expect(picked.map((w) => w.ownerUserId)).toEqual([7]);
    expect(WRITER_RULES.minRepliers).toBe(5);
  });

  it('the pick is stored once; only the request that stored the winner tells them', async () => {
    const notify = jest.fn();
    const record = jest.fn();
    let stored = false;
    const query = jest.fn(async (sql: string) => {
      if (sql.startsWith('SELECT 1 FROM public.weekly_writer')) return stored ? [{}] : [];
      if (sql.includes('INSERT INTO public.weekly_writer')) { stored = true; return [{ id: 1 }]; }
      return [];
    });
    const svc = new WriterWeekService({ query } as any, { notify } as any, { record } as any);
    jest.spyOn(svc, 'pick').mockResolvedValue([{ ownerUserId: 7, commerceProfileId: 70, topPostId: 1, score: 50, posts: 2, replies: 12, repliers: 6 }]);
    await svc.ensureWeek(new Date('2026-11-18T07:00:00Z'));
    await svc.ensureWeek(new Date('2026-11-18T07:00:00Z'));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toEqual(expect.objectContaining({ userId: 7, title: 'Hongera! Wewe ni Mwandishi wa Wiki' }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'WRITER_OF_WEEK_PICKED', targetId: 7 }));
  });

  it('an admin removes a pick only with a reason, and it is recorded', async () => {
    const record = jest.fn();
    const query = jest.fn(async () => [{ id: 4, ownerUserId: 7, weekStart: '2026-11-09' }]);
    const svc = new WriterWeekService({ query } as any, undefined, { record } as any);
    await expect(svc.remove(4, 1, ' ')).rejects.toThrow(BadRequestException);
    expect(await svc.remove(4, 1, 'Majibu ya kujitengenezea')).toEqual({ removed: true });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'WRITER_OF_WEEK_REMOVED', actorId: 1 }));
  });

  it('every Status card invites people to get the app from Google Play', () => {
    expect(PLAY_LINE).toBe('Pakua app ya KenteXa: Google Play');
    const png = drawCard({ kind: 'writer', badge: 'Mwandishi wa Wiki', headline: 'Asha Mwakyusa', context: '9–15 Nov 2026', meta: 'watu 41 walijibu', link: 'kentexa.com/@asha', cover: '#b45309' }, 'status');
    expect(png.readUInt32BE(16)).toBe(1080);
  });
});
