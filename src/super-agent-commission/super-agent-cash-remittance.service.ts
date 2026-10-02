/**
 * SuperAgentCashRemittanceService — Stage 3S-C7 Part B-A: records that a
 * Super Agent has physically handed back cash they collected, through a
 * real, immutable allocation trail -- never a naked status update (see
 * SuperAgentCashRemittanceAllocation's own header comment for why
 * SuperAgentCashCollection.reconciliationStatus can't be used for this).
 *
 * Full-collection-only allocation: each `cashCollectionId` passed in must
 * be remitted for its own full `collectedAmount`, enforced here before any
 * write (not caller-supplied per-collection) and backstopped by
 * `UQ_super_agent_cash_remittance_allocation_collection` at the DB level
 * (a collection can never be allocated twice, concurrently or otherwise).
 *
 * The whole remittance (its own row plus every allocation row it covers)
 * is one atomic transaction -- there is no partial remittance: if ANY
 * target collection turns out to already be allocated, the entire
 * transaction aborts and nothing is recorded, rather than committing a
 * remittance that covers less than what was requested.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SuperAgentCashRemittance } from './entities/super-agent-cash-remittance.entity';
import { SuperAgentCashRemittanceAllocation } from './entities/super-agent-cash-remittance-allocation.entity';

const UNIQUE_VIOLATION = '23505';

export interface RecordRemittanceParams {
  superAgentId: number;
  currency: string;
  cashCollectionIds: number[];
  actorUserId: number;
  idempotencyKey: string;
  evidenceRef?: string | null;
}

@Injectable()
export class SuperAgentCashRemittanceService {
  constructor(
    @InjectRepository(SuperAgentCashRemittance) private remittanceRepo: Repository<SuperAgentCashRemittance>,
    private readonly dataSource: DataSource,
  ) {}

  async findByIdempotencyKey(idempotencyKey: string): Promise<SuperAgentCashRemittance | null> {
    return this.remittanceRepo.findOne({ where: { idempotencyKey } });
  }

  async recordRemittance(params: RecordRemittanceParams): Promise<SuperAgentCashRemittance> {
    if (!params.cashCollectionIds.length) {
      throw new BadRequestException('At least one cashCollectionId is required');
    }
    const existing = await this.remittanceRepo.findOne({ where: { idempotencyKey: params.idempotencyKey } });
    if (existing) return existing; // idempotent retry, no re-validation needed

    const uniqueIds = [...new Set(params.cashCollectionIds)];
    if (uniqueIds.length !== params.cashCollectionIds.length) {
      throw new BadRequestException('Duplicate cashCollectionId in the same remittance request');
    }

    return this.dataSource.transaction(async (manager) => {
      // Serializes concurrent remittance attempts for the SAME Super Agent,
      // so two overlapping calls can never both pass the "not yet
      // allocated" check for the same collection before either commits --
      // mirrors the same lock-before-check pattern already established in
      // SuperAgentHandlingEarningService's own ambiguity-hold logic.
      await manager.query('SELECT id FROM public.super_agent WHERE id = $1 FOR UPDATE', [params.superAgentId]);

      // Re-check idempotency inside the lock -- a concurrent identical retry
      // must still resolve to the same row, not attempt a second insert.
      const existingInTx = await manager.getRepository(SuperAgentCashRemittance).findOne({ where: { idempotencyKey: params.idempotencyKey } });
      if (existingInTx) return existingInTx;

      const collections = await manager.query(
        `SELECT id, "superAgentId", currency, "collectedAmount" FROM public.super_agent_cash_collection WHERE id = ANY($1::int[])`,
        [uniqueIds],
      );
      if (collections.length !== uniqueIds.length) {
        throw new NotFoundException('One or more cashCollectionIds do not reference an existing cash collection');
      }
      for (const c of collections) {
        if (c.superAgentId !== params.superAgentId) {
          throw new BadRequestException(`Cash collection ${c.id} does not belong to this Super Agent`);
        }
        if (c.currency !== params.currency) {
          throw new BadRequestException(`Cash collection ${c.id} currency does not match this remittance's currency`);
        }
      }

      const totalAmount = collections.reduce((sum: number, c: any) => sum + Number(c.collectedAmount), 0);

      const remittanceRepo = manager.getRepository(SuperAgentCashRemittance);
      const remittance = await remittanceRepo.save(remittanceRepo.create({
        superAgentId: params.superAgentId,
        currency: params.currency,
        amount: totalAmount,
        actorUserId: params.actorUserId,
        evidenceRef: params.evidenceRef ?? null,
        idempotencyKey: params.idempotencyKey,
      }));

      const allocationRepo = manager.getRepository(SuperAgentCashRemittanceAllocation);
      for (const c of collections) {
        try {
          await allocationRepo.insert({
            remittanceId: remittance.id,
            cashCollectionId: c.id,
            allocatedAmount: c.collectedAmount, // full-collection-only
          });
        } catch (error: any) {
          if (error?.code === UNIQUE_VIOLATION) {
            // Already allocated to a different remittance -- the whole
            // batch aborts (no partial remittance); the thrown error rolls
            // back the transaction, including the remittance row itself.
            throw new ConflictException(`Cash collection ${c.id} is already allocated to a different remittance`);
          }
          throw error;
        }
      }

      return remittance;
    });
  }
}
