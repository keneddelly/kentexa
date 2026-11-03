import { readFileSync } from 'fs';
import { join } from 'path';

// Owner 2026-11-03: the shop place is kept so the send form stops asking every time.
describe('1794700000000-AddSellerPickupPlace and its use', () => {
  it('creates the per-city shop place table', () => {
    const src = readFileSync(join(__dirname, '1794700000000-AddSellerPickupPlace.ts'), 'utf8');
    expect(src).toContain('public.seller_pickup_place');
    expect(src).toContain('PRIMARY KEY ("userId", city)');
  });

  it('every parameter of the shop-place queries carries its type', () => {
    const src = readFileSync(join(__dirname, '../../super-agents/super-agents.service.ts'), 'utf8');
    const block = src.slice(src.indexOf('private async keepSellerPickupPlace'), src.indexOf('async setSellerPickupPlace'));
    const params = block.match(/\$\d+(::[a-z0-9\[\]]+)?/g) || [];
    expect(params.length).toBe(10);
    expect(params.filter((p) => !p.includes('::'))).toEqual([]);
  });
});
