/**
 * SuperAgentHandlingEarningObligationService — Stage 3S-C6 second correction.
 *
 * Owns the transactional-outbox lifecycle described in
 * SuperAgentHandlingEarningObligation's own header comment:
 *
 *   createObligation()  -- called from WITHIN ParcelRunAssignmentService.
 *                           confirmReceipt()'s own transaction, so the
 *                           obligation and the qualifying custody receipt
 *                           commit together or not at all.
 *   attemptResolve()    -- best-effort: try to actually compute the earning
 *                           now. Never throws. Safe to call concurrently for
 *                           the same obligation (the underlying earning
 *                           creation is already idempotent/race-safe via
 *                           SuperAgentHandlingEarning's own unique
 *                           constraints), so confirmReceipt's own immediate
 *                           opportunistic attempt and a later reconciliation
 *                           sweep can never double-pay even if they overlap.
 *   processPending()    -- reconciliation entry point: claims a batch of
 *                           outstanding obligations (SELECT ... FOR UPDATE
 *                           SKIP LOCKED, so concurrent workers never claim
 *                           the same row) and resolves each. A future
 *                           scheduler/cron/admin action calls this; it is
 *                           NOT wired to run automatically in this gate.
 *
 * ActivityEventService is used here purely as supplemental telemetry (a
 * human-readable breadcrumb on failure) -- never the recovery mechanism
 * itself. The obligation ROW, committed transactionally with the physical
 * receipt, is what guarantees recovery is possible; if the telemetry call
 * also fails, record() swallows that internally and the obligation row
 * still carries everything a later processPending() sweep needs.
 */
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  SuperAgentHandlingEarningObligation,
  EarningObligationStatus,
} from './entities/super-agent-handling-earning-obligation.entity';
import { SuperAgentHandlingEarningService, RecordHandlingEarningActor } from './super-agent-handling-earning.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';

const UNIQUE_VIOLATION = '23505';

// A genuinely unexpected error (not "no rate configured yet") stops being
// automatically retried after this many attempts, escalating to
// FAILED_PERMANENT so it stays visible rather than retrying silently
// forever. FAILED_NO_RATE never counts against this -- see the entity's own
// comment on FAILED_PERMANENT.
const MAX_ERROR_ATTEMPTS = 5;

// A 'processing' row whose last attempt is older than this is treated as
// abandoned (e.g. the worker that claimed it crashed mid-resolve) and
// becomes reclaimable again by processPending().
const STALE_PROCESSING_MINUTES = 10;

export interface ProcessPendingResult {
  claimed: number;
  completed: number;
  stillFailing: number;
}

@Injectable()
export class SuperAgentHandlingEarningObligationService {
  constructor(
    @InjectRepository(SuperAgentHandlingEarningObligation)
    private obligationRepo: Repository<SuperAgentHandlingEarningObligation>,
    private readonly earningService: SuperAgentHandlingEarningService,
    private readonly activityEventService: ActivityEventService,
    private readonly dataSource: DataSource,
  ) {}

  // Called with the SAME transaction manager confirmReceipt() is already
  // using -- this is what makes the obligation transactionally atomic with
  // the qualifying custody event and the RECEIVED status flip. Idempotent
  // on custodyEventId, mirroring the earning table's own established
  // create-if-absent convention (a retried confirmReceipt for an event
  // whose obligation already exists must never create a second one).
  async createObligation(
    manager: EntityManager,
    params: { custodyEventId: number; parcelId: number; superAgentId: number },
  ): Promise<SuperAgentHandlingEarningObligation> {
    const repo = manager.getRepository(SuperAgentHandlingEarningObligation);
    const row = repo.create({
      custodyEventId: params.custodyEventId,
      parcelId: params.parcelId,
      superAgentId: params.superAgentId,
      status: EarningObligationStatus.PENDING,
    });
    try {
      return await repo.save(row);
    } catch (error: any) {
      if (error?.code === UNIQUE_VIOLATION) {
        return repo.findOneOrFail({ where: { custodyEventId: params.custodyEventId } });
      }
      throw error;
    }
  }

  // Best-effort resolution of one obligation. NEVER throws -- confirmReceipt
  // and processPending() both rely on that. A no-op if the obligation is
  // already COMPLETED (or vanished, which should never happen given the FK).
  async attemptResolve(obligationId: number, actor: RecordHandlingEarningActor): Promise<void> {
    const obligation = await this.obligationRepo.findOne({ where: { id: obligationId } });
    if (!obligation || obligation.status === EarningObligationStatus.COMPLETED) return;

    try {
      const earning = await this.earningService.recordEarningForCustodyEvent(obligation.custodyEventId, actor);
      obligation.status = EarningObligationStatus.COMPLETED;
      obligation.resultingEarningId = earning.id;
      obligation.lastError = null;
      obligation.lastAttemptedAt = new Date();
      await this.obligationRepo.save(obligation);
    } catch (error: any) {
      const isNoRate = error instanceof ConflictException;
      const nextAttempts = obligation.attempts + 1;
      obligation.attempts = nextAttempts;
      obligation.lastError = String(error?.message ?? 'unknown error').slice(0, 500);
      obligation.lastAttemptedAt = new Date();
      obligation.status = isNoRate
        ? EarningObligationStatus.FAILED_NO_RATE
        : nextAttempts >= MAX_ERROR_ATTEMPTS
          ? EarningObligationStatus.FAILED_PERMANENT
          : EarningObligationStatus.FAILED_ERROR;

      // The obligation row itself already exists (committed transactionally
      // with the physical receipt) -- even if THIS status-update write also
      // fails, nothing is lost; a later sweep finds it still PENDING/
      // FAILED_* and retries. Never let a failure here escape.
      await this.obligationRepo.save(obligation).catch(() => {});

      // Supplemental telemetry only -- never the recovery mechanism itself.
      // record() itself never throws.
      await this.activityEventService.record({
        eventType:
          obligation.status === EarningObligationStatus.FAILED_PERMANENT
            ? 'SUPER_AGENT_HANDLING_EARNING_GENERATION_PERMANENTLY_FAILED'
            : 'SUPER_AGENT_HANDLING_EARNING_GENERATION_FAILED',
        category: ActivityCategory.LOGISTICS,
        actorId: actor.userId,
        targetType: 'parcel_custody_event',
        targetId: obligation.custodyEventId,
        severity: obligation.status === EarningObligationStatus.FAILED_PERMANENT ? 'critical' : 'error',
        visibility: 'admin',
        metadata: {
          obligationId: obligation.id,
          parcelId: obligation.parcelId,
          superAgentId: obligation.superAgentId,
          attempts: obligation.attempts,
          reason: obligation.lastError,
        },
      });
    }
  }

  // Reconciliation entry point. Claims a bounded batch of outstanding
  // obligations via SELECT ... FOR UPDATE SKIP LOCKED (so two concurrent
  // invocations never claim the same row) and resolves each. Not wired to
  // any scheduler in this gate -- a future cron/admin action calls it.
  async processPending(limit = 50, actor: RecordHandlingEarningActor = { userId: null }): Promise<ProcessPendingResult> {
    const claimedIds: number[] = await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT id FROM public.super_agent_handling_earning_obligation
         WHERE status = 'pending'
            OR status = 'failed_no_rate'
            OR (status = 'failed_error' AND attempts < $2)
            OR (status = 'processing' AND ("lastAttemptedAt" IS NULL OR "lastAttemptedAt" < now() - ($3 || ' minutes')::interval))
         ORDER BY id ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [limit, MAX_ERROR_ATTEMPTS, STALE_PROCESSING_MINUTES],
      );
      const ids = rows.map((r: any) => Number(r.id));
      if (ids.length) {
        await manager.query(
          `UPDATE public.super_agent_handling_earning_obligation SET status = 'processing' WHERE id = ANY($1::int[])`,
          [ids],
        );
      }
      return ids;
    });

    let completed = 0;
    let stillFailing = 0;
    for (const id of claimedIds) {
      await this.attemptResolve(id, actor);
      const after = await this.obligationRepo.findOne({ where: { id } });
      if (after?.status === EarningObligationStatus.COMPLETED) completed += 1;
      else stillFailing += 1;
    }
    return { claimed: claimedIds.length, completed, stillFailing };
  }
}
