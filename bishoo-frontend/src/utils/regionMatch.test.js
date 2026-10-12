import { isIntercityPlace, normalizePlace, regionRelation } from './regionMatch';

describe('C1/C2: same region or another region', () => {
  test('spellings of the same region match', () => {
    expect(normalizePlace('Dar-es-Salaam')).toBe('dar es salaam');
    expect(regionRelation('Dar es Salaam', ' dar es salaam ')).toBe('same');
    expect(regionRelation('Mwanza', 'Mkoa wa Mwanza')).toBe('same');
    expect(regionRelation('Mwanza', 'Mwanza Region')).toBe('same');
  });
  test('another region = intercity; unknown = no automatic choice', () => {
    expect(regionRelation('Dar es Salaam', 'Katavi')).toBe('other');
    expect(isIntercityPlace('Dar es Salaam', 'Katavi')).toBe(true);
    expect(regionRelation('Dar es Salaam', '')).toBeNull();
    expect(regionRelation(undefined, 'Katavi')).toBeNull();
    expect(isIntercityPlace('Dar es Salaam', null)).toBe(false);
  });
});
