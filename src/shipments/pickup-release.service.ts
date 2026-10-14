import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { SmsService } from '../sms/sms.service';
import { CommunicationEngineService } from '../communication/communication-engine.service';
import { LogisticsDispatchService } from './logistics-dispatch.service';
import { customerParcelNumber } from '../super-agents/customer-parcel-number';
import { findNearestOffice } from '../transport/nearest-office';
import { smsSafeName } from '../super-agents/customer-parcel-number';
import type { RoleContext } from '../role-context/role-context.types';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

/**
 * D2 (owner 2026-10-14): an accepted pickup that the agent cannot do goes
 * back to the next nearest agent, instead of the sender waiting forever.
 *   - "Siwezi kufika": the accepting agent releases the job before collecting.
 *   - Timeout: accepted but not collected within the timeout -> released
 *     automatically; an in-app reminder goes to the agent before that.
 * A release puts the job back to "waiting" (no agent, handover code cleared),
 * writes PICKUP_RELEASED (never offered to that agent again), tells the
 * sender by SMS and offers the job again to the next nearest agents. After
 * MAX_RELEASES the job is not offered again automatically and the sender is
 * told the nearest office instead.
 *
 * Settings (environment, optional, defaults built in):
 *   PICKUP_ACCEPT_TIMEOUT_MINUTES    10..240, default 45
 *   PICKUP_ACCEPT_REMINDER_MINUTES   5..timeout-1, default 30
 */
export const MAX_RELEASES = 3;
export const PICKUP_RELEASED_EVENT = 'PICKUP_RELEASED';
export const PICKUP_REMINDED_EVENT = 'PICKUP_ACCEPT_REMINDED';
export type ReleaseReason = 'agent_cannot_come' | 'timeout';

export function pickupAcceptTimeouts(env: Record<string, string | undefined> = process.env) {
  const int = (v: string | undefined) => { const n = Number.parseInt(String(v ?? '').trim(), 10); return Number.isFinite(n) ? n : null; };
  const timeoutMinutes = Math.min(240, Math.max(10, int(env.PICKUP_ACCEPT_TIMEOUT_MINUTES) ?? 45));
  const reminderMinutes = Math.min(timeoutMinutes - 1, Math.max(5, int(env.PICKUP_ACCEPT_REMINDER_MINUTES) ?? 30));
  return { timeoutMinutes, reminderMinutes };
}

/** Plain characters only, one SMS part each. */
export const pickupReleasedSenderSms = (reference: string) =>
  `KenteXa: Wakala hawezi kufika kuchukua mzigo${reference ? ` ${reference}` : ''}. Tunatafuta wakala mwingine; tutakujulisha.`;
export const pickupNoAgentSenderSms = (reference: string, officeName: string | null) =>
  officeName
    ? `KenteXa: Hatujapata wakala wa kuchukua mzigo${reference ? ` ${reference}` : ''}. Unaweza kuupeleka ofisi ya ${smsSafeName(officeName).slice(0, 40)}.`
    : `KenteXa: Hatujapata wakala wa kuchukua mzigo${reference ? ` ${reference}` : ''} bado. Tutakujulisha akipatikana.`;
export const pickupTimedOutAgentSms = (reference: string) =>
  `KenteXa: Kazi ya kuchukua mzigo${reference ? ` ${reference}` : ''} imeondolewa kwako kwa sababu muda umepita. Usiende kuchukua.`;

/** TypeORM's raw UPDATE ... RETURNING answers [rows, affectedCount]. */
const returnedRows = (res: any): any[] => (Array.isArray(res) && Array.isArray(res[0]) ? res[0] : Array.isArray(res) ? res : []);

@Injectable()
export class PickupReleaseService {
  private readonly logger = new Logger(PickupReleaseService.name);
  constructor(
    private readonly db: DataSource,
    @Optional() private readonly sms?: SmsService,
    @Optional() private readonly communication?: CommunicationEngineService,
    @Optional() private readonly dispatch?: LogisticsDispatchService,
  ) {}

  /** "Siwezi kufika": only the agent who accepted, only before collecting. */
  async releaseByAgent(taskId: number, userId: number, role: RoleContext) {
    if (!role || role.userId !== userId || role.roleType !== AccountRoleType.AGENT || !role.profileId) {
      throw new ForbiddenException('Active Agent context required');
    }
    return this.release(taskId, 'agent_cannot_come', Number(role.profileId));
  }

  /** The shared release. `byAgentProfileId` = the agent who must hold the job (null = the timeout). */
  async release(taskId: number, reason: ReleaseReason, byAgentProfileId: number | null) {
    const pre: any[] = await this.db.query(`SELECT t."parcelId", p."shipmentId" FROM public.parcel_pickup_task t
      JOIN public.parcel p ON p.id = t."parcelId" WHERE t.id = $1`, [taskId]);
    if (pre.length !== 1 || !pre[0].shipmentId) throw new NotFoundException('Pickup task not found');
    const result = await this.db.transaction(async (em) => {
      // Same lock order as claim/collect: shipment -> parcel -> task, so a release
      // and a collection at the same moment can never both succeed.
      await em.query('SELECT id FROM public.shipment WHERE id = $1 FOR UPDATE', [pre[0].shipmentId]);
      const p: any[] = await em.query('SELECT id, status FROM public.parcel WHERE id = $1 FOR UPDATE', [pre[0].parcelId]);
      const t: any[] = await em.query('SELECT * FROM public.parcel_pickup_task WHERE id = $1 FOR UPDATE', [taskId]);
      const task = t[0];
      if (!task) throw new NotFoundException('Pickup task not found');
      if (task.status === 'requested' && byAgentProfileId != null) {
        const mine: any[] = await em.query(`SELECT 1 FROM public.activity_events WHERE "eventType" = $1
          AND "targetType" = 'parcel_pickup_task' AND "targetId" = $2 AND "actorProfileId" = $3 LIMIT 1`,
          [PICKUP_RELEASED_EVENT, taskId, byAgentProfileId]);
        if (mine.length) return { id: taskId, status: 'requested', replay: true } as any;
      }
      if (task.status !== 'claimed') throw new ConflictException('This pickup can no longer be released');
      if (byAgentProfileId != null && Number(task.agentProfileId) !== byAgentProfileId) {
        throw new ForbiddenException('Only the agent who accepted this pickup can release it');
      }
      const agentProfileId = Number(task.agentProfileId);
      await em.query(`UPDATE public.parcel_pickup_task SET status = 'requested', "agentProfileId" = NULL, "claimedAt" = NULL,
        "handoffCodeHash" = NULL, "handoffCodeIssuedAt" = NULL, "handoffCodeExpiresAt" = NULL, "handoffAttempts" = 0,
        "updatedAt" = now() WHERE id = $1`, [taskId]);
      await em.query(`INSERT INTO public.parcel_tracking ("parcelId", status, city, note, "updatedBy", "handlerPhone", "handlerLocation", "handlerType")
        VALUES ($1, $2, NULL, $3, NULL, NULL, NULL, 'local_agent')`,
        [p[0].id, p[0].status, 'Wakala hawezi kufika; tunatafuta wakala mwingine']);
      await em.query(`INSERT INTO public.activity_events
          ("eventType", category, "actorProfileId", "actorProfileType", "actorType", "targetType", "targetId", metadata, severity, visibility)
        VALUES ($1, 'LOGISTICS', $2, 'agent', $3, 'parcel_pickup_task', $4, $5::jsonb, 'info', 'admin')`,
        [PICKUP_RELEASED_EVENT, agentProfileId, reason === 'timeout' ? 'system' : 'agent', taskId, JSON.stringify({ reason })]);
      const count: any[] = await em.query(`SELECT count(*)::int AS n FROM public.activity_events
        WHERE "eventType" = $1 AND "targetType" = 'parcel_pickup_task' AND "targetId" = $2`, [PICKUP_RELEASED_EVENT, taskId]);
      return { id: taskId, status: 'requested', replay: false, agentProfileId, releases: Number(count[0]?.n || 0) };
    });
    if (!result.replay) await this.afterRelease(taskId, reason, result.agentProfileId, result.releases);
    return { id: result.id, status: result.status, replay: result.replay };
  }

  /** Messages and the next offer, after the release is saved. A failure here never undoes it. */
  private async afterRelease(taskId: number, reason: ReleaseReason, agentProfileId: number, releases: number) {
    try {
      const rows: any[] = await this.db.query(`
        SELECT t."pickupContactPhone" AS "senderPhone", s."trackingNumber" AS "shipmentNumber", s."originCity",
               COALESCE(s."pickupPinLatitude", s."originLatitude") AS lat, COALESCE(s."pickupPinLongitude", s."originLongitude") AS lng,
               p."trackingNumber", p."waybillNumber", p."createdAt",
               a."userId" AS "agentUserId", COALESCE(NULLIF(btrim(a.phone), ''), u.phone) AS "agentPhone"
          FROM public.parcel_pickup_task t JOIN public.parcel p ON p.id = t."parcelId" JOIN public.shipment s ON s.id = p."shipmentId"
          LEFT JOIN public.agent a ON a.id = $2 LEFT JOIN public."user" u ON u.id = a."userId"
         WHERE t.id = $1`, [taskId, agentProfileId]);
      const r = rows[0];
      if (!r) return;
      const reference = customerParcelNumber({ trackingNumber: r.shipmentNumber ?? r.trackingNumber, waybillNumber: r.waybillNumber, createdAt: r.createdAt });
      if (reason === 'timeout') {
        if (r.agentUserId && this.communication) {
          await this.communication.dispatch({
            eventType: 'LOGISTICS_PICKUP_RELEASED', sourceType: 'parcel_pickup_task', sourceId: taskId,
            recipients: [{ userId: Number(r.agentUserId), role: 'agent', actionPage: 'agent-pickups', actionParam: String(taskId) }],
            context: { taskId, reference: reference || `#${taskId}` },
          } as any).catch(() => undefined);
        }
        if (r.agentPhone && this.sms) await this.sms.sendSms(r.agentPhone, pickupTimedOutAgentSms(reference)).catch(() => false);
      }
      if (releases < MAX_RELEASES) {
        if (r.senderPhone && this.sms) await this.sms.sendSms(r.senderPhone, pickupReleasedSenderSms(reference)).catch(() => false);
        if (this.dispatch) await this.dispatch.dispatchPickup(taskId, { channels: ['in_app'] }).catch(() => undefined);
      } else {
        const point = r.lat != null && r.lng != null ? { latitude: Number(r.lat), longitude: Number(r.lng) } : null;
        const office = await findNearestOffice(this.db, r.originCity, point).catch(() => null);
        if (r.senderPhone && this.sms) await this.sms.sendSms(r.senderPhone, pickupNoAgentSenderSms(reference, office?.name ?? null)).catch(() => false);
      }
    } catch (err: any) {
      this.logger.warn(`After-release messages for task ${taskId} failed: ${err?.message || err}`);
    }
  }

  @Cron('* * * * *')
  async tick(): Promise<void> {
    try { await this.runOnce(new Date()); }
    catch (err: any) { this.logger.warn(`Pickup accept timeout tick failed: ${err?.message || err}`); }
  }

  /** Reminders, then timeouts, for accepted pickups not yet collected. */
  async runOnce(now: Date, cfg = pickupAcceptTimeouts()): Promise<{ reminded: number[]; released: number[] }> {
    const picked = await this.db.transaction(async (em) => {
      const lock: any[] = await em.query(`SELECT pg_try_advisory_xact_lock(hashtext('pickup-accept-timeout')) AS ok`);
      if (!lock[0]?.ok) return null;
      const remind = returnedRows(await em.query(`
        INSERT INTO public.activity_events ("eventType", category, "actorProfileId", "actorProfileType", "actorType", "targetType", "targetId", severity, visibility)
        SELECT $1::varchar, 'LOGISTICS', t."agentProfileId", 'agent', 'system', 'parcel_pickup_task', t.id, 'info', 'admin'
          FROM public.parcel_pickup_task t
         WHERE t.status = 'claimed'
           AND t."claimedAt" <= $2::timestamp - make_interval(mins => $3::int)
           AND t."claimedAt" >  $2::timestamp - make_interval(mins => $4::int)
           AND NOT EXISTS (SELECT 1 FROM public.activity_events e WHERE e."eventType" = $1::varchar AND e."targetType" = 'parcel_pickup_task'
                 AND e."targetId" = t.id AND e."actorProfileId" = t."agentProfileId")
        RETURNING "targetId" AS id, "actorProfileId" AS "agentProfileId"`,
        [PICKUP_REMINDED_EVENT, now, cfg.reminderMinutes, cfg.timeoutMinutes]));
      const expired: any[] = await em.query(`SELECT id FROM public.parcel_pickup_task
        WHERE status = 'claimed' AND "claimedAt" <= $1::timestamp - make_interval(mins => $2::int) ORDER BY id LIMIT 50`,
        [now, cfg.timeoutMinutes]);
      return { remind, expired: expired.map((r) => Number(r.id)) };
    });
    if (!picked) return { reminded: [], released: [] };
    for (const r of picked.remind) await this.remind(Number(r.id), Number(r.agentProfileId), cfg);
    const released: number[] = [];
    for (const id of picked.expired) {
      try { const res = await this.release(id, 'timeout', null); if (!res.replay) released.push(id); }
      catch (err: any) { this.logger.warn(`Timeout release of task ${id} skipped: ${err?.message || err}`); }
    }
    return { reminded: picked.remind.map((r: any) => Number(r.id)), released };
  }

  private async remind(taskId: number, agentProfileId: number, cfg: { timeoutMinutes: number; reminderMinutes: number }) {
    if (!this.communication) return;
    try {
      const rows: any[] = await this.db.query(`SELECT a."userId", s."trackingNumber" AS "shipmentNumber", p."trackingNumber", p."waybillNumber", p."createdAt"
        FROM public.parcel_pickup_task t JOIN public.parcel p ON p.id = t."parcelId" JOIN public.shipment s ON s.id = p."shipmentId"
        JOIN public.agent a ON a.id = $2 WHERE t.id = $1`, [taskId, agentProfileId]);
      const r = rows[0];
      if (!r?.userId) return;
      const reference = customerParcelNumber({ trackingNumber: r.shipmentNumber ?? r.trackingNumber, waybillNumber: r.waybillNumber, createdAt: r.createdAt });
      await this.communication.dispatch({
        eventType: 'LOGISTICS_PICKUP_REMINDER', sourceType: 'parcel_pickup_task', sourceId: taskId,
        recipients: [{ userId: Number(r.userId), role: 'agent', actionPage: 'agent-pickups', actionParam: String(taskId) }],
        context: { taskId, reference: reference || `#${taskId}`, minutesLeft: cfg.timeoutMinutes - cfg.reminderMinutes },
      } as any);
    } catch (err: any) {
      this.logger.warn(`Pickup reminder for task ${taskId} not sent: ${err?.message || err}`);
    }
  }
}
