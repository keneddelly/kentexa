import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { extractHashtags, hashtagKey } from './hashtags';
import { NOT_FROM_HIDDEN_PROFILE } from '../commerce-profiles/public-visibility';

export type HashtagContentType = 'moment';

/**
 * A post counts on a tag when anyone may see it: live, public, written by a person (not a
 * self-posted listing), not from a hidden profile, and outside any community or in an open one.
 */
const COUNTED_POST = `f."isActive" = true AND (f.visibility IS NULL OR f.visibility::text = 'public') AND f."autoListing" = false`
  + ` AND ${NOT_FROM_HIDDEN_PROFILE('f')}`
  + ` AND (f."communityId" IS NULL OR EXISTS (SELECT 1 FROM public.community hc WHERE hc.id = f."communityId" AND hc.status = 'active' AND hc."joinPolicy" = 'open'))`;

/**
 * Hashtags (owner approved 2026-11-15). Saves which tags each post uses, from the post's own
 * text, and answers the composer's suggestions and the tag page's header. The posts on a tag
 * page come from CvsService.getHashtagPosts, under the feed's own visibility rules.
 *
 * Saving tags must never stop a post from being published or edited: every write here is
 * caught and logged.
 */
@Injectable()
export class HashtagService {
  private readonly logger = new Logger(HashtagService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** Make the saved tags of one piece of content match its text: add new ones, drop removed ones. */
  async sync(contentType: HashtagContentType, contentId: number, text: string | null | undefined): Promise<number> {
    try {
      return await this.dataSource.transaction((m) => this.syncWith(m, contentType, contentId, text));
    } catch (err) {
      this.logger.warn(`Hashtag sync failed for ${contentType} ${contentId}: ${err}`);
      return 0;
    }
  }

  private async syncWith(m: EntityManager, contentType: HashtagContentType, contentId: number, text: string | null | undefined): Promise<number> {
    const tags = extractHashtags(text);
    let ids: number[] = [];
    if (tags.length) {
      await m.query(
        `INSERT INTO public.hashtag (key, display)
         SELECT * FROM unnest($1::varchar[], $2::varchar[])
         ON CONFLICT (key) DO NOTHING`,
        [tags.map((t) => t.key), tags.map((t) => t.display)],
      );
      const rows: { id: number }[] = await m.query(
        `SELECT id FROM public.hashtag WHERE key = ANY($1::varchar[])`, [tags.map((t) => t.key)]);
      ids = rows.map((r) => Number(r.id));
    }
    await m.query(
      `DELETE FROM public.hashtag_usage
        WHERE "contentType" = $1 AND "contentId" = $2 AND NOT ("hashtagId" = ANY($3::int[]))`,
      [contentType, contentId, ids],
    );
    if (ids.length) {
      await m.query(
        `INSERT INTO public.hashtag_usage ("hashtagId", "contentType", "contentId")
         SELECT unnest($1::int[]), $2, $3
         ON CONFLICT DO NOTHING`,
        [ids, contentType, contentId],
      );
    }
    return ids.length;
  }

  /** The content is gone (deleted post): it no longer counts on any tag. */
  async remove(contentType: HashtagContentType, contentId: number): Promise<void> {
    try {
      await this.dataSource.query(
        `DELETE FROM public.hashtag_usage WHERE "contentType" = $1 AND "contentId" = $2`, [contentType, contentId]);
    } catch (err) {
      this.logger.warn(`Hashtag remove failed for ${contentType} ${contentId}: ${err}`);
    }
  }

  /** The tag page's header: how the tag is written and how many posts use it. Null when unknown. */
  async info(raw: string): Promise<{ key: string; display: string; blocked: boolean; postCount: number } | null> {
    const key = hashtagKey(raw);
    if (!key) return null;
    const [row] = await this.dataSource.query(
      `SELECT h.key, h.display, h.status,
              (SELECT COUNT(*)::int FROM public.hashtag_usage u
                 JOIN public.business_feed_item f ON f.id = u."contentId"
                WHERE u."hashtagId" = h.id AND u."contentType" = 'moment' AND ${COUNTED_POST}) AS "postCount"
         FROM public.hashtag h WHERE h.key = $1`, [key]);
    if (!row) return null;
    const blocked = row.status === 'blocked';
    return { key: row.key, display: row.display, blocked, postCount: blocked ? 0 : Number(row.postCount || 0) };
  }

  /** Composer: tags that start with what the person typed, most used first. Blocked tags never show. */
  async suggest(raw: string, limit = 8): Promise<{ key: string; display: string; postCount: number }[]> {
    const prefix = typeof raw === 'string' ? raw.trim().replace(/^#/, '').normalize('NFKC').toLowerCase() : '';
    if (!prefix || prefix.length > 50 || !/^[\p{L}\p{M}\p{N}_]+$/u.test(prefix)) return [];
    const like = prefix.replace(/[\\%_]/g, (c) => `\\${c}`) + '%';
    const rows = await this.dataSource.query(
      `SELECT h.key, h.display, COUNT(f.id)::int AS "postCount"
         FROM public.hashtag h
         JOIN public.hashtag_usage u ON u."hashtagId" = h.id AND u."contentType" = 'moment'
         JOIN public.business_feed_item f ON f.id = u."contentId" AND ${COUNTED_POST}
        WHERE h.key LIKE $1 AND h.status = 'active'
        GROUP BY h.id
        ORDER BY "postCount" DESC, length(h.key) ASC, h.key ASC
        LIMIT $2`, [like, Math.min(Math.max(limit, 1), 20)]).catch(() => []);
    return rows.map((r: any) => ({ key: r.key, display: r.display, postCount: Number(r.postCount) }));
  }

  /** Admin: block or unblock a tag. A blocked tag's page shows nothing and it is not suggested. */
  async setBlocked(raw: string, blocked: boolean): Promise<{ key: string; status: string }> {
    const key = hashtagKey(raw);
    if (!key) throw new NotFoundException('Tagi si sahihi.');
    const status = blocked ? 'blocked' : 'active';
    // A tag can be blocked before anyone has used it.
    await this.dataSource.query(
      `INSERT INTO public.hashtag (key, display, status) VALUES ($1, $1, $2)
       ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status`, [key, status]);
    return { key, status };
  }

  /**
   * Admin: read the tags of every existing post, in batches by id. Safe to run again: it gives
   * the same result as publishing each post today.
   */
  async backfill(batchSize = 500): Promise<{ posts: number; tagged: number }> {
    let lastId = 0;
    let posts = 0;
    let tagged = 0;
    for (;;) {
      const rows: { id: number; title: string | null; body: string | null }[] = await this.dataSource.query(
        `SELECT id, title, body FROM public.business_feed_item
          WHERE id > $1 AND "isActive" = true ORDER BY id ASC LIMIT $2`, [lastId, batchSize]);
      if (!rows.length) break;
      for (const r of rows) {
        posts += 1;
        if (await this.sync('moment', Number(r.id), momentTagText(r))) tagged += 1;
      }
      lastId = Number(rows[rows.length - 1].id);
    }
    return { posts, tagged };
  }
}

/** The text of a post that tags are read from. */
export function momentTagText(post: { title?: string | null; body?: string | null }): string {
  return [post.title, post.body].filter(Boolean).join('\n');
}
