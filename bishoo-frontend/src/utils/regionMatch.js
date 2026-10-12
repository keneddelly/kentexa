// Same place or not (Release C, C1/C2) — same rules as the backend's
// src/super-agents/region-match.ts. Offices register a region; parcels carry
// a region typed or picked in different spellings.
export const normalizePlace = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/[-_.,]/g, ' ')
  .replace(/\bmkoa wa\b|\bregion\b|\bmkoa\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// True only when BOTH places are known and differ.
export const isIntercityPlace = (origin, destination) => {
  const a = normalizePlace(origin);
  const b = normalizePlace(destination);
  return Boolean(a && b && a !== b);
};

// C1: the delivery method the counter picks by itself from the office's
// region and the destination region. 'same' | 'other' | null (unknown).
export const regionRelation = (officeRegion, destinationRegion) => {
  const a = normalizePlace(officeRegion);
  const b = normalizePlace(destinationRegion);
  if (!a || !b) return null;
  return a === b ? 'same' : 'other';
};
