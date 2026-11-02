import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NOT_FROM_HIDDEN_PROFILE, NOT_MUTED_BY_VIEWER, VISIBLE_TO_VIEWER } from '../commerce-profiles/public-visibility';

/**
 * Social Home, part 2: "Leo kwako" (owner approved 2026-11-02, in the Social Home sketch).
 * A small daily block at the top of Home, built only from real records; an item with
 * nothing behind it is left out, and nothing at all means no block.
 *
 *  - discussion: today's most active question/discussion in the person's topics (or across
 *                Home when they follow none), by replies in the last 24 hours.
 *  - replies:    new replies from other people on the person's own posts in the last 24 hours.
 *  - poll:       an open poll in their topics they have not voted on, the most voted first.
 *
 * Same visibility, hidden-profile and mute rules as the feed. Read-only.
 */
export interface TodayItem { kind: 'discussion' | 'replies' | 'poll'; postId: number; title: string; topic?: string | null; count?: number }

const snippet = (t: unknown) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 90);

@Injectable()
export class TodayService {
  constructor(private readonly dataSource: DataSource) {}

  async forViewer(userId: number): Promise<TodayItem[]> {
    const topics: string[] = (await this.dataSource.query(
      `SELECT "topicKey" FROM public.user_topic_follow WHERE "userId" = $1`, [userId]).catch(() => [])).map((r: any) => r.topicKey);
    const [discussion, replies, poll] = await Promise.all([
      this.discussion(userId, topics).catch(() => null),
      this.replies(userId).catch(() => null),
      this.poll(userId, topics).catch(() => null),
    ]);
    return [discussion, replies, poll].filter((x): x is TodayItem => !!x);
  }

  /** Feed rows this viewer may see (the feed's own rules), as a query builder on alias f. */
  private visible(userId: number) {
    return this.dataSource.createQueryBuilder()
      .from('business_feed_item', 'f')
      .where('f."isActive" = true')
      .andWhere(NOT_FROM_HIDDEN_PROFILE('f'))
      .andWhere(VISIBLE_TO_VIEWER('f'), { feedViewerId: userId })
      .andWhere(NOT_MUTED_BY_VIEWER('f'))
      .andWhere('f."autoListing" = false');
  }

  private async discussion(userId: number, topics: string[]): Promise<TodayItem | null> {
    const qb = this.visible(userId)
      .select(['f.id AS id', 'f.title AS title', 'f.body AS body', 'f.topic AS topic'])
      .addSelect(`(SELECT COUNT(*) FROM public.post_comment pc WHERE pc."postId" = f.id AND pc."isDeleted" = false AND pc."createdAt" > NOW() - INTERVAL '24 hours')`, 'fresh')
      .andWhere(`f.intent::text IN ('question', 'discussion')`)
      .andWhere(`f."createdAt" > NOW() - INTERVAL '7 days'`)
      .andWhere('f."businessId" <> :todayViewer', { todayViewer: userId });
    if (topics.length) qb.andWhere('f.topic = ANY(:todayTopics)', { todayTopics: topics });
    const [row] = await qb.orderBy('fresh', 'DESC').addOrderBy('f."createdAt"', 'DESC').limit(1).getRawMany();
    if (!row || Number(row.fresh) < 1) return null;
    return { kind: 'discussion', postId: Number(row.id), title: snippet(row.body || row.title), topic: row.topic || null, count: Number(row.fresh) };
  }

  private async replies(userId: number): Promise<TodayItem | null> {
    const [row] = await this.dataSource.query(
      `SELECT pc."postId" AS "postId", COUNT(*) OVER () AS total, f.title, f.body
         FROM public.post_comment pc
         JOIN public.business_feed_item f ON f.id = pc."postId"
        WHERE f."businessId" = $1 AND f."isActive" = true
          AND pc."isDeleted" = false AND pc."authorId" IS NOT NULL AND pc."authorId" <> $1
          AND pc."createdAt" > NOW() - INTERVAL '24 hours'
        ORDER BY pc."createdAt" DESC
        LIMIT 1`, [userId]);
    if (!row) return null;
    return { kind: 'replies', postId: Number(row.postId), title: snippet(row.body || row.title), count: Number(row.total) };
  }

  private async poll(userId: number, topics: string[]): Promise<TodayItem | null> {
    const qb = this.visible(userId)
      .innerJoin('post_poll', 'pp', 'pp."postId" = f.id')
      .select(['f.id AS id', 'f.title AS title', 'f.topic AS topic'])
      .addSelect(`(SELECT COALESCE(SUM(o."voteCount"), 0) FROM public.post_poll_option o WHERE o."pollId" = pp.id)`, 'votes')
      .andWhere('pp."closesAt" > NOW()')
      .andWhere('f."businessId" <> :todayViewer', { todayViewer: userId })
      .andWhere(`NOT EXISTS (SELECT 1 FROM public.post_poll_vote v WHERE v."pollId" = pp.id AND v."userId" = :todayViewer)`);
    if (topics.length) qb.andWhere('f.topic = ANY(:todayTopics)', { todayTopics: topics });
    const [row] = await qb.orderBy('votes', 'DESC').addOrderBy('f."createdAt"', 'DESC').limit(1).getRawMany();
    if (!row) return null;
    return { kind: 'poll', postId: Number(row.id), title: snippet(row.title), topic: row.topic || null, count: Number(row.votes) };
  }
}
