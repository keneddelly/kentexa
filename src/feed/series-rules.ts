import { slugify } from '../share/share-html';

/**
 * Mfululizo (issue #410, owner approved 2026-11-17): the pure rules, tested on their own.
 */
export const SERIES_STATUSES = ['draft', 'published', 'archived'] as const;
export type SeriesStatus = (typeof SERIES_STATUSES)[number];

export const SERIES_TEXT = {
  missing: 'Mfululizo haupatikani.',
  title: 'Andika jina la mfululizo (herufi 3 hadi 120).',
  status: 'Hali si sahihi: rasimu, umechapishwa au umehifadhiwa.',
  topic: 'Mada haipo.',
  post: 'Chapisho halipatikani au si la wazi kwa wote.',
  already: 'Chapisho hili tayari ni sehemu ya mfululizo huu.',
  order: 'Orodha ya mpangilio hailingani na sehemu zilizopo. Pakia upya ujaribu tena.',
  notPublished: 'Mfululizo huu bado haujachapishwa.',
  community: 'Jumuiya haipatikani.',
} as const;

/** The address of a series: /series/12-business-conversations (the number is what counts). */
export const seriesPath = (id: number, title: string) => {
  const s = slugify(title);
  return `/series/${id}${s ? `-${s}` : ''}`;
};

/** "12-business-conversations" or "12" -> 12; anything else -> null. */
export const seriesIdFromRef = (ref: unknown): number | null => {
  const m = String(ref ?? '').match(/^(\d{1,9})(?:-[a-z0-9-]*)?$/i);
  return m ? Number(m[1]) : null;
};

export const cleanTitle = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return t.length >= 3 && t.length <= 120 ? t : null;
};

/**
 * A reorder must name exactly the episodes the series has now, each once. Anything else
 * (a missing, extra or repeated post) is refused, so two admins editing at once never corrupt it.
 */
export const validOrder = (current: number[], requested: unknown): number[] | null => {
  if (!Array.isArray(requested)) return null;
  const ids = requested.map((v) => Number(v));
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  if (new Set(ids).size !== ids.length || ids.length !== current.length) return null;
  const have = new Set(current);
  return ids.every((n) => have.has(n)) ? ids : null;
};

/**
 * What a viewer sees: only episodes whose post may be shown, numbered 1..n in their order.
 * A hidden or deleted post drops out and the numbers close up; the stored row stays.
 */
export const numberVisible = <T extends { position: number; visible: boolean }>(rows: T[]) =>
  rows.filter((r) => r.visible).sort((a, b) => a.position - b.position).map((r, i) => ({ ...r, number: i + 1 }));

/** The episodes before and after a post in a numbered list (null at the ends or when absent). */
export const neighbours = <T extends { postId: number }>(list: T[], postId: number) => {
  const i = list.findIndex((e) => e.postId === postId);
  if (i < 0) return null;
  return { index: i, prev: i > 0 ? list[i - 1] : null, next: i < list.length - 1 ? list[i + 1] : null };
};
