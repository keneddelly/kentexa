import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PUBLIC_TO_GUESTS } from '../commerce-profiles/public-visibility';

/**
 * Post views (owner approved 2026-11-16: "count readers like Reels views"). A view = the post was
 * on screen (half of it, or a third of the screen) for half a second.
 *  - signed-in readers: post_engagement 'view', one per person per post (business_feed_item.viewCount);
 *  - guests: post_guest_view, one per post per browser (a random key, no personal data), public posts only.
 * The number shown is both added together. The writer sees the last 7 days, and how many guests
 * came through shared links.
 */
@Injectable()
export class PostViewsService {
  constructor(private readonly db: DataSource) {}

  async guestView(postId: number, sessionKey: unknown, fromShare: unknown): Promise<{ counted: boolean }> {
    const key = typeof sessionKey === 'string' ? sessionKey.trim() : '';
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) throw new BadRequestException('Ufunguo si sahihi.');
    const rows = await this.db.query(
      `INSERT INTO public.post_guest_view ("postId", "sessionKey", "fromShare")
       SELECT x.id, $2, $3 FROM public.business_feed_item x WHERE x.id = $1 AND ${PUBLIC_TO_GUESTS('x')}
       ON CONFLICT ("postId", "sessionKey") DO NOTHING RETURNING id`, [postId, key, fromShare === true]).catch(() => []);
    return { counted: Array.isArray(rows) && rows.length > 0 };
  }

  /** Guest views for these posts (one query for a page of the feed). */
  async guestCounts(postIds: number[]): Promise<Map<number, number>> {
    if (!postIds.length) return new Map();
    const rows: any[] = await this.db.query(
      `SELECT "postId", COUNT(*)::int AS n FROM public.post_guest_view WHERE "postId" = ANY($1) GROUP BY "postId"`, [postIds]).catch(() => []);
    return new Map(rows.map((r) => [Number(r.postId), Number(r.n)]));
  }

  /** The writer's own numbers: total, the last 7 days day by day, and guests from shared links. */
  async stats(postId: number, viewerId: number) {
    const [post] = await this.db.query(`SELECT id, "businessId", "viewCount" FROM public.business_feed_item WHERE id = $1`, [postId]);
    if (!post) throw new NotFoundException('Chapisho halipatikani.');
    if (Number(post.businessId) !== Number(viewerId)) throw new ForbiddenException('Ni mwandishi tu anayeona takwimu hizi.');
    const [members, guests, days] = await Promise.all([
      this.db.query(`SELECT COUNT(*)::int AS n FROM public.post_engagement WHERE "postId" = $1 AND type::text = 'view'`, [postId]),
      this.db.query(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE "fromShare")::int AS shared FROM public.post_guest_view WHERE "postId" = $1`, [postId]).catch(() => [{ n: 0, shared: 0 }]),
      this.db.query(
        `SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
                (SELECT COUNT(*) FROM public.post_engagement e WHERE e."postId" = $1 AND e.type::text = 'view'
                   AND (e."createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam')::date = d::date)::int
              + COALESCE((SELECT COUNT(*) FROM public.post_guest_view g WHERE g."postId" = $1
                   AND (g."createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam')::date = d::date), 0)::int AS views
           FROM generate_series((now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date - 6, (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date, interval '1 day') d
          ORDER BY d`, [postId]).catch(() => []),
    ]);
    const m = Number(members[0]?.n || 0);
    const g = Number(guests[0]?.n || 0);
    return { total: m + g, members: m, guests: g, fromShares: Number(guests[0]?.shared || 0), days: days.map((d: any) => ({ day: d.day, views: Number(d.views || 0) })) };
  }
}
