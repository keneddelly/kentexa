import { readdirSync } from 'fs';

/**
 * Migration ledger identity is timestamp+name and the bounded runner orders by
 * timestamp, so two migrations must never share one. Stage 3S-A renumbered the
 * pickup-task migration because 1788282600000 already belongs to the older
 * AddCheckoutRequestIdempotency migration on the checkout branches (#53/#54).
 */
describe('migration timestamps', () => {
  const files = readdirSync(__dirname).filter((n) => /^\d{13}-.+\.ts$/.test(n) && !/\.spec\.ts$/.test(n));
  const stamp = (n: string) => Number(n.slice(0, 13));

  it('are unique across the repository sequence', () => {
    const seen = new Map<number, string>();
    for (const f of files) {
      expect(seen.get(stamp(f))).toBeUndefined();
      seen.set(stamp(f), f);
    }
  });

  it('the pickup-task migration sorts AFTER the reserved checkout (1788282600000) and walk-in (1788282000000) migrations', () => {
    const pickup = files.find((f) => f.includes('AddParcelPickupTask'))!;
    expect(pickup).toBe('1788283200000-AddParcelPickupTask.ts');
    expect(stamp(pickup)).toBeGreaterThan(1788282600000);
    // the old, colliding number is not used by ANY migration on this branch
    expect(files.some((f) => stamp(f) === 1788282600000)).toBe(false);
  });

  it('Stage 3S-B3\'s transport-quote migration sorts AFTER pickup-task', () => {
    const quote = files.find((f) => f.includes('AddTransportQuote'))!;
    expect(quote).toBe('1788283800000-AddTransportQuote.ts');
    expect(stamp(quote)).toBeGreaterThan(1788283200000);
  });

  it('Stage 3S-B4\'s route-price-history migration sorts AFTER the quote migration and is currently the latest', () => {
    const priceHistory = files.find((f) => f.includes('AddTransportRoutePriceHistory'))!;
    expect(priceHistory).toBe('1788284400000-AddTransportRoutePriceHistory.ts');
    expect(stamp(priceHistory)).toBeGreaterThan(1788283800000);
    expect(files.every((f) => stamp(f) <= stamp(priceHistory))).toBe(true);
  });
});
