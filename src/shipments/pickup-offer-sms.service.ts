import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { SmsService } from '../sms/sms.service';
import { PICKUP_TO_BASE_DISTANCE_SQL } from './pickup-pin';
import { customerParcelNumber, smsSafeName } from '../super-agents/customer-parcel-number';

/**
 * Job offer by SMS (owner 2026-10-14). The in-app alert reaches only agents
 * with the app open; a pickup still waiting after a short delay is also sent
 * by SMS to the nearest few online agents -- the waybill and the area only,
 * never the exact pin or the sender's details.
 *
 * Settings (environment, all optional, defaults built in):
 *   PICKUP_OFFER_SMS_AGENTS         how many agents get the SMS, 0..3 (default 3; 0 = off)
 *   PICKUP_OFFER_SMS_DELAY_MINUTES  minutes the job waits before the SMS, 0..60 (default 2)
 * Each job is SMS-offered to at most that many agents in total, each agent at
 * most once (recorded as an activity event before sending); jobs older than
 * 2 hours are never SMS-offered.
 */
export const PICKUP_OFFER_MAX_AGE_MINUTES = 120;

export function pickupOfferSmsConfig(env: Record<string, string | undefined> = process.env) {
  const int = (v: string | undefined, def: number, min: number, max: number) => {
    const n = Number.parseInt(String(v ?? '').trim(), 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return {
    agents: int(env.PICKUP_OFFER_SMS_AGENTS, 3, 0, 3),
    delayMinutes: int(env.PICKUP_OFFER_SMS_DELAY_MINUTES, 2, 0, 60),
  };
}

/** Plain characters only, one SMS part. */
export function pickupOfferSms(reference: string, area: string, destination: string) {
  const where = smsSafeName(area).slice(0, 30) || 'mjini';
  const to = smsSafeName(destination).slice(0, 24);
  return `KenteXa: Kazi mpya ya kuchukua mzigo${reference ? ` ${reference}` : ''}, eneo ${where}${to ? `, kwenda ${to}` : ''}. Fungua KenteXa ukubali kazi.`;
}

@Injectable()
export class PickupOfferSmsService {
  private readonly logger = new Logger(PickupOfferSmsService.name);
  constructor(private readonly db: DataSource, @Optional() private readonly sms?: SmsService) {}

  @Cron('* * * * *')
  async tick(): Promise<void> {
    try { await this.runOnce(new Date()); }
    catch (err: any) { this.logger.warn(`Pickup offer SMS tick failed: ${err?.message || err}`); }
  }

  async runOnce(now: Date, config = pickupOfferSmsConfig()): Promise<{ sent: number; failed: number; skipped: string | null }> {
    if (!this.sms || config.agents === 0) return { sent: 0, failed: 0, skipped: 'off' };
    const toSend = await this.db.transaction(async (em) => {
      // One tick at a time, even with two servers: the second one skips.
      const lock: any[] = await em.query(`SELECT pg_try_advisory_xact_lock(hashtext('pickup-offer-sms')) AS ok`);
      if (!lock[0]?.ok) return null;
      const tasks: any[] = await em.query(`
        SELECT t.id, s."originCity", s."destinationCity", s."weightKg",
               COALESCE(NULLIF(btrim(s."originWard"), ''), NULLIF(btrim(s."originDistrictName"), ''), s."originCity") AS area,
               s."trackingNumber" AS "shipmentNumber", p."trackingNumber", p."waybillNumber", p."createdAt" AS "parcelCreatedAt",
               (SELECT count(*)::int FROM public.activity_events e
                 WHERE e."eventType" = 'PICKUP_OFFER_SMS_SENT' AND e."targetType" = 'parcel_pickup_task' AND e."targetId" = t.id) AS "alreadySent"
          FROM public.parcel_pickup_task t
          JOIN public.parcel p ON p.id = t."parcelId"
          JOIN public.shipment s ON s.id = p."shipmentId"
         WHERE t.status = 'requested' AND s.status = 'confirmed' AND p.status = 'pending'
           AND t."createdAt" <= $1::timestamp - make_interval(mins => $2::int)
           AND t."createdAt" >  $1::timestamp - make_interval(mins => $3::int)
         ORDER BY t."createdAt" ASC LIMIT 20`, [now, config.delayMinutes, PICKUP_OFFER_MAX_AGE_MINUTES]);
      const out: Array<{ taskId: number; agentId: number; phone: string; message: string }> = [];
      for (const task of tasks) {
        const room = config.agents - Number(task.alreadySent || 0);
        if (room <= 0) continue;
        // Same eligibility and order as the in-app alert (LogisticsDispatchService).
        const agents: any[] = await em.query(`
          SELECT a.id, COALESCE(NULLIF(btrim(a.phone), ''), u.phone) AS phone
            FROM public.parcel_pickup_task t JOIN public.parcel p ON p.id = t."parcelId" JOIN public.shipment s ON s.id = p."shipmentId"
            JOIN public.agent a ON a.status = 'approved' AND lower(trim(a.city)) = lower(trim(s."originCity"))
             AND a."isOnline" = true AND (a."maxWeightKg" IS NULL OR a."maxWeightKg" >= s."weightKg")
            LEFT JOIN public."user" u ON u.id = a."userId"
           WHERE t.id = $1
             AND NOT EXISTS (SELECT 1 FROM public.activity_events e WHERE e."eventType" IN ('PICKUP_OFFER_SMS_SENT', 'PICKUP_RELEASED')
                   AND e."targetType" = 'parcel_pickup_task' AND e."targetId" = t.id AND e."actorProfileId" = a.id)
           ORDER BY (a."baseLatitude" IS NULL) ASC, ${PICKUP_TO_BASE_DISTANCE_SQL} ASC NULLS LAST, COALESCE(a.rating, 0) DESC, a.id ASC
           LIMIT $2`, [task.id, room]);
        const reference = customerParcelNumber({
          trackingNumber: task.shipmentNumber ?? task.trackingNumber, waybillNumber: task.waybillNumber, createdAt: task.parcelCreatedAt,
        });
        const message = pickupOfferSms(reference, task.area, task.destinationCity);
        for (const a of agents) {
          if (!a.phone) continue;
          // Recorded BEFORE sending: a crash after this line can never send a second SMS.
          await em.query(`INSERT INTO public.activity_events
              ("eventType", category, "actorProfileId", "actorProfileType", "targetType", "targetId", metadata, severity, visibility)
            VALUES ('PICKUP_OFFER_SMS_SENT', 'LOGISTICS', $1, 'agent', 'parcel_pickup_task', $2, $3::jsonb, 'info', 'admin')`,
            [a.id, task.id, JSON.stringify({ reference })]);
          out.push({ taskId: task.id, agentId: a.id, phone: a.phone, message });
        }
      }
      return out;
    });
    if (toSend === null) return { sent: 0, failed: 0, skipped: 'another_tick_running' };
    let sent = 0; let failed = 0;
    for (const s of toSend) {
      const ok = await this.sms.sendSms(s.phone, s.message).catch(() => false);
      if (ok) sent++; else { failed++; this.logger.warn(`Pickup offer SMS to agent ${s.agentId} for task ${s.taskId} not sent`); }
    }
    if (toSend.length) this.logger.log(`Pickup offer SMS: ${sent} sent, ${failed} failed`);
    return { sent, failed, skipped: null };
  }
}
