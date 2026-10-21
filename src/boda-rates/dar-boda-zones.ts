/**
 * The ONE Dar es Salaam boda boda zone table and default zone-to-zone fee matrix.
 * Used by checkout (DailyBatchesService) and the Super Agent office price rule
 * (OfficeBodaFeeService). Admin overrides live in boda_rate_card (category 'matrix',
 * rateKey 'matrix_<from>_<to>'). Change prices here only; dar-boda-zones.spec.ts
 * fails if the two users ever stop agreeing.
 */

export interface DarBodaZone {
  rank: number;
  label: string;
  keywords: string[];
}

// Used for seller → buyer distance calculation. Lower rank = more central.
export const DAR_BODA_ZONES: Readonly<Record<string, DarBodaZone>> = Object.freeze({
  zone_central: {
    rank: 1,
    label: 'Kariakoo / Ilala / Upanga',
    keywords: ['kariakoo', 'ilala', 'upanga', 'kisutu', 'gerezani', 'kivukoni', 'lumumba'],
  },
  zone_inner: {
    rank: 2,
    label: 'Kinondoni / Sinza / Magomeni / Temeke',
    keywords: [
      'kinondoni', 'sinza', 'mwenge', 'mikocheni', 'magomeni', 'mwananyamala', 'tandale', 'manzese',
      'kijitonyama', 'msasani', 'masaki', 'oyster bay', 'temeke', 'kigamboni', 'kurasini', 'mtoni', "chang'ombe",
    ],
  },
  zone_mid: {
    rank: 3,
    label: 'Ubungo / Kimara / Mbezi / Mbagala',
    keywords: ['ubungo', 'kimara', 'makuburi', 'kibamba', 'mbezi', 'mbezi louis', 'mbezi beach', 'mbagala', 'mbagala kuu', 'yombo', 'tandika'],
  },
  zone_far: {
    rank: 4,
    label: 'Bunju / Tegeta / Boko / Kigamboni',
    keywords: ['bunju', 'bunju a', 'bunju b', 'mbweni', 'tegeta', 'boko', 'kunduchi'],
  },
});

// Fee matrix: '<sellerRank>-<buyerRank>' → fee in TZS.
// Default rates — overridden by DB values when admin updates them.
// Based on realistic Dar es Salaam boda rates 2026 (TZS 500-700/km).
export const DEFAULT_DAR_BODA_MATRIX: Readonly<Record<string, number>> = Object.freeze({
  '1-1': 3000, // central → central    (~3km avg, e.g. Kariakoo→Ilala)
  '1-2': 6000, // central → inner      (~8km,  e.g. Kariakoo→Sinza)
  '1-3': 10000, // central → mid        (~14km, e.g. Kariakoo→Mbagala)
  '1-4': 15000, // central → far        (~24km, e.g. Kariakoo→Bunju)
  '2-1': 5000, // inner → central      (~7km,  e.g. Sinza→Kariakoo)
  '2-2': 4000, // inner → inner        (~5km,  e.g. Sinza→Kinondoni)
  '2-3': 8000, // inner → mid          (~10km, e.g. Sinza→Mbagala)
  '2-4': 13000, // inner → far          (~20km, e.g. Sinza→Bunju)
  '3-1': 9000, // mid → central        (~13km, e.g. Mbagala→Kariakoo)
  '3-2': 7000, // mid → inner          (~9km,  e.g. Mbagala→Temeke)
  '3-3': 4000, // mid → mid            (~5km,  e.g. Mbagala→Kimara)
  '3-4': 10000, // mid → far            (~14km, e.g. Kimara→Bunju)
  '4-1': 14000, // far → central        (~23km, e.g. Bunju→Kariakoo)
  '4-2': 12000, // far → inner          (~18km, e.g. Bunju→Sinza)
  '4-3': 9000, // far → mid            (~13km, e.g. Bunju→Kimara)
  '4-4': 5000, // far → far            (~6km,  e.g. Bunju→Tegeta)
});
