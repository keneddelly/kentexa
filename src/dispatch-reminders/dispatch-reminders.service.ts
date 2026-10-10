/**
 * "Received but not dispatched" reminder (marketplace-basic item 3).
 *
 * The system cannot know that a parcel physically left. It only knows
 * "received at this office" (the custody ledger's origin_hub_received event)
 * and that no dispatch information was entered afterwards. So this is a
 * time-based reminder, never an automatic status change.
 *
 * This module only READS parcels. It never changes a parcel, a receipt, a
 * customer SMS or a shehena, and it never sends anything to a sender or a
 * recipient: the only phone it uses is the office's own super_agent.phone.
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { SmsService } from '../sms/sms.service';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import {
  TANZANIA_TZ, eveningSmsText, readDispatchReminderSettings, stillHereHiddenUntil, tanzaniaClock,
} from './dispatch-reminders.config';

// The pre-dispatch statuses (ORIGIN_INTAKE_STATUSES in super-agents.service.ts).
export const NOT_DISPATCHED_STATUSES = ['received_at_hub', 'verified', 'ready_for_dispatch'];

export interface StaleParcel {
  parcelId: number;
  waybillNumber: string | null;
  trackingNumber: string | null;
  recipientName: string | null;
  destinationCity: string;
  receivedAt: Date;
  bulkShipmentId: number | null;
  bulkShipmentCode: string | null;
  bulkShipmentStatus: string | null;
}

/**
 * Parcels of office $1 that are received, not dispatched, older than the
 * cut-off $2, and not marked "Still here" for today. Same-city parcels are
 * left out: they are never dispatched, so they would stay red forever.
 * "Received" time = latest origin_hub_received custody event at this office,
 * or the parcel's creation time for old parcels with no custody event.
 */
const STALE_SQL = (officeFilter: string) => `
  WITH received AS (
    SELECT DISTINCT ON (ce."parcelId") ce."parcelId", ce."hubId", ce."recordedAt"
      FROM public.parcel_custody_event ce
     WHERE ce."eventKind" = 'origin_hub_received'
     ORDER BY ce."parcelId", ce."recordedAt" DESC
  )
  SELECT p.id AS "parcelId", p."superAgentId" AS "superAgentId", p."waybillNumber", p."trackingNumber",
         p."recipientName", p."destinationCity",
         COALESCE(r."recordedAt", p."createdAt") AS "receivedAt",
         p."bulkShipmentId", bs."shipmentCode" AS "bulkShipmentCode", bs.status::text AS "bulkShipmentStatus"
    FROM public.parcel p
    LEFT JOIN received r ON r."parcelId" = p.id AND r."hubId" = p."superAgentId"
    LEFT JOIN public.bulk_shipment bs ON bs.id = p."bulkShipmentId"
   WHERE ${officeFilter}
     AND p.status::text = ANY($2)
     AND lower(btrim(p."originCity")) <> lower(btrim(p."destinationCity"))
     AND (p."destinationSuperAgentId" IS NULL OR p."destinationSuperAgentId" <> p."superAgentId")
     AND COALESCE(r."recordedAt", p."createdAt") <= $3
     AND NOT EXISTS (
       SELECT 1 FROM public.parcel_still_here_mark m
        WHERE m."parcelId" = p.id AND m."superAgentId" = p."superAgentId" AND m."hiddenUntil" > now())`;

@Injectable()
export class DispatchRemindersService {
  private readonly logger = new Logger(DispatchRemindersService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly sms: SmsService,
    @Optional() private readonly inApp?: InAppNotificationService,
    @Optional() private readonly activity?: ActivityEventService,
  ) {}

  private settings() { return readDispatchReminderSettings(); }

  private cutoff(now: Date): Date {
    return new Date(now.getTime() - this.settings().staleHours * 3600_000);
  }

  /** The office the logged-in user runs (same rule as the counter: one office per owner). */
  async officeForUser(userId: number): Promise<{ id: number; userId: number }> {
    const rows: Array<{ id: number; userId: number }> = await this.db.query(
      `SELECT id, "userId" FROM public.super_agent WHERE "userId" = $1 ORDER BY id`, [userId],
    );
    if (rows.length !== 1) throw new ForbiddenException('Super Agent office required');
    return { id: Number(rows[0].id), userId: Number(rows[0].userId) };
  }

  async listStale(officeId: number, now = new Date()): Promise<StaleParcel[]> {
    const rows: any[] = await this.db.query(
      `${STALE_SQL('p."superAgentId" = $1')} ORDER BY "receivedAt" ASC, p.id ASC LIMIT 200`,
      [officeId, NOT_DISPATCHED_STATUSES, this.cutoff(now)],
    );
    return rows.map((r) => ({
      parcelId: Number(r.parcelId),
      waybillNumber: r.waybillNumber ?? null,
      trackingNumber: r.trackingNumber ?? null,
      recipientName: r.recipientName ?? null,
      destinationCity: r.destinationCity,
      receivedAt: r.receivedAt,
      bulkShipmentId: r.bulkShipmentId == null ? null : Number(r.bulkShipmentId),
      bulkShipmentCode: r.bulkShipmentCode ?? null,
      bulkShipmentStatus: r.bulkShipmentStatus ?? null,
    }));
  }

  async mine(userId: number, now = new Date()) {
    const office = await this.officeForUser(userId);
    const parcels = await this.listStale(office.id, now);
    return { staleHours: this.settings().staleHours, count: parcels.length, parcels };
  }

  /**
   * "Still here": the parcel is really waiting for a bus. Hidden from the red
   * list and the nightly SMS until the next day's check time (default 22:00,
   * see stillHereHiddenUntil). One tap, no form. Every mark is kept (never
   * updated or deleted) so admins can see it.
   */
  async markStillHere(userId: number, parcelId: number, now = new Date()) {
    const office = await this.officeForUser(userId);
    const parcels: Array<{ status: string; superAgentId: number }> = await this.db.query(
      `SELECT status::text AS status, "superAgentId" FROM public.parcel WHERE id = $1`, [parcelId],
    );
    if (!parcels[0]) throw new NotFoundException('Parcel not found');
    if (Number(parcels[0].superAgentId) !== office.id) throw new ForbiddenException('Not a parcel of your office');
    if (!NOT_DISPATCHED_STATUSES.includes(parcels[0].status)) {
      throw new BadRequestException('This parcel already has dispatch information');
    }
    const rows: Array<{ id: number; hiddenUntil: Date }> = await this.db.query(
      `INSERT INTO public.parcel_still_here_mark ("parcelId", "superAgentId", "markedByUserId", "hiddenUntil")
       VALUES ($1, $2, $3, $4)
       RETURNING id, "hiddenUntil"`,
      [parcelId, office.id, userId, stillHereHiddenUntil(now, this.settings().smsMinuteOfDay)],
    );
    await this.activity?.record({
      eventType: 'PARCEL_MARKED_STILL_HERE', category: ActivityCategory.LOGISTICS,
      actorId: userId, actorType: 'super_agent', targetType: 'parcel', targetId: parcelId,
      metadata: { superAgentId: office.id, hiddenUntil: rows[0].hiddenUntil }, visibility: 'internal',
    });
    return { parcelId, hiddenUntil: rows[0].hiddenUntil };
  }

  // ── Nightly SMS ──────────────────────────────────────────────────────────
  // Runs every 5 minutes, Tanzania time. Inside the window (default
  // 22:00-23:30) it sends ONE SMS per office per day, only if the office's
  // red list is not empty. The unique (superAgentId, reminderDate) row is
  // the guarantee: a restart, a second server or a later tick can never send
  // a second one. A failed SMS is retried exactly once, on a later tick.
  @Cron('*/5 * * * *', { timeZone: TANZANIA_TZ })
  async eveningTick(): Promise<void> {
    try {
      await this.runEvening(new Date());
    } catch (error) {
      this.logger.error(`Evening dispatch reminder failed: ${(error as Error)?.message ?? error}`);
    }
  }

  async runEvening(now: Date): Promise<{ sent: number; failed: number; noPhone: number; skipped: string | null }> {
    const { smsMinuteOfDay, latestMinuteOfDay } = this.settings();
    const clock = tanzaniaClock(now);
    if (clock.minuteOfDay < smsMinuteOfDay || clock.minuteOfDay > latestMinuteOfDay) {
      return { sent: 0, failed: 0, noPhone: 0, skipped: 'outside_time_window' };
    }
    const counts: Array<{ superAgentId: number; count: number; phone: string | null; userId: number | null; name: string }> =
      await this.db.query(
        `SELECT s."superAgentId", count(*)::int AS count, sa.phone, sa."userId", sa."businessName" AS name
           FROM (${STALE_SQL('p."superAgentId" IS NOT NULL AND $1::int IS NULL')}) s
           JOIN public.super_agent sa ON sa.id = s."superAgentId" AND sa.status = 'active'
          GROUP BY s."superAgentId", sa.phone, sa."userId", sa."businessName"`,
        [null, NOT_DISPATCHED_STATUSES, this.cutoff(now)],
      );
    let sent = 0; let failed = 0; let noPhone = 0;
    for (const office of counts) {
      const officeId = Number(office.superAgentId);
      const phone = office.phone?.trim() || null;
      // First attempt today: claim the day's row.
      const claimed: Array<{ id: number }> = await this.db.query(
        `INSERT INTO public.super_agent_dispatch_reminder ("superAgentId", "reminderDate", "parcelCount", phone, status, attempts)
         VALUES ($1, $2, $3, $4, 'sending', 0)
         ON CONFLICT ("superAgentId", "reminderDate") DO NOTHING RETURNING id`,
        [officeId, clock.date, office.count, phone],
      );
      let rowId = claimed[0]?.id;
      const firstAttempt = Boolean(rowId);
      if (!rowId) {
        // The one allowed retry: only a row that failed exactly once, and only
        // on a LATER tick (failure at least 4 minutes old) -- never seconds
        // later from a second copy of this job running at the same moment.
        // Wrapped in a CTE because TypeORM returns a bare UPDATE ... RETURNING
        // as [rows, count], not as rows -- a plain SELECT always returns rows.
        const retry: Array<{ id: number }> = await this.db.query(
          `WITH claimed AS (
             UPDATE public.super_agent_dispatch_reminder SET status = 'sending', "updatedAt" = now()
              WHERE "superAgentId" = $1 AND "reminderDate" = $2 AND status = 'failed' AND attempts = 1
                AND "updatedAt" <= $3
              RETURNING id)
           SELECT id FROM claimed`,
          [officeId, clock.date, new Date(now.getTime() - 4 * 60_000)],
        );
        rowId = retry[0]?.id;
      }
      if (!rowId) continue; // already sent, already retried, or no phone
      // One office's problem must never stop the others, and a claimed row
      // must never be left stuck at "sending".
      try {
        const outcome = await this.remindOffice(Number(rowId), officeId, office, phone, firstAttempt);
        if (outcome === 'sent') sent++; else if (outcome === 'no_phone') noPhone++; else failed++;
      } catch (error) {
        failed++;
        this.logger.error(`Dispatch reminder for office ${officeId} failed: ${(error as Error)?.message ?? error}`);
        await this.db.query(
          `UPDATE public.super_agent_dispatch_reminder
              SET status = 'failed', attempts = attempts + 1, "lastError" = $2, "updatedAt" = now()
            WHERE id = $1 AND status = 'sending'`,
          [rowId, String((error as Error)?.message ?? error).slice(0, 500)],
        ).catch(() => undefined);
      }
    }
    this.logger.log(`Nightly dispatch reminder ${clock.date}: ${counts.length} office(s) with red parcels, sent ${sent}, failed ${failed}, no phone ${noPhone}`);
    return { sent, failed, noPhone, skipped: null };
  }

  private async remindOffice(
    rowId: number, officeId: number, office: { count: number; userId: number | null }, phone: string | null, firstAttempt: boolean,
  ): Promise<'sent' | 'failed' | 'no_phone'> {
    if (firstAttempt && office.userId) {
      // Free and immediate: also an in-app notification to the office owner.
      try {
        await this.inApp?.notify({
          userId: Number(office.userId), type: 'dispatch_reminder', icon: '📦',
          title: 'Vifurushi bila taarifa za kusafirisha',
          body: `${office.count} ${office.count === 1 ? 'kifurushi kimepokelewa' : 'vifurushi vimepokelewa'} bila taarifa za kusafirisha. Fungua dashibodi kuweka taarifa.`,
          actionPage: 'SuperAgentDashboard', sourceType: 'super_agent_dispatch_reminder', sourceId: Number(rowId),
        });
      } catch (error) {
        this.logger.warn(`In-app dispatch reminder failed for office ${officeId}: ${(error as Error)?.message ?? error}`);
      }
    }

    if (!phone) {
      await this.db.query(
        `UPDATE public.super_agent_dispatch_reminder SET status = 'no_phone', "lastError" = 'No office phone saved', "updatedAt" = now() WHERE id = $1`,
        [rowId],
      );
      return 'no_phone';
    }
    let ok = false; let errorText: string | null = null;
    try {
      ok = await this.sms.sendSms(phone, eveningSmsText(office.count));
      if (!ok) errorText = 'SMS provider did not accept the message (or outbound SMS is disabled)';
    } catch (error) {
      errorText = String((error as Error)?.message ?? error).slice(0, 500);
    }
    // $2 is cast so Postgres never has to guess its type.
    await this.db.query(
      `UPDATE public.super_agent_dispatch_reminder
          SET status = $2::varchar, attempts = attempts + 1, "lastError" = $3::text,
              "sentAt" = CASE WHEN $2::varchar = 'sent' THEN now() ELSE "sentAt" END, "updatedAt" = now()
        WHERE id = $1`,
      [rowId, ok ? 'sent' : 'failed', ok ? null : errorText],
    );
    await this.activity?.record({
      eventType: ok ? 'DISPATCH_REMINDER_SMS_SENT' : 'DISPATCH_REMINDER_SMS_FAILED',
      category: ActivityCategory.LOGISTICS, actorType: 'system', targetType: 'super_agent', targetId: officeId,
      metadata: { reminderId: Number(rowId), parcelCount: office.count, attemptWasRetry: !firstAttempt, error: errorText },
      severity: ok ? 'info' : 'warning', visibility: 'internal',
    });
    return ok ? 'sent' : 'failed';
  }

  // ── Admin views ──────────────────────────────────────────────────────────
  async adminStillHereMarks(days = 7) {
    return this.db.query(
      `SELECT m.id, m."markedAt", m."hiddenUntil", m."parcelId", p."waybillNumber", p."trackingNumber",
              p."destinationCity", p.status::text AS "parcelStatus",
              m."superAgentId", sa."businessName" AS "officeName", sa.city AS "officeCity",
              m."markedByUserId", u.name AS "markedByName"
         FROM public.parcel_still_here_mark m
         JOIN public.parcel p ON p.id = m."parcelId"
         JOIN public.super_agent sa ON sa.id = m."superAgentId"
         LEFT JOIN public."user" u ON u.id = m."markedByUserId"
        WHERE m."markedAt" >= now() - make_interval(days => $1)
        ORDER BY m."markedAt" DESC LIMIT 500`,
      [Math.min(Math.max(Number(days) || 7, 1), 90)],
    );
  }

  async adminReminders(days = 7) {
    return this.db.query(
      `SELECT r.id, r."reminderDate", r."parcelCount", r.status, r.attempts, r."lastError", r."sentAt",
              r."superAgentId", sa."businessName" AS "officeName", sa.city AS "officeCity"
         FROM public.super_agent_dispatch_reminder r
         JOIN public.super_agent sa ON sa.id = r."superAgentId"
        WHERE r."reminderDate" >= (now() AT TIME ZONE '${TANZANIA_TZ}')::date - $1::int
        ORDER BY r."reminderDate" DESC, r.id DESC LIMIT 500`,
      [Math.min(Math.max(Number(days) || 7, 1), 90)],
    );
  }
}
