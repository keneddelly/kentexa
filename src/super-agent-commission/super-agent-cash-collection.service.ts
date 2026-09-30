/**
 * SuperAgentCashCollectionService — Stage 3S-C5: cash-desk collection
 * foundation for the Kentexa Van pilot.
 *
 * Deliberately independent of SuperAgentHandlingEarningService: this gate
 * does not assume every collection implies a qualifying custody event, or
 * that every custody event implies a payment. Callers that need both simply
 * call each service; nothing here derives one from the other.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
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

  private async assertSuperAgentExists(superAgentId: number): Promise<void> {
    const rows = await this.dataSource.query('SELECT id FROM public.super_agent WHERE id = $1', [superAgentId]);
    if (!rows.length) throw new BadRequestException('superAgentId does not reference an existing Super Agent');
  }

  async collectCash(dto: CollectCashDto): Promise<SuperAgentCashCollection> {
    if (!ALLOWED_PAYMENT_METHODS.includes(dto.paymentMethod)) {
      throw new BadRequestException(`Unsupported paymentMethod: ${dto.paymentMethod}`);
    }
    await this.assertSuperAgentExists(dto.superAgentId);

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
        // SAME caller-supplied idempotencyKey -- the DB's own unique
        // constraint is what guarantees this can never double-collect;
        // return the already-committed original untouched.
        return this.collectionRepo.findOneOrFail({ where: { idempotencyKey: dto.idempotencyKey } });
      }
      throw error;
    }
  }
}
