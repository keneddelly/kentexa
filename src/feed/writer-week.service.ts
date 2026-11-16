import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';

/**
 * Mwandishi wa Wiki (owner approved 2026-11-16): recognition for writers, no money.
 *
 * Every week (Monday 00:00, Dar es Salaam time) the writer of the week and the next 3 are picked
 * from the week before, by plain counting (no AI), over public Makala, Mjadala, Swali and Uzoefu:
 *   reply from someone else x3, each different person who replied x2, save x2, like x1,
 *   open of a shared link x1, best answer received x5. The writer's own replies and likes never count.
 * Fair play: at least 5 different people replied; the account is older than 14 days; no report
 * upheld against their posts in 90 days; one owner counts once (personal and business profiles).
 * The pick is made by the first request of the week and kept in weekly_writer. An admin can remove
 * a pick that breaks the rules; the next one moves up. Every pick and removal is an activity event.
 */
export const WRITER_RULES = Object.freeze({
  kinds: ['question', 'discussion', 'experience', 'article'],
  minRepliers: 5,
  minAccountDays: 14,
  reportDays: 90,
  places: 4,
  points: { reply: 3, replier: 2, save: 2, like: 1, open: 1, best: 5 },
});

const DAY = 86400000;
const EAT = 3 * 3600000; // Dar es Salaam is UTC+3 all year

/** The week that is shown now: the Monday that started last week (EAT), as YYYY-MM-DD, and its window. */
export const shownWeek = (now: Date = new Date()) => {
  const local = new Date(now.getTime() + EAT);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const thisMonday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - sinceMonday);
  const start = thisMonday - 7 * DAY; // midnight UTC of last Monday's date
  return {
    weekStart: new Date(start).toISOString().slice(0, 10),
    from: new Date(start - EAT), // Monday 00:00 EAT
    to: new Date(start - EAT + 7 * DAY),
  };
};

export type WriterScore = {
  ownerUserId: number; commerceProfileId: number | null; topPostId: number | null;
  score: number; posts: number; replies: number; repliers: number;
};

/** Adds up each owner's week from per-post numbers (pure, so it is tested on its own). */
export const scoreWriters = (
  posts: Array<{ id: number; owner: number; cp: number | null; replies: number; likes: number; saves: number; opens: number }>,
  repliersByOwner: Map<number, number>,
  bestByOwner: Map<number, number>,
): WriterScore[] => {
  const P = WRITER_RULES.points;
  const byOwner = new Map<number, WriterScore & { topValue: number }>();
  for (const p of posts) {
    const value = P.reply * p.replies + P.like * p.likes + P.save * p.saves + P.open * p.opens;
    const cur = byOwner.get(p.owner) || { ownerUserId: p.owner, commerceProfileId: p.cp, topPostId: p.id, score: 0, posts: 0, replies: 0, repliers: 0, topValue: -1 };
    cur.score += value;
    cur.posts += 1;
    cur.replies += p.replies;
    if (value > cur.topValue) { cur.topValue = value; cur.topPostId = p.id; cur.commerceProfileId = p.cp; }
    byOwner.set(p.owner, cur);
  }
  return [...byOwner.values()].map(({ topValue, ...w }) => {
    w.repliers = repliersByOwner.get(w.ownerUserId) || 0;
    w.score += P.replier * w.repliers + P.best * (bestByOwner.get(w.ownerUserId) || 0);
    return w;
  }).sort((a, b) => b.score - a.score || b.repliers - a.repliers || a.ownerUserId - b.ownerUserId);
};

@Injectable()
export class WriterWeekService {
  constructor(
    private readonly db: DataSource,
    @Optional() private readonly notifications?: InAppNotificationService,
    @Optional() private readonly activityEvents?: ActivityEventService,
  ) {}

  private cache: { weekStart: string; at: number; winnerOwner: number | null } | null = null;

  /** Picks the week (once) and stores the top places. */
  async ensureWeek(now: Date = new Date()): Promise<string> {
    const { weekStart, from, to } = shownWeek(now);
    const [done] = await this.db.query(`SELECT 1 FROM public.weekly_writer WHERE "weekStart" = $1 LIMIT 1`, [weekStart]);
    if (done) return weekStart;
    const picked = await this.pick(from, to);
    // Two requests may pick at the same moment: the unique (week, owner) keeps one row each, and
    // only the request that stored the winner's row tells the winner.
    let storedWinner = false;
    for (let i = 0; i < picked.length; i += 1) {
      const w = picked[i];
      const saved = await this.db.query(
        `INSERT INTO public.weekly_writer ("weekStart", rank, "ownerUserId", "commerceProfileId", "topPostId", score, posts, replies, repliers)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT ("weekStart", "ownerUserId") DO NOTHING RETURNING id`,
        [weekStart, i + 1, w.ownerUserId, w.commerceProfileId, w.topPostId, w.score, w.posts, w.replies, w.repliers]);
      if (i === 0 && Array.isArray(saved) && saved.length) storedWinner = true;
    }
    if (storedWinner) {
      this.activityEvents?.record({
        eventType: 'WRITER_OF_WEEK_PICKED', category: ActivityCategory.SOCIAL, actorType: 'system', targetType: 'user', targetId: picked[0].ownerUserId,
        metadata: { weekStart, places: picked.map((w) => ({ owner: w.ownerUserId, score: w.score })) },
      } as any);
      await this.notifyWinner(picked[0].ownerUserId, weekStart, picked[0].commerceProfileId);
    }
    this.cache = null;
    return weekStart;
  }

  /** The week's numbers, owner by owner, with the fair-play rules applied. */
  async pick(from: Date, to: Date): Promise<WriterScore[]> {
    const kinds = WRITER_RULES.kinds;
    const posts: any[] = await this.db.query(
      `WITH p AS (
         SELECT f.id, f."businessId" AS owner, f."commerceProfileId" AS cp
           FROM public.business_feed_item f
          WHERE f."createdAt" >= $1 AND f."createdAt" < $2
            AND f."isActive" = true AND f.status::text = 'published' AND f.visibility::text = 'public'
            AND COALESCE(f."autoListing", false) = false AND f.intent::text = ANY($3)
            AND NOT EXISTS (SELECT 1 FROM public.commerce_profile gp WHERE gp.id = f."commerceProfileId" AND (gp."hiddenFromPublic" = true OR gp.status::text <> 'active'))
            AND (f."communityId" IS NULL OR EXISTS (SELECT 1 FROM public.community gc WHERE gc.id = f."communityId" AND gc.status = 'active' AND gc."joinPolicy" = 'open')))
       SELECT p.id, p.owner, p.cp,
              (SELECT COUNT(*)::int FROM public.post_comment pc WHERE pc."postId" = p.id AND pc."isDeleted" = false AND pc."authorId" <> p.owner AND pc."createdAt" < $2) AS replies,
              (SELECT COUNT(*)::int FROM public.post_engagement e WHERE e."postId" = p.id AND e.type::text = 'like' AND e."userId" <> p.owner AND e."createdAt" < $2) AS likes,
              (SELECT COUNT(*)::int FROM public.post_engagement e WHERE e."postId" = p.id AND e.type::text = 'save' AND e."userId" <> p.owner AND e."createdAt" < $2) AS saves,
              (SELECT COUNT(*)::int FROM public.share_link l JOIN public.share_visit v ON v."shareLinkId" = l.id
                WHERE l."contentType" = 'post' AND l."contentId" = p.id AND v."createdAt" < $2
                  AND (v."viewerUserId" IS NULL OR v."viewerUserId" <> p.owner)) AS opens
         FROM p`, [from, to, kinds]).catch(() => []);
    if (!posts.length) return [];
    const ids = posts.map((p) => Number(p.id));
    const [repliers, best] = await Promise.all([
      this.db.query(
        `SELECT f."businessId" AS owner, COUNT(DISTINCT pc."authorId")::int AS n
           FROM public.post_comment pc JOIN public.business_feed_item f ON f.id = pc."postId"
          WHERE pc."postId" = ANY($1) AND pc."isDeleted" = false AND pc."authorId" <> f."businessId" AND pc."createdAt" < $2
          GROUP BY f."businessId"`, [ids, to]).catch(() => []),
      this.db.query(
        `SELECT c."authorId" AS owner, COUNT(*)::int AS n
           FROM public.business_feed_item b JOIN public.post_comment c ON c.id = b."bestCommentId"
          WHERE c."createdAt" >= $1 AND c."createdAt" < $2 AND c."isDeleted" = false AND c."authorId" <> b."businessId"
          GROUP BY c."authorId"`, [from, to]).catch(() => []),
    ]);
    const scored = scoreWriters(
      posts.map((p) => ({ id: Number(p.id), owner: Number(p.owner), cp: p.cp ? Number(p.cp) : null, replies: Number(p.replies || 0), likes: Number(p.likes || 0), saves: Number(p.saves || 0), opens: Number(p.opens || 0) })),
      new Map(repliers.map((r: any) => [Number(r.owner), Number(r.n)])),
      new Map(best.map((r: any) => [Number(r.owner), Number(r.n)])),
    ).filter((w) => w.repliers >= WRITER_RULES.minRepliers);
    if (!scored.length) return [];
    const owners = scored.map((w) => w.ownerUserId);
    const ok: any[] = await this.db.query(
      `SELECT u.id FROM public."user" u
        WHERE u.id = ANY($1) AND u."createdAt" < $2::timestamptz - make_interval(days => $3)
          AND NOT EXISTS (SELECT 1 FROM public.post_report r JOIN public.business_feed_item f ON f.id = r."postId"
                           WHERE f."businessId" = u.id AND r.status = 'actioned' AND r."reviewedAt" > $2::timestamptz - make_interval(days => $4))`,
      [owners, to, WRITER_RULES.minAccountDays, WRITER_RULES.reportDays]).catch(() => []);
    const allowed = new Set(ok.map((r) => Number(r.id)));
    return scored.filter((w) => allowed.has(w.ownerUserId)).slice(0, WRITER_RULES.places);
  }

  private async notifyWinner(ownerUserId: number, weekStart: string, cp: number | null) {
    try {
      await this.notifications?.notify({
        userId: ownerUserId,
        type: 'writer_of_week',
        title: 'Hongera! Wewe ni Mwandishi wa Wiki',
        body: `Ulichoandika wiki ya ${weekLabel(weekStart)} kimewagusa watu wengi. Shiriki kadi yako na marafiki.`,
        icon: '⭐',
        actionPage: 'Home',
        actionCommerceProfileId: cp || undefined,
      });
    } catch { /* a notification never blocks the pick */ }
  }

  /** The shown week: the writer of the week and the next places (removed picks left out). */
  async current(now: Date = new Date()) {
    const weekStart = await this.ensureWeek(now).catch(() => shownWeek(now).weekStart);
    const rows: any[] = await this.db.query(
      `SELECT w.rank, w."ownerUserId", w."commerceProfileId", w."topPostId", w.posts, w.replies, w.repliers,
              COALESCE(cp."displayName", u.name) AS name, COALESCE(cp."photoUrl", u."avatarUrl") AS photo, cp.username,
              t.title AS "topTitle", t.intent::text AS "topIntent",
              (SELECT COUNT(*)::int FROM public.weekly_writer x WHERE x."ownerUserId" = w."ownerUserId" AND x.rank = 1 AND x."removedAt" IS NULL) AS wins
         FROM public.weekly_writer w
         JOIN public."user" u ON u.id = w."ownerUserId"
         LEFT JOIN public.commerce_profile cp ON cp.id = w."commerceProfileId"
         LEFT JOIN public.business_feed_item t ON t.id = w."topPostId" AND t."isActive" = true
        WHERE w."weekStart" = $1 AND w."removedAt" IS NULL
        ORDER BY w.rank`, [weekStart]).catch(() => []);
    const people = rows.map((r) => ({
      ownerUserId: Number(r.ownerUserId), commerceProfileId: r.commerceProfileId ? Number(r.commerceProfileId) : null,
      name: r.name || '', photo: r.photo || null, username: r.username || null,
      posts: Number(r.posts || 0), replies: Number(r.replies || 0), repliers: Number(r.repliers || 0), wins: Number(r.wins || 0),
      topPost: r.topPostId && r.topTitle ? { id: Number(r.topPostId), title: r.topTitle, intent: r.topIntent } : null,
    }));
    return { weekStart, weekLabel: weekLabel(weekStart), winner: people[0] || null, next: people.slice(1, WRITER_RULES.places) };
  }

  /** The current writer of the week's owner id (kept 10 minutes), for the label on their posts. */
  async winnerOwner(now: Date = new Date()): Promise<number | null> {
    const { weekStart } = shownWeek(now);
    if (this.cache && this.cache.weekStart === weekStart && now.getTime() - this.cache.at < 10 * 60000) return this.cache.winnerOwner;
    const [r] = await this.db.query(
      `SELECT "ownerUserId" FROM public.weekly_writer WHERE "weekStart" = $1 AND "removedAt" IS NULL ORDER BY rank LIMIT 1`, [weekStart]).catch(() => []);
    this.cache = { weekStart, at: now.getTime(), winnerOwner: r ? Number(r.ownerUserId) : null };
    return this.cache.winnerOwner;
  }

  /** How many times a person has been writer of the week (for their profile). */
  async wins(ownerUserId: number) {
    const rows: any[] = await this.db.query(
      `SELECT "weekStart" FROM public.weekly_writer w
        WHERE w."ownerUserId" = $1 AND w."removedAt" IS NULL
          AND w.rank = (SELECT MIN(x.rank) FROM public.weekly_writer x WHERE x."weekStart" = w."weekStart" AND x."removedAt" IS NULL)
        ORDER BY "weekStart" DESC`, [ownerUserId]).catch(() => []);
    const last = rows[0] ? String(rows[0].weekStart instanceof Date ? rows[0].weekStart.toISOString().slice(0, 10) : rows[0].weekStart).slice(0, 10) : null;
    return { wins: rows.length, last, lastLabel: last ? weekLabel(last, true) : null };
  }

  /** Admin: the shown week with every pick, removed ones too. */
  async adminWeek(now: Date = new Date()) {
    const weekStart = await this.ensureWeek(now).catch(() => shownWeek(now).weekStart);
    const rows = await this.db.query(
      `SELECT w.*, COALESCE(cp."displayName", u.name) AS name FROM public.weekly_writer w
         JOIN public."user" u ON u.id = w."ownerUserId" LEFT JOIN public.commerce_profile cp ON cp.id = w."commerceProfileId"
        WHERE w."weekStart" = $1 ORDER BY w.rank`, [weekStart]);
    return { weekStart, weekLabel: weekLabel(weekStart), rules: WRITER_RULES, picks: rows };
  }

  /** Admin: remove a pick that breaks the rules (kept on record); the next one moves up. */
  async remove(id: number, adminId: number, reason: unknown) {
    const why = typeof reason === 'string' ? reason.trim().slice(0, 200) : '';
    if (!why) throw new BadRequestException('Andika sababu ya kuondoa.');
    const [row] = await this.db.query(
      `UPDATE public.weekly_writer SET "removedAt" = now(), "removedById" = $2, "removeReason" = $3
        WHERE id = $1 AND "removedAt" IS NULL RETURNING id, "ownerUserId", "weekStart"`, [id, adminId, why]);
    if (!row) throw new NotFoundException('Chaguo hili halipo au limeshaondolewa.');
    this.activityEvents?.record({
      eventType: 'WRITER_OF_WEEK_REMOVED', category: ActivityCategory.SOCIAL, actorId: adminId, targetType: 'user', targetId: Number(row.ownerUserId),
      metadata: { weeklyWriterId: id, reason: why },
    } as any);
    this.cache = null;
    return { removed: true };
  }
}

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
/** "9–15 Nov" (with the year when asked). */
export const weekLabel = (weekStart: string, withYear = false): string => {
  const a = new Date(`${weekStart}T00:00:00Z`);
  const b = new Date(a.getTime() + 6 * DAY);
  const left = a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}` : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
  return `${left}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}${withYear ? ` ${b.getUTCFullYear()}` : ''}`;
};
