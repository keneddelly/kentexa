/**
 * SuperAgentHandlingEarningObligationService — Stage 3S-C6 second correction,
 * ownership/concurrency model corrected in the third correction.
 *
 * Owns the transactional-outbox lifecycle described in
 * SuperAgentHandlingEarningObligation's own header comment:
 *
 *   createObligation()      -- called from WITHIN ParcelRunAssignmentService.
 *                               confirmReceipt()'s own transaction, so the
 *                               obligation and the qualifying custody
 *                               receipt commit together or not at all.
 *   attemptResolve()        -- claims the obligation, tries to actually
 *                               compute the earning, then finalizes via a
 *                               compare-and-set write. Never throws.
 *   processPending()        -- reconciliation entry point: finds candidate
 *                               obligation ids and calls attemptResolve()
 *                               on each. Not wired to any scheduler in this
 *                               gate -- a future cron/admin action calls it.
 *   resolveAmbiguousHold()  -- explicit human resolution of a
 *                               HELD_AMBIGUOUS_IDENTITY obligation.
 *   forceReplay()           -- explicit authorized replay of a
 *                               FAILED_PERMANENT obligation.
 *
 * Third correction -- ownership/concurrency: the earlier version claimed a
 * BATCH of rows in one transaction (SELECT ... FOR UPDATE SKIP LOCKED, then
 * an UPDATE), but attemptResolve() itself never re-claimed a SPECIFIC row --
 * it read the obligation once, did the (possibly slow) earning-generation
 * call, then wrote its own view of the final status unconditionally. Two
 * overlapping attempts for the SAME obligation (confirmReceipt's own
 * immediate call racing a concurrent processPending() sweep, or a stale/
 * delayed worker finishing after a newer one already succeeded) could each
 * read a stale in-memory copy and the LATER write would blindly overwrite
 * whatever the other had already committed -- including overwriting a real
 * COMPLETED with a stale FAILED_ERROR.
 *
 * The corrected design gives every resolution attempt its own atomic
 * claim-then-compare-and-set lifecycle, with NO in-memory state carried
 * between the two steps:
 *
 *   1. claimObligation(id) -- a single atomic
 *      `UPDATE ... SET status='processing' WHERE id=$1 AND status IN
 *      (<reclaimable statuses>) RETURNING *`. Postgres serializes concurrent
 *      UPDATEs to the same row: whichever commits first "wins" the claim;
 *      any other concurrent claim attempt's WHERE clause then no longer
 *      matches (status is already 'processing') and it affects zero rows,
 *      so it correctly returns null -- "nothing to do here." This holds
 *      for ANY two overlapping callers, immediate or swept, without needing
 *      a shared in-memory lock or a held DB transaction across the
 *      (possibly slow) earning-generation call.
 *   2. The actual earning-generation call happens with NO lock held.
 *   3. finalize(id, patch) -- a single atomic
 *      `UPDATE ... SET status=$2, ... WHERE id=$1 AND status='processing'`.
 *      This is the compare-and-set: it only ever writes a final status if
 *      the row is STILL 'processing' (i.e. still owned by an in-flight
 *      claim, never yet finalized by anyone else). A late/stale write from
 *      an abandoned attempt can therefore never overwrite an already-
 *      COMPLETED (or otherwise already-finalized) row -- its own finalize
 *      simply affects zero rows and is silently discarded.
 *
 * A stale 'processing' row (a worker that crashed mid-resolve, so its own
 * finalize() never ran) is still reclaimable -- claimObligation()'s WHERE
 * clause also matches 'processing' rows whose lastAttemptedAt is older than
 * STALE_PROCESSING_MINUTES, so recovery from a crash never requires manual
 * intervention.
 *
 * ActivityEventService is used here purely as supplemental telemetry (a
 * human-readable breadcrumb) -- never the recovery mechanism itself. The
 * obligation ROW, committed transactionally with the physical receipt, is
 * what guarantees recovery is possible; if the telemetry call also fails,
 * record() swallows that internally and the obligation row still carries
 * everything a later processPending() sweep needs.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  SuperAgentHandlingEarningObligation,
  EarningObligationStatus,
} from './entities/super-agent-handling-earning-obligation.entity';
import {
  SuperAgentHandlingEarningService,
  RecordHandlingEarningActor,
  UnresolvedHandoffAmbiguityException,
} from './super-agent-handling-earning.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { pgRows } from '../money-routing/pg-rows';

const UNIQUE_VIOLATION = '23505';

// A genuinely unexpected error (not "no rate configured yet") stops being
// automatically retried after this many attempts, escalating to
// FAILED_PERMANENT so it stays visible rather than retrying silently
// forever. FAILED_NO_RATE never counts against this -- see the entity's own
// comment on FAILED_PERMANENT.
const MAX_ERROR_ATTEMPTS = 5;

// A 'processing' row whose last attempt is older than this is treated as
// abandoned (e.g. the worker that claimed it crashed mid-resolve) and
// becomes reclaimable again.
const STALE_PROCESSING_MINUTES = 10;

// Statuses a fresh (non-stale) claim attempt may take ownership from.
const RECLAIMABLE_STATUSES = ['pending', 'failed_no_rate', 'failed_error'];

export interface ProcessPendingResult {
  attempted: number;
  completed: number;
  stillFailing: number;
}

export interface ResolveAmbiguousHoldDecision {
  // A human has determined this custody event describes the SAME physical
  // handoff as an existing earning -- link to it, create no new earning.
  duplicateOfEarningId?: number;
  // A human has determined this custody event is a genuinely SEPARATE
  // handling operation despite the missing evidenceRef -- authorize an
  // independent earning.
  authorizeIndependentEarning?: boolean;
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

  // Atomically claims ONE specific obligation for processing -- see this
  // file's own header comment for why this, not a batch SELECT FOR UPDATE,
  // is what actually makes concurrent resolution attempts safe. Returns the
  // claimed row (now 'processing') or null if there was nothing to claim
  // (already COMPLETED/HELD/FAILED_PERMANENT, or actively owned by a
  // non-stale attempt elsewhere).
  private async claimObligation(id: number): Promise<{ id: number; custodyEventId: number; attempts: number } | null> {
    // pgRows -- TypeORM's postgres driver returns [rows, affectedCount] for
    // an UPDATE ... RETURNING (unlike a plain SELECT), see pg-rows.ts's own
    // comment. Without this normalisation, rows[0] was the WHOLE inner rows
    // array rather than the first row, silently making every field on it
    // (including custodyEventId) undefined -- the exact bug that slipped
    // through here before this fix.
    const rows = pgRows<{ id: number; custodyEventId: number; attempts: number }>(await this.dataSource.query(
      `UPDATE public.super_agent_handling_earning_obligation
       SET status = 'processing', "lastAttemptedAt" = now(), "updatedAt" = now()
       WHERE id = $1
         AND (status = ANY($2::text[])
              OR (status = 'processing' AND ("lastAttemptedAt" IS NULL OR "lastAttemptedAt" < now() - ($3 || ' minutes')::interval)))
       RETURNING id, "custodyEventId", attempts`,
      [id, RECLAIMABLE_STATUSES, STALE_PROCESSING_MINUTES],
    ));
    return rows[0] ?? null;
  }

  // Compare-and-set: only ever writes a final status if the row is STILL
  // 'processing' -- i.e. nobody else has already finalized it since this
  // attempt's own claim. A late/stale caller's finalize silently no-ops
  // instead of clobbering whatever the winner already committed.
  private async finalize(
    id: number,
    patch: { status: EarningObligationStatus; resultingEarningId?: number | null; attempts?: number; lastError?: string | null },
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE public.super_agent_handling_earning_obligation
       SET status = $2, "resultingEarningId" = COALESCE($3, "resultingEarningId"),
           attempts = COALESCE($4, attempts), "lastError" = $5, "updatedAt" = now()
       WHERE id = $1 AND status = 'processing'`,
      [id, patch.status, patch.resultingEarningId ?? null, patch.attempts ?? null, patch.lastError ?? null],
    );
  }

  // Best-effort resolution of one obligation. NEVER throws -- confirmReceipt
  // and processPending() both rely on that. A no-op if there was nothing to
  // claim (see claimObligation's own comment).
  async attemptResolve(obligationId: number, actor: RecordHandlingEarningActor): Promise<void> {
    const claimed = await this.claimObligation(obligationId);
    if (!claimed) return;
    await this.resolveClaimed(obligationId, claimed.custodyEventId, claimed.attempts, actor);
  }

  // Shared "do the actual work, then finalize" step for an ALREADY-CLAIMED
  // obligation (status='processing', owned by the caller) -- used by both
  // attemptResolve() and forceReplay(), so there is exactly one code path
  // between "we own this row" and "we wrote its final status."
  private async resolveClaimed(
    obligationId: number,
    custodyEventId: number,
    priorAttempts: number,
    actor: RecordHandlingEarningActor,
  ): Promise<void> {
    try {
      const earning = await this.earningService.recordEarningForCustodyEvent(custodyEventId, actor);
      await this.finalize(obligationId, { status: EarningObligationStatus.COMPLETED, resultingEarningId: earning.id, lastError: null });
    } catch (error: any) {
      if (error instanceof UnresolvedHandoffAmbiguityException) {
        await this.finalize(obligationId, { status: EarningObligationStatus.HELD_AMBIGUOUS_IDENTITY, lastError: String(error.message).slice(0, 500) });
        return;
      }
      const isNoRate = error instanceof ConflictException;
      const nextAttempts = priorAttempts + 1;
      const status = isNoRate
        ? EarningObligationStatus.FAILED_NO_RATE
        : nextAttempts >= MAX_ERROR_ATTEMPTS
          ? EarningObligationStatus.FAILED_PERMANENT
          : EarningObligationStatus.FAILED_ERROR;
      const lastError = String(error?.message ?? 'unknown error').slice(0, 500);
      await this.finalize(obligationId, { status, attempts: nextAttempts, lastError });

      // Supplemental telemetry only -- never the recovery mechanism itself.
      // record() itself never throws.
      await this.activityEventService.record({
        eventType:
          status === EarningObligationStatus.FAILED_PERMANENT
            ? 'SUPER_AGENT_HANDLING_EARNING_GENERATION_PERMANENTLY_FAILED'
            : 'SUPER_AGENT_HANDLING_EARNING_GENERATION_FAILED',
        category: ActivityCategory.LOGISTICS,
        actorId: actor.userId,
        targetType: 'parcel_custody_event',
        targetId: custodyEventId,
        severity: status === EarningObligationStatus.FAILED_PERMANENT ? 'critical' : 'error',
        visibility: 'admin',
        metadata: { obligationId, attempts: nextAttempts, reason: lastError },
      });
    }
  }

  // Reconciliation entry point. A plain (unlocked) read of candidate ids --
  // the actual ownership/serialization happens per-row inside
  // attemptResolve()'s own claimObligation(), so two concurrent
  // processPending() calls seeing the SAME candidate is harmless: at most
  // one of them will actually claim and resolve it. Not wired to any
  // scheduler in this gate -- a future cron/admin action calls it.
  async processPending(limit = 50, actor: RecordHandlingEarningActor = { userId: null }): Promise<ProcessPendingResult> {
    const rows = await this.dataSource.query(
      `SELECT id FROM public.super_agent_handling_earning_obligation
       WHERE status = 'pending'
          OR status = 'failed_no_rate'
          OR (status = 'failed_error' AND attempts < $2)
          OR (status = 'processing' AND ("lastAttemptedAt" IS NULL OR "lastAttemptedAt" < now() - ($3 || ' minutes')::interval))
       ORDER BY id ASC
       LIMIT $1`,
      [limit, MAX_ERROR_ATTEMPTS, STALE_PROCESSING_MINUTES],
    );
    const ids: number[] = rows.map((r: any) => Number(r.id));

    let completed = 0;
    let stillFailing = 0;
    for (const id of ids) {
      await this.attemptResolve(id, actor);
      const after = await this.obligationRepo.findOne({ where: { id } });
      if (after?.status === EarningObligationStatus.COMPLETED) completed += 1;
      else stillFailing += 1;
    }
    return { attempted: ids.length, completed, stillFailing };
  }

  // Explicit human resolution of a HELD_AMBIGUOUS_IDENTITY obligation.
  // Atomically claims the hold itself (a HELD row is not in
  // RECLAIMABLE_STATUSES, so attemptResolve()/processPending() can never
  // touch it) before acting, so two concurrent resolution attempts on the
  // SAME hold can't both succeed either.
  async resolveAmbiguousHold(
    obligationId: number,
    decision: ResolveAmbiguousHoldDecision,
    actor: RecordHandlingEarningActor,
  ): Promise<SuperAgentHandlingEarningObligation> {
    const claimed = pgRows<{ id: number; custodyEventId: number; parcelId: number; superAgentId: number }>(await this.dataSource.query(
      `UPDATE public.super_agent_handling_earning_obligation
       SET status = 'processing', "lastAttemptedAt" = now(), "updatedAt" = now()
       WHERE id = $1 AND status = 'held_ambiguous_identity'
       RETURNING id, "custodyEventId", "parcelId", "superAgentId"`,
      [obligationId],
    ));
    if (!claimed.length) {
      throw new ConflictException('This obligation is not currently held for ambiguity review');
    }
    const [row] = claimed;

    try {
      if (decision.duplicateOfEarningId != null) {
        const existing = await this.earningService.findEarningById(decision.duplicateOfEarningId);
        if (!existing || existing.parcelId !== row.parcelId || existing.superAgentId !== row.superAgentId) {
          throw new BadRequestException('duplicateOfEarningId must reference an existing earning for the SAME parcel and Super Agent');
        }
        await this.finalize(obligationId, { status: EarningObligationStatus.COMPLETED, resultingEarningId: existing.id, lastError: null });
      } else if (decision.authorizeIndependentEarning) {
        const earning = await this.earningService.recordEarningForCustodyEvent(row.custodyEventId, actor, { allowAmbiguous: true });
        await this.finalize(obligationId, { status: EarningObligationStatus.COMPLETED, resultingEarningId: earning.id, lastError: null });
      } else {
        throw new BadRequestException('A resolution decision (duplicateOfEarningId or authorizeIndependentEarning) is required');
      }
    } catch (error) {
      // Put the hold back exactly as it was -- an invalid/failed resolution
      // attempt must never leave the obligation stuck in 'processing'.
      await this.dataSource.query(
        `UPDATE public.super_agent_handling_earning_obligation SET status = 'held_ambiguous_identity' WHERE id = $1 AND status = 'processing'`,
        [obligationId],
      );
      throw error;
    }
    return this.obligationRepo.findOneOrFail({ where: { id: obligationId } });
  }

  // Explicit authorized replay of a FAILED_PERMANENT obligation -- never
  // reachable automatically. Atomically claims directly from
  // FAILED_PERMANENT (never reclaimable any other way) and resets attempts
  // to 0 so a genuine retry gets the full MAX_ERROR_ATTEMPTS budget again.
  async forceReplay(obligationId: number, actor: RecordHandlingEarningActor): Promise<void> {
    const claimed = pgRows<{ id: number; custodyEventId: number }>(await this.dataSource.query(
      `UPDATE public.super_agent_handling_earning_obligation
       SET status = 'processing', attempts = 0, "lastAttemptedAt" = now(), "updatedAt" = now()
       WHERE id = $1 AND status = 'failed_permanent'
       RETURNING id, "custodyEventId"`,
      [obligationId],
    ));
    if (!claimed.length) {
      throw new NotFoundException('No FAILED_PERMANENT obligation found to replay');
    }
    await this.resolveClaimed(obligationId, claimed[0].custodyEventId, 0, actor);
  }
}
