import { TodayService } from './today.service';

/** Social Home part 2, "Leo kwako" (owner approved 2026-11-02): only real activity. */
describe('Leo kwako', () => {
  const build = (topics: string[] = ['kilimo']) => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM public.user_topic_follow')) return topics.map((topicKey) => ({ topicKey }));
      return [];
    });
    const svc: any = new TopicsLessToday({ query } as any);
    return { svc, query };
  };
  class TopicsLessToday extends TodayService {}

  it('shows each item that has something behind it, in order', async () => {
    const { svc } = build();
    svc.discussion = jest.fn().mockResolvedValue({ kind: 'discussion', postId: 4, title: 'Bei ya mbolea', count: 6 });
    svc.replies = jest.fn().mockResolvedValue({ kind: 'replies', postId: 9, title: 'Taa', count: 3 });
    svc.poll = jest.fn().mockResolvedValue({ kind: 'poll', postId: 12, title: 'Mvua zimeanza?', count: 40 });
    expect((await svc.forViewer(5)).map((i: any) => i.kind)).toEqual(['discussion', 'replies', 'poll']);
    expect(svc.discussion).toHaveBeenCalledWith(5, ['kilimo']);
  });

  it('nothing real, nothing shown; a failing part never breaks the others', async () => {
    const { svc } = build([]);
    svc.discussion = jest.fn().mockResolvedValue(null);
    svc.replies = jest.fn().mockRejectedValue(new Error('down'));
    svc.poll = jest.fn().mockResolvedValue({ kind: 'poll', postId: 12, title: 'Kura', count: 0 });
    expect(await svc.forViewer(5)).toEqual([{ kind: 'poll', postId: 12, title: 'Kura', count: 0 }]);
    svc.poll = jest.fn().mockResolvedValue(null);
    expect(await svc.forViewer(5)).toEqual([]);
  });

  it('replies count only other people\'s comments on the person\'s own posts in the last day', async () => {
    const { svc, query } = build();
    query.mockImplementationOnce(async () => [{ postId: 9, total: '3', title: 'Taa', body: 'Taa mpya' }]);
    expect(await (TodayService.prototype as any).replies.call(svc, 5)).toEqual({ kind: 'replies', postId: 9, title: 'Taa mpya', count: 3 });
    const sql = query.mock.calls[0][0];
    expect(sql).toContain('pc."authorId" <> $1');
    expect(sql).toContain(`INTERVAL '24 hours'`);
  });
});
