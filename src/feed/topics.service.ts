import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';

/**
 * Social Home, part 1 (owner approved 2026-11-02): topics ("Mada").
 * A fixed list kept in feed_topic (admin can change it later); people follow topics and
 * every post made in the composer carries one. Home follows the topics a person follows.
 */
export interface FeedTopic { key: string; label: string; note: string | null; following?: boolean }

export const MIN_TOPICS_ON_FIRST_VISIT = 3;

@Injectable()
export class TopicsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly activityEvents: ActivityEventService,
  ) {}

  async list(userId?: number | null): Promise<FeedTopic[]> {
    const topics = await this.dataSource.query(
      `SELECT key, label, note FROM public.feed_topic WHERE active = true ORDER BY position, key`);
    const followed = userId ? await this.followedKeys(userId) : [];
    return topics.map((t: any) => ({ key: t.key, label: t.label, note: t.note, following: followed.includes(t.key) }));
  }

  async followedKeys(userId: number): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT "topicKey" FROM public.user_topic_follow WHERE "userId" = $1`, [userId]).catch(() => []);
    return rows.map((r: any) => r.topicKey);
  }

  /** A topic key a post may carry: an active topic, or null when none was chosen. */
  async assertTopic(key: unknown): Promise<string | null> {
    if (key === undefined || key === null || key === '') return null;
    if (typeof key !== 'string') throw new BadRequestException('Chagua mada.');
    const [row] = await this.dataSource.query(`SELECT key FROM public.feed_topic WHERE key = $1 AND active = true`, [key]);
    if (!row) throw new BadRequestException('Mada hii haipo.');
    return row.key;
  }

  /** Sets exactly which topics this person follows (the picker sends the whole choice). */
  async setFollowed(userId: number, keys: unknown): Promise<FeedTopic[]> {
    if (!Array.isArray(keys) || keys.some((k) => typeof k !== 'string')) throw new BadRequestException('Chagua mada.');
    const wanted = [...new Set(keys as string[])];
    const valid: string[] = wanted.length
      ? (await this.dataSource.query(`SELECT key FROM public.feed_topic WHERE active = true AND key = ANY($1)`, [wanted])).map((r: any) => r.key)
      : [];
    if (valid.length !== wanted.length) throw new BadRequestException('Mada moja au zaidi haipo.');
    const before = await this.followedKeys(userId);
    await this.dataSource.transaction(async (m) => {
      await m.query(`DELETE FROM public.user_topic_follow WHERE "userId" = $1 AND NOT ("topicKey" = ANY($2))`, [userId, valid]);
      for (const k of valid) {
        await m.query(`INSERT INTO public.user_topic_follow ("userId", "topicKey") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, k]);
      }
    });
    const added = valid.filter((k) => !before.includes(k));
    const removed = before.filter((k) => !valid.includes(k));
    if (added.length || removed.length) {
      this.activityEvents.record({
        eventType: 'TOPICS_FOLLOWED',
        category: ActivityCategory.SOCIAL,
        actorId: userId,
        targetType: 'feed_topic',
        targetId: null,
        metadata: { added, removed },
      });
    }
    return this.list(userId);
  }
}
