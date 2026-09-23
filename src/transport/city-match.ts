/**
 * Shared, hardened city matching for PUBLIC transport discovery
 * (findAvailableForRoute: GET /shipments/routes and GET /transport/available).
 *
 * The legacy matching is deliberately fuzzy -- case-insensitive substring in
 * BOTH directions, so "Dar", "Dar es Salaam" and "Dar es salaam " (real
 * production strings) all meet -- and that stays. What changes (Stage 2E) is
 * that user text can no longer act as a PATTERN or match by accident:
 *   - input is trimmed and must be 2..80 characters (a 1-letter or
 *     whitespace-only string can't broaden discovery);
 *   - LIKE wildcards in the input (% _) and the escape character are literal;
 *   - the reverse-containment direction uses the stored column as a pattern,
 *     so the column is escaped too, and a stored value shorter than 2
 *     characters (e.g. "", "a") never matches by containment.
 * Escape character: '!' (declared with ESCAPE, so no backslash ambiguity).
 */
import { BadRequestException } from '@nestjs/common';

export const DISCOVERY_CITY_MIN = 2;
export const DISCOVERY_CITY_MAX = 80;

/** Makes text literal inside a LIKE pattern that declares ESCAPE '!'. */
export function escapeLikeLiteral(text: string): string {
  return text.replace(/[!%_]/g, '!$&');
}

/**
 * Validates one side of a discovery query.
 * - `allowUnconstrainedSide` (ONLY for GET /transport/available, whose public
 *   coverage page sends `to=` empty to mean "from X to anywhere"): an
 *   absent/EXACTLY-empty value means "no constraint on this side" and is
 *   returned as null. Whitespace-only text is never "empty": it is rejected.
 * - Otherwise the value must be a string of 2..80 trimmed characters.
 */
export function normalizeDiscoveryCity(
  raw: unknown,
  allowUnconstrainedSide = false,
): string | null {
  if (allowUnconstrainedSide && (raw === undefined || raw === '')) return null;
  if (typeof raw !== 'string') throw new BadRequestException('A city is required');
  const trimmed = raw.trim();
  if (trimmed.length < DISCOVERY_CITY_MIN) {
    throw new BadRequestException(`A city must be at least ${DISCOVERY_CITY_MIN} characters`);
  }
  if (trimmed.length > DISCOVERY_CITY_MAX) {
    throw new BadRequestException(`A city must be at most ${DISCOVERY_CITY_MAX} characters`);
  }
  return trimmed;
}

/**
 * SQL predicate (named params `:${param}` = escaped '%text%' pattern and
 * `:${param}Raw` = the text itself) for "column contains the city OR the city
 * contains the column".
 */
export function cityMatchSql(column: string, param: string): string {
  const escapedColumn = `REPLACE(REPLACE(REPLACE(LOWER(${column}), '!', '!!'), '%', '!%'), '_', '!_')`;
  return (
    `(LOWER(${column}) LIKE LOWER(:${param}) ESCAPE '!' ` +
    `OR (LENGTH(TRIM(${column})) >= ${DISCOVERY_CITY_MIN} ` +
    `AND LOWER(:${param}Raw) LIKE ('%' || ${escapedColumn} || '%') ESCAPE '!'))`
  );
}

/** Params for cityMatchSql(column, param) given the validated city. */
export function cityMatchParams(param: string, city: string): Record<string, string> {
  return { [param]: `%${escapeLikeLiteral(city)}%`, [`${param}Raw`]: city };
}
