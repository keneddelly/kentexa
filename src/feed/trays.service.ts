import { Injectable, Optional } from '@nestjs/common';
import { SeriesService } from './series.service';
import { DataSource } from 'typeorm';
import { PUBLIC_TO_GUESTS } from '../commerce-profiles/public-visibility';
import { stripArticle, readMinutes } from './article-text';

/**
 * Feed trays (owner approved 2026-11-16: "that will make KenteXa awake"): the conversation rows
 * Home places between posts, from public content only (what a guest may see):
 *  - articles:  Makala mpya, newest first, last 14 days (owner 2026-11-16: every tray starts with the newest);
 *  - questions: Maswali yasiyojibiwa, public questions of the last 14 days with no reply yet;
 *  - polls:     Kura zinazoendelea, open polls, newest first, with their vote counts;
 *  - hashtags:  Hashtag zinazovuma, the most used tags of the last 7 days.
 * Plain counting; an empty list means the tray is skipped.
 */
@Injectable()
export class TraysService {
  constructor(private readonly db: DataSource, @Optional() private readonly series?: SeriesService) {}

  private cache: { at: number; value: any } | null = null;

  async trays(now: Date = new Date()) {
    if (this.cache && now.getTime() - this.cache.at < 120000) return this.cache.value;
    const who = `COALESCE(cp."displayName", u.name) AS owner, COALESCE(cp."photoUrl", u."avatarUrl") AS photo`;
    const joins = `LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId" LEFT JOIN public."user" u ON u.id = x."businessId"
                   LEFT JOIN public.community c ON c.id = x."communityId"`;
    const [articles, questions, polls, hashtags] = await Promise.all([
      this.db.query(
        `SELECT x.id, x.title, x.body, x."imageUrl", x.media, ${who}, c.name AS community,
                (SELECT COUNT(*)::int FROM public.post_comment pc WHERE pc."postId" = x.id AND pc."isDeleted" = false) AS replies,
                (SELECT COUNT(*)::int FROM public.post_engagement e WHERE e."postId" = x.id AND e.type::text = 'like') AS likes
           FROM public.business_feed_item x ${joins}
          WHERE x.intent::text = 'article' AND ${PUBLIC_TO_GUESTS('x')} AND x."createdAt" > $1::timestamptz - INTERVAL '14 days'
          ORDER BY x."createdAt" DESC
          LIMIT 8`, [now]).catch(() => []),
      this.db.query(
        `SELECT x.id, x.title, x.body, ${who}, c.name AS community, x."createdAt"
           FROM public.business_feed_item x ${joins}
          WHERE x.intent::text = 'question' AND ${PUBLIC_TO_GUESTS('x')} AND x."createdAt" > $1::timestamptz - INTERVAL '14 days'
            AND NOT EXISTS (SELECT 1 FROM public.post_comment pc WHERE pc."postId" = x.id AND pc."isDeleted" = false)
          ORDER BY x."createdAt" DESC LIMIT 8`, [now]).catch(() => []),
      this.db.query(
        `SELECT x.id, x.title, x.body, ${who}, c.name AS community, p."closesAt",
                COALESCE((SELECT SUM(o."voteCount") FROM public.post_poll_option o WHERE o."pollId" = p.id), 0)::int AS votes
           FROM public.business_feed_item x JOIN public.post_poll p ON p."postId" = x.id ${joins}
          WHERE x.intent::text = 'poll' AND ${PUBLIC_TO_GUESTS('x')} AND p."closesAt" > $1
          ORDER BY x."createdAt" DESC LIMIT 8`, [now]).catch(() => []),
      this.db.query(
        `SELECT h.key, h.display, COUNT(*)::int AS posts
           FROM public.hashtag_usage hu JOIN public.hashtag h ON h.id = hu."hashtagId"
           JOIN public.business_feed_item x ON x.id = hu."contentId"
          WHERE hu."contentType" = 'moment' AND h.status = 'active' AND hu."createdAt" > $1::timestamptz - INTERVAL '7 days' AND ${PUBLIC_TO_GUESTS('x')}
          GROUP BY h.key, h.display ORDER BY posts DESC, h.key LIMIT 10`, [now]).catch(() => []),
    ]);
    const words = (r: any) => (String(r.title || '').trim() && r.title !== 'Moment' ? r.title : r.body) || '';
    const cover = (r: any) => (Array.isArray(r.media) && r.media[0]?.url) || r.imageUrl || null;
    const value = {
      articles: articles.map((r: any) => ({
        id: Number(r.id), title: r.title, excerpt: stripArticle(r.body).split('\n').join(' ').slice(0, 160), minutes: readMinutes(r.body),
        cover: /^\s*\[picha 1\]\s*$/im.test(String(r.body || '')) ? null : cover(r),
        owner: r.owner, photo: r.photo, community: r.community, replies: Number(r.replies || 0), likes: Number(r.likes || 0),
      })),
      questions: questions.map((r: any) => ({ id: Number(r.id), words: String(words(r)).slice(0, 200), owner: r.owner, photo: r.photo, community: r.community, createdAt: r.createdAt })),
      polls: polls.map((r: any) => ({ id: Number(r.id), words: String(words(r)).slice(0, 200), owner: r.owner, photo: r.photo, community: r.community, closesAt: r.closesAt, votes: Number(r.votes || 0) })),
      hashtags: hashtags.map((r: any) => ({ key: r.key, display: r.display, posts: Number(r.posts || 0) })),
      // Mfululizo (#410 phase 4): published series, the newest episode first (public episodes only).
      series: this.series ? await this.series.list({ limit: 8 }).catch(() => []) : [],
    };
    this.cache = { at: now.getTime(), value };
    return value;
  }
}
