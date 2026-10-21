import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BodaRateCard } from '../boda-rates/boda-rate-card.entity';

/**
 * The Dar es Salaam boda boda fee for the office price rule (agent pickup or door
 * delivery from a Dar office). Same zones and default zone-to-zone matrix as checkout
 * (DailyBatchesService), with the admin overrides from boda_rate_card (category
 * 'matrix', rateKey 'matrix_<from>_<to>'). Reads that table only: no timed jobs.
 */

// Zone rank by address keyword. Lower rank = more central.
export const DAR_BODA_ZONES: { rank: number; keywords: string[] }[] = [
  { rank: 1, keywords: ['kariakoo', 'ilala', 'upanga', 'kisutu', 'gerezani', 'kivukoni', 'lumumba'] },
  { rank: 2, keywords: ['kinondoni', 'sinza', 'mwenge', 'mikocheni', 'magomeni', 'mwananyamala', 'tandale', 'manzese',
    'kijitonyama', 'msasani', 'masaki', 'oyster bay', 'temeke', 'kigamboni', 'kurasini', 'mtoni', "chang'ombe"] },
  { rank: 3, keywords: ['ubungo', 'kimara', 'makuburi', 'kibamba', 'mbezi', 'mbezi louis', 'mbezi beach', 'mbagala',
    'mbagala kuu', 'yombo', 'tandika'] },
  { rank: 4, keywords: ['bunju', 'bunju a', 'bunju b', 'mbweni', 'tegeta', 'boko', 'kunduchi'] },
];

// '<fromRank>-<toRank>' -> fee in TZS, used when boda_rate_card has no override.
export const DEFAULT_DAR_BODA_MATRIX: Record<string, number> = {
  '1-1': 3000, '1-2': 6000, '1-3': 10000, '1-4': 15000,
  '2-1': 5000, '2-2': 4000, '2-3': 8000, '2-4': 13000,
  '3-1': 9000, '3-2': 7000, '3-3': 4000, '3-4': 10000,
  '4-1': 14000, '4-2': 12000, '4-3': 9000, '4-4': 5000,
};

const FALLBACK_FEE = 10000;

export function darZoneRank(address: string | null): number {
  if (!address) return 1;
  const lower = address.toLowerCase();
  const zone = DAR_BODA_ZONES.find((z) => z.keywords.some((kw) => lower.includes(kw)));
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
