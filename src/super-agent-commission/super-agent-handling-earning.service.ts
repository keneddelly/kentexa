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

@Injectable()
export class SuperAgentHandlingEarningService {
  constructor(
    @InjectRepository(ParcelCustodyEvent) private custodyRepo: Repository<ParcelCustodyEvent>,
    @InjectRepository(SuperAgentHandlingEarning) private earningRepo: Repository<SuperAgentHandlingEarning>,
    private readonly rateService: SuperAgentHandlingRateService,
    private readonly dataSource: DataSource,
  ) {}

  private isQualifyingReceipt(event: ParcelCustodyEvent): boolean {
    return event.toCustodianType === 'super_agent' && event.toCustodianId != null;
  }

  private async assertSuperAgentExists(superAgentId: number): Promise<void> {
    const rows = await this.dataSource.query('SELECT id FROM public.super_agent WHERE id = $1', [superAgentId]);
    if (!rows.length) throw new BadRequestException('toCustodianId does not reference an existing Super Agent');
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

    const rate = await this.rateService.getEffectiveRate('handling', 'global', event.recordedAt);
    if (!rate) {
      throw new ConflictException('No effective handling-rate configuration covers this custody event\'s time');
    }

    const row = this.earningRepo.create({
      custodyEventId: event.id,
      parcelId: event.parcelId,
      superAgentId: event.toCustodianId!,
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
