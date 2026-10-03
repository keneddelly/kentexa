/**
 * SuperAgentCashCollectionService — Stage 3S-C5: cash-desk collection
 * foundation for the Kentexa Van pilot.
 *
 * Deliberately independent of SuperAgentHandlingEarningService: this gate
 * does not assume every collection implies a qualifying custody event, or
 * that every custody event implies a payment. Callers that need both simply
 * call each service; nothing here derives one from the other.
 *
 * This is a tested STANDALONE FOUNDATION, not a pilot-ready live workflow:
 * no automatic earning trigger wiring, no quote-context validation (quoteId
 * remains a deliberately deferred risk -- a future gate must validate the
 * accepted quote context before real money changes hands), no reconciliation
 * or remittance. See this gate's own correction report for the full boundary.
 *
 * Post-review correction (Stage 3S-C5 re-review): the original version
 * caught a reused idempotencyKey and silently returned the ORIGINAL row on
 * ANY conflict -- including one whose proposed economics (amount, currency,
 * payment method, price context, quote, receipt) genuinely differed from
 * what was actually stored. That would have reported success for a request
 * that was never truthfully recorded. A retry must match the original
 * request exactly; anything else is a real conflict, not a retry.
 */
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SuperAgentCashCollection } from './entities/super-agent-cash-collection.entity';

export interface CollectCashDto {
  parcelId: number;
  superAgentId: number;
  quoteId?: number | null;
  priceContextAmount: number;
  priceContextCurrency?: string;
  collectedAmount: number;
  currency?: string;
  paymentMethod: string;
  actorUserId: number;
  receiptReference?: string | null;
  idempotencyKey: string;
}

const ALLOWED_PAYMENT_METHODS = ['cash'];
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class SuperAgentCashCollectionService {
  constructor(
    @InjectRepository(SuperAgentCashCollection) private collectionRepo: Repository<SuperAgentCashCollection>,
    private readonly dataSource: DataSource,
  ) {}

  private async assertSuperAgentExists(superAgentId: number): Promise<{ id: number; userId: number }> {
    const rows = await this.dataSource.query('SELECT id, "userId" FROM public.super_agent WHERE id = $1', [superAgentId]);
    if (!rows.length) throw new BadRequestException('superAgentId does not reference an existing Super Agent');
    return rows[0];
  }

  private async assertParcelExists(parcelId: number): Promise<void> {
    const rows = await this.dataSource.query('SELECT id FROM public.parcel WHERE id = $1', [parcelId]);
    if (!rows.length) throw new BadRequestException('parcelId does not reference an existing Parcel');
  }

  // "Authority" here means the one relationship this data model can
  // currently prove: the collecting actor IS the Super Agent's own linked
  // operating user (SuperAgent.userId). There is no staff/workspace-member
  // authority model wired to SuperAgent anywhere in this codebase yet (only
  // an optional workspace BINDING, never a membership list) -- if one is
  // added later, this check should widen to membership rather than exact
  // match. Documented here rather than silently assumed.
  private async assertActorAuthority(actorUserId: number, superAgent: { userId: number }): Promise<void> {
    const rows = await this.dataSource.query('SELECT id FROM public."user" WHERE id = $1', [actorUserId]);
    if (!rows.length) throw new BadRequestException('actorUserId does not reference an existing user');
    if (actorUserId !== superAgent.userId) {
      throw new BadRequestException('actorUserId is not authorized to collect on behalf of this Super Agent');
    }
  }

  // "Same payload" for idempotency purposes -- every economically or
  // identity-relevant field must match exactly. Decimal columns round-trip
  // as strings from the driver, so amounts compare via Number().
  private matchesExisting(existing: SuperAgentCashCollection, dto: CollectCashDto): boolean {
    return (
      existing.parcelId === dto.parcelId &&
      existing.superAgentId === dto.superAgentId &&
      (existing.quoteId ?? null) === (dto.quoteId ?? null) &&
      Number(existing.priceContextAmount) === Number(dto.priceContextAmount) &&
      existing.priceContextCurrency === (dto.priceContextCurrency ?? 'TZS') &&
      Number(existing.collectedAmount) === Number(dto.collectedAmount) &&
      existing.currency === (dto.currency ?? 'TZS') &&
      existing.paymentMethod === dto.paymentMethod &&
      existing.actorUserId === dto.actorUserId &&
      (existing.receiptReference ?? null) === (dto.receiptReference ?? null)
    );
  }

  async collectCash(dto: CollectCashDto): Promise<SuperAgentCashCollection> {
    if (!ALLOWED_PAYMENT_METHODS.includes(dto.paymentMethod)) {
      throw new BadRequestException(`Unsupported paymentMethod: ${dto.paymentMethod}`);
    }
    if (!(dto.collectedAmount > 0)) {
      throw new BadRequestException('collectedAmount must be a positive amount');
    }
    if (!(dto.priceContextAmount >= 0)) {
      throw new BadRequestException('priceContextAmount cannot be negative');
    }
    const superAgent = await this.assertSuperAgentExists(dto.superAgentId);
    await this.assertParcelExists(dto.parcelId);
    await this.assertActorAuthority(dto.actorUserId, superAgent);

    const row = this.collectionRepo.create({
      parcelId: dto.parcelId,
      superAgentId: dto.superAgentId,
      quoteId: dto.quoteId ?? null,
      priceContextAmount: dto.priceContextAmount,
      priceContextCurrency: dto.priceContextCurrency ?? 'TZS',
      collectedAmount: dto.collectedAmount,
      currency: dto.currency ?? 'TZS',
      paymentMethod: dto.paymentMethod,
      actorUserId: dto.actorUserId,
      receiptReference: dto.receiptReference ?? null,
      idempotencyKey: dto.idempotencyKey,
      reconciliationStatus: 'pending',
    });
    try {
      return await this.collectionRepo.save(row);
    } catch (error: any) {
      if (error?.code === UNIQUE_VIOLATION) {
        // A retry (or a genuinely concurrent duplicate submission) under the
        // SAME caller-supplied idempotencyKey. The DB's own unique
        // constraint is what guarantees this can never double-write; this
        // check decides whether that's actually a retry of the SAME request
        // (return the original, untouched) or a genuinely different request
        // reusing a stale key (a real conflict, never silently reported as
        // success).
        const existing = await this.collectionRepo.findOneOrFail({ where: { idempotencyKey: dto.idempotencyKey } });
        if (!this.matchesExisting(existing, dto)) {
          throw new ConflictException('idempotencyKey was already used for a collection with different economics');
        }
        return existing;
      }
      throw error;
    }
  }
}
