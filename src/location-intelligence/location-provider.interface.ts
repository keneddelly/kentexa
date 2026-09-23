/**
 * Location Intelligence — provider-neutral contract (Stage 2A).
 * Place at: src/location-intelligence/location-provider.interface.ts
 *
 * No consumer, entity, or persisted table anywhere in the codebase depends
 * on any of these types today. This is deliberately in-memory/value-object
 * only -- see LocationIntelligenceService's own doc comment for why
 * persistence is out of scope for this stage.
 */

/**
 * How a LocationCandidate was actually produced. Genuinely open: the
 * `| (string & {})` member is a standard TypeScript technique that keeps
 * autocomplete/documentation for the known values below WITHOUT collapsing
 * the type to plain `string` (which would lose that autocomplete) -- any
 * other string literal is still structurally assignable, so a future
 * provider can introduce e.g. 'geocoded' or 'provider_search' without
 * modifying this file. Previously the type was a closed union while its own
 * comment claimed otherwise; this makes the code match that claim.
 */
export type LocationResolutionMethod =
  | 'admin_seed' // matched against seeded administrative-geography text (what tz_seed does)
  | 'user_typed' // free text, unresolved beyond echoing it back
  | 'gps' // device coordinates
  | 'reverse_geocoded' // coordinates -> label
  | 'manual_entry' // staff/admin correction
  | (string & {});

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface LocationSearchOptions {
  near?: GeoPoint;
  countryCode?: string;
  limit?: number;
}

/**
 * Only exposes a GeoPoint when BOTH values convert to finite numbers within
 * valid geographic ranges (latitude -90..90, longitude -180..180). A
 * candidate must never appear partially coordinate-resolved (one side
 * present, the other missing/invalid) or expose NaN -- either both
 * coordinates are trustworthy together, or neither is exposed and the
 * candidate remains valid as a label/administrative-only result. Exported
 * so every provider (not just tz_seed) validates coordinates identically.
 */
export function toValidatedPoint(
  rawLatitude: unknown,
  rawLongitude: unknown,
): Partial<GeoPoint> {
  if (rawLatitude == null || rawLongitude == null) return {};
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return {};
  if (latitude < -90 || latitude > 90) return {};
  if (longitude < -180 || longitude > 180) return {};
  return { latitude, longitude };
}

/**
 * A single, provider-neutral result. Every field beyond displayLabel/
 * providerKey/resolutionMethod is optional by design -- a result must
 * remain valid when the underlying source can only resolve administrative
 * or free-form text (a village, a landmark, a colloquial place name), which
 * is the common case this whole stage exists to support, not an edge case.
 *
 * Deliberately has no global database identity field: this is a value, not
 * a row. Nothing persists a LocationCandidate or references one by id.
 */
export interface LocationCandidate {
  displayLabel: string;
  latitude?: number;
  longitude?: number;
  regionId?: number;
  regionName?: string;
  districtId?: number;
  districtName?: string;
  wardId?: number;
  wardName?: string;
  /** Never populated by the tz_seed provider; reserved for future providers/manual entry. */
  landmark?: string;
  /** Open string identifier, e.g. 'tz_seed' -- never a closed vendor enum. */
  providerKey: string;
  /** Never populated by tz_seed -- no external provider ids exist for seeded rows. */
  providerPlaceId?: string;
  resolutionMethod: LocationResolutionMethod;
  /**
   * Omitted entirely unless a provider has a real basis for a number.
   * tz_seed never sets this -- a label-only/administrative-text match has
   * no meaningful confidence score, and fabricating one would misrepresent
   * it as more precise than it is.
   */
  confidence?: number;
}

/**
 * Implemented by exactly one provider in this stage (TzSeedLocationProvider).
 * Kentexa's domain code never references a vendor name outside a provider's
 * own implementation file -- LocationIntelligenceService only ever sees this
 * interface.
 */
export interface LocationProvider {
  readonly key: string;
  search(query: string, opts?: LocationSearchOptions): Promise<LocationCandidate[]>;
  /** Optional: no provider in this stage implements it (no external geocoder exists yet). */
  reverseGeocode?(point: GeoPoint): Promise<LocationCandidate | null>;
}
