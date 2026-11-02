import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BodaRateCard } from '../boda-rates/boda-rate-card.entity';
import { DarRates, DEFAULT_DAR_RATES, darFee, darRatesFrom, darSteps, darZoneOf } from '../boda-rates/dar-boda-zones';

/**
 * The Dar es Salaam delivery fee by zone (owner approved 2026-11-02), for every user:
 * checkout, the send form, seller COD, hotel food delivery and the office price rule.
 * Zones, steps and default prices: src/boda-rates/dar-boda-zones.ts. Admin overrides:
 * boda_rate_card rows of category 'dar_step'. Reads that table only: no timed jobs.
 *
 * A place the zone table does not know gives null (never a guessed fee).
 */
@Injectable()
export class OfficeBodaFeeService {
  constructor(@InjectRepository(BodaRateCard) private readonly rateCards: Repository<BodaRateCard>) {}

  /** The step prices and heavy multiplier, with the active admin overrides. */
  async rates(): Promise<DarRates> {
    const rows = await this.rateCards.find({ where: { category: In(['dar_step']), isActive: true } }).catch(() => []);
    return rows.length ? darRatesFrom(rows) : DEFAULT_DAR_RATES;
  }

  async feeBetween(fromAddress: string | null, toAddress: string | null, weightKg?: number | null): Promise<number | null> {
    return darFee(await this.rates(), fromAddress, toAddress, weightKg);
  }

  /** For the forms: the fee and which zones were understood (null = the customer picks an area). */
  async quote(fromAddress: string | null, toAddress: string | null, weightKg?: number | null) {
    const from = darZoneOf(fromAddress); const to = darZoneOf(toAddress);
    return {
      fee: await this.feeBetween(fromAddress, toAddress, weightKg),
      fromZone: from ? from.key : null,
      toZone: to ? to.key : null,
      steps: from && to ? darSteps(from, to) : null,
    };
  }
}
