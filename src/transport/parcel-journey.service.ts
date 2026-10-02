/**
 * ParcelJourneyService — Stage 3S-C8 (C8-A): the smallest orchestration
 * layer necessary to let an operator progress an existing, eligible parcel
 * through the canonical TransportRun/ParcelRunAssignment system without
 * manually stitching unrelated database IDs together.
 *
 * Deliberately NOT a "VanService" duplicating Shipment/Parcel/Transport/
 * Agent/Super Agent authorities: every write this gate needs (assign,
 * markLoaded, markUnloaded, confirmReceipt) already lives in
 * ParcelRunAssignmentService and is called DIRECTLY by the new C8
 * controller -- this service is READ-ONLY, resolving context and
 * suggesting candidates so a caller never has to already know a Run or
 * TransportRunStop id.
 *
 * `resolveJourneyContext` works identically regardless of which of this
 * codebase's three Parcel-creation paths produced the parcel (independent
 * Shipment, seller/order shipment, or Super Agent walk-in) -- all three
 * already converge on one canonical `parcel` row, so there is nothing here
 * to bridge.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ParcelRunAssignmentService } from './parcel-run-assignment.service';
import { ParcelRunAssignment } from './entities/parcel-run-assignment.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { TransportRunStatus } from './entities/transport-run.entity';

export interface ParcelJourneySummary {
  id: number;
  trackingNumber: string | null;
  status: string;
  originCity: string;
  destinationCity: string;
  weightKg: number | null;
  orderId: number | null;
  shipmentId: number | null;
  superAgentId: number | null;
  destinationSuperAgentId: number | null;
}

export interface ParcelJourneyContext {
  parcel: ParcelJourneySummary;
  latestCustodyEvent: ParcelCustodyEvent | null;
  activeAssignment: ParcelRunAssignment | null;
}

export interface EligibleRunCandidate {
  runId: number;
  scheduledDeparture: Date;
  loadRunStopId: number;
  loadLabel: string;
  unloadRunStopId: number;
  unloadLabel: string;
}

@Injectable()
export class ParcelJourneyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly assignmentService: ParcelRunAssignmentService,
  ) {}

  private async getParcelSummary(parcelId: number): Promise<ParcelJourneySummary> {
    const rows = await this.dataSource.query(
      `SELECT id, "trackingNumber", status, "originCity", "destinationCity", "weightKg",
              "orderId", "shipmentId", "superAgentId", "destinationSuperAgentId"
         FROM public.parcel WHERE id = $1`,
      [parcelId],
    );
    if (!rows.length) throw new NotFoundException('Parcel not found');
    return rows[0];
  }

  async resolveJourneyByTrackingNumber(trackingNumber: string): Promise<ParcelJourneyContext> {
    const value = trackingNumber?.trim();
    if (!value) throw new NotFoundException('Parcel not found');
    const rows = await this.dataSource.query(
      `SELECT id FROM public.parcel WHERE "trackingNumber" = $1 LIMIT 1`,
      [value],
    );
    if (!rows.length) throw new NotFoundException('Parcel not found');
    return this.resolveJourneyContext(Number(rows[0].id));
  }

  async resolveJourneyContext(parcelId: number): Promise<ParcelJourneyContext> {
    const parcel = await this.getParcelSummary(parcelId);
    const latestCustodyEvent = await this.dataSource.getRepository(ParcelCustodyEvent).findOne({
      where: { parcelId },
      order: { recordedAt: 'DESC', id: 'DESC' },
    });
    const activeAssignment = await this.assignmentService.getActiveAssignmentForParcel(parcelId);
    return { parcel, latestCustodyEvent, activeAssignment };
  }

  // Best-effort suggestion only -- never authoritative, never blocks the
  // real assignment call (ParcelRunAssignmentService.createAssignment),
  // which independently re-validates everything. "Where is this parcel
  // right now" is read from its latest custody event's own toCustodianId
  // when it is currently held by a Super Agent; otherwise falls back to a
  // same-name match against the parcel's own originCity. The destination
  // side matches the same way against destinationSuperAgentId/
  // destinationCity. A Run with no matching load/unload pair simply
  // produces no candidates for that Run -- never a false positive.
  async findEligibleRuns(parcelId: number): Promise<EligibleRunCandidate[]> {
    const parcel = await this.getParcelSummary(parcelId);
    const latest = await this.dataSource.getRepository(ParcelCustodyEvent).findOne({
      where: { parcelId },
      order: { recordedAt: 'DESC', id: 'DESC' },
    });
    const currentSuperAgentId = latest?.toCustodianType === 'super_agent' ? latest.toCustodianId : null;

    const rows = await this.dataSource.query(
      `SELECT r.id AS "runId", r."scheduledDeparture",
              ls.id AS "loadRunStopId", ls."locationLabel" AS "loadLabel",
              us.id AS "unloadRunStopId", us."locationLabel" AS "unloadLabel"
         FROM public.transport_run r
         JOIN public.transport_run_stop ls ON ls."runId" = r.id AND ls."parcelAcceptanceAllowed" = true
         JOIN public.transport_run_stop us ON us."runId" = r.id AND us.sequence > ls.sequence
        WHERE r.status IN ($1, $2)
          AND ( ($3::int IS NOT NULL AND ls."superAgentId" = $3)
                OR lower(ls."locationLabel") LIKE lower($4) )
          AND ( ($5::int IS NOT NULL AND us."superAgentId" = $5)
                OR lower(us."locationLabel") LIKE lower($6) )
        ORDER BY r."scheduledDeparture" ASC`,
      [
        TransportRunStatus.SCHEDULED, TransportRunStatus.OPEN,
        currentSuperAgentId, `%${parcel.originCity}%`,
        parcel.destinationSuperAgentId, `%${parcel.destinationCity}%`,
      ],
    );
    return rows;
  }

  // Readiness desk queues: same canonical conditions as the admin read
  // models, but hard-scoped to the caller's active Super Agent profile.
  async listHubBlockedAwaitingReceipt(superAgentId: number) {
    return this.dataSource.query(
      `SELECT a.id AS "assignmentId", a."parcelId", a."runId", p."trackingNumber",
              a."unloadedAt",
              EXTRACT(EPOCH FROM (now() - a."unloadedAt")) / 60 AS "waitingMinutes"
         FROM public.parcel_run_assignment a
         JOIN public.transport_run_stop us ON us.id = a."unloadRunStopId"
         JOIN public.parcel p ON p.id = a."parcelId"
        WHERE a.status = 'unloaded' AND us."superAgentId" = $1
        ORDER BY a."unloadedAt" ASC`,
      [superAgentId],
    );
  }

  async listHubAwaitingCompletion(superAgentId: number) {
    return this.dataSource.query(
      `SELECT id, "trackingNumber", status, "arrivedAtHubTime"
         FROM public.parcel
        WHERE "destinationSuperAgentId" = $1
          AND status IN ('arrived_at_hub', 'awaiting_buyer')
        ORDER BY "arrivedAtHubTime" ASC NULLS LAST
        LIMIT 200`,
      [superAgentId],
    );
  }

  // ── Stage 3S-C8 (C8-F): admin operational visibility ───────────────────────
  // "Parcels blocked awaiting Super Agent receipt" -- exactly
  // ParcelRunAssignmentService's own hasUnconfirmedSuperAgentReceipt
  // condition (UNLOADED at a stop that names a real Super Agent), surfaced
  // as a list with how long each has been waiting, rather than invented as
  // a new state. This IS the "custody exception / stuck parcel" view --
  // no separate exception entity needed.
  async adminListBlockedAwaitingSuperAgentReceipt(): Promise<Array<{
    assignmentId: number; parcelId: number; runId: number; superAgentId: number;
    unloadedAt: Date; waitingMinutes: number;
  }>> {
    return this.dataSource.query(
      `SELECT a.id AS "assignmentId", a."parcelId", a."runId", us."superAgentId",
              a."unloadedAt",
              EXTRACT(EPOCH FROM (now() - a."unloadedAt")) / 60 AS "waitingMinutes"
         FROM public.parcel_run_assignment a
         JOIN public.transport_run_stop us ON us.id = a."unloadRunStopId"
        WHERE a.status = 'unloaded' AND us."superAgentId" IS NOT NULL
        ORDER BY a."unloadedAt" ASC`,
    );
  }

  // "Parcels awaiting Agent delivery/self-pickup" -- reuses the existing
  // Parcel.status vocabulary (ARRIVED_AT_HUB/AWAITING_BUYER) the legacy
  // carrier-delivery flow and confirmReceipt's own C8 extension both
  // already produce; never a second, parallel status column.
  async adminListAwaitingLastMileCompletion(): Promise<Array<{
    id: number; trackingNumber: string | null; status: string;
    destinationSuperAgentId: number | null; arrivedAtHubTime: Date | null;
  }>> {
    return this.dataSource.query(
      `SELECT id, "trackingNumber", status, "destinationSuperAgentId", "arrivedAtHubTime"
         FROM public.parcel
        WHERE status IN ('arrived_at_hub', 'awaiting_buyer')
        ORDER BY "arrivedAtHubTime" ASC NULLS LAST
        LIMIT 200`,
    );
  }
}
