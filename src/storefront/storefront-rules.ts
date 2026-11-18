/**
 * Page templates (owner approved 2026-11-18): Duka (store) and the personal brand page (creator).
 * The plain rules, kept pure and tested.
 */
export const PAGE_TEMPLATES = ['store', 'creator', 'basic'] as const;
export type PageTemplate = typeof PAGE_TEMPLATES[number];
export const MAX_COLLECTIONS = 12;
export const MAX_COLLECTION_PRODUCTS = 60;

export type OpeningHours = { open: string; close: string; closedDays: number[] };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A clean opening-hours value, or null (= not set). */
export const cleanHours = (v: any): OpeningHours | null => {
  if (!v || typeof v !== 'object') return null;
  const open = String(v.open || '').trim();
  const close = String(v.close || '').trim();
  if (!HHMM.test(open) || !HHMM.test(close)) return null;
  const closedDays = Array.isArray(v.closedDays)
    ? [...new Set(v.closedDays.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() as number[]
    : [];
  if (closedDays.length === 7) return null;
  return { open, close, closedDays };
};

/** null = automatic. */
export const cleanTemplate = (v: any): PageTemplate | null => {
  const s = String(v ?? '').trim().toLowerCase();
  return (PAGE_TEMPLATES as readonly string[]).includes(s) ? (s as PageTemplate) : null;
};

/** The old price only counts when it is above what the customer pays now. */
export const cleanCompareAt = (compareAt: unknown, displayPrice: unknown): number | null => {
  const c = Number(compareAt);
  const d = Number(displayPrice);
  if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(d) || c <= d) return null;
  return Math.round(c * 100) / 100;
};

export const cleanTitle = (v: unknown, max: number) => String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export const cleanIds = (v: unknown) => (Array.isArray(v)
  ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_COLLECTION_PRODUCTS)
  : []);
