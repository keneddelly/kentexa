import { sumQuoteComponents, TransportQuoteComponents, TRANSPORT_QUOTE_COMPONENT_KEYS } from './transport-quote-components';

/**
 * Stage 3S-B5 — pure-function proof of the ONE place a quote's total is
 * derived from its components, independent of any database or service.
 */
describe('sumQuoteComponents', () => {
  it('sums only the present component keys, treating an absent key as zero, never a fabricated default', () => {
    expect(sumQuoteComponents({ transportBase: 1000 })).toBe(1000);
    expect(sumQuoteComponents({ transportBase: 1000, agentPickup: 500 })).toBe(1500);
    expect(
      sumQuoteComponents({
        transportBase: 1000,
        agentPickup: 500,
        hubHandling: 200,
        lastMileDelivery: 300,
        platformService: 100,
      }),
    ).toBe(2100);
  });

  it('the canonical key list matches exactly what TransportQuoteComponents declares', () => {
    expect(TRANSPORT_QUOTE_COMPONENT_KEYS).toEqual([
      'transportBase',
      'agentPickup',
      'hubHandling',
      'lastMileDelivery',
      'platformService',
    ]);
  });

  it('an absent key stays absent on the object itself -- summing never writes a synthesized 0 back onto it', () => {
    const components: TransportQuoteComponents = { transportBase: 1000 };
    expect(sumQuoteComponents(components)).toBe(1000);
    expect(components.agentPickup).toBeUndefined();
    expect(Object.keys(components)).toEqual(['transportBase']);
  });
});
