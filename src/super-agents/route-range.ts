/**
 * Anonymous route market range (docs/KENTEXA_ROADMAP.md step 3a (b), owner 2026-10-22).
 * For one route (this office's city to a destination) and one weight, the range of what
 * the active offices on that route charge by their per-destination rates (shipping_rate),
 * and where this office sits in it.
 *
 * Never another office's name, id or exact price:
 * - no range at all until at least MIN_OTHER_OFFICES other offices have a rate;
 * - the low end is rounded DOWN and the high end UP to RANGE_STEP, the middle to the
 *   nearest MIDDLE_STEP, so no end is one office's exact price;
 * - this office's position is a third (low / middle / high), never a rank.
 *
 * Pure: no database, no clock.
 */
import { roundUpTo100 } from './office-price';

export const MIN_OTHER_OFFICES = 3;
export const RANGE_STEP = 1000;
export const MIDDLE_STEP = 500;

export interface RouteRate { officeId: number; ratePerKg: number; minimumCharge: number }
export type RangePosition = 'low' | 'middle' | 'high';

export interface RouteRange {
  weightKg: number;
  /** How many offices (this one included) have a rate on this route. */
  officeCount: number;
  /** null until at least MIN_OTHER_OFFICES other offices have a rate. */
  range: { low: number; middle: number; high: number } | null;
  /** This office's own price for this weight; null when it has no rate on this route. */
  mine: number | null;
  /** Where this office sits; null without a range or without its own rate. */
  position: RangePosition | null;
}

/** One office's price for this weight: rate x kg, at least the minimum, rounded up to 100. */
export const routePrice = (r: Pick<RouteRate, 'ratePerKg' | 'minimumCharge'>, weightKg: number): number =>
  Math.max(roundUpTo100(weightKg * Number(r.ratePerKg)), roundUpTo100(Number(r.minimumCharge) || 0));

const median = (sorted: number[]): number => {
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};

export function computeRouteRange(rates: RouteRate[], myOfficeId: number, weightKg: number): RouteRange {
  const weight = Number(weightKg) > 0 ? Number(weightKg) : 1;
  // One price per office (the first valid row wins), only rates that can be charged.
  const byOffice = new Map<number, number>();
  for (const r of rates) {
    if (!(Number(r.ratePerKg) > 0) || byOffice.has(r.officeId)) continue;
    byOffice.set(r.officeId, routePrice(r, weight));
  }
  const mine = byOffice.get(myOfficeId) ?? null;
  const others = [...byOffice.entries()].filter(([id]) => id !== myOfficeId).map(([, p]) => p);
  const base = { weightKg: weight, officeCount: byOffice.size, mine };
  if (others.length < MIN_OTHER_OFFICES) return { ...base, range: null, position: null };

  const all = [...others, ...(mine == null ? [] : [mine])].sort((a, b) => a - b);
  const range = {
    low: Math.floor(all[0] / RANGE_STEP) * RANGE_STEP,
    middle: Math.round(median(all) / MIDDLE_STEP) * MIDDLE_STEP,
    high: Math.ceil(all[all.length - 1] / RANGE_STEP) * RANGE_STEP,
  };
  let position: RangePosition | null = null;
  if (mine != null) {
    const cheaper = others.filter((p) => p < mine).length / others.length;
    const dearer = others.filter((p) => p > mine).length / others.length;
    position = dearer > 2 / 3 ? 'low' : cheaper > 2 / 3 ? 'high' : 'middle';
  }
  return { ...base, range, position };
}
