import { normalizeSearchQuery } from './search-term-normalizer.util';
import { buildMultiTermLikeClause } from './search-query.util';

describe('normalizeSearchQuery', () => {
  // The core bug this exists to fix: "camera" (English, in the DB) and
  // "kamera" (Swahili, what a Tanzanian user actually types) must both
  // produce a term set that includes "camera" — otherwise a LIKE search
  // built only from the literal query never finds an English-titled
  // listing when the user searched in Swahili.
  it('expands "kamera" to include "camera"', () => {
    expect(normalizeSearchQuery('kamera').terms).toContain('camera');
  });

  it('keeps "camera" matching itself', () => {
    expect(normalizeSearchQuery('camera').terms).toContain('camera');
  });

  it('handles the colloquial English plural "kameras"', () => {
    const terms = normalizeSearchQuery('kameras').terms;
    expect(terms).toContain('camera');
  });

  it('keeps descriptive words alongside the expanded product term', () => {
    const swahili = normalizeSearchQuery('kamera ndogo').terms;
    expect(swahili).toContain('camera');
    expect(swahili).toContain('ndogo');

    const english = normalizeSearchQuery('camera ndogo').terms;
    expect(english).toContain('camera');
    expect(english).toContain('ndogo');
  });

  it('expands the multi-word phrase "kinasa sauti" to "voice recorder"', () => {
    expect(normalizeSearchQuery('kinasa sauti').terms).toContain('voice recorder');
  });

  it('expands "voice recorder" back to "kinasa sauti"', () => {
    expect(normalizeSearchQuery('voice recorder').terms).toContain('kinasa sauti');
  });

  it('expands "chaja" to "charger" and vice versa', () => {
    expect(normalizeSearchQuery('chaja').terms).toContain('charger');
    expect(normalizeSearchQuery('charger').terms).toContain('chaja');
  });

  it('expands "simu" to "phone" and vice versa', () => {
    expect(normalizeSearchQuery('simu').terms).toContain('phone');
    expect(normalizeSearchQuery('phone').terms).toContain('simu');
  });

  it('expands "gari" to "car" and vice versa', () => {
    expect(normalizeSearchQuery('gari').terms).toContain('car');
    expect(normalizeSearchQuery('car').terms).toContain('gari');
  });

  it('strips a trailing price expression and still resolves the product term', () => {
    const { cleanedQuery, terms } = normalizeSearchQuery('kamera 100k');
    expect(cleanedQuery).toBe('kamera');
    expect(terms).toContain('camera');
    expect(terms.some((t) => t.includes('100k'))).toBe(false);
  });

  it('strips price + filler words + keeps the location as a term, not noise', () => {
    const { cleanedQuery, terms } = normalizeSearchQuery('kamera ya 100k Keko');
    expect(cleanedQuery).not.toMatch(/\bya\b/);
    expect(cleanedQuery).not.toMatch(/100k/);
    expect(terms).toContain('camera');
    expect(terms.map((t) => t.toLowerCase())).toContain('keko');
  });

  // The exact regression reported: "camera of 40k" returned zero results
  // because the raw query (including "of 40k") was LIKE-matched verbatim
  // against product titles that only ever contain "Camera".
  it('regression: "camera of 40k" cleans down to just "camera"', () => {
    const { cleanedQuery, terms } = normalizeSearchQuery('camera of 40k');
    expect(cleanedQuery).toBe('camera');
    expect(terms).toContain('camera');
    expect(terms).not.toContain('of');
  });

  it('never returns an empty term set, even for an all-noise query', () => {
    const { terms } = normalizeSearchQuery('ya cha kwa');
    expect(terms.length).toBeGreaterThan(0);
  });
});

describe('buildMultiTermLikeClause', () => {
  it('generates one OR-of-LIKE condition per column, parameterized per term', () => {
    const { clause, params } = buildMultiTermLikeClause(
      ['LOWER(p.name)', 'LOWER(p.description)'],
      ['%camera%', '%kamera%'],
      'kw',
    );
    expect(clause).toBe(
      '((LOWER(p.name) LIKE :kw_0_0 OR LOWER(p.name) LIKE :kw_0_1) OR (LOWER(p.description) LIKE :kw_1_0 OR LOWER(p.description) LIKE :kw_1_1))',
    );
    expect(params).toEqual({
      kw_0_0: '%camera%',
      kw_0_1: '%kamera%',
      kw_1_0: '%camera%',
      kw_1_1: '%kamera%',
    });
  });
});
