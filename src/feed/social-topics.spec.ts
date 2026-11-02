import { BadRequestException } from '@nestjs/common';
import { TopicsService } from './topics.service';
import { CvsService } from './cvs.service';

/** Social Home part 1 (owner approved 2026-11-02): topics, listings out of Home, talk first. */
describe('topics', () => {
  const build = (active = ['biashara', 'kilimo', 'usafiri'], followed: string[] = []) => {
    const state = { followed: [...followed] };
    const query = jest.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM public.feed_topic WHERE active = true ORDER BY')) return active.map((key) => ({ key, label: key, note: null }));
      if (sql.includes('FROM public.feed_topic WHERE key = $1')) return active.includes(params[0]) ? [{ key: params[0] }] : [];
      if (sql.includes('FROM public.feed_topic WHERE active = true AND key = ANY')) return params[0].filter((k: string) => active.includes(k)).map((key: string) => ({ key }));
      if (sql.includes('SELECT "topicKey" FROM public.user_topic_follow')) return state.followed.map((topicKey) => ({ topicKey }));
      if (sql.startsWith('DELETE FROM public.user_topic_follow')) { state.followed = state.followed.filter((k) => params[1].includes(k)); return []; }
      if (sql.startsWith('INSERT INTO public.user_topic_follow')) { if (!state.followed.includes(params[1])) state.followed.push(params[1]); return []; }
      return [];
    });
    const events = { record: jest.fn() };
    const ds: any = { query, transaction: async (fn: any) => fn({ query }) };
    return { svc: new TopicsService(ds, events as any), events, state };
  };

  it('lists the active topics with what this person follows', async () => {
    const { svc } = build(undefined, ['kilimo']);
    expect((await svc.list(5)).map((t) => [t.key, t.following])).toEqual([['biashara', false], ['kilimo', true], ['usafiri', false]]);
  });

  it('the picker sets exactly the chosen topics and records the change', async () => {
    const { svc, state, events } = build(undefined, ['kilimo']);
    await svc.setFollowed(5, ['biashara', 'usafiri']);
    expect(state.followed.sort()).toEqual(['biashara', 'usafiri']);
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'TOPICS_FOLLOWED', metadata: { added: ['biashara', 'usafiri'], removed: ['kilimo'] } }));
  });

  it('an unknown topic is refused, on follow and on a post', async () => {
    const { svc } = build();
    await expect(svc.setFollowed(5, ['siasa'])).rejects.toThrow(BadRequestException);
    await expect(svc.assertTopic('siasa')).rejects.toThrow(BadRequestException);
    expect(await svc.assertTopic('kilimo')).toBe('kilimo');
    expect(await svc.assertTopic(undefined)).toBeNull();
  });
});

describe('For You ranks conversation first', () => {
  it('comments weigh more than purchases, and a question, discussion or poll gets a lift', () => {
    const expr: string = (Object.create(CvsService.prototype) as any).talkDecayExpr('f');
    expect(expr).toContain('f."commentCount" * 4');
    expect(expr).toContain('f."repostCount" * 3');
    expect(expr).toContain('+ f."purchaseCount" + 1');
    expect(expr).toContain(`IN ('question', 'discussion', 'poll') THEN 1.2`);
  });
});
