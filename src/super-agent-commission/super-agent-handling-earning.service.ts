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
 * This still says nothing about whether the SAME physical handoff was ALSO
 * recorded a second time by a different pathway (legacy vs. Run-based) --
 * see this gate's own report for the documented, deliberately NOT-yet-built
 * cross-pathway deduplication plan; solving that here would mean building a
 * second custody ledger/index, explicitly out of this gate's scope.
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

export interface RecordHandlingEarningActor {
  userId: number | null;
}

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

  async recordEarningForCustodyEvent(
    custodyEventId: number,
    actor: RecordHandlingEarningActor,
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

    // Frozen from the qualifying event's own fromCustodianType -- see the
    // entity's header comment for why this, not eventKind, is the right
    // extra dedup dimension.
    const sourceCustodianType = event.fromCustodianType ?? 'unknown';

    const row = this.earningRepo.create({
      custodyEventId: event.id,
      parcelId: event.parcelId,
      superAgentId: event.toCustodianId!,
      sourceCustodianType,
      rateConfigId: rate.id,
      amount: rate.amount,
      currency: rate.currency,
      source: event.eventKind,
      actorUserId: actor.userId,
    });
    try {
      return await this.earningRepo.save(row);
    } catch (error: any) {
      if (error?.code === UNIQUE_VIOLATION) {
        if (error?.constraint === 'UQ_super_agent_handling_earning_parcel_agent_source') {
          // Stage 3S-C6: a DIFFERENT custody event (from this pathway or a
          // different one entirely) already earned for this exact
          // (parcelId, superAgentId, sourceCustodianType) triple -- the
          // cross-pathway deduplication safety net firing, not a retry of
          // THIS event. Returning the already-recorded earning keeps this
          // call idempotent from the caller's point of view ("this
          // parcel/agent/prior-custodian combination is already
          // compensated") without ever risking a second payment for what
          // may be the same physical handoff recorded twice -- while still
          // allowing a genuinely separate handling operation (a different
          // sourceCustodianType) for the same parcel/agent pair to earn its
          // own, independent row.
          return this.earningRepo.findOneOrFail({
            where: { parcelId: event.parcelId, superAgentId: event.toCustodianId!, sourceCustodianType },
          });
        }
        // Idempotent retry / genuinely concurrent attempt for the SAME
        // custody event -- the DB's own unique constraint on custodyEventId
        // is what actually guarantees "retrying never increases earnings
        // twice", not this check-then-insert; re-reading here just returns
        // the already-committed winner.
        return this.earningRepo.findOneOrFail({ where: { custodyEventId: event.id } });
      }
      throw error;
    }
  }
}
