/**
 * SuperAgentHandlingEarningService — Stage 3S-C5: turns one qualifying,
 * already-recorded ParcelCustodyEvent into exactly one immutable earning
 * row. Never writes ParcelCustodyEvent itself -- "do not create custody
 * events merely to generate earnings" (Issue #62's own instruction). This
 * service only ever READS the ledger C1-C4 already established.
 *
 * Eligibility ("verify custodian direction... do not infer from event names
 * alone"): a custody event qualifies if and only if its `toCustodianType` is
 * 'super_agent' with a real `toCustodianId` -- i.e. a Super Agent is
 * genuinely RECEIVING custody. A Super Agent RELEASING custody (Stage
 * 3S-C4's own `parcel_run_loaded`, fromCustodianType='super_agent') never
 * qualifies on its own -- exactly the "a load event transferring custody
 * FROM a Super Agent TO a transport provider must not independently
 * generate another receiving commission" requirement. This single
 * directional rule covers every existing receiving eventKind
 * (origin_hub_received, destination_hub_received, parcel_run_unloaded)
 * without needing to enumerate event names at all.
 *
 * Post-review correction (Stage 3S-C5 re-review): the reviewer correctly
 * pointed out that "toCustodianType='super_agent'" alone is a NECESSARY
 * condition but not, by itself, evidence the row represents a genuine
 * physical handling operation performed by a real, identifiable actor --
 * nothing stopped a degenerate/spoofed-looking row (e.g. a custodian
 * "handing off to itself", or a bare `actorSource='system'` event with no
 * identifiable human or authenticated provider behind it at all) from
 * qualifying. Two further checks were added, both bound to the EXISTING
 * custody-event contract's own vocabulary (never a brittle enumeration of
 * eventKind strings):
 *   - `actorSource` must be a REAL, authenticated actor ('account_role' or
 *     'provider_webhook') -- never bare 'system', which this ledger's own
 *     actor-shape CHECK already defines as having no identifiable actor at
 *     all behind it.
 *   - `fromCustodianType` must be one of the small, stable set of custodian
 *     types that can legitimately precede a Super Agent RECEIVING custody
 *     (unknown/first custody, a transport provider, another Super Agent, or
 *     a local Agent) -- and the from/to pair may never be the identical
 *     custodian (a self-transfer proves nothing physically happened).
 *
 * Second re-review correction: `local_agent` was initially left out of that
 * set, which would have made a REAL, already-shipped canonical pathway
 * permanently ineligible --
 * parcel-collections.service.ts's own hub-handover flow already writes a
 * genuine, authenticated `collection_received_at_origin_hub` event with
 * exactly `fromCustodianType='local_agent'` when an Agent physically hands a
 * collected parcel to the origin Super Agent desk. Added; the REVERSE
 * direction (a Super Agent handing off TO an Agent) and a local-Agent-only
 * delivery (never reaching a Super Agent's `toCustodianType` at all) both
 * remain correctly excluded by the existing toCustodianType check, unaffected
 * by this addition.
 *
 * Stage 3S-C6 second correction: cross-pathway deduplication is now keyed
 * on the qualifying event's own `evidenceRef` (frozen onto the earning row
 * as `physicalHandoffRef`) -- a proven, concrete-operation identity, not a
 * custodian-type category guess. See SuperAgentHandlingEarning's own header
 * comment for the full reasoning.
 *
 * Stage 3S-C6 third correction: the FINAL re-review correctly rejected the
 * earlier version of this ambiguity handling, which inserted a SECOND
 * immutable earning FIRST and only flagged the ambiguity afterward --
 * "detection after a potential duplicate financial liability has been
 * created, not a safe ambiguity hold." It also pointed out that
 * `parcel_run_assignment:<id>` and `collection:<id>` are different
 * namespaces with no mechanism proving a legacy write and a Run write of
 * the SAME real transfer would ever share an identical evidenceRef --
 * this service never invents or asserts such equivalence.
 *
 * The corrected rule: when a qualifying event carries NO evidenceRef at
 * all, cross-writer equivalence with any EXISTING earning for the same
 * (parcel, Super Agent) pair can't be proven either way. Rather than
 * guessing, this service now HOLDS -- it throws
 * UnresolvedHandoffAmbiguityException and creates NO earning at all,
 * leaving the decision to an explicit, separately-invoked resolution
 * (SuperAgentHandlingEarningObligationService.resolveAmbiguousHold()) that
 * either links the event to the EXISTING earning (a human has determined
 * it's the same handoff) or explicitly authorizes an independent one (a
 * human has determined it's genuinely separate) via `allowAmbiguous`. The
 * FIRST-ever no-evidenceRef event for a pair (nothing yet to be ambiguous
 * WITH) still earns immediately -- there's no ambiguity to hold on.
 *
 * This whole check-then-decide sequence runs inside a transaction that
 * locks the target Super Agent row first (mirroring this lineage's own
 * established "lock the contended resource before checking its state"
 * pattern) -- without it, two truly concurrent, equally ambiguous
 * (no-evidenceRef) receipts for the SAME pair could both see zero prior
 * earnings and both proceed, defeating the entire hold.
 *
 * Deliberately NOT wired as an automatic side effect of any existing
 * custody-writing call site in this gate (see this gate's own report for
 * why) -- this is a standalone, explicitly-invoked authority, proven correct
 * against real custody-event rows shaped exactly like every existing
 * pathway already produces.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { SuperAgentHandlingEarning } from './entities/super-agent-handling-earning.entity';
import { SuperAgentHandlingRateService } from './super-agent-handling-rate.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';

export interface RecordHandlingEarningActor {
  userId: number | null;
}

export interface RecordEarningOptions {
  // Explicit authorization (from SuperAgentHandlingEarningObligationService.
  // resolveAmbiguousHold(), never set by any automatic call path) to create
  // an earning for a no-evidenceRef event despite an existing earning for
  // the same pair -- a human has determined these are genuinely separate.
  allowAmbiguous?: boolean;
}

// Thrown instead of creating a second earning when a qualifying receipt
// carries no provable physical-handoff identity AND a prior earning
// already exists for the same (parcel, Super Agent) pair. Never
// automatically retried by SuperAgentHandlingEarningObligationService's own
// processPending() sweep -- resolving it requires an explicit human
// decision (resolveAmbiguousHold()).
export class UnresolvedHandoffAmbiguityException extends ConflictException {}

// Postgres error code for a unique-constraint violation.
const UNIQUE_VIOLATION = '23505';

// A REAL, authenticated actor must be behind a commission-qualifying
// physical operation. 'system' is this ledger's own established vocabulary
// for "no identifiable actor at all" (its actor-shape CHECK requires every
// actor-identifying column to be NULL for that source) -- never sufficient
// evidence a person or authenticated carrier actually handled a parcel.
const LEGITIMATE_ACTOR_SOURCES = new Set(['account_role', 'provider_webhook']);

// The small, stable set of custodian types that can legitimately precede a
// Super Agent RECEIVING custody: unknown/first custody (null -- e.g. a
// customer origin drop-off, never itself recorded as a "from" custodian),
// a transport provider (Stage 3S-C4's own parcel_run_unloaded), another
// Super Agent (a hub-to-hub transfer), or a local Agent (Stage 3S-C5
// re-review correction: parcel-collections.service.ts's own existing
// hub-handover flow already writes a genuine, authenticated
// 'collection_received_at_origin_hub' event with exactly this shape --
// fromCustodianType='local_agent' -- when an Agent physically hands a
// collected parcel to the origin Super Agent desk. Excluding it would have
// made a real, already-shipped qualifying receipt permanently ineligible).
// Deliberately NOT an enumeration of eventKind strings -- this is the
// custodian-type vocabulary the ledger already established, a much smaller
// and more stable surface. The REVERSE direction (fromCustodianType=
// 'super_agent' -- a Super Agent handing off TO an Agent) and a local-
// Agent-only delivery (toCustodianType never 'super_agent' at all) are both
// still correctly excluded by the toCustodianType check above, not by
// anything in this set.
const LEGITIMATE_PRIOR_CUSTODIAN_TYPES = new Set<string | null>([null, 'transport_provider', 'super_agent', 'local_agent']);

@Injectable()
export class SuperAgentHandlingEarningService {
  constructor(
    @InjectRepository(ParcelCustodyEvent) private custodyRepo: Repository<ParcelCustodyEvent>,
    @InjectRepository(SuperAgentHandlingEarning) private earningRepo: Repository<SuperAgentHandlingEarning>,
    private readonly rateService: SuperAgentHandlingRateService,
    private readonly dataSource: DataSource,
    private readonly activityEventService: ActivityEventService,
  ) {}

  private isQualifyingReceipt(event: ParcelCustodyEvent): boolean {
    if (event.toCustodianType !== 'super_agent' || event.toCustodianId == null) return false;
    if (!LEGITIMATE_ACTOR_SOURCES.has(event.actorSource)) return false;
    if (!LEGITIMATE_PRIOR_CUSTODIAN_TYPES.has(event.fromCustodianType)) return false;
    // A degenerate self-transfer (identical custodian on both sides) proves
    // nothing physically happened -- reject it even though its individual
    // fields would otherwise pass every check above.
    if (event.fromCustodianType === event.toCustodianType && event.fromCustodianId === event.toCustodianId) {
      return false;
    }
    return true;
  }

  private async assertSuperAgentExists(superAgentId: number): Promise<void> {
    const rows = await this.dataSource.query('SELECT id FROM public.super_agent WHERE id = $1', [superAgentId]);
    if (!rows.length) throw new BadRequestException('toCustodianId does not reference an existing Super Agent');
  }

  private async assertParcelExists(parcelId: number): Promise<void> {
    const rows = await this.dataSource.query('SELECT id FROM public.parcel WHERE id = $1', [parcelId]);
    if (!rows.length) throw new BadRequestException('parcelId does not reference an existing Parcel');
  }

  async findEarningById(id: number): Promise<SuperAgentHandlingEarning | null> {
    return this.earningRepo.findOne({ where: { id } });
  }

  async recordEarningForCustodyEvent(
    custodyEventId: number,
    actor: RecordHandlingEarningActor,
    opts: RecordEarningOptions = {},
  ): Promise<SuperAgentHandlingEarning> {
    const event = await this.custodyRepo.findOne({ where: { id: custodyEventId } });
    if (!event) throw new NotFoundException('Custody event not found');

    if (!this.isQualifyingReceipt(event)) {
      throw new BadRequestException(
        'This custody event does not represent a Super Agent physically receiving custody',
      );
    }
    await this.assertSuperAgentExists(event.toCustodianId!);
    await this.assertParcelExists(event.parcelId);

    const rate = await this.rateService.getEffectiveRate('handling', 'global', event.recordedAt);
    if (!rate) {
      throw new ConflictException('No effective handling-rate configuration covers this custody event\'s time');
    }

    // Frozen from the qualifying event's own evidenceRef -- the proven
    // physical-handoff identity, see the entity's header comment.
    const physicalHandoffRef = event.evidenceRef ?? null;
    const superAgentId = event.toCustodianId!;

    return this.dataSource.transaction(async (manager) => {
      // Locks the target Super Agent row FIRST -- serializes every
      // earning-recording attempt for it, so two truly concurrent,
      // equally-ambiguous (no-evidenceRef) receipts for the SAME pair can
      // never both pass the "any prior earning?" check before either
      // commits. See this service's own header comment.
      await manager.query('SELECT id FROM public.super_agent WHERE id = $1 FOR UPDATE', [superAgentId]);
      const earningRepo = manager.getRepository(SuperAgentHandlingEarning);

      // Idempotent-retry fast path: if THIS exact custody event already has
      // an earning, return it directly -- BEFORE the ambiguity-hold check
      // below. Without this, a genuine retry of the SAME event would look
      // identical to "a second, different event for this pair" and would
      // be wrongly held.
      const existingForThisEvent = await earningRepo.findOne({ where: { custodyEventId: event.id } });
      if (existingForThisEvent) return existingForThisEvent;

      if (physicalHandoffRef == null && !opts.allowAmbiguous) {
        const priorCount = await earningRepo.count({ where: { parcelId: event.parcelId, superAgentId } });
        if (priorCount > 0) {
          await this.activityEventService.record({
            eventType: 'SUPER_AGENT_HANDLING_EARNING_UNRESOLVED_HANDOFF_AMBIGUITY',
            category: ActivityCategory.LOGISTICS,
            actorId: actor.userId,
            targetType: 'parcel_custody_event',
            targetId: event.id,
            severity: 'warning',
            visibility: 'admin',
            metadata: {
              custodyEventId: event.id,
              parcelId: event.parcelId,
              superAgentId,
              reason: 'no evidenceRef on the qualifying custody event -- cannot prove this is (or is not) the same physical handoff as an existing earning for this parcel/Super Agent pair; held pending explicit resolution',
            },
          });
          throw new UnresolvedHandoffAmbiguityException(
            'This custody event carries no physical-handoff reference, and a prior earning already exists for this parcel/Super Agent pair -- cross-writer equivalence cannot be proven automatically. Held pending explicit resolution.',
          );
        }
      }

      const row = earningRepo.create({
        custodyEventId: event.id,
        parcelId: event.parcelId,
        superAgentId,
        physicalHandoffRef,
        rateConfigId: rate.id,
        amount: rate.amount,
        currency: rate.currency,
        source: event.eventKind,
        actorUserId: actor.userId,
      });
      // A SAVEPOINT, not a bare try/catch -- Postgres aborts the WHOLE
      // transaction on ANY error (including a caught unique-violation) until
      // something rolls back, so the re-select queries below would
      // otherwise fail with "current transaction is aborted." Rolling back
      // to this savepoint undoes only the failed insert, keeping the
      // Super Agent row lock (and the surrounding transaction) intact.
      await manager.query('SAVEPOINT before_earning_insert');
      try {
        return await earningRepo.save(row);
      } catch (error: any) {
        await manager.query('ROLLBACK TO SAVEPOINT before_earning_insert');
        if (error?.code === UNIQUE_VIOLATION) {
          if (error?.constraint === 'UQ_super_agent_handling_earning_physical_handoff') {
            // A DIFFERENT custody event -- from this pathway or a different
            // one entirely -- already recorded an earning for this exact,
            // PROVEN physical operation (physicalHandoffRef can only
            // collide when two rows genuinely describe the same real-world
            // handoff). Returning the already-recorded earning keeps this
            // call idempotent without ever risking a second payment for
            // what is provably the same handoff.
            return earningRepo.findOneOrFail({ where: { physicalHandoffRef: physicalHandoffRef! } });
          }
          // Belt-and-suspenders: the fast path above already handles the
          // common case, but a genuinely concurrent retry for the SAME
          // custody event (racing in before this transaction's own lock)
          // still resolves correctly via the DB's own unique constraint.
          return earningRepo.findOneOrFail({ where: { custodyEventId: event.id } });
        }
        throw error;
      }
    });
  }
}
