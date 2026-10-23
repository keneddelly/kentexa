/**
 * Seller partner agents: "partner first" for a seller's own pickup jobs (owner 2026-10-22).
 *
 * A pickup task whose requester (the seller) has an approved partner agent in the
 * pickup city is offered ONLY to those partner agents for the first few minutes.
 * After that, or as soon as every partner has released it ("Siwezi kufika"), it is
 * open to all agents exactly as before. A partner agent is a normal agent: approved
 * by the normal process, same claim rules, free to take any other job.
 *
 * Settings (environment, optional):
 *   SELLER_PARTNER_FIRST_MINUTES   minutes partners have the job alone, 0..30 (default 5; 0 = off)
 *
 * The table arrives by migration 1792400000000, raised by hand on live. Until it
 * exists the gate is plain TRUE, so nothing changes and nothing can fail. Whether it
 * exists is checked by SellerAgentPartnersService at start-up and every minute, never
 * inside the job queries themselves.
 */
import { customerParcelNumber, smsSafeName } from '../super-agents/customer-parcel-number';

export const SELLER_PARTNER_TABLE = 'public.seller_agent_partner';

export function sellerPartnerFirstMinutes(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseInt(String(env.SELLER_PARTNER_FIRST_MINUTES ?? '').trim(), 10);
  return Number.isFinite(n) ? Math.min(30, Math.max(0, n)) : 5;
}

// ── Does the table exist yet? Checked at most once a minute. ────────────────
let tableReady = false;
let checkedAt = 0;

export async function refreshSellerPartnerTable(
  db: { query: (sql: string, params?: any[]) => Promise<any> }, force = false, now = Date.now(),
) {
  if (tableReady || (!force && now - checkedAt < 60_000)) return tableReady;
  checkedAt = now;
  try {
    const rows: any[] = await db.query(`SELECT to_regclass('public.seller_agent_partner') IS NOT NULL AS ok`);
    tableReady = !!rows?.[0]?.ok;
  } catch {
    tableReady = false;
  }
  return tableReady;
}

/** Read by the job queries; refreshed by SellerAgentPartnersService (start-up and every minute). */
export function sellerPartnerTableReady(): boolean {
  return tableReady;
}

/** Tests only. */
export function setSellerPartnerTableReadyForTests(ready: boolean) {
  tableReady = ready;
  checkedAt = ready ? Date.now() : 0;
}

/**
 * SQL condition: may the agent whose USER id is `agentUserIdSql` see/take pickup task
 * `t` (joined to shipment `s`) now? Needs aliases t and s in the outer query.
 */
export function partnerGateSql(agentUserIdSql: string, minutes = sellerPartnerFirstMinutes()): string {
  if (!tableReady || minutes <= 0) return 'TRUE';
  const partner = (extra: string) => `EXISTS (SELECT 1 FROM ${SELLER_PARTNER_TABLE} sap
        JOIN public.agent pa ON pa."userId" = sap."agentUserId" AND pa.status = 'approved'
         AND lower(btrim(pa.city)) = lower(btrim(s."originCity"))
       WHERE sap."sellerUserId" = t."requestedByUserId" AND sap.status = 'accepted'${extra}
         AND NOT EXISTS (SELECT 1 FROM public.activity_events pe WHERE pe."eventType" = 'PICKUP_RELEASED'
               AND pe."targetType" = 'parcel_pickup_task' AND pe."targetId" = t.id AND pe."actorProfileId" = pa.id))`;
  return `(t."createdAt" <= now() - make_interval(mins => ${minutes})`
    + ` OR NOT ${partner('')}`
    + ` OR ${partner(` AND sap."agentUserId" = ${agentUserIdSql}`)})`;
}

export const PARTNER_JOB_MESSAGE = 'Kazi hii imepewa kwanza wakala mshirika wa muuzaji. Itafunguka kwa wakala wote baada ya dakika chache.';

/** The partner agent's job SMS: from the seller, one part, plain characters. */
export function partnerPickupOfferSms(shopName: string, reference: string, area: string) {
  const shop = smsSafeName(shopName).slice(0, 30) || 'Muuzaji wako';
  const where = smsSafeName(area).slice(0, 30) || 'mjini';
  return `KenteXa: ${shop} ana kazi ya kuchukua mzigo${reference ? ` ${reference}` : ''}, eneo ${where}. Fungua KenteXa ukubali kazi.`;
}

/**
 * Right after a seller's pickup task is created: tell the seller's approved partner
 * agents in that city, at once, by SMS (online or not -- it is their seller's job).
 * Each agent at most once per task (recorded before sending). Never throws.
 */
export async function offerTaskToSellerPartners(
  db: { query: (sql: string, params?: any[]) => Promise<any> },
  sms: { sendSms: (phone: string, text: string) => Promise<any> } | null | undefined,
  taskId: number,
): Promise<number> {
  try {
    if (!sms || sellerPartnerFirstMinutes() <= 0 || !tableReady) return 0;
    const rows: any[] = await db.query(`
      SELECT a.id AS "agentId", COALESCE(NULLIF(btrim(a.phone), ''), au.phone) AS phone,
             COALESCE(NULLIF(btrim(sp."businessName"), ''), NULLIF(btrim(su."storeName"), ''), su.name) AS "shopName",
             COALESCE(NULLIF(btrim(s."originWard"), ''), NULLIF(btrim(s."originDistrictName"), ''), s."originCity") AS area,
             s."trackingNumber" AS "shipmentNumber", p."trackingNumber", p."waybillNumber", p."createdAt" AS "parcelCreatedAt"
        FROM public.parcel_pickup_task t
        JOIN public.parcel p ON p.id = t."parcelId"
        JOIN public.shipment s ON s.id = p."shipmentId"
        JOIN ${SELLER_PARTNER_TABLE} sap ON sap."sellerUserId" = t."requestedByUserId" AND sap.status = 'accepted'
        JOIN public.agent a ON a."userId" = sap."agentUserId" AND a.status = 'approved'
         AND lower(btrim(a.city)) = lower(btrim(s."originCity"))
        LEFT JOIN public."user" au ON au.id = a."userId"
        LEFT JOIN public."user" su ON su.id = t."requestedByUserId"
        LEFT JOIN LATERAL (SELECT x."businessName" FROM public.seller_profile x
                            WHERE x."userId" = t."requestedByUserId" ORDER BY x.id ASC LIMIT 1) sp ON true
       WHERE t.id = $1 AND t.status = 'requested'
         AND NOT EXISTS (SELECT 1 FROM public.activity_events e WHERE e."eventType" = 'PARTNER_PICKUP_OFFER_SENT'
               AND e."targetType" = 'parcel_pickup_task' AND e."targetId" = t.id AND e."actorProfileId" = a.id)
       LIMIT 5`, [taskId]);
    let sent = 0;
    for (const r of rows) {
      if (!r.phone) continue;
      const reference = customerParcelNumber({
        trackingNumber: r.shipmentNumber ?? r.trackingNumber, waybillNumber: r.waybillNumber, createdAt: r.parcelCreatedAt,
      });
      await db.query(`INSERT INTO public.activity_events
          ("eventType", category, "actorProfileId", "actorProfileType", "targetType", "targetId", metadata, severity, visibility)
        VALUES ('PARTNER_PICKUP_OFFER_SENT', 'LOGISTICS', $1, 'agent', 'parcel_pickup_task', $2, $3::jsonb, 'info', 'admin')`,
        [r.agentId, taskId, JSON.stringify({ reference })]);
      const ok = await sms.sendSms(r.phone, partnerPickupOfferSms(r.shopName || '', reference, r.area || '')).catch(() => false);
      if (ok !== false) sent++;
    }
    return sent;
  } catch {
    return 0;
  }
}
