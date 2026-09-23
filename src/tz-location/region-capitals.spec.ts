import { TZ_REGION_CAPITALS } from './region-capitals';
import { TzPricingService } from './tz-pricing.service';

/**
 * The region -> capital policy existed privately inside TzPricingService. Stage 2E
 * extracts it into ONE shared constant, behaviour-preserving. This golden copy is
 * the exact map as it was in production before the extraction (commit 2c87da92).
 */
const PRODUCTION_GOLDEN: Record<string, string> = {
  'Dar es Salaam': 'Dar es Salaam', Mwanza: 'Mwanza', Arusha: 'Arusha', Kilimanjaro: 'Moshi', Tanga: 'Tanga',
  Morogoro: 'Morogoro', Dodoma: 'Dodoma', Mbeya: 'Mbeya', Iringa: 'Iringa', Mara: 'Musoma', Kagera: 'Bukoba',
  Kigoma: 'Kigoma', Tabora: 'Tabora', Shinyanga: 'Shinyanga', Singida: 'Singida', Lindi: 'Lindi', Mtwara: 'Mtwara',
  Ruvuma: 'Songea', Pwani: 'Kibaha', Rukwa: 'Sumbawanga', Manyara: 'Babati', Geita: 'Geita', Katavi: 'Mpanda',
  Njombe: 'Njombe', Simiyu: 'Bariadi', Songwe: 'Vwawa', 'Zanzibar North': 'Mkokotoni', 'Zanzibar South': 'Koani',
  'Zanzibar West': 'Zanzibar City', 'Pemba North': 'Wete', 'Pemba South': 'Chake Chake',
};

describe('TZ_REGION_CAPITALS — one canonical, behaviour-preserving policy', () => {
  it('is exactly the production map: same 31 keys, same values, same order', () => {
    expect(Object.keys(TZ_REGION_CAPITALS)).toEqual(Object.keys(PRODUCTION_GOLDEN));
    expect({ ...TZ_REGION_CAPITALS }).toEqual(PRODUCTION_GOLDEN);
    expect(Object.keys(TZ_REGION_CAPITALS)).toHaveLength(31);
  });

  it('is frozen: no consumer can mutate the shared policy', () => {
    expect(Object.isFrozen(TZ_REGION_CAPITALS)).toBe(true);
    expect(() => { (TZ_REGION_CAPITALS as any).Kilimanjaro = 'Hacked'; }).toThrow();
  });

  it('TzPricingService reads THIS constant (same reference, no second copy) so pricing sees identical aliases', () => {
    const pricing = new (TzPricingService as any)({}, {}, {}, {}) as any;
    expect(pricing.REGION_CAPITALS).toBe(TZ_REGION_CAPITALS);
    expect(pricing.REGION_CAPITALS['Kilimanjaro']).toBe('Moshi');
    expect(pricing.REGION_CAPITALS['Mara']).toBe('Musoma');
    expect(pricing.REGION_CAPITALS['Dar es Salaam']).toBe('Dar es Salaam');
  });

  it('the map is defined in exactly one source file (no duplicated policy)', () => {
    const fs = require('fs');
    const path = require('path');
    const walk = (dir: string, out: string[] = []) => {
      for (const n of fs.readdirSync(dir)) {
        const f = path.join(dir, n);
        if (fs.statSync(f).isDirectory()) walk(f, out);
        else if (/\.ts$/.test(n) && !/\.spec\.ts$/.test(n)) out.push(f);
      }
      return out;
    };
    const holders = walk(path.join(__dirname, '..')).filter((f: string) => /Kilimanjaro:\s*'Moshi'/.test(fs.readFileSync(f, 'utf8')));
    expect(holders.map((f: string) => path.basename(f))).toEqual(['region-capitals.ts']);
  });
});
