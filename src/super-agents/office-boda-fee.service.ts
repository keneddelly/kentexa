import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BodaRateCard } from '../boda-rates/boda-rate-card.entity';
import { DAR_BODA_ZONES, DEFAULT_DAR_BODA_MATRIX } from '../boda-rates/dar-boda-zones';

/**
 * The Dar es Salaam boda boda fee for the office price rule (agent pickup or door
 * delivery from a Dar office). Zones and default matrix come from the shared table
 * (src/boda-rates/dar-boda-zones.ts, also used by checkout), with the admin overrides
 * from boda_rate_card. Reads that table only: no timed jobs.
 */

const FALLBACK_FEE = 10000;

export function darZoneRank(address: string | null): number {
  if (!address) return 1;
  const lower = address.toLowerCase();
  const zone = Object.values(DAR_BODA_ZONES).find((z) => z.keywords.some((kw) => lower.includes(kw)));
  return zone ? zone.rank : 2;
}

/** Pure: the fee between two Dar addresses from a zone-to-zone matrix. */
export function darBodaFee(matrix: Record<string, number>, fromAddress: string | null, toAddress: string | null): number {
  return matrix[`${darZoneRank(fromAddress)}-${darZoneRank(toAddress)}`] || FALLBACK_FEE;
}

@Injectable()
export class OfficeBodaFeeService {
  constructor(@InjectRepository(BodaRateCard) private readonly rateCards: Repository<BodaRateCard>) {}

  /** Default matrix with the active admin overrides from boda_rate_card. */
  async matrix(): Promise<Record<string, number>> {
    const matrix = { ...DEFAULT_DAR_BODA_MATRIX };
    const rows = await this.rateCards.find({ where: { category: 'matrix', isActive: true } }).catch(() => []);
    for (const r of rows) matrix[r.rateKey.replace('matrix_', '').replace('_', '-')] = Number(r.fee);
    return matrix;
  }

  async feeBetween(fromAddress: string | null, toAddress: string | null): Promise<number> {
    return darBodaFee(await this.matrix(), fromAddress, toAddress);
  }
}
