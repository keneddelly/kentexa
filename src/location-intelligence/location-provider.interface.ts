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
 * How a LocationCandidate was actually produced. An open string, not a
 * closed set enforced anywhere -- new providers may introduce new methods
 * without touching this file. The values below are simply the ones this
 * stage's own provider and near-future providers are expected to use.
 */
export type LocationResolutionMethod =
  | 'admin_seed' // matched against seeded administrative-geography text (what tz_seed does)
  | 'user_typed' // free text, unresolved beyond echoing it back
  | 'gps' // device coordinates
  | 'reverse_geocoded' // coordinates -> label
  | 'manual_entry'; // staff/admin correction

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
