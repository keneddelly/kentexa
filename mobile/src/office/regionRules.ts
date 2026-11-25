import { OFFICE_RULES } from './officeRules';

/**
 * Same place or not. Same rule as the web (utils/regionMatch.js); the patterns come from
 * shared/office-rules.json, so both apps read one definition.
 */
export const normalizePlace = (value: unknown): string => String(value ?? '')
  .toLowerCase()
  .replace(new RegExp(OFFICE_RULES.regionMatch.separatorsPattern, 'g'), ' ')
  .replace(new RegExp(OFFICE_RULES.regionMatch.stripPattern, 'g'), ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** True only when both places are known and differ. */
export const isIntercityPlace = (origin: unknown, destination: unknown): boolean => {
  const a = normalizePlace(origin);
  const b = normalizePlace(destination);
  return Boolean(a && b && a !== b);
};

/** 'same' | 'other' | null (unknown). */
export type RelationT = 'same' | 'other' | null;
export const regionRelation = (officeRegion: unknown, destinationRegion: unknown): RelationT => {
  const a = normalizePlace(officeRegion);
  const b = normalizePlace(destinationRegion);
  if (!a || !b) return null;
  return a === b ? 'same' : 'other';
};
