/**
 * The ONE Dar es Salaam delivery zone table and fee rule (owner approved 2026-11-02:
 * "for Dar es Salaam we should divide it in zones, then design fee according to zone";
 * zone price only, starting prices with admin changes, heavy parcels doubled).
 *
 * Dar grows along its main roads, so a zone is a road plus a ring (how far out):
 * ring 0 is the centre (Kati), rings 1-4 go out along Bagamoyo, Morogoro, Nyerere/Pugu,
 * Kilwa and Kigamboni.
 *
 *   steps  = 0 in the same zone;
 *            |ringA - ringB| on the same road (the centre counts as on every road);
 *            ringA + ringB on different roads (the trip passes the centre).
 *   fee    = the step price (admin can change each one), x the heavy multiplier when the
 *            parcel is above DAR_HEAVY_KG (no longer fits a boda: bajaji / kirikuu).
 *
 * A place the table does not know is NOT guessed: the fee is null and the customer
 * picks a known area (darAreas()).
 *
 * Used by checkout, the send form (direct delivery), seller COD, hotel food delivery
 * and the office price rule. Admin overrides live in boda_rate_card:
 *   category 'dar_step', rateKey 'dar_step_<n>'      -> price for n steps
 *   category 'dar_step', rateKey 'dar_heavy_multiplier' -> the heavy multiplier
 */

import { DAR_COMMON_PLACES } from '../tz-location/dar-common-places';

export type DarRoad = 'kati' | 'bagamoyo' | 'morogoro' | 'nyerere' | 'kilwa' | 'kigamboni';

export interface DarZone {
  key: string;
  road: DarRoad;
  ring: number;
  label: string;
  places: string[];
}

export const DAR_ROAD_LABELS: Readonly<Record<DarRoad, string>> = Object.freeze({
  kati: 'Kati', bagamoyo: 'Barabara ya Bagamoyo', morogoro: 'Barabara ya Morogoro',
  nyerere: 'Barabara ya Nyerere / Pugu', kilwa: 'Barabara ya Kilwa', kigamboni: 'Kigamboni',
});

// Each zone's places: its own list plus the common places of that zone (one list for the
// place picker and the fee, src/tz-location/dar-common-places.ts), without repeats.
const zone = (road: DarRoad, ring: number, own: string[]): DarZone => {
  const key = `${road}_${ring}`;
  const places: string[] = [];
  for (const p of [...own, ...DAR_COMMON_PLACES.filter((c) => c.zone === key).map((c) => c.name)]) {
    if (!places.some((x) => x.toLowerCase() === p.toLowerCase())) places.push(p);
  }
  return { key, road, ring, label: own.slice(0, 2).join(' / '), places };
};

/**
 * First list, owner to correct. Each place belongs to exactly one zone, and every Dar
 * ward in the location seed (tz-complete-seed.ts) is in it (dar-boda-zones.spec.ts checks).
 * District names (Ilala, Kinondoni, Temeke, Ubungo, Kigamboni) are places too, so
 * "<street>, Ubungo" still finds its area from the district the customer gave.
 */
export const DAR_ZONES: readonly DarZone[] = Object.freeze([
  zone('kati', 0, ['Kariakoo', 'Posta', 'Kisutu', 'Upanga', 'Gerezani', 'Kivukoni', 'Ilala', 'Jangwani', 'Mchikichini', 'Lumumba', 'Mchafukoge']),
  zone('bagamoyo', 1, ['Kinondoni', 'Mwananyamala', 'Msasani', 'Masaki', 'Oyster Bay', 'Namanga', 'Hananasif']),
  zone('bagamoyo', 2, ['Mikocheni', 'Kijitonyama', 'Mwenge', 'Kawe', 'Lugalo', 'Makongo', 'Makumbusho']),
  zone('bagamoyo', 3, ['Mbezi Beach', 'Tegeta', 'Kunduchi', 'Salasala', 'Wazo', 'Africana']),
  zone('bagamoyo', 4, ['Bunju', 'Mbweni', 'Boko', 'Mapinga']),
  zone('morogoro', 1, ['Magomeni', 'Manzese', 'Tandale', 'Mabibo', 'Mzimuni', 'Makurumla', 'Ndugumbi']),
  zone('morogoro', 2, ['Sinza', 'Ubungo', 'Makuburi', 'Kimara Baruti', 'Mlimani']),
  zone('morogoro', 3, ['Kimara', 'Mbezi Louis', 'Mbezi Luis', 'Mbezi', 'Goba', 'Mbezi Mwisho', 'Kimara Mwisho', 'Saranga']),
  zone('morogoro', 4, ['Kibamba', 'Kiluvya', 'Mpiji', 'Kwembe']),
  zone('nyerere', 1, ['Buguruni', 'Vingunguti', 'Tabata', 'Kiwalani']),
  zone('nyerere', 2, ['Segerea', 'Kipawa', 'Airport', 'Ukonga', 'Banana', 'Kisukuru']),
  zone('nyerere', 3, ['Kinyerezi', 'Gongo la Mboto', 'Kitunda', 'Majohe']),
  zone('nyerere', 4, ['Pugu', 'Chanika', 'Kivule', 'Msongola']),
  zone('kilwa', 1, ['Temeke', "Chang'ombe", 'Keko', 'Kurasini', 'Mivinjeni', 'Miburani']),
  zone('kilwa', 2, ['Mtoni', 'Tandika', 'Yombo', 'Azimio', 'Sandali', 'Kilakala', 'Makangarawe']),
  zone('kilwa', 3, ['Mbagala', 'Rangi Tatu', 'Kijichi', 'Kiburugwa', 'Toangoma', 'Charambe', 'Kinjengethia', 'Kibonde Maji']),
  zone('kilwa', 4, ['Kongowe', 'Chamazi', 'Vikindu', 'Mbagala Kuu']),
  zone('kigamboni', 1, ['Kigamboni', 'Vijibweni']),
  zone('kigamboni', 2, ['Kibada', 'Tuangoma']),
  zone('kigamboni', 3, ['Mjimwema', 'Kisota', 'Kisarawe II', 'Somangila']),
  zone('kigamboni', 4, ['Kimbiji', 'Pemba Mnazi']),
]);

/** Price for 0, 1, 2 ... 8 steps (TZS). More steps than listed use the last price. */
export const DEFAULT_DAR_STEP_PRICES: readonly number[] = Object.freeze([3000, 5000, 7000, 10000, 14000, 16000, 18000, 20000, 22000]);
export const DAR_HEAVY_KG = 20;
export const DEFAULT_DAR_HEAVY_MULTIPLIER = 2;

export interface DarRates { steps: number[]; heavyMultiplier: number }
export const DEFAULT_DAR_RATES: DarRates = Object.freeze({ steps: [...DEFAULT_DAR_STEP_PRICES], heavyMultiplier: DEFAULT_DAR_HEAVY_MULTIPLIER }) as DarRates;

const norm = (s: string) => ` ${String(s).toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim()} `;

/**
 * The zone of an address, or null when no known place is named. Addresses go from the
 * most specific part to the district ("Sinza, Kinondoni"), so the place named FIRST wins;
 * on the same position the longer name wins ("Mbezi Beach" over "Mbezi").
 */
export function darZoneOf(address: string | null | undefined): DarZone | null {
  return darMatch(address)?.zone ?? null;
}

/** The zone and the exact place name KenteXa read in an address (for "Tabata Relini -> Mabibo Hostel"). */
export function darMatch(address: string | null | undefined): { zone: DarZone; place: string } | null {
  if (!address || !String(address).trim()) return null;
  const text = norm(address);
  let best: { zone: DarZone; place: string; at: number; len: number } | null = null;
  for (const z of DAR_ZONES) {
    for (const p of z.places) {
      const needle = norm(p);
      const at = text.indexOf(needle);
      if (at < 0) continue;
      if (!best || at < best.at || (at === best.at && needle.length > best.len)) best = { zone: z, place: p, at, len: needle.length };
    }
  }
  return best ? { zone: best.zone, place: best.place } : null;
}

export function darSteps(a: DarZone, b: DarZone): number {
  if (a.key === b.key) return 0;
  if (a.road === b.road || a.road === 'kati' || b.road === 'kati') return Math.abs(a.ring - b.ring);
  return a.ring + b.ring;
}

/** Pure: the fee for a trip, or null when either place is unknown. */
export function darFee(rates: DarRates, from: string | null | undefined, to: string | null | undefined, weightKg?: number | null): number | null {
  const a = darZoneOf(from); const b = darZoneOf(to);
  if (!a || !b) return null;
  const list = rates.steps.length ? rates.steps : [...DEFAULT_DAR_STEP_PRICES];
  const base = Number(list[Math.min(darSteps(a, b), list.length - 1)]);
  if (!Number.isFinite(base) || base <= 0) return null;
  const heavy = Number(weightKg) > DAR_HEAVY_KG ? (Number(rates.heavyMultiplier) > 0 ? Number(rates.heavyMultiplier) : DEFAULT_DAR_HEAVY_MULTIPLIER) : 1;
  return Math.round(base * heavy);
}

/** The default rates with the admin overrides (boda_rate_card rows, category 'dar_step'). */
export function darRatesFrom(rows: { rateKey: string; fee: number | string; isActive?: boolean }[] | null | undefined): DarRates {
  const steps = [...DEFAULT_DAR_STEP_PRICES];
  let heavyMultiplier = DEFAULT_DAR_HEAVY_MULTIPLIER;
  for (const r of rows || []) {
    if (r.isActive === false) continue;
    const n = Number(r.fee);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (r.rateKey === 'dar_heavy_multiplier') { heavyMultiplier = n; continue; }
    const m = /^dar_step_(\d+)$/.exec(r.rateKey);
    if (m && Number(m[1]) < 20) steps[Number(m[1])] = Math.round(n);
  }
  // A gap (e.g. only step 10 set) repeats the price before it.
  for (let i = 1; i < steps.length; i++) if (!(Number(steps[i]) > 0)) steps[i] = steps[i - 1];
  return { steps, heavyMultiplier };
}

/** For the area picker: every zone with its places, centre first, then road by road. */
export function darAreas() {
  return DAR_ZONES.map((z) => ({ key: z.key, road: z.road, roadLabel: DAR_ROAD_LABELS[z.road], ring: z.ring, places: [...z.places] }));
}
