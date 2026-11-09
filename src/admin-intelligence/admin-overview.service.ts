import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Admin "Muhtasari" in one call (owner 2026-11-09: "admin is the mirror of KenteXa ... any added
 * data should be seen on admin"). The dashboard used to download every product, order, advert
 * and user to count them in the browser. Here every number is one COUNT/SUM in the database,
 * and each one is read on its own: a table that is missing (or a query that fails) gives null
 * for that number, never a broken page. Real records only.
 */
@Injectable()
export class AdminOverviewService {
  constructor(private readonly db: DataSource) {}

  private async one(sql: string): Promise<Record<string, number | null>> {
    try {
      const [row] = await this.db.query(sql);
      const out: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(row || {})) out[k] = v == null ? null : Number(v);
      return out;
    } catch {
      return {};
    }
  }

  async overview() {
    const [users, businesses, products, classifieds, services, orders, shipments, offices, agents,
      identity, applications, sellers, contact, disputes, pickups, reported] = await Promise.all([
      this.one(`SELECT count(*) AS total, count(*) FILTER (WHERE "createdAt" >= now() - interval '1 day') AS today,
        count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days') AS week FROM public."user"`),
      this.one(`SELECT count(*) AS total, count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days') AS week FROM public.business`),
      this.one(`SELECT count(*) FILTER (WHERE "isActive" = true) AS active, count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days') AS week FROM public.product`),
      this.one(`SELECT count(*) FILTER (WHERE status::text = 'active') AS active, count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days') AS week FROM public.classified`),
      this.one(`SELECT count(*) FILTER (WHERE status::text = 'active') AS active, count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days') AS week FROM public.service_ad`),
      this.one(`SELECT count(*) AS total,
        count(*) FILTER (WHERE "createdAt" >= now() - interval '1 day') AS today,
        coalesce(sum("totalAmount") FILTER (WHERE "createdAt" >= now() - interval '1 day'), 0) AS "todayValue",
        count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days') AS week,
        coalesce(sum("totalAmount") FILTER (WHERE "createdAt" >= now() - interval '7 days'), 0) AS "weekValue",
        coalesce(sum("totalAmount") FILTER (WHERE "paymentStatus"::text = 'paid'), 0) AS "paidValue"
        FROM public."order"`),
      this.one(`SELECT count(*) FILTER (WHERE "createdAt" >= now() - interval '1 day') AS today,
        count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days') AS week,
        count(*) FILTER (WHERE status::text NOT IN ('delivered', 'completed', 'cancelled')) AS open FROM public.shipment`),
      this.one(`SELECT count(*) FILTER (WHERE status::text = 'active') AS active, count(*) FILTER (WHERE status::text = 'pending') AS pending FROM public.super_agent`),
      this.one(`SELECT count(*) AS total, count(*) FILTER (WHERE "isOnline" = true) AS online FROM public.agent`),
      this.one(`SELECT count(*) FILTER (WHERE status::text = 'pending') AS pending FROM public.identity_profile`),
      this.one(`SELECT count(*) FILTER (WHERE status::text = 'pending') AS pending FROM public.business_capability_application`),
      this.one(`SELECT count(*) FILTER (WHERE status::text = 'pending') AS pending FROM public.seller_profile`),
      this.one(`SELECT count(*) FILTER (WHERE status::text = 'open') AS open FROM public.contact_message`),
      this.one(`SELECT count(*) FILTER (WHERE status::text IN ('open', 'reviewing')) AS open FROM public.dispute`),
      this.one(`SELECT count(*) FILTER (WHERE status::text = 'requested') AS waiting FROM public.parcel_pickup_task`),
      this.one(`SELECT count(*) AS week FROM public.activity_events WHERE "eventType" = 'MOMENT_REPORTED' AND "createdAt" >= now() - interval '7 days'`),
    ]);
    let recentOrders: any[] = [];
    try {
      recentOrders = await this.db.query(`SELECT o.id, o."totalAmount", o.status, o."createdAt", u.name AS "buyerName"
        FROM public."order" o LEFT JOIN public."user" u ON u.id = o."buyerId" ORDER BY o."createdAt" DESC LIMIT 6`);
    } catch { recentOrders = []; }
    return {
      at: new Date().toISOString(),
      // Things waiting for someone at KenteXa, each opens its page.
      needsAction: {
        identityPending: identity.pending ?? null,
        applicationsPending: applications.pending ?? null,
        sellersPending: sellers.pending ?? null,
        officesPending: offices.pending ?? null,
        contactOpen: contact.open ?? null,
        disputesOpen: disputes.open ?? null,
        pickupsWaiting: pickups.waiting ?? null,
        momentsReportedWeek: reported.week ?? null,
      },
      users, businesses, products, classifieds, services, orders, shipments,
      offices: { active: offices.active ?? null }, agents,
      recentOrders: recentOrders.map((o) => ({ id: o.id, totalAmount: Number(o.totalAmount) || 0, status: o.status, createdAt: o.createdAt, buyerName: o.buyerName ?? null })),
    };
  }
}
