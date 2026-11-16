import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { PUBLIC_TO_GUESTS } from '../commerce-profiles/public-visibility';

/**
 * Viral engine A2 (issue #381): short share links, kentexa.com/s/<code>. A code stands for
 * (who shared, what, which channel), so later steps can count opens and new members per share.
 * Only content a guest may read can get one (the same PUBLIC_TO_GUESTS rule as previews).
 */
export const SHARE_CONTENT_TYPES = ['post', 'community'] as const;
export type ShareContentType = (typeof SHARE_CONTENT_TYPES)[number];
export const SHARE_CHANNELS = ['whatsapp', 'status', 'facebook', 'telegram', 'x', 'copy', 'native', 'image', 'link'] as const;
export const SHARE_CODE = /^[A-Za-z0-9]{5,12}$/;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // no 0/O, 1/l/I
export const newShareCode = (len = 7): string => {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
};

export const pathFor = (type: string, id: number): string => (type === 'community' ? `/community/${id}` : `/post/${id}`);

@Injectable()
export class ShareLinksService {
  constructor(private readonly db: DataSource) {}

  /** Is this content readable by a guest (so it may travel outside KenteXa)? */
  async isPublic(type: ShareContentType, id: number): Promise<boolean> {
    const sql = type === 'post'
      ? `SELECT 1 FROM public.business_feed_item x WHERE x.id = $1 AND ${PUBLIC_TO_GUESTS('x')}`
      : `SELECT 1 FROM public.community c WHERE c.id = $1 AND c.status = 'active' AND c."joinPolicy" = 'open'`;
    const rows = await this.db.query(sql, [id]).catch(() => []);
    return rows.length > 0;
  }

  /** A short link for sharing. The same person, content and channel always get the same code. */
  async create(sharerUserId: number | null, type: string, id: number, channel: string) {
    if (!SHARE_CONTENT_TYPES.includes(type as ShareContentType)) throw new BadRequestException('Aina hii haishirikiwi.');
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Chagua cha kushiriki.');
    const ch = (SHARE_CHANNELS as readonly string[]).includes(channel) ? channel : 'link';
    if (!(await this.isPublic(type as ShareContentType, id))) {
      throw new BadRequestException('Hiki ni cha wanachama au wafuasi tu, hakiwezi kushirikiwa nje.');
    }
    const [existing] = await this.db.query(
      `SELECT code FROM public.share_link WHERE "sharerUserId" IS NOT DISTINCT FROM $1 AND "contentType" = $2 AND "contentId" = $3 AND channel = $4 LIMIT 1`,
      [sharerUserId, type, id, ch]);
    if (existing) return this.present(existing.code, type, id, ch);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newShareCode();
      try {
        await this.db.query(
          `INSERT INTO public.share_link (code, "sharerUserId", "contentType", "contentId", channel) VALUES ($1, $2, $3, $4, $5)`,
          [code, sharerUserId, type, id, ch]);
        return this.present(code, type, id, ch);
      } catch (err: any) {
        if (String(err?.code) !== '23505') throw err; // only a code clash is retried
      }
    }
    throw new BadRequestException('Imeshindikana kutengeneza kiungo. Jaribu tena.');
  }

  /** What a code points to. Unknown code: null. */
  async resolve(code: string): Promise<{ contentType: string; contentId: number; path: string; sharerUserId: number | null } | null> {
    if (!SHARE_CODE.test(String(code || ''))) return null;
    const [r] = await this.db.query(
      `SELECT "contentType", "contentId", "sharerUserId" FROM public.share_link WHERE code = $1`, [code]).catch(() => []);
    if (!r) return null;
    return { contentType: r.contentType, contentId: Number(r.contentId), path: pathFor(r.contentType, Number(r.contentId)), sharerUserId: r.sharerUserId ?? null };
  }

  // ── Viral engine B8: what each shared link brings ─────────────────────────────

  /** A browser opened a short link. One per link per session; the sharer's own opens are left out. */
  async recordVisit(code: string, sessionKey: string, viewerUserId: number | null): Promise<{ counted: boolean }> {
    if (!SHARE_CODE.test(String(code || '')) || !/^[A-Za-z0-9_-]{8,64}$/.test(String(sessionKey || ''))) return { counted: false };
    const [link] = await this.db.query(`SELECT id, "sharerUserId" FROM public.share_link WHERE code = $1`, [code]).catch(() => []);
    if (!link) return { counted: false };
    if (viewerUserId && Number(link.sharerUserId) === Number(viewerUserId)) return { counted: false };
    const rows = await this.db.query(
      `INSERT INTO public.share_visit ("shareLinkId", "sessionKey", "viewerUserId") VALUES ($1, $2, $3)
       ON CONFLICT ("shareLinkId", "sessionKey") DO NOTHING RETURNING id`, [link.id, sessionKey, viewerUserId]).catch(() => []);
    return { counted: Array.isArray(rows) && rows.length > 0 };
  }

  /**
   * A new account (created in the last 24 hours) that arrived through a short link. Once per
   * account; never the sharer themselves.
   */
  async claim(userId: number, code: string): Promise<{ claimed: boolean }> {
    if (!userId || !SHARE_CODE.test(String(code || ''))) return { claimed: false };
    const [link] = await this.db.query(`SELECT id, "sharerUserId" FROM public.share_link WHERE code = $1`, [code]).catch(() => []);
    if (!link || Number(link.sharerUserId) === Number(userId)) return { claimed: false };
    const [user] = await this.db.query(
      `SELECT 1 FROM public."user" WHERE id = $1 AND "createdAt" > NOW() - INTERVAL '24 hours'`, [userId]).catch(() => []);
    if (!user) return { claimed: false };
    const rows = await this.db.query(
      `INSERT INTO public.share_conversion ("userId", "shareLinkId") VALUES ($1, $2) ON CONFLICT ("userId") DO NOTHING RETURNING id`,
      [userId, link.id]).catch(() => []);
    return { claimed: Array.isArray(rows) && rows.length > 0 };
  }

  /** "Ulichoshiriki" for one post or community: only the sharer's own links. */
  async myStats(userId: number, type: string, id: number) {
    const rows: any[] = await this.db.query(
      `SELECT l.channel,
              (SELECT COUNT(*)::int FROM public.share_visit v WHERE v."shareLinkId" = l.id) AS opens,
              (SELECT COUNT(*)::int FROM public.share_conversion c WHERE c."shareLinkId" = l.id) AS joined
         FROM public.share_link l
        WHERE l."sharerUserId" = $1 AND l."contentType" = $2 AND l."contentId" = $3`, [userId, type, id]).catch(() => []);
    if (!rows.length) return { shared: false, opens: 0, joined: 0, newReplies: 0, channels: [] };
    let newReplies = 0;
    if (type === 'post') {
      const [r] = await this.db.query(
        `SELECT COUNT(*)::int AS n FROM public.post_comment pc
          WHERE pc."postId" = $3 AND pc."isDeleted" = false AND pc."authorId" IN (
            SELECT c."userId" FROM public.share_conversion c JOIN public.share_link l ON l.id = c."shareLinkId"
             WHERE l."sharerUserId" = $1 AND l."contentType" = $2 AND l."contentId" = $3)`, [userId, type, id]).catch(() => []);
      newReplies = Number(r?.n || 0);
    }
    const byChannel = new Map<string, number>();
    rows.forEach((r) => byChannel.set(r.channel, (byChannel.get(r.channel) || 0) + Number(r.opens || 0)));
    return {
      shared: true,
      opens: rows.reduce((n, r) => n + Number(r.opens || 0), 0),
      joined: rows.reduce((n, r) => n + Number(r.joined || 0), 0),
      newReplies,
      channels: Array.from(byChannel.entries()).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([channel, opens]) => ({ channel, opens })),
    };
  }

  /**
   * Admin growth report (stage E, layers 1-2: plain SQL over recorded events, nothing invented).
   * Shares by channel and kind, opens, guest opens, new accounts, first participation within 7
   * days, re-shares by new members, new members per sharer, and the content and communities
   * that bring the most people.
   */
  async adminReport(days = 30) {
    const d = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)));
    const since = `NOW() - INTERVAL '${d} days'`;
    const q = (sql: string) => this.db.query(sql).catch(() => []);
    const [byChannel, byType, totals, firstStep, reshares, topContent, topCommunities] = await Promise.all([
      q(`SELECT l.channel, COUNT(DISTINCT l.id)::int AS links,
                COUNT(v.id)::int AS opens,
                (SELECT COUNT(*)::int FROM public.share_conversion c JOIN public.share_link l2 ON l2.id = c."shareLinkId"
                  WHERE l2.channel = l.channel AND c."registeredAt" > ${since}) AS joined
           FROM public.share_link l LEFT JOIN public.share_visit v ON v."shareLinkId" = l.id AND v."createdAt" > ${since}
          WHERE l."createdAt" > ${since} OR v.id IS NOT NULL
          GROUP BY l.channel ORDER BY opens DESC`),
      q(`SELECT "contentType", COUNT(*)::int AS links FROM public.share_link WHERE "createdAt" > ${since} GROUP BY "contentType"`),
      q(`SELECT
           (SELECT COUNT(*)::int FROM public.share_link WHERE "createdAt" > ${since}) AS links,
           (SELECT COUNT(DISTINCT "sharerUserId")::int FROM public.share_link WHERE "createdAt" > ${since} AND "sharerUserId" IS NOT NULL) AS sharers,
           (SELECT COUNT(*)::int FROM public.share_visit WHERE "createdAt" > ${since}) AS opens,
           (SELECT COUNT(*)::int FROM public.share_visit WHERE "createdAt" > ${since} AND "viewerUserId" IS NULL) AS "guestOpens",
           (SELECT COUNT(*)::int FROM public.share_conversion WHERE "registeredAt" > ${since}) AS joined`),
      q(`SELECT COUNT(*)::int AS n FROM public.share_conversion c
          WHERE c."registeredAt" > ${since} AND (
            EXISTS (SELECT 1 FROM public.post_comment x WHERE x."authorId" = c."userId" AND x."createdAt" BETWEEN c."registeredAt" AND c."registeredAt" + INTERVAL '7 days')
            OR EXISTS (SELECT 1 FROM public.post_engagement x WHERE x."userId" = c."userId" AND x.type::text IN ('like', 'repost') AND x."createdAt" BETWEEN c."registeredAt" AND c."registeredAt" + INTERVAL '7 days')
            OR EXISTS (SELECT 1 FROM public.post_poll_vote x WHERE x."userId" = c."userId" AND x."createdAt" BETWEEN c."registeredAt" AND c."registeredAt" + INTERVAL '7 days')
            OR EXISTS (SELECT 1 FROM public.community_member x WHERE x."userId" = c."userId" AND x.status = 'active' AND x."createdAt" BETWEEN c."registeredAt" AND c."registeredAt" + INTERVAL '7 days')
            OR EXISTS (SELECT 1 FROM public.business_feed_item x WHERE x."businessId" = c."userId" AND x."createdAt" BETWEEN c."registeredAt" AND c."registeredAt" + INTERVAL '7 days'))`),
      q(`SELECT COUNT(DISTINCT c."userId")::int AS people, COUNT(l.id)::int AS links FROM public.share_conversion c
           JOIN public.share_link l ON l."sharerUserId" = c."userId" AND l."createdAt" > c."registeredAt"
          WHERE c."registeredAt" > ${since}`),
      q(`SELECT l."contentType", l."contentId", COUNT(DISTINCT v.id)::int AS opens, COUNT(DISTINCT c.id)::int AS joined,
                COALESCE(MAX(f.title), MAX(cm.name)) AS title, MAX(f.body) AS body
           FROM public.share_link l
           LEFT JOIN public.share_visit v ON v."shareLinkId" = l.id AND v."createdAt" > ${since}
           LEFT JOIN public.share_conversion c ON c."shareLinkId" = l.id AND c."registeredAt" > ${since}
           LEFT JOIN public.business_feed_item f ON l."contentType" = 'post' AND f.id = l."contentId"
           LEFT JOIN public.community cm ON l."contentType" = 'community' AND cm.id = l."contentId"
          GROUP BY l."contentType", l."contentId" HAVING COUNT(DISTINCT v.id) > 0
          ORDER BY joined DESC, opens DESC LIMIT 10`),
      q(`SELECT cm.id, cm.name, COUNT(DISTINCT v.id)::int AS opens, COUNT(DISTINCT c.id)::int AS joined
           FROM public.share_link l
           LEFT JOIN public.business_feed_item f ON l."contentType" = 'post' AND f.id = l."contentId"
           JOIN public.community cm ON cm.id = CASE WHEN l."contentType" = 'community' THEN l."contentId" ELSE f."communityId" END
           LEFT JOIN public.share_visit v ON v."shareLinkId" = l.id AND v."createdAt" > ${since}
           LEFT JOIN public.share_conversion c ON c."shareLinkId" = l.id AND c."registeredAt" > ${since}
          GROUP BY cm.id, cm.name HAVING COUNT(DISTINCT v.id) > 0
          ORDER BY joined DESC, opens DESC LIMIT 10`),
    ]);
    const t = totals[0] || {};
    const joined = Number(t.joined || 0);
    const sharers = Number(t.sharers || 0);
    const opens = Number(t.opens || 0);
    const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
    return {
      days: d,
      totals: {
        links: Number(t.links || 0), sharers, opens, guestOpens: Number(t.guestOpens || 0), joined,
        firstParticipation7d: Number(firstStep[0]?.n || 0),
        resharingNewMembers: Number(reshares[0]?.people || 0), resharedLinks: Number(reshares[0]?.links || 0),
      },
      rates: {
        openToJoinPct: ratio(joined, Number(t.guestOpens || opens)),
        joinToParticipatePct: ratio(Number(firstStep[0]?.n || 0), joined),
        newMembersPerSharer: sharers > 0 ? Math.round((joined / sharers) * 100) / 100 : null,
      },
      byChannel, byType, topContent, topCommunities,
    };
  }

  private present(code: string, type: string, id: number, channel: string) {
    const site = process.env.FRONTEND_URL || 'https://kentexa.com';
    return { code, url: `${site}/s/${code}`, contentType: type, contentId: id, channel, path: pathFor(type, id) };
  }
}

