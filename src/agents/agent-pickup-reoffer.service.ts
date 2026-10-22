import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CommunicationEngineService } from '../communication/communication-engine.service';
import { PICKUP_TO_BASE_DISTANCE_SQL } from '../shipments/pickup-pin';
import { partnerGateSql } from '../partner-invitations/seller-agent-partner-gate';

/**
 * D5 (owner 2026-10-14): when an agent goes online, pickups already waiting
 * near his base are offered to him (in-app job alert), instead of only the
 * agents who happened to be online when the job was booked.
 *   - waiting jobs only (task requested, shipment confirmed, parcel pending);
 *   - his city, his maximum weight, within REOFFER_RADIUS_M of his base;
 *   - never a job he released before (D2: PICKUP_RELEASED);
 *   - nearest first, at most REOFFER_MAX_JOBS;
 *   - the same job is not re-alerted to him within REOFFER_QUIET_HOURS.
 * No SMS: an in-app alert only (the job-offer SMS is separate).
 */
export const REOFFER_RADIUS_M = 10_000;
export const REOFFER_MAX_JOBS = 5;
export const REOFFER_QUIET_HOURS = 2;
export const PICKUP_REOFFERED_EVENT = 'PICKUP_REOFFERED';

@Injectable()
export class AgentPickupReofferService {
  private readonly logger = new Logger(AgentPickupReofferService.name);
  constructor(private readonly db: DataSource, private readonly communication: CommunicationEngineService) {}

  /** Offers the waiting nearby pickups to this agent. Never throws: going online must always work. */
  async offerTo(agentId: number): Promise<number[]> {
    try {
      const rows: any[] = await this.db.query(`
        SELECT t.id, a."userId", s."originCity", s."destinationCity", s."itemDescription",
               ${PICKUP_TO_BASE_DISTANCE_SQL} AS "distanceM"
          FROM public.agent a
          JOIN public.shipment s ON lower(trim(s."originCity")) = lower(trim(a.city))
          JOIN public.parcel p ON p."shipmentId" = s.id
          JOIN public.parcel_pickup_task t ON t."parcelId" = p.id
         WHERE a.id = $1 AND a.status = 'approved' AND a."isOnline" = true AND a."userId" IS NOT NULL
           AND t.status = 'requested' AND s.status = 'confirmed' AND p.status = 'pending'
           AND (a."maxWeightKg" IS NULL OR a."maxWeightKg" >= s."weightKg")
           AND ${PICKUP_TO_BASE_DISTANCE_SQL} <= $2
           AND NOT EXISTS (SELECT 1 FROM public.activity_events e
                 WHERE e."targetType" = 'parcel_pickup_task' AND e."targetId" = t.id AND e."actorProfileId" = a.id
                   AND (e."eventType" = 'PICKUP_RELEASED'
                        OR (e."eventType" = $3 AND e."createdAt" > now() - make_interval(hours => $4::int))))
           -- Seller partner agents first, for a few minutes (seller-agent-partner-gate.ts).
           AND ${partnerGateSql('a."userId"')}
         ORDER BY "distanceM" ASC, t."createdAt" ASC
         LIMIT $5`, [agentId, REOFFER_RADIUS_M, PICKUP_REOFFERED_EVENT, REOFFER_QUIET_HOURS, REOFFER_MAX_JOBS]);
      for (const r of rows) {
        await this.db.query(`INSERT INTO public.activity_events
            ("eventType", category, "actorProfileId", "actorProfileType", "targetType", "targetId", metadata, severity, visibility)
          VALUES ($1, 'LOGISTICS', $2, 'agent', 'parcel_pickup_task', $3, $4::jsonb, 'info', 'admin')`,
          [PICKUP_REOFFERED_EVENT, agentId, r.id, JSON.stringify({ distanceM: Math.round(Number(r.distanceM)) })]);
        await this.communication.dispatch({
          eventType: 'LOGISTICS_PICKUP_AVAILABLE', sourceType: 'parcel_pickup_task', sourceId: r.id,
          recipients: [{ userId: Number(r.userId), role: 'agent', actionPage: 'agent-pickups', actionParam: String(r.id) }],
          context: { taskId: r.id, originCity: r.originCity, destinationCity: r.destinationCity, itemDescription: r.itemDescription || 'Parcel' },
        } as any);
      }
      return rows.map((r) => Number(r.id));
    } catch (err: any) {
      this.logger.warn(`Pickup re-offer for agent ${agentId} failed: ${err?.message || err}`);
      return [];
    }
  }
}
