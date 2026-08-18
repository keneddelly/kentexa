import { parsePriceExpression } from './price-expression-parser.util';

describe('parsePriceExpression', () => {
  it('treats a bare "120k" as a budget ceiling (maxPrice), not minPrice', () => {
    expect(parsePriceExpression('Kinasa sauti cha 120k')).toEqual({
      minPrice: null,
      maxPrice: 120000,
    });
  });

  it('parses "chini ya X" as maxPrice', () => {
    expect(parsePriceExpression('kinasa sauti chini ya 150k')).toEqual({
      minPrice: null,
      maxPrice: 150000,
    });
  });

  it('parses a bare 6-digit number as maxPrice', () => {
    expect(parsePriceExpression('camera ya 100000')).toEqual({
      minPrice: null,
      maxPrice: 100000,
    });
  });

  it('parses "laki moja" (100,000) regardless of word order', () => {
    expect(parsePriceExpression('laki moja kinasa sauti').maxPrice).toBe(100000);
  });

  it('parses "X mpaka Y" as a min/max range', () => {
    expect(parsePriceExpression('50k mpaka 100k')).toEqual({
      minPrice: 50000,
      maxPrice: 100000,
    });
  });

  it('parses "zaidi ya X" as minPrice', () => {
    expect(parsePriceExpression('zaidi ya laki moja')).toEqual({
      minPrice: 100000,
      maxPrice: null,
    });
  });

  it('does not mistake a short digit run inside a model name for a price', () => {
    expect(parsePriceExpression('a9 camera')).toEqual({
      minPrice: null,
      maxPrice: null,
    });
  });

  it('returns nulls when no price is present', () => {
    expect(parsePriceExpression('camera')).toEqual({
      minPrice: null,
      maxPrice: null,
    });
  });
});
