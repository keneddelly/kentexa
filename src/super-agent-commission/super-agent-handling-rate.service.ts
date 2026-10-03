/**
 * SuperAgentHandlingRateService — Stage 3S-C5: configuration authority for
 * the Super Agent physical-handling commission rate.
 *
 * "The rate must never be hard-coded into commission business logic" --
 * SuperAgentHandlingEarningService never reads a constant; it always calls
 * getEffectiveRate() and fails closed (no earning) when none applies.
 */
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SuperAgentHandlingRate } from './entities/super-agent-handling-rate.entity';
import { SuperAgentHandlingEarning } from './entities/super-agent-handling-earning.entity';

export interface ConfigureHandlingRateDto {
  commissionType: string;
  scope?: string;
  amount: number;
  currency?: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  reason?: string | null;
  createdByUserId: number | null;
}

// Postgres error code for an EXCLUDE constraint violation.
const EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class SuperAgentHandlingRateService {
  constructor(
    @InjectRepository(SuperAgentHandlingRate) private rateRepo: Repository<SuperAgentHandlingRate>,
    @InjectRepository(SuperAgentHandlingEarning) private earningRepo: Repository<SuperAgentHandlingEarning>,
  ) {}

  async configureRate(dto: ConfigureHandlingRateDto): Promise<SuperAgentHandlingRate> {
    const row = this.rateRepo.create({
      commissionType: dto.commissionType,
      scope: dto.scope ?? 'global',
      amount: dto.amount,
      currency: dto.currency ?? 'TZS',
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo ?? null,
      isActive: true,
      reason: dto.reason ?? null,
      createdByUserId: dto.createdByUserId,
    });
    try {
      return await this.rateRepo.save(row);
    } catch (error: any) {
      if (error?.code === EXCLUSION_VIOLATION) {
        throw new ConflictException(
          'An active handling-rate configuration already covers this time window for this commission type/scope',
        );
      }
      throw error;
    }
  }

  // A genuine administrative retraction of a still-future, not-yet-effective
  // draft ONLY. Post-review correction (Stage 3S-C5 re-review): the original
  // version had no such check at all despite its own doc comment's promise --
  // it would happily flip isActive=false on a version that is CURRENTLY in
  // effect or already in the past, silently changing what getEffectiveRate()
  // reports for real historical/live windows. An already-recorded earning's
  // own amount/currency/rateConfigId are frozen independently of this row, so
  // this can never rewrite THEIR economics -- but retracting a live or past
  // configuration is still a real, user-visible correctness bug (a currently
  // "in force" rate silently disappearing), not merely a historical-integrity
  // one, so it is refused outright. Also refused if any earning already
  // references this exact row (defensive: this should never legitimately
  // happen for a still-future row, since nothing has been recorded against a
  // rate before its own effectiveFrom -- confirmed by a dedicated test that
  // constructs exactly that contrived case directly). Idempotent: retracting
  // an already-inactive row is a no-op.
  async deactivateRate(id: number): Promise<SuperAgentHandlingRate> {
    const row = await this.rateRepo.findOneOrFail({ where: { id } });
    if (!row.isActive) return row;
    if (row.effectiveFrom <= new Date()) {
      throw new ConflictException('Only a future, not-yet-effective configuration can be retracted');
    }
    const referenced = await this.earningRepo.count({ where: { rateConfigId: id } });
    if (referenced > 0) {
      throw new ConflictException('Cannot retract a configuration already referenced by a recorded earning');
    }
    row.isActive = false;
    return this.rateRepo.save(row);
  }

  async getEffectiveRate(commissionType: string, scope: string, at: Date): Promise<SuperAgentHandlingRate | null> {
    return this.rateRepo
      .createQueryBuilder('r')
      .where('r.commissionType = :commissionType', { commissionType })
      .andWhere('r.scope = :scope', { scope })
      .andWhere('r.isActive = true')
      .andWhere('r.effectiveFrom <= :at', { at })
      .andWhere('(r.effectiveTo IS NULL OR r.effectiveTo > :at)', { at })
      .orderBy('r.effectiveFrom', 'DESC')
      .getOne();
  }
}
