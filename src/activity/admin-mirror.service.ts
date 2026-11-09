import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActivityCategory } from './entities/activity-event.entity';

/**
 * The admin mirror (owner 2026-11-09: "admin is the mirror of KenteXa ... any added data should
 * be seen on admin"): the live feed of every recorded action, and everything about one person or
 * one business on one page. Reads only; every part is read on its own so one missing table never
 * blanks the page. Never returns passwords, ID numbers, ID images or tokens.
 */
export interface FeedFilter {
  category?: string; eventType?: string; actorId?: number; businessId?: number;
  kind?: 'all' | 'named' | 'action'; before?: number; limit?: number; q?: string;
}

@Injectable()
export class AdminMirrorService {
  constructor(private readonly db: DataSource) {}

  private async rows(sql: string, params: unknown[] = []): Promise<any[]> {
    try { return await this.db.query(sql, params); } catch { return []; }
  }
  private async count(sql: string, params: unknown[] = []): Promise<number | null> {
    try { const [r] = await this.db.query(sql, params); return r ? Number(Object.values(r)[0]) : null; } catch { return null; }
  }

  async feed(f: FeedFilter) {
    const where: string[] = []; const params: unknown[] = [];
    // Each condition writes its own placeholder for the value just added.
    const add = (build: (p: string) => string, v: unknown) => { params.push(v); where.push(build(`$${params.length}`)); };
    if (f.category && (Object.values(ActivityCategory) as string[]).includes(f.category)) add((p) => `e.category::text = ${p}`, f.category);
    if (f.eventType) add((p) => `e."eventType" = ${p}`, String(f.eventType).slice(0, 80));
    if (f.actorId) add((p) => `(e."actorId" = ${p} OR e."relatedUserId" = ${p})`, f.actorId);
    if (f.businessId) add((p) => `(e."businessId" = ${p} OR e."relatedBusinessId" = ${p})`, f.businessId);
    if (f.kind === 'named') where.push(`e."eventType" <> 'ACTION'`);
    if (f.kind === 'action') where.push(`e."eventType" = 'ACTION'`);
    if (f.q) add((p) => `(e."eventType" ILIKE ${p} OR e.metadata->>'route' ILIKE ${p})`, `%${String(f.q).slice(0, 60)}%`);
    if (f.before) add((p) => `e.id < ${p}`, f.before);
    const limit = Math.min(200, Math.max(1, Number(f.limit) || 60));
    const items = await this.rows(
      `SELECT e.id, e."eventType", e.category, e."actorId", e."actorType", e."businessId", e."targetType", e."targetId",
              e."relatedUserId", e."relatedBusinessId", e.metadata, e.severity, e."createdAt",
              u.name AS "actorName", u.phone AS "actorPhone"
         FROM public.activity_events e LEFT JOIN public."user" u ON u.id = e."actorId"
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY e.id DESC LIMIT ${limit}`, params);
    return { items, nextBefore: items.length === limit ? items[items.length - 1].id : null };
  }

  async person(userId: number) {
    const [user] = await this.rows(`SELECT id, name, email, phone, role, "createdAt" FROM public."user" WHERE id = $1`, [userId]);
    if (!user) throw new NotFoundException('Mtumiaji hayupo');
    const [roles, identity, businesses, recentOrders, recentShipments, events] = await Promise.all([
      this.rows(`SELECT id, "roleType", status, "createdAt" FROM public.account_role WHERE "userId" = $1 ORDER BY id`, [userId]),
      this.rows(`SELECT status, "idType", "legalName", "reviewedAt", "reviewedBy", "rejectionReason" FROM public.identity_profile WHERE "userId" = $1`, [userId]),
      this.rows(`SELECT id, coalesce("tradingName", "legalName") AS name, status, "createdAt" FROM public.business WHERE "userId" = $1 ORDER BY id`, [userId]),
      this.rows(`SELECT id, "totalAmount", status, "paymentStatus", "createdAt", ("buyerId" = $1) AS "asBuyer" FROM public."order"
        WHERE "buyerId" = $1 OR "sellerId" = $1 ORDER BY id DESC LIMIT 10`, [userId]),
      this.rows(`SELECT id, "trackingNumber", status, "originCity", "destinationCity", "createdAt" FROM public.shipment
        WHERE "requestedByUserId" = $1 ORDER BY id DESC LIMIT 10`, [userId]),
      this.rows(`SELECT e.id, e."eventType", e.category, e."actorId", e."actorType", e."targetType", e."targetId", e.metadata, e.severity, e."createdAt"
        FROM public.activity_events e WHERE e."actorId" = $1 OR e."relatedUserId" = $1 ORDER BY e.id DESC LIMIT 100`, [userId]),
    ]);
    const [ordersBought, ordersSold, products, classifieds, services, shipments, moments] = await Promise.all([
      this.count(`SELECT count(*) FROM public."order" WHERE "buyerId" = $1`, [userId]),
      this.count(`SELECT count(*) FROM public."order" WHERE "sellerId" = $1`, [userId]),
      this.count(`SELECT count(*) FROM public.product WHERE "sellerId" = $1`, [userId]),
      this.count(`SELECT count(*) FROM public.classified WHERE "sellerId" = $1`, [userId]),
      this.count(`SELECT count(*) FROM public.service_ad WHERE "providerId" = $1`, [userId]),
      this.count(`SELECT count(*) FROM public.shipment WHERE "requestedByUserId" = $1`, [userId]),
      this.count(`SELECT count(*) FROM public.business_feed_item WHERE "businessId" = $1`, [userId]),
    ]);
    return {
      user, roles, identity: identity[0] ?? null, businesses,
      counts: { ordersBought, ordersSold, products, classifieds, services, shipments, moments },
      recentOrders, recentShipments, events,
    };
  }

  async business(businessId: number) {
    const [business] = await this.rows(`SELECT b.id, b."legalName", b."tradingName", b.status, b."createdAt", b."userId" AS "ownerId",
        u.name AS "ownerName", u.phone AS "ownerPhone" FROM public.business b LEFT JOIN public."user" u ON u.id = b."userId" WHERE b.id = $1`, [businessId]);
    if (!business) throw new NotFoundException('Biashara haipo');
    const ws = `(SELECT id FROM public.operational_workspace WHERE "businessId" = $1)`;
    const [capabilities, members, recentOrders, events] = await Promise.all([
      this.rows(`SELECT "capabilityCode", status, "workspaceId", "updatedAt" FROM public.business_capability WHERE "workspaceId" IN ${ws} ORDER BY "capabilityCode"`, [businessId]),
      this.rows(`SELECT m.id, m."userId", m."roleTemplate" AS role, m.status, u.name FROM public.business_membership m LEFT JOIN public."user" u ON u.id = m."userId" WHERE m."businessId" = $1 ORDER BY m.id`, [businessId]),
      this.rows(`SELECT id, "totalAmount", status, "paymentStatus", "createdAt" FROM public."order" WHERE "workspaceId" IN ${ws} ORDER BY id DESC LIMIT 10`, [businessId]),
      this.rows(`SELECT e.id, e."eventType", e.category, e."actorId", e."actorType", e."targetType", e."targetId", e.metadata, e.severity, e."createdAt",
          u.name AS "actorName" FROM public.activity_events e LEFT JOIN public."user" u ON u.id = e."actorId"
        WHERE e."businessId" = $1 OR e."relatedBusinessId" = $1 ORDER BY e.id DESC LIMIT 100`, [businessId]),
    ]);
    const [products, orders, services, offices] = await Promise.all([
      this.count(`SELECT count(*) FROM public.product WHERE "workspaceId" IN ${ws}`, [businessId]),
      this.count(`SELECT count(*) FROM public."order" WHERE "workspaceId" IN ${ws}`, [businessId]),
      this.count(`SELECT count(*) FROM public.service_ad WHERE "businessId" = $1`, [businessId]),
      this.count(`SELECT count(*) FROM public.super_agent WHERE "workspaceId" IN ${ws}`, [businessId]),
    ]);
    return { business, capabilities, members, counts: { products, orders, services, offices }, recentOrders, events };
  }

  // ── Inbox chats (owner 2026-11-09: "kentexa should see what is chatting between users"; owner
  // chose: admin reads all chats). Who talks with whom, how much, and the messages themselves.
  // Every opened chat is recorded with who opened it (ADMIN_CHAT_VIEWED). ──
  async chats(f: { q?: string; userId?: number; before?: number; limit?: number }) {
    const where: string[] = []; const params: unknown[] = [];
    const add = (build: (p: string) => string, v: unknown) => { params.push(v); where.push(build(`$${params.length}`)); };
    if (f.userId) add((p) => `(c.seller_id = ${p} OR bc.user_id = ${p})`, f.userId);
    if (f.q) add((p) => `(su.name ILIKE ${p} OR su.phone ILIKE ${p} OR bc.name ILIKE ${p} OR bc.phone ILIKE ${p} OR c."lastMessagePreview" ILIKE ${p})`, `%${String(f.q).slice(0, 60)}%`);
    if (f.before) add((p) => `c.id < ${p}`, f.before);
    const limit = Math.min(100, Math.max(1, Number(f.limit) || 40));
    const items = await this.rows(
      `SELECT c.id, c.channel, c.status, c."messageCount", c."lastMessageAt", c."lastMessagePreview", c."linkedOrderId", c."commerceProfileId", c."createdAt",
              c.seller_id AS "sellerId", su.name AS "sellerName", su.phone AS "sellerPhone",
              bc.user_id AS "customerUserId", bc.name AS "customerName", bc.phone AS "customerPhone"
         FROM public.conversation c
         LEFT JOIN public."user" su ON su.id = c.seller_id
         LEFT JOIN public.business_customer bc ON bc.id = c.customer_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY c.id DESC LIMIT ${limit}`, params);
    return { items, nextBefore: items.length === limit ? items[items.length - 1].id : null };
  }

  async chat(conversationId: number) {
    const [conversation] = await this.rows(
        `SELECT c.id, c.channel, c.status, c."messageCount", c."lastMessageAt", c."linkedOrderId", c."commerceProfileId", c."createdAt",
                c.seller_id AS "sellerId", su.name AS "sellerName", su.phone AS "sellerPhone",
                bc.user_id AS "customerUserId", bc.name AS "customerName", bc.phone AS "customerPhone"
           FROM public.conversation c
           LEFT JOIN public."user" su ON su.id = c.seller_id
           LEFT JOIN public.business_customer bc ON bc.id = c.customer_id
          WHERE c.id = $1`, [conversationId]);
    if (!conversation) throw new NotFoundException('Mazungumzo hayapo');
    const messages = await this.rows(
      `SELECT m.id, m."senderType", m.sender_id AS "senderId", u.name AS "senderName", m.type, m.content, m."imageUrl", m."isNote", m."createdAt"
         FROM public.conversation_message m LEFT JOIN public."user" u ON u.id = m.sender_id
        WHERE m.conversation_id = $1 ORDER BY m.id ASC LIMIT 1000`, [conversationId]);
    return { conversation, messages };
  }
}
