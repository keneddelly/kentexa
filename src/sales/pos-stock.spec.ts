import { readFileSync } from 'fs';
import { join } from 'path';
import { customerKey } from './pos-stock.service';

// POS part 3 (owner approved 2026-11-03): Stoo and Madeni.
describe('POS stock and debts', () => {
  it('one customer = same phone (any format), else same name', () => {
    expect(customerKey('0712 345 678', 'Neema')).toBe('p:712345678');
    expect(customerKey('+255712345678', 'N. Juma')).toBe('p:712345678');
    expect(customerKey(null, ' Neema Juma ')).toBe('n:neema juma');
  });

  it('every query parameter carries its type', () => {
    for (const f of ['pos-stock.service.ts', 'pos-day.service.ts']) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      const params = src.match(/\$\d+(::[a-z\[\]]+)?/g) || [];
      expect(params.filter((p) => !p.includes('::'))).toEqual([]);
    }
  });
});
