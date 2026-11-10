import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { InAppNotificationService } from '../notifications/in-app-notification.service';

/**
 * "Uza tena" weekly summary (owner 2026-11-10, growth plan). Monday morning, one notification:
 *  - to each reseller with activity in the last 7 days: link opens, orders, profit on its way;
 *  - to each shop whose products resellers sold: how many sales, how many resellers, profit to pay.
 * Only real numbers from the records; nobody with nothing to report gets a message. Sent once a
 * week per person (notification sourceType resale_weekly, sourceId = the week number).
 */
export const weekNumber = (d = new Date()) => Math.floor(d.getTime() / (7 * 86400000));
const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;

export const RESELLER_WEEK_SQL = `
  SELECT u.id AS "userId",
    COALESCE((SELECT SUM(x.opens) FROM public.resale_offer_open x JOIN public.resale_offer o ON o.id = x."offerId"
               WHERE o."resellerUserId" = u.id AND x.day >= CURRENT_DATE - 7), 0)::int AS opens,
    (SELECT COUNT(*) FROM public."order" r WHERE r."resellerUserId" = u.id AND r."createdAt" >= now() - interval '7 days'
       AND r.status::text <> 'cancelled')::int AS orders,
    COALESCE((SELECT SUM(r."resellerProfit") FROM public."order" r WHERE r."resellerUserId" = u.id
       AND r.status::text NOT IN ('cancelled') AND r."resellerPaidAt" IS NULL), 0)::numeric AS coming
  FROM public."user" u
  WHERE u.id IN (SELECT DISTINCT "resellerUserId" FROM public.resale_offer)`;

export const SHOP_WEEK_SQL = `
  SELECT r."sellerId" AS "userId", COUNT(*)::int AS sales, COUNT(DISTINCT r."resellerUserId")::int AS resellers,
    COALESCE((SELECT SUM(p."resellerProfit") FROM public."order" p WHERE p."sellerId" = r."sellerId" AND p."resellerUserId" IS NOT NULL
       AND p.status::text IN ('delivered', 'completed') AND p."resellerPaidAt" IS NULL), 0)::numeric AS "toPay"
  FROM public."order" r
  WHERE r."resellerUserId" IS NOT NULL AND r."createdAt" >= now() - interval '7 days' AND r.status::text <> 'cancelled'
  GROUP BY r."sellerId"`;

/** The reseller's line, from real numbers only; null when there is nothing to tell. */
export function resellerMessage(r: { opens: number; orders: number; coming: number }): string | null {
  const parts: string[] = [];
  if (r.opens > 0) parts.push(`watu ${r.opens} wamefungua viungo vyako`);
  if (r.orders > 0) parts.push(`oda ${r.orders}`);
  if (!parts.length && !(r.coming > 0)) return null;
  const head = parts.length ? `Wiki hii ${parts.join(', ')}.` : 'Wiki hii hakuna oda mpya.';
  return r.coming > 0 ? `${head} Faida inayokuja: ${tzs(r.coming)}.` : `${head} Shiriki tena kwenye WhatsApp Status ili uuze zaidi.`;
}

export function shopMessage(s: { sales: number; resellers: number; toPay: number }): string | null {
  if (!(s.sales > 0)) return null;
  const who = s.resellers === 1 ? 'Muuzaji 1 ameuza' : `Wauzaji ${s.resellers} wameuza`;
  const pay = s.toPay > 0 ? ` Faida ya kuwalipa (ndani ya siku 3 baada ya mteja kupokea): ${tzs(s.toPay)}.` : '';
  return `${who} bidhaa zako mara ${s.sales} wiki hii.${pay}`;
}

@Injectable()
export class ResaleWeeklyService {
  private readonly logger = new Logger(ResaleWeeklyService.name);

  constructor(private readonly db: DataSource, @Optional() private readonly notifier?: InAppNotificationService) {}

  // Monday 08:07 in Dar es Salaam.
  @Cron('7 8 * * 1', { timeZone: 'Africa/Dar_es_Salaam' })
  async send(now = new Date()): Promise<{ resellers: number; shops: number }> {
    const week = weekNumber(now);
    let sentBefore = new Set<number>();
    try {
      const rows: any[] = await this.db.query(
        `SELECT DISTINCT "userId" FROM public.notification WHERE "sourceType" = 'resale_weekly' AND "sourceId" = $1::int`, [week]);
      sentBefore = new Set(rows.map((r) => Number(r.userId)));
    } catch { /* first run */ }
    const out = { resellers: 0, shops: 0 };

    let resellers: any[] = [];
    try { resellers = await this.db.query(RESELLER_WEEK_SQL); } catch { resellers = []; } // before the tracking migration
    for (const r of resellers) {
      const userId = Number(r.userId);
      const body = resellerMessage({ opens: Number(r.opens) || 0, orders: Number(r.orders) || 0, coming: Number(r.coming) || 0 });
      if (!body || sentBefore.has(userId)) continue;
      sentBefore.add(userId);
      await this.notifier?.notify({ userId, type: 'resale_weekly', title: 'Wiki yako ya Uza tena', body, actionPage: 'MyResales', sourceType: 'resale_weekly', sourceId: week }).catch(() => undefined);
      out.resellers += 1;
    }

    let shops: any[] = [];
    try { shops = await this.db.query(SHOP_WEEK_SQL); } catch { shops = []; }
    for (const s of shops) {
      const userId = Number(s.userId);
      const body = shopMessage({ sales: Number(s.sales) || 0, resellers: Number(s.resellers) || 0, toPay: Number(s.toPay) || 0 });
      if (!body || sentBefore.has(userId)) continue;
      sentBefore.add(userId);
      await this.notifier?.notify({ userId, type: 'resale_weekly', title: 'Uza tena: wiki hii dukani kwako', body, actionPage: 'MyResales', sourceType: 'resale_weekly', sourceId: week }).catch(() => undefined);
      out.shops += 1;
    }
    if (out.resellers || out.shops) this.logger.log(`Uza tena weekly: ${out.resellers} resellers, ${out.shops} shops`);
    return out;
  }
}
