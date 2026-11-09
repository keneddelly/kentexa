import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Admin stage 3 (owner 2026-11-09: "any added data should be seen on admin ... all features found
 * on KenteXa can be accessed by admin in dashboard"). One list per kind of data that had no admin
 * page: Moments and their reports, communities, hotel orders, POS sales, team invitations,
 * Instagram connections, office prices, live agent jobs, reviews and notifications sent.
 * Each list: newest first, optional words (q) and status, at most 200 rows. Only display fields:
 * no tokens, codes, PINs, ID data or payment proofs. A missing table gives an empty list.
 * (KenteXa keeps no log of SMS sent, so there is no SMS list; notifications are the record.)
 */
interface Dataset { title: string; sql: (where: string, limit: number) => string; search: string[]; status?: string }

const DATASETS: Record<string, Dataset> = {
  moments: {
    title: 'Moments',
    search: ['m.title', 'm.body', 'u.name'], status: 'm.status::text',
    sql: (w, l) => `SELECT m.id, m.type::text AS type, m.title, m.status::text AS status, m.visibility::text AS visibility,
        m."businessId" AS "authorId", u.name AS "authorName",
        (SELECT count(*) FROM public.post_report r WHERE r."postId" = m.id) AS reports,
        (SELECT count(*) FROM public.post_report r WHERE r."postId" = m.id AND r.status = 'open') AS "openReports", m."createdAt"
      FROM public.business_feed_item m LEFT JOIN public."user" u ON u.id = m."businessId" ${w} ORDER BY m.id DESC LIMIT ${l}`,
  },
  reports: {
    title: 'Moments zilizoripotiwa',
    search: ['r.reason', 'r.note', 'm.title', 'ru.name'], status: 'r.status',
    sql: (w, l) => `SELECT r.id, r."postId", m.title AS "postTitle", m.status::text AS "postStatus", m."businessId" AS "authorId", au.name AS "authorName",
        r."reporterId", ru.name AS "reporterName", r.reason, r.note, r.status, r."reviewedAt", r."createdAt"
      FROM public.post_report r LEFT JOIN public.business_feed_item m ON m.id = r."postId"
      LEFT JOIN public."user" ru ON ru.id = r."reporterId" LEFT JOIN public."user" au ON au.id = m."businessId" ${w} ORDER BY r.id DESC LIMIT ${l}`,
  },
  communities: {
    title: 'Jumuiya',
    search: ['c.name', 'c.purpose', 'u.name'], status: 'c.status::text',
    sql: (w, l) => `SELECT c.id, c.name, c.purpose, c."joinPolicy"::text AS "joinPolicy", c.status::text AS status, c."memberCount",
        c."createdById" AS "ownerId", u.name AS "ownerName", c."createdAt"
      FROM public.community c LEFT JOIN public."user" u ON u.id = c."createdById" ${w} ORDER BY c.id DESC LIMIT ${l}`,
  },
  hotel_orders: {
    title: 'Oda za hoteli',
    search: ['b."tradingName"', 'b."legalName"', 'f."placeNumber"', 'cu.name'], status: 'f.status::text',
    sql: (w, l) => `SELECT f.id, f."businessId", coalesce(b."tradingName", b."legalName") AS "businessName", f.mode::text AS mode,
        f."placeType"::text AS "placeType", f."placeNumber", f."totalAmount", f."paymentMethod"::text AS "paymentMethod",
        f."paymentStatus"::text AS "paymentStatus", f.status::text AS status, f."customerId", cu.name AS "customerName", f."createdAt"
      FROM public.food_order f LEFT JOIN public.business b ON b.id = f."businessId" LEFT JOIN public."user" cu ON cu.id = f."customerId" ${w} ORDER BY f.id DESC LIMIT ${l}`,
  },
  pos_sales: {
    title: 'Mauzo ya POS',
    search: ['s."receiptNumber"', 's."customerName"', 'u.name'], status: 's.status::text',
    sql: (w, l) => `SELECT s.id, s."receiptNumber", s.channel::text AS channel, s."sellerId", u.name AS "sellerName", s."customerName",
        s.total, s."paymentMethod"::text AS "paymentMethod", s."isCod", s."balanceDue", s.status::text AS status, s."createdAt"
      FROM public.sale s LEFT JOIN public."user" u ON u.id = s."sellerId" ${w} ORDER BY s.id DESC LIMIT ${l}`,
  },
  team_invitations: {
    title: 'Mialiko ya timu',
    search: ['t.name', 't.phone', 'cp."displayName"'], status: 't.status::text',
    sql: (w, l) => `SELECT t.id, t."commerceProfileId", cp."displayName" AS "businessName", t.name, t.phone, t.role::text AS role,
        t.status::text AS status, t."invitedByUserId", iu.name AS "invitedByName", t."userId", t."respondedAt", t."createdAt"
      FROM public.team_invitation t LEFT JOIN public.commerce_profile cp ON cp.id = t."commerceProfileId"
      LEFT JOIN public."user" iu ON iu.id = t."invitedByUserId" ${w} ORDER BY t.id DESC LIMIT ${l}`,
  },
  instagram: {
    title: 'Instagram',
    search: ['i."instagramUsername"', 'i."facebookPageName"', 'b."tradingName"', 'b."legalName"'], status: 'i.status::text',
    sql: (w, l) => `SELECT i.id, i."businessId", coalesce(b."tradingName", b."legalName") AS "businessName", i."instagramUsername",
        to_jsonb(i)->>'facebookPageName' AS "facebookPageName", i.status::text AS status, i."webhookSubscribed",
        to_jsonb(i)->>'webhookError' AS "webhookError", i."connectedAt", i."lastVerifiedAt", i."createdAt"
      FROM public.instagram_business_connection i LEFT JOIN public.business b ON b.id = i."businessId" ${w} ORDER BY i.id DESC LIMIT ${l}`,
  },
  office_prices: {
    title: 'Bei za ofisi',
    search: ['r."originCity"', 'r."destinationCity"', 'sa."businessName"'], status: `CASE WHEN r."isActive" THEN 'active' ELSE 'inactive' END`,
    sql: (w, l) => `SELECT r.id, r."superAgentId" AS "officeId", sa."businessName" AS "officeName", r."originCity", r."destinationCity",
        r."ratePerKg", r."minimumCharge", r."estimatedDays", r."isActive", r."createdAt"
      FROM public.shipping_rate r LEFT JOIN public.super_agent sa ON sa.id = r."superAgentId" ${w} ORDER BY r.id DESC LIMIT ${l}`,
  },
  agent_jobs: {
    title: 'Kazi za mawakala',
    search: ['s."trackingNumber"', 'au.name', 's."originCity"', 's."destinationCity"'], status: 't.status::text',
    sql: (w, l) => `SELECT t.id, t.status::text AS status, t."servicePath"::text AS "servicePath", s."trackingNumber", s."originCity", s."destinationCity",
        t."requestedByUserId" AS "senderId", su.name AS "senderName", t."agentProfileId", au.name AS "agentName",
        t."createdAt", t."claimedAt", t."collectedAt"
      FROM public.parcel_pickup_task t LEFT JOIN public.parcel p ON p.id = t."parcelId" LEFT JOIN public.shipment s ON s.id = p."shipmentId"
      LEFT JOIN public."user" su ON su.id = t."requestedByUserId" LEFT JOIN public.agent a ON a.id = t."agentProfileId"
      LEFT JOIN public."user" au ON au.id = a."userId" ${w} ORDER BY t.id DESC LIMIT ${l}`,
  },
  reviews: {
    title: 'Maoni',
    search: ['x.comment', 'x."reviewerName"', 'x."subjectName"'],
    sql: (w, l) => `SELECT * FROM (
        SELECT 'duka' AS kind, r.id, r.rating, r.comment, r.verified, r."buyerId" AS "reviewerId", bu.name AS "reviewerName",
          r."sellerId" AS "subjectId", su.name AS "subjectName", r."createdAt"
        FROM public.review r LEFT JOIN public."user" bu ON bu.id = r."buyerId" LEFT JOIN public."user" su ON su.id = r."sellerId"
        UNION ALL
        SELECT 'bidhaa' AS kind, pr.id, pr.rating, pr.comment, pr."isVerifiedPurchase" AS verified, pr."reviewerId", ru.name AS "reviewerName",
          pr."productId" AS "subjectId", p.name AS "subjectName", pr."createdAt"
        FROM public.product_review pr LEFT JOIN public."user" ru ON ru.id = pr."reviewerId" LEFT JOIN public.product p ON p.id = pr."productId"
      ) x ${w} ORDER BY x."createdAt" DESC LIMIT ${l}`,
  },
  notifications: {
    title: 'Taarifa zilizotumwa',
    search: ['n.title', 'n.body', 'n.type', 'u.name'], status: `CASE WHEN n."isRead" THEN 'read' ELSE 'unread' END`,
    sql: (w, l) => `SELECT n.id, n.type, n.title, n.body, n."userId", u.name AS "userName", n."isRead", n."readAt", n."createdAt"
      FROM public.notification n LEFT JOIN public."user" u ON u.id = n."userId" ${w} ORDER BY n.id DESC LIMIT ${l}`,
  },
};

export const ADMIN_DATASETS = Object.freeze(Object.fromEntries(Object.entries(DATASETS).map(([k, v]) => [k, v.title])));

@Injectable()
export class AdminDataService {
  constructor(private readonly db: DataSource) {}

  async list(key: string, opts: { q?: string; status?: string; limit?: number } = {}) {
    const d = DATASETS[key];
    if (!d) throw new NotFoundException('Data hii haipo');
    const where: string[] = []; const params: unknown[] = [];
    const q = String(opts.q || '').trim().slice(0, 80);
    if (q) { params.push(`%${q}%`); where.push(`(${d.search.map((c) => `${c}::text ILIKE $${params.length}`).join(' OR ')})`); }
    const status = String(opts.status || '').trim().slice(0, 40);
    if (status && d.status) { params.push(status); where.push(`${d.status} = $${params.length}`); }
    const limit = Math.min(200, Math.max(1, Number(opts.limit) || 100));
    try {
      const rows = await this.db.query(d.sql(where.length ? `WHERE ${where.join(' AND ')}` : '', limit), params);
      return { key, title: d.title, rows };
    } catch {
      return { key, title: d.title, rows: [], unavailable: true };
    }
  }

  /**
   * A reported Moment (owner 2026-11-09): hide it (status archived, no longer shown) or keep it.
   * Either way its open reports are closed with who and when. The change itself is recorded by
   * the action recorder; this never deletes the Moment.
   */
  async reviewReport(reportId: number, adminId: number, decision: 'hide' | 'keep') {
    if (decision !== 'hide' && decision !== 'keep') throw new BadRequestException('Chagua: ficha au acha');
    const [report] = await this.db.query(`SELECT id, "postId" FROM public.post_report WHERE id = $1`, [reportId]);
    if (!report) throw new NotFoundException('Ripoti haipo');
    if (decision === 'hide') {
      await this.db.query(`UPDATE public.business_feed_item SET status = 'archived', "isActive" = false WHERE id = $1`, [report.postId]);
    }
    const closed = await this.db.query(
      `UPDATE public.post_report SET status = $3, "reviewedAt" = now(), "reviewedById" = $2 WHERE "postId" = $1 AND status = 'open' RETURNING id`,
      [report.postId, adminId, decision === 'hide' ? 'actioned' : 'dismissed']);
    return { postId: Number(report.postId), decision, reportsClosed: closed.length };
  }
}
