import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DAR_ZONES, DEFAULT_DAR_RATES, darAreas, darFee, darRatesFrom, darSteps, darZoneOf,
} from './dar-boda-zones';
import { DAR_COMMON_PLACES } from '../tz-location/dar-common-places';
import { DailyBatchesService } from '../daily-batches/daily-batches.service';
import { OfficeBodaFeeService } from '../super-agents/office-boda-fee.service';

const z = (place: string) => darZoneOf(place)!;

// Owner approved 2026-11-02: Dar is split into zones (centre + 5 roads in rings), the fee
// follows the steps between zones, zone price only, heavy parcels doubled.
describe('Dar delivery zones', () => {
  it('finds the zone of an address; the place named first wins, a longer name beats a shorter one', () => {
    expect(z('Kariakoo, Ilala').key).toBe('kati_0');
    expect(z('Sinza, Kinondoni').key).toBe('morogoro_2');
    expect(z('Mbezi Beach, Kinondoni').key).toBe('bagamoyo_3');
    expect(z('Mbezi, Ubungo, Dar es Salaam').key).toBe('morogoro_3');
    expect(z("Chang'ombe").key).toBe('kilwa_1');
    expect(z('Mwenge — Kwa Mtogole, Kinondoni').key).toBe('bagamoyo_2');
  });

  it('never guesses: a place it does not know has no zone and no fee', () => {
    expect(darZoneOf('Kwa Mtogole')).toBeNull();
    expect(darZoneOf('')).toBeNull();
    expect(darZoneOf(null)).toBeNull();
    expect(darFee(DEFAULT_DAR_RATES, 'Kariakoo', 'Kwa Mtogole')).toBeNull();
    expect(darFee(DEFAULT_DAR_RATES, 'Dar es Salaam', 'Sinza')).toBeNull();
  });

  it('steps: same zone 0, same road the ring difference, different roads through the centre', () => {
    expect(darSteps(z('Kariakoo'), z('Ilala'))).toBe(0);
    expect(darSteps(z('Kariakoo'), z('Sinza'))).toBe(2);
    expect(darSteps(z('Kinondoni'), z('Bunju'))).toBe(3);
    expect(darSteps(z('Sinza'), z('Mbagala'))).toBe(5);
    expect(darSteps(z('Bunju'), z('Chanika'))).toBe(8);
  });

  it('the approved starting prices', () => {
    expect(darFee(DEFAULT_DAR_RATES, 'Kariakoo', 'Ilala')).toBe(3000);
    expect(darFee(DEFAULT_DAR_RATES, 'Kariakoo', 'Magomeni')).toBe(5000);
    expect(darFee(DEFAULT_DAR_RATES, 'Kariakoo', 'Sinza')).toBe(7000);
    expect(darFee(DEFAULT_DAR_RATES, 'Kariakoo', 'Mbezi Louis')).toBe(10000);
    expect(darFee(DEFAULT_DAR_RATES, 'Kariakoo', 'Bunju')).toBe(14000);
    expect(darFee(DEFAULT_DAR_RATES, 'Sinza', 'Mbagala')).toBe(16000);
    expect(darFee(DEFAULT_DAR_RATES, 'Bunju', 'Chanika')).toBe(22000);
  });

  it('a parcel above 20 kg (no longer fits a boda) pays double', () => {
    expect(darFee(DEFAULT_DAR_RATES, 'Kariakoo', 'Sinza', 20)).toBe(7000);
    expect(darFee(DEFAULT_DAR_RATES, 'Kariakoo', 'Sinza', 25)).toBe(14000);
  });

  it('admin overrides: a step price and the heavy multiplier; bad rows are ignored', () => {
    const rates = darRatesFrom([
      { rateKey: 'dar_step_2', fee: 8000 },
      { rateKey: 'dar_heavy_multiplier', fee: 1.5 },
      { rateKey: 'dar_step_3', fee: -5 },
      { rateKey: 'dar_step_4', fee: 99999, isActive: false },
    ]);
    expect(darFee(rates, 'Kariakoo', 'Sinza')).toBe(8000);
    expect(darFee(rates, 'Kariakoo', 'Mbezi Louis')).toBe(10000);
    expect(darFee(rates, 'Kariakoo', 'Bunju')).toBe(14000);
    expect(darFee(rates, 'Kariakoo', 'Sinza', 30)).toBe(12000);
  });

  it('every place belongs to exactly one zone', () => {
    const seen = new Map<string, string>();
    for (const zone of DAR_ZONES) for (const p of zone.places) {
      expect([p, seen.get(p.toLowerCase())]).toEqual([p, undefined]);
      seen.set(p.toLowerCase(), zone.key);
    }
    expect(darAreas()).toHaveLength(DAR_ZONES.length);
  });

  it('every Dar es Salaam ward in the location seed has a zone', () => {
    const src = readFileSync(join(__dirname, '../tz-location/tz-complete-seed.ts'), 'utf8');
    const start = src.indexOf("'Dar es Salaam': {\n    Ilala");
    expect(start).toBeGreaterThan(0);
    const rest = src.slice(start);
    const block = rest.slice(0, rest.indexOf('\n  },'));
    const wards = [...block.matchAll(/name: ['"](.+?)['"],/g)].map((m) => m[1]);
    expect(wards.length).toBeGreaterThan(50);
    expect(wards.filter((w) => !darZoneOf(w))).toEqual([]);
  });
});

describe('common Dar places (owner 2026-11-02: "add many common places")', () => {
  it('each common place is found by name and lands in the zone the list gives it', () => {
    expect(DAR_COMMON_PLACES.length).toBeGreaterThan(150);
    expect(DAR_COMMON_PLACES.filter((p) => darZoneOf(p.name)?.key !== p.zone)).toEqual([]);
  });

  it('names are unique, districts are Dar councils, and no map point is invented', () => {
    const names = DAR_COMMON_PLACES.map((p) => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect([...new Set(DAR_COMMON_PLACES.map((p) => p.district))].sort()).toEqual(['Ilala', 'Kigamboni', 'Kinondoni', 'Temeke', 'Ubungo']);
    expect(DAR_COMMON_PLACES.every((p) => !('lat' in p) && !('lng' in p))).toBe(true);
  });

  it('real trips by the names people use', () => {
    expect(darFee(DEFAULT_DAR_RATES, 'Posta', 'Tabata Relini')).toBe(5000);
    expect(darFee(DEFAULT_DAR_RATES, 'Kariakoo Sokoni', 'Mlimani City')).toBe(7000);
    expect(darFee(DEFAULT_DAR_RATES, 'Kimara Korogwe', 'Stendi ya Magufuli')).toBe(3000);
    expect(darFee(DEFAULT_DAR_RATES, 'Tegeta Nyuki', 'Bunju B')).toBe(5000);
  });
});

describe('one Dar fee for checkout and the office price rule', () => {
  const rows = [{ rateKey: 'dar_step_2', fee: 7500, category: 'dar_step', isActive: true }];
  const repo = { find: jest.fn(async () => rows) };
  const checkout = Object.assign(Object.create(DailyBatchesService.prototype), {
    productRepo: { manager: { getRepository: () => repo } },
  }) as any;
  const office = new OfficeBodaFeeService(repo as any);
  const places: (string | null)[] = ['Kariakoo', 'Sinza', 'Bunju', 'Mbagala', 'Kigamboni', 'Kwa Mtogole', null];

  it('every pair gives the same fee (or the same "unknown") in both', async () => {
    for (const from of places) for (const to of places) {
      expect([from, to, await office.feeBetween(from, to)]).toEqual([from, to, await checkout.calculateBodaFee(from, to)]);
    }
    expect(await office.feeBetween('Kariakoo', 'Sinza')).toBe(7500);
  });

  it('a failed read of the admin prices falls back to the approved defaults', async () => {
    const down = new OfficeBodaFeeService({ find: jest.fn(() => Promise.reject(new Error('down'))) } as any);
    expect(await down.feeBetween('Kariakoo', 'Sinza')).toBe(7000);
    expect(await down.quote('Kariakoo', 'Kwa Mtogole')).toEqual({ fee: null, fromZone: 'kati_0', toZone: null, steps: null });
  });
});
