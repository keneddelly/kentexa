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
  // draft -- never touches a row an earning may already reference (those
  // rows freeze their own amount/currency/rateConfigId independently, so
  // deactivating the config afterward changes nothing about history).
  // Idempotent: retracting an already-inactive row is a no-op.
  async deactivateRate(id: number): Promise<SuperAgentHandlingRate> {
    const row = await this.rateRepo.findOneOrFail({ where: { id } });
    if (!row.isActive) return row;
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
