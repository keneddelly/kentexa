/**
 * Same place or not, for parcel routing (Release C). Offices register a
 * region ("Dar es Salaam"); parcels carry a city/region typed or picked in
 * different spellings ("dar-es-salaam", "Mkoa wa Mwanza", "Mwanza Region").
 */
export function normalizePlace(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[-_.,]/g, ' ')
    .replace(/\bmkoa wa\b|\bregion\b|\bmkoa\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True only when BOTH places are known and differ: the parcel is intercity. */
export function isIntercity(origin: string | null | undefined, destination: string | null | undefined): boolean {
  const a = normalizePlace(origin);
  const b = normalizePlace(destination);
  return Boolean(a && b && a !== b);
}
