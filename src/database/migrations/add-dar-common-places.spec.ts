import { readFileSync } from 'fs';
import { join } from 'path';

// 2026-11-02: PostgreSQL refused this migration on live ("inconsistent types deduced for
// parameter $1": text versus character varying) and the deploy stopped. Every parameter
// must carry its type; the CI database has no location rows, so only this check sees it.
describe('1794300000000-AddDarCommonPlaces', () => {
  it('casts every query parameter', () => {
    const src = readFileSync(join(__dirname, '1794300000000-AddDarCommonPlaces.ts'), 'utf8');
    const params = src.match(/\$\d+(::[a-z\[\]]+)?/g) || [];
    expect(params.length).toBeGreaterThan(0);
    expect(params.filter((p) => !p.includes('::'))).toEqual([]);
  });
});
