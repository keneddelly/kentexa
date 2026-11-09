import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { money, profitState } from '../resale/resale-rules';

/**
 * Admin: the "Uza tena" launch (owner 2026-11-10: "we need this to become our door to the
 * market"). The numbers to watch: how many shops and resellers take part, resale orders a week,
 * how many are delivered, how fast shops pay resellers, and every late or disputed profit.
 * Read from the records only (orders from resale offers, products, offers); a part that cannot
 * be read is null, never a made-up number.
 */
const DAY = 86400000;
const WEEKS = 8;

@Injectable()
export class ResaleLaunchService {
  constructor(private readonly db: DataSource) {}

  private async q<T = any>(sql: string, params: unknown[] = []): Promise<T[] | null> {
    try { return await this.db.query(sql, params); } catch { return null; }
  }

  async launch(now = Date.now()) {
    const [network] = (await this.q(`SELECT
        (SELECT count(DISTINCT p."sellerId") FROM public.product p WHERE p."resaleOpen" = true AND p."resalePrice" > 0)::int AS suppliers,
        (SELECT count(*) FROM public.product p WHERE p."resaleOpen" = true AND p."resalePrice" > 0 AND p."isActive" = true)::int AS products,
        (SELECT count(DISTINCT o."resellerUserId") FROM public.resale_offer o WHERE o."isActive" = true)::int AS resellers,
        (SELECT count(*) FROM public.resale_offer o WHERE o."isActive" = true)::int AS offers,
        (SELECT count(*) FROM public.resale_member m WHERE m."isActive" = true AND m."rulesAcceptedAt" IS NOT NULL)::int AS members`)) || [null];

    const since = new Date(now - WEEKS * 7 * DAY);
    const rows = (await this.q(
      `SELECT o.id, o.status, o."createdAt", o."deliveredAt", o."completedAt", o."resellerProfit", o."totalAmount",
              o."resellerPaidAt", o."resellerConfirmedAt", o."resellerDisputedAt", o."resellerDisputeNote", o."resellerPaidRef",
              o."productNameSnapshot", o."sellerId", o."resellerUserId",
              COALESCE(s."storeName", s.name) AS "supplierName", s.phone AS "supplierPhone", r.name AS "resellerName", r.phone AS "resellerPhone"
         FROM public."order" o
         LEFT JOIN public."user" s ON s.id = o."sellerId"
         LEFT JOIN public."user" r ON r.id = o."resellerUserId"
        WHERE o."resellerUserId" IS NOT NULL AND o."createdAt" >= $1
        ORDER BY o.id DESC LIMIT 5000`, [since])) ;
    if (!rows) return { network: network ?? null, weeks: null, profits: null, payDays: null, problems: null, topResellers: null, topSuppliers: null };

    const items = rows.map((r: any) => ({ ...r, state: profitState(r, now), profit: money(r.resellerProfit) }));

    // Week by week (by the day the order was made), newest last.
    const weekStart = (t: number) => Math.floor((now - t) / (7 * DAY));
    const weeks = Array.from({ length: WEEKS }, (_, i) => ({
      weekAgo: WEEKS - 1 - i, orders: 0, delivered: 0, cancelled: 0, sales: 0, profit: 0,
    }));
    for (const o of items) {
      const w = weekStart(new Date(o.createdAt).getTime());
      const row = weeks.find((x) => x.weekAgo === w);
      if (!row) continue;
      row.orders += 1;
      if (o.status === 'delivered' || o.status === 'completed') { row.delivered += 1; row.sales += money(o.totalAmount); row.profit += o.profit; }
      if (o.status === 'cancelled') row.cancelled += 1;
    }

    const sum = (states: string[]) => {
      const list = items.filter((o) => states.includes(o.state));
      return { count: list.length, amount: money(list.reduce((s, o) => s + o.profit, 0)) };
    };
    const profits = {
      coming: sum(['waiting']), owed: sum(['owed']), late: sum(['late']), paid: sum(['paid']),
      confirmed: sum(['confirmed']), disputed: sum(['disputed']), onHold: sum(['on_hold']),
    };

    // How fast shops pay: days from delivery to "Nimelipa", for profits paid.
    const days = items
      .filter((o) => o.resellerPaidAt && (o.deliveredAt || o.completedAt))
      .map((o) => (new Date(o.resellerPaidAt).getTime() - new Date(o.deliveredAt || o.completedAt).getTime()) / DAY)
      .filter((d) => Number.isFinite(d) && d >= 0)
      .sort((a, b) => a - b);
    const payDays = days.length ? {
      paid: days.length,
      median: Math.round(days[Math.floor((days.length - 1) / 2)] * 10) / 10,
      withinThree: days.filter((d) => d <= 3).length,
    } : { paid: 0, median: null, withinThree: 0 };

    const problems = items
      .filter((o) => o.state === 'late' || o.state === 'disputed')
      .slice(0, 50)
      .map((o) => ({
        orderId: o.id, state: o.state, product: o.productNameSnapshot, profit: o.profit,
        deliveredAt: o.deliveredAt || o.completedAt, paidRef: o.resellerPaidRef, note: o.resellerDisputeNote,
        supplier: { id: o.sellerId, name: o.supplierName, phone: o.supplierPhone },
        reseller: { id: o.resellerUserId, name: o.resellerName, phone: o.resellerPhone },
      }));

    const top = (key: 'resellerUserId' | 'sellerId', name: 'resellerName' | 'supplierName') => {
      const m = new Map<number, { id: number; name: string; orders: number; delivered: number; profit: number }>();
      for (const o of items) {
        const id = Number(o[key]);
        const e = m.get(id) || { id, name: o[name] || `#${id}`, orders: 0, delivered: 0, profit: 0 };
        e.orders += 1;
        if (o.status === 'delivered' || o.status === 'completed') { e.delivered += 1; e.profit = money(e.profit + o.profit); }
        m.set(id, e);
      }
      return [...m.values()].sort((a, b) => b.orders - a.orders || b.delivered - a.delivered).slice(0, 10);
    };

    return {
      network: network ?? null,
      weeks: weeks.map((w) => ({ ...w, sales: money(w.sales), profit: money(w.profit) })),
      profits, payDays, problems,
      topResellers: top('resellerUserId', 'resellerName'),
      topSuppliers: top('sellerId', 'supplierName'),
    };
  }
}
