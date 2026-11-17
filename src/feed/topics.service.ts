import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';

/**
 * Social Home, part 1 (owner approved 2026-11-02): topics ("Mada").
 * A fixed list kept in feed_topic (admin can change it later); people follow topics and
 * every post made in the composer carries one. Home follows the topics a person follows.
 */
export interface FeedTopic { key: string; label: string; note: string | null; description?: string | null; following?: boolean }

export const MIN_TOPICS_ON_FIRST_VISIT = 3;

@Injectable()
export class TopicsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly activityEvents: ActivityEventService,
  ) {}

  async list(userId?: number | null): Promise<FeedTopic[]> {
    // Mfululizo (#410): the longer description too, once its column exists.
    const topics = await this.dataSource.query(
      `SELECT key, label, note${(await this.hasDescription()) ? ', description' : ''} FROM public.feed_topic WHERE active = true ORDER BY position, key`);
    const followed = userId ? await this.followedKeys(userId) : [];
    return topics.map((t: any) => ({ key: t.key, label: t.label, note: t.note, ...(t.description ? { description: t.description } : {}), following: followed.includes(t.key) }));
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

  // ── Admin: the topic list (Mfululizo #410 phase 3, owner approved 2026-11-17) ──
  /** Every topic, active or not, with how many posts and series use it. */
  async adminList() {
    const hasDescription = await this.hasDescription();
    const rows: any[] = await this.dataSource.query(`
      SELECT t.key, t.label, t.note, ${hasDescription ? 't.description' : 'NULL::varchar AS description'}, t.position, t.active,
             (SELECT COUNT(*)::int FROM public.business_feed_item x WHERE x.topic = t.key) AS posts,
             (SELECT COUNT(*)::int FROM public.user_topic_follow f WHERE f."topicKey" = t.key) AS followers
        FROM public.feed_topic t ORDER BY t.position, t.key`);
    return rows.map((r) => ({ ...r, position: Number(r.position), posts: Number(r.posts), followers: Number(r.followers) }));
  }

  private descriptionKnown: boolean | null = null;
  private async hasDescription(): Promise<boolean> {
    if (this.descriptionKnown) return true;
    const [r] = await this.dataSource.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'feed_topic' AND column_name = 'description') AS ok`).catch(() => [null]);
    if (r?.ok) this.descriptionKnown = true;
    return Boolean(r?.ok);
  }

  /** A new topic: key a-z and _, 2 to 40 letters; it goes last unless a place is given. */
  async adminCreate(adminUserId: number, body: any) {
    const key = String(body?.key ?? '').trim().toLowerCase();
    if (!/^[a-z_]{2,40}$/.test(key)) throw new BadRequestException('Ufunguo wa mada: herufi a-z na _ tu (2 hadi 40).');
    const label = String(body?.label ?? '').replace(/\s+/g, ' ').trim();
    if (label.length < 2 || label.length > 60) throw new BadRequestException('Andika jina la mada (herufi 2 hadi 60).');
    const [exists] = await this.dataSource.query(`SELECT key FROM public.feed_topic WHERE key = $1::varchar`, [key]);
    if (exists) throw new BadRequestException('Mada yenye ufunguo huu tayari ipo.');
    await this.dataSource.query(`INSERT INTO public.feed_topic (key, label, note, position, active)
      VALUES ($1::varchar, $2::varchar, $3::varchar, COALESCE($4::int, (SELECT COALESCE(MAX(position), 0) + 1 FROM public.feed_topic)), true)`,
      [key, label, String(body?.note ?? '').trim().slice(0, 120) || null, Number.isInteger(Number(body?.position)) && body?.position !== '' && body?.position != null ? Number(body.position) : null]);
    if (body?.description !== undefined && (await this.hasDescription())) {
      await this.dataSource.query(`UPDATE public.feed_topic SET description = $2::varchar WHERE key = $1::varchar`, [key, String(body.description ?? '').trim().slice(0, 400) || null]);
    }
    this.activityEvents.record({ eventType: 'TOPIC_CREATED', category: ActivityCategory.CONTENT, actorId: adminUserId, targetType: 'feed_topic', targetId: null, metadata: { key } });
    return (await this.adminList()).find((t) => t.key === key);
  }

  /** Change a topic's name, note, description, place or switch it off (its key never changes). */
  async adminUpdate(adminUserId: number, key: string, body: any) {
    const [t] = await this.dataSource.query(`SELECT key FROM public.feed_topic WHERE key = $1::varchar`, [key]);
    if (!t) throw new BadRequestException('Mada haipo.');
    const sets: string[] = []; const params: any[] = [key];
    const put = (col: string, v: any, cast: string) => { params.push(v); sets.push(`${col} = $${params.length}::${cast}`); };
    if (body?.label !== undefined) {
      const label = String(body.label ?? '').replace(/\s+/g, ' ').trim();
      if (label.length < 2 || label.length > 60) throw new BadRequestException('Andika jina la mada (herufi 2 hadi 60).');
      put('label', label, 'varchar');
    }
    if (body?.note !== undefined) put('note', String(body.note ?? '').trim().slice(0, 120) || null, 'varchar');
    if (body?.description !== undefined && (await this.hasDescription())) put('description', String(body.description ?? '').trim().slice(0, 400) || null, 'varchar');
    if (body?.position !== undefined && Number.isInteger(Number(body.position))) put('position', Number(body.position), 'int');
    if (body?.active !== undefined) put('active', Boolean(body.active), 'boolean');
    if (sets.length) await this.dataSource.query(`UPDATE public.feed_topic SET ${sets.join(', ')} WHERE key = $1::varchar`, params);
    this.activityEvents.record({ eventType: 'TOPIC_UPDATED', category: ActivityCategory.CONTENT, actorId: adminUserId, targetType: 'feed_topic', targetId: null, metadata: { key, fields: Object.keys(body || {}) } });
    return (await this.adminList()).find((x) => x.key === key);
  }
}
