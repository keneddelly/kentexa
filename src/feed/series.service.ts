import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PUBLIC_TO_GUESTS } from '../commerce-profiles/public-visibility';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { SERIES_STATUSES, SERIES_TEXT, SeriesStatus, cleanTitle, neighbours, numberVisible, seriesPath, validOrder } from './series-rules';
import { stripArticle } from './article-text';

/**
 * Mfululizo (Topic Series, issue #410, owner approved 2026-11-17): ordered episodes ("Sehemu")
 * that are existing posts. Comments, likes and views stay on the post; a series only orders them.
 *  - Everyone (guests too) reads PUBLISHED series, and sees only episodes whose post is public
 *    (PUBLIC_TO_GUESTS); a hidden or deleted post drops out and the numbers close up.
 *  - Signed-in people follow / unfollow a published series.
 *  - Admin creates, edits, publishes, archives, attaches public posts, removes and reorders
 *    (MVP: admin only; creators later behind a permission, owner choice).
 * Every change is an activity event. Before migration 1797400000000 runs, reads are empty.
 */
type Viewer = { id?: number | null; isAdmin?: boolean } | null | undefined;

const words = (r: { title?: string | null; body?: string | null; intent?: string | null }) => {
  const title = String(r.title || '').trim();
  if (title && title !== 'Moment') return title;
  return stripArticle(String(r.body || '')).split('\n').join(' ').trim();
};
const cover = (r: any) => (Array.isArray(r.media) && r.media[0]?.url) || r.imageUrl || null;

@Injectable()
export class SeriesService {
  private tablesReady = false;
  private checkedAt = 0;

  constructor(
    private readonly db: DataSource,
    @Optional() private readonly activityEvents?: ActivityEventService,
    @Optional() private readonly notifications?: InAppNotificationService,
  ) {}

  async ready(): Promise<boolean> {
    if (!this.tablesReady && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT to_regclass('public.content_series_episode') IS NOT NULL AS ok`);
        this.tablesReady = Boolean(row?.ok);
      } catch { this.tablesReady = false; }
    }
    return this.tablesReady;
  }

  private event(eventType: string, actorId: number | null, targetId: number, metadata: Record<string, unknown> = {}) {
    try {
      this.activityEvents?.record({
        eventType, category: ActivityCategory.CONTENT, actorId, actorType: actorId ? 'user' : 'system',
        targetType: 'content_series', targetId, metadata, visibility: 'system', severity: 'info',
      } as any)?.catch?.(() => undefined);
    } catch { /* recording never blocks the action */ }
  }

  // ── Reading ────────────────────────────────────────────────────────────
  /** Published series, newest first; `topic` keeps those in a topic. Each with its visible count and latest episode. */
  async list(opts: { topic?: string; communityId?: number; limit?: number } = {}, viewer?: Viewer) {
    if (!(await this.ready())) return [];
    const limit = Math.min(50, Math.max(1, Number(opts.limit) || 20));
    const params: any[] = [limit];
    let where = `s.status = 'published'`;
    if (opts.topic) { params.push(String(opts.topic)); where += ` AND EXISTS (SELECT 1 FROM public.content_series_topic st WHERE st."seriesId" = s.id AND st."topicKey" = $${params.length}::varchar)`; }
    if (opts.communityId) { params.push(Number(opts.communityId)); where += ` AND s."communityId" = $${params.length}::int`; }
    const rows: any[] = await this.db.query(`
      SELECT s.id, s.title, s.description, s."coverUrl", s."publishedAt", s."communityId",
             COALESCE(cp."displayName", u.name) AS publisher, COALESCE(cp."photoUrl", u."avatarUrl") AS "publisherPhoto",
             (SELECT COUNT(*)::int FROM public.content_series_episode e JOIN public.business_feed_item x ON x.id = e."postId"
               WHERE e."seriesId" = s.id AND ${PUBLIC_TO_GUESTS('x')}) AS episodes,
             (SELECT MAX(e."createdAt") FROM public.content_series_episode e JOIN public.business_feed_item x ON x.id = e."postId"
               WHERE e."seriesId" = s.id AND ${PUBLIC_TO_GUESTS('x')}) AS "latestAt",
             (SELECT COUNT(*)::int FROM public.content_series_follow f WHERE f."seriesId" = s.id) AS followers,
             COALESCE((SELECT array_agg(st."topicKey" ORDER BY st."topicKey") FROM public.content_series_topic st WHERE st."seriesId" = s.id), '{}') AS topics
        FROM public.content_series s
        LEFT JOIN public.commerce_profile cp ON cp.id = s."commerceProfileId"
        LEFT JOIN public."user" u ON u.id = s."ownerUserId"
       WHERE ${where}
       ORDER BY COALESCE((SELECT MAX(e."createdAt") FROM public.content_series_episode e WHERE e."seriesId" = s.id), s."publishedAt") DESC NULLS LAST, s.id DESC
       LIMIT $1::int`, params);
    const followed = await this.followedSet(viewer?.id, rows.map((r) => Number(r.id)));
    return rows.filter((r) => Number(r.episodes) > 0).map((r) => this.card(r, followed));
  }

  private card(r: any, followed: Set<number>) {
    const id = Number(r.id);
    return {
      id, title: r.title, description: r.description, coverUrl: r.coverUrl, path: seriesPath(id, r.title),
      publisher: r.publisher || 'KenteXa', publisherPhoto: r.publisherPhoto || null, communityId: r.communityId == null ? null : Number(r.communityId),
      topics: Array.isArray(r.topics) ? r.topics : [], episodes: Number(r.episodes || 0), followers: Number(r.followers || 0),
      latestAt: r.latestAt || null, publishedAt: r.publishedAt || null, following: followed.has(id),
    };
  }

  private async followedSet(userId: number | null | undefined, ids: number[]): Promise<Set<number>> {
    if (!userId || !ids.length) return new Set();
    const rows: any[] = await this.db.query(`SELECT "seriesId" FROM public.content_series_follow WHERE "userId" = $1::int AND "seriesId" = ANY($2::int[])`, [userId, ids]).catch(() => []);
    return new Set(rows.map((r) => Number(r.seriesId)));
  }

  /** One series with its visible episodes in order. A draft or archived series is for admin only. */
  async get(id: number, viewer?: Viewer) {
    if (!(await this.ready())) throw new NotFoundException(SERIES_TEXT.missing);
    const [s] = await this.db.query(`
      SELECT s.*, COALESCE(cp."displayName", u.name) AS publisher, COALESCE(cp."photoUrl", u."avatarUrl") AS "publisherPhoto",
             c.name AS "communityName",
             (SELECT COUNT(*)::int FROM public.content_series_follow f WHERE f."seriesId" = s.id) AS followers,
             COALESCE((SELECT array_agg(st."topicKey" ORDER BY st."topicKey") FROM public.content_series_topic st WHERE st."seriesId" = s.id), '{}') AS topics
        FROM public.content_series s
        LEFT JOIN public.commerce_profile cp ON cp.id = s."commerceProfileId"
        LEFT JOIN public."user" u ON u.id = s."ownerUserId"
        LEFT JOIN public.community c ON c.id = s."communityId"
       WHERE s.id = $1::int`, [id]);
    if (!s || (s.status !== 'published' && !viewer?.isAdmin)) throw new NotFoundException(SERIES_TEXT.missing);
    const episodes = await this.episodes(id, Boolean(viewer?.isAdmin && s.status !== 'published'));
    const followed = await this.followedSet(viewer?.id, [id]);
    return {
      ...this.card({ ...s, episodes: episodes.filter((e) => e.visible).length }, followed),
      status: s.status as SeriesStatus, communityName: s.communityName || null,
      episodeList: viewer?.isAdmin ? episodes : episodes.filter((e) => e.visible),
    };
  }

  /** The episodes of a series in order: post details, whether it may be shown, and its number among the shown. */
  private async episodes(seriesId: number, _adminDraft = false) {
    const rows: any[] = await this.db.query(`
      SELECT e."postId", e.position, e.title AS "episodeTitle", e."createdAt",
             x.title, x.body, x.intent, x."imageUrl", x.media, x."createdAt" AS "postedAt",
             (${PUBLIC_TO_GUESTS('x')}) AS visible,
             (SELECT COUNT(*)::int FROM public.post_comment pc WHERE pc."postId" = x.id AND pc."isDeleted" = false) AS replies
        FROM public.content_series_episode e
        JOIN public.business_feed_item x ON x.id = e."postId"
       WHERE e."seriesId" = $1::int
       ORDER BY e.position ASC`, [seriesId]);
    const shown = numberVisible(rows.map((r) => ({ ...r, position: Number(r.position), visible: Boolean(r.visible) })));
    const numberOf = new Map(shown.map((r) => [Number(r.postId), r.number]));
    return rows.map((r) => ({
      postId: Number(r.postId), position: Number(r.position), number: numberOf.get(Number(r.postId)) ?? null,
      title: (r.episodeTitle || '').trim() || words(r).slice(0, 120), summary: stripArticle(String(r.body || '')).split('\n').join(' ').slice(0, 180),
      intent: r.intent || null, cover: cover(r), postedAt: r.postedAt, addedAt: r.createdAt, replies: Number(r.replies || 0), visible: Boolean(r.visible),
    }));
  }

  /** The series a post belongs to, for the bar on the post: its number, the total, previous and next. */
  async forPost(postId: number) {
    if (!(await this.ready())) return [];
    const series: any[] = await this.db.query(`
      SELECT s.id, s.title FROM public.content_series s
        JOIN public.content_series_episode e ON e."seriesId" = s.id
       WHERE e."postId" = $1::int AND s.status = 'published'
       ORDER BY s.id`, [postId]);
    const out: any[] = [];
    for (const s of series) {
      const list = (await this.episodes(Number(s.id))).filter((e) => e.visible);
      const at = neighbours(list, postId);
      if (!at) continue;
      const brief = (e: any) => (e ? { postId: e.postId, number: e.number, title: e.title } : null);
      out.push({ id: Number(s.id), title: s.title, path: seriesPath(Number(s.id), s.title), number: list[at.index].number, total: list.length, prev: brief(at.prev), next: brief(at.next) });
    }
    return out;
  }

  // ── Following ──────────────────────────────────────────────────────────
  async follow(userId: number, seriesId: number, on: boolean) {
    if (!(await this.ready())) throw new NotFoundException(SERIES_TEXT.missing);
    const [s] = await this.db.query(`SELECT id, status FROM public.content_series WHERE id = $1::int`, [seriesId]);
    if (!s) throw new NotFoundException(SERIES_TEXT.missing);
    if (on) {
      if (s.status !== 'published') throw new BadRequestException(SERIES_TEXT.notPublished);
      const ins = await this.db.query(`INSERT INTO public.content_series_follow ("seriesId", "userId") VALUES ($1::int, $2::int)
        ON CONFLICT DO NOTHING RETURNING "seriesId"`, [seriesId, userId]);
      if (ins?.length) this.event('SERIES_FOLLOWED', userId, seriesId);
    } else {
      await this.db.query(`DELETE FROM public.content_series_follow WHERE "seriesId" = $1::int AND "userId" = $2::int`, [seriesId, userId]);
    }
    const [n] = await this.db.query(`SELECT COUNT(*)::int AS n FROM public.content_series_follow WHERE "seriesId" = $1::int`, [seriesId]);
    return { following: on, followers: Number(n?.n || 0) };
  }

  // ── Admin ──────────────────────────────────────────────────────────────
  async adminList() {
    if (!(await this.ready())) return [];
    const rows: any[] = await this.db.query(`
      SELECT s.id, s.title, s.status, s."coverUrl", s."updatedAt", s."publishedAt",
             (SELECT COUNT(*)::int FROM public.content_series_episode e WHERE e."seriesId" = s.id) AS episodes,
             (SELECT COUNT(*)::int FROM public.content_series_follow f WHERE f."seriesId" = s.id) AS followers,
             COALESCE((SELECT array_agg(st."topicKey" ORDER BY st."topicKey") FROM public.content_series_topic st WHERE st."seriesId" = s.id), '{}') AS topics
        FROM public.content_series s ORDER BY s."updatedAt" DESC LIMIT 200`);
    return rows.map((r) => ({ ...r, id: Number(r.id), episodes: Number(r.episodes), followers: Number(r.followers), path: seriesPath(Number(r.id), r.title) }));
  }

  private async cleanTopics(v: unknown): Promise<string[] | null> {
    if (v === undefined) return null;
    const keys = Array.isArray(v) ? [...new Set(v.map((k) => String(k).trim()).filter(Boolean))].slice(0, 5) : [];
    if (!keys.length) return [];
    const rows: any[] = await this.db.query(`SELECT key FROM public.feed_topic WHERE key = ANY($1::varchar[])`, [keys]);
    if (rows.length !== keys.length) throw new BadRequestException(SERIES_TEXT.topic);
    return keys;
  }

  private async cleanCommunity(v: unknown): Promise<number | null | undefined> {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const id = Number(v);
    const [c] = Number.isInteger(id) ? await this.db.query(`SELECT id FROM public.community WHERE id = $1::int`, [id]) : [];
    if (!c) throw new BadRequestException(SERIES_TEXT.community);
    return id;
  }

  async create(adminUserId: number, body: any) {
    if (!(await this.ready())) throw new BadRequestException(SERIES_TEXT.missing);
    const title = cleanTitle(body?.title);
    if (!title) throw new BadRequestException(SERIES_TEXT.title);
    const topics = (await this.cleanTopics(body?.topics)) ?? [];
    const communityId = (await this.cleanCommunity(body?.communityId)) ?? null;
    const id = await this.db.transaction(async (m) => {
      const [row] = await m.query(`INSERT INTO public.content_series (title, description, "coverUrl", "ownerUserId", "commerceProfileId", "communityId", status, "createdByUserId")
        VALUES ($1::varchar, $2::text, $3::varchar, $4::int, $5::int, $6::int, 'draft', $4::int) RETURNING id`,
        [title, String(body?.description ?? '').trim().slice(0, 2000) || null, String(body?.coverUrl ?? '').trim().slice(0, 500) || null,
          adminUserId, Number.isInteger(Number(body?.commerceProfileId)) && Number(body?.commerceProfileId) > 0 ? Number(body.commerceProfileId) : null, communityId]);
      for (const k of topics) await m.query(`INSERT INTO public.content_series_topic ("seriesId", "topicKey") VALUES ($1::int, $2::varchar)`, [row.id, k]);
      return Number(row.id);
    });
    this.event('SERIES_CREATED', adminUserId, id, { title });
    return this.get(id, { id: adminUserId, isAdmin: true });
  }

  async update(adminUserId: number, id: number, body: any) {
    if (!(await this.ready())) throw new NotFoundException(SERIES_TEXT.missing);
    const [s] = await this.db.query(`SELECT id, status, "publishedAt" FROM public.content_series WHERE id = $1::int`, [id]);
    if (!s) throw new NotFoundException(SERIES_TEXT.missing);
    const sets: string[] = []; const params: any[] = [id];
    const put = (col: string, val: any, cast: string) => { params.push(val); sets.push(`"${col}" = $${params.length}::${cast}`); };
    if (body?.title !== undefined) { const t = cleanTitle(body.title); if (!t) throw new BadRequestException(SERIES_TEXT.title); put('title', t, 'varchar'); }
    if (body?.description !== undefined) put('description', String(body.description ?? '').trim().slice(0, 2000) || null, 'text');
    if (body?.coverUrl !== undefined) put('coverUrl', String(body.coverUrl ?? '').trim().slice(0, 500) || null, 'varchar');
    const community = await this.cleanCommunity(body?.communityId);
    if (community !== undefined) put('communityId', community, 'int');
    if (body?.status !== undefined) {
      if (!SERIES_STATUSES.includes(body.status)) throw new BadRequestException(SERIES_TEXT.status);
      put('status', body.status, 'varchar');
      if (body.status === 'published' && !s.publishedAt) sets.push(`"publishedAt" = now()`);
    }
    const topics = await this.cleanTopics(body?.topics);
    await this.db.transaction(async (m) => {
      if (sets.length) await m.query(`UPDATE public.content_series SET ${sets.join(', ')}, "updatedAt" = now() WHERE id = $1::int`, params);
      if (topics) {
        await m.query(`DELETE FROM public.content_series_topic WHERE "seriesId" = $1::int`, [id]);
        for (const k of topics) await m.query(`INSERT INTO public.content_series_topic ("seriesId", "topicKey") VALUES ($1::int, $2::varchar)`, [id, k]);
      }
    });
    if (body?.status && body.status !== s.status) this.event(`SERIES_${String(body.status).toUpperCase()}`, adminUserId, id);
    return this.get(id, { id: adminUserId, isAdmin: true });
  }

  /** "kentexa.com/post/42-..." or "42" -> 42. */
  static postIdFrom(v: unknown): number | null {
    const s = String(v ?? '').trim();
    const m = s.match(/^(?:.*\/post\/)?(\d{1,10})(?:-[a-z0-9-]*)?\/?(?:[?#].*)?$/i);
    return m ? Number(m[1]) : null;
  }

  /** Attach a public post as the next episode. */
  async addEpisode(adminUserId: number, seriesId: number, body: any) {
    if (!(await this.ready())) throw new NotFoundException(SERIES_TEXT.missing);
    const postId = SeriesService.postIdFrom(body?.post ?? body?.postId);
    if (!postId) throw new BadRequestException(SERIES_TEXT.post);
    const [post] = await this.db.query(`SELECT x.id FROM public.business_feed_item x WHERE x.id = $1::int AND ${PUBLIC_TO_GUESTS('x')}`, [postId]);
    if (!post) throw new BadRequestException(SERIES_TEXT.post);
    const title = typeof body?.title === 'string' && body.title.trim() ? body.title.replace(/\s+/g, ' ').trim().slice(0, 120) : null;
    await this.db.transaction(async (m) => {
      const [s] = await m.query(`SELECT id FROM public.content_series WHERE id = $1::int FOR UPDATE`, [seriesId]);
      if (!s) throw new NotFoundException(SERIES_TEXT.missing);
      const [dupe] = await m.query(`SELECT 1 AS ok FROM public.content_series_episode WHERE "seriesId" = $1::int AND "postId" = $2::int`, [seriesId, postId]);
      if (dupe) throw new ConflictException(SERIES_TEXT.already);
      await m.query(`INSERT INTO public.content_series_episode ("seriesId", "postId", position, title, "addedByUserId")
        VALUES ($1::int, $2::int, COALESCE((SELECT MAX(position) FROM public.content_series_episode WHERE "seriesId" = $1::int), 0) + 1, $3::varchar, $4::int)`,
        [seriesId, postId, title, adminUserId]);
      await m.query(`UPDATE public.content_series SET "updatedAt" = now() WHERE id = $1::int`, [seriesId]);
    });
    this.event('SERIES_EPISODE_ADDED', adminUserId, seriesId, { postId });
    await this.tellFollowers(seriesId, postId, title).catch(() => undefined);
    return this.get(seriesId, { id: adminUserId, isAdmin: true });
  }

  async removeEpisode(adminUserId: number, seriesId: number, postId: number) {
    if (!(await this.ready())) throw new NotFoundException(SERIES_TEXT.missing);
    await this.db.transaction(async (m) => {
      const [s] = await m.query(`SELECT id FROM public.content_series WHERE id = $1::int FOR UPDATE`, [seriesId]);
      if (!s) throw new NotFoundException(SERIES_TEXT.missing);
      await m.query(`DELETE FROM public.content_series_episode WHERE "seriesId" = $1::int AND "postId" = $2::int`, [seriesId, postId]);
      // Close the gap so the places stay 1..n.
      await m.query(`SET CONSTRAINTS "UQ_content_series_episode_position" DEFERRED`);
      await m.query(`UPDATE public.content_series_episode e SET position = r.n
        FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS n FROM public.content_series_episode WHERE "seriesId" = $1::int) r
        WHERE e.id = r.id AND e.position <> r.n`, [seriesId]);
      await m.query(`UPDATE public.content_series SET "updatedAt" = now() WHERE id = $1::int`, [seriesId]);
    });
    this.event('SERIES_EPISODE_REMOVED', adminUserId, seriesId, { postId });
    return this.get(seriesId, { id: adminUserId, isAdmin: true });
  }

  /** New order: the full list of post ids, each once. One transaction, the series row locked. */
  async reorder(adminUserId: number, seriesId: number, postIds: unknown) {
    if (!(await this.ready())) throw new NotFoundException(SERIES_TEXT.missing);
    await this.db.transaction(async (m) => {
      const [s] = await m.query(`SELECT id FROM public.content_series WHERE id = $1::int FOR UPDATE`, [seriesId]);
      if (!s) throw new NotFoundException(SERIES_TEXT.missing);
      const rows: any[] = await m.query(`SELECT "postId" FROM public.content_series_episode WHERE "seriesId" = $1::int`, [seriesId]);
      const order = validOrder(rows.map((r) => Number(r.postId)), postIds);
      if (!order) throw new ConflictException(SERIES_TEXT.order);
      await m.query(`SET CONSTRAINTS "UQ_content_series_episode_position" DEFERRED`);
      await m.query(`UPDATE public.content_series_episode e SET position = o.n
        FROM unnest($2::int[]) WITH ORDINALITY AS o("postId", n)
        WHERE e."seriesId" = $1::int AND e."postId" = o."postId"`, [seriesId, order]);
      await m.query(`UPDATE public.content_series SET "updatedAt" = now() WHERE id = $1::int`, [seriesId]);
    });
    this.event('SERIES_REORDERED', adminUserId, seriesId);
    return this.get(seriesId, { id: adminUserId, isAdmin: true });
  }

  /**
   * Phase 4 (owner choice: in-app only): followers of a PUBLISHED series hear about a new episode,
   * at most once a day per series (a second episode the same day says nothing), never by SMS.
   */
  private async tellFollowers(seriesId: number, postId: number, episodeTitle: string | null) {
    if (!this.notifications) return 0;
    const [s] = await this.db.query(`SELECT id, title, status FROM public.content_series WHERE id = $1::int`, [seriesId]);
    if (!s || s.status !== 'published') return 0;
    const [recent] = await this.db.query(`SELECT 1 AS ok FROM public.notification
      WHERE "sourceType" = 'content_series' AND "sourceId" = $1::int AND "createdAt" > now() - interval '1 day' LIMIT 1`, [seriesId]).catch(() => [null]);
    if (recent) return 0;
    const [post] = await this.db.query(`SELECT title, body FROM public.business_feed_item WHERE id = $1::int`, [postId]);
    const what = (episodeTitle || words(post || {}) || '').slice(0, 120);
    const fans: any[] = await this.db.query(`SELECT "userId" FROM public.content_series_follow WHERE "seriesId" = $1::int LIMIT 5000`, [seriesId]);
    let sent = 0;
    for (const f of fans) {
      await this.notifications.notify({
        userId: Number(f.userId), type: 'system' as any, title: `Sehemu mpya: ${s.title}`,
        body: what || 'Sehemu mpya imeongezwa kwenye mfululizo unaoufuata.',
        actionPage: 'PostDetail', actionParam: String(postId), sourceType: 'content_series', sourceId: seriesId,
      } as any).then(() => { sent += 1; }).catch(() => undefined);
    }
    return sent;
  }
}
