/**
 * Shipment historical location snapshot -- pure construction (Stage 2B shape,
 * Stage 2D trust model).
 *
 * TRUST MODEL: a snapshot is only ever built from
 *   (a) a candidate the SERVER resolved itself from a place reference the
 *       client selected (snapshotFromResolvedPlace), or
 *   (b) the user's own free text, with SERVER-authored provenance
 *       (snapshotFromFreeText).
 * There is deliberately no function that accepts client-supplied coordinates,
 * region/district names, providerKey or resolutionMethod: the client can only
 * name WHICH place it chose, never assert facts about it.
 *
 * No I/O, no provider lookup, no guessing here.
 */
import { LocationCandidate, toValidatedPoint } from '../location-intelligence/location-provider.interface';

/**
 * What a client submits after selecting a search result. A REFERENCE only:
 * providerKey + providerPlaceId are a lookup key the server resolves exactly.
 * `localityText` is the user's own unverified remainder (e.g. "Mwisho" from
 * "Mbezi Mwisho"); it is kept as marked, untrusted text and never becomes
 * geography.
 */
export interface PlaceSelection {
  providerKey: string;
  providerPlaceId: string;
  localityText?: string;
}

export interface LocationSnapshotValues {
  label: string | null;
  latitude: number | null;
  longitude: number | null;
  regionName: string | null;
  districtName: string | null;
  providerKey: string | null;
  resolutionMethod: string | null;
}

/** Server-authored provenance for free text. Never read from a request. */
export const USER_TYPED_PROVIDER_KEY = 'user';
export const USER_TYPED_RESOLUTION_METHOD = 'user_typed';

const MAX_LABEL = 200;
const MAX_NAME = 120;
const MAX_KEY = 40;
export const MAX_LOCALITY_TEXT = 60;

const EMPTY: LocationSnapshotValues = Object.freeze({
  label: null,
  latitude: null,
  longitude: null,
  regionName: null,
  districtName: null,
  providerKey: null,
  resolutionMethod: null,
}) as LocationSnapshotValues;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * The user's own unverified locality text: a bounded single line. Control
 * characters and runs of whitespace are collapsed; anything empty is null.
 */
export function cleanLocalityText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, MAX_LOCALITY_TEXT) : null;
}

/**
 * Display label = the TRUSTED, server-resolved part first, then the user's
 * unverified remainder in an explicit, fixed marker. The two parts stay
 * distinguishable (in the code path and in the stored text) even though they
 * share one label column: "<resolved label> (typed: <unverified text>)".
 */
export const UNVERIFIED_TEXT_MARKER = ' (typed: ';
export function composeSnapshotLabel(trustedLabel: string, unverifiedText: string | null): string {
  if (!unverifiedText) return trustedLabel.slice(0, MAX_LABEL);
  const suffix = `${UNVERIFIED_TEXT_MARKER}${unverifiedText})`;
  const room = Math.max(0, MAX_LABEL - suffix.length);
  return `${trustedLabel.slice(0, room)}${suffix}`;
}

/**
 * Snapshot of a place the SERVER resolved. Every value below is copied from
 * the resolved candidate (server data); the only client contribution is the
 * optional, marked, unverified `localityText` inside the label. Coordinates,
 * when present, are the selected seed AREA's centroid (resolutionMethod
 * 'admin_seed' says so) -- never the typed locality's, which is unknown.
 */
export function snapshotFromResolvedPlace(
  candidate: LocationCandidate,
  localityText?: unknown,
): LocationSnapshotValues {
  const trusted = text(candidate.displayLabel, MAX_LABEL);
  if (!trusted) return { ...EMPTY };
  const point = toValidatedPoint(candidate.latitude, candidate.longitude);
  return {
    label: composeSnapshotLabel(trusted, cleanLocalityText(localityText)),
    latitude: point.latitude ?? null,
    longitude: point.longitude ?? null,
    regionName: text(candidate.regionName, MAX_NAME),
    districtName: text(candidate.districtName, MAX_NAME),
    providerKey: text(candidate.providerKey, MAX_KEY),
    resolutionMethod: text(candidate.resolutionMethod, MAX_KEY),
  };
}

/**
 * Snapshot of unresolved free text: the user's bounded label, no
 * coordinates, no region/district claims, and provenance authored HERE (never
 * from the request), so 'user_typed' can never be confused with a resolved
 * place. Blank text yields the all-null snapshot.
 */
export function snapshotFromFreeText(freeText: unknown): LocationSnapshotValues {
  const label = text(freeText, MAX_LABEL);
  if (!label) return { ...EMPTY };
  return {
    ...EMPTY,
    label,
    providerKey: USER_TYPED_PROVIDER_KEY,
    resolutionMethod: USER_TYPED_RESOLUTION_METHOD,
  };
}

/**
 * COMPATIBILITY POLICY, not a location rule. Today's hub matching
 * (SuperAgent.city equality) and route discovery are string-based on
 * "city", and in production the hubs' `city` is a REGION name. So, for a
 * Shipment created from a resolved place, the legacy originCity/
 * destinationCity column is derived from the resolved administrative
 * hierarchy's region. This says nothing about what a LocationCandidate's
 * "city" is (it has none) and must not be reused as a general definition;
 * when the model of hubs/routes changes, this helper is the one place to
 * change. Returns null when the candidate carries no region context.
 */
export function deriveLegacyRoutingCity(candidate: LocationCandidate): string | null {
  return text(candidate.regionName, MAX_NAME);
}

export function toOriginSnapshotColumns(v: LocationSnapshotValues) {
  return {
    originLocationLabel: v.label,
    originLatitude: v.latitude,
    originLongitude: v.longitude,
    originRegionName: v.regionName,
    originDistrictName: v.districtName,
    originProviderKey: v.providerKey,
    originResolutionMethod: v.resolutionMethod,
  };
}

export function toDestinationSnapshotColumns(v: LocationSnapshotValues) {
  return {
    destinationLocationLabel: v.label,
    destinationLatitude: v.latitude,
    destinationLongitude: v.longitude,
    destinationRegionName: v.regionName,
    destinationDistrictName: v.districtName,
    destinationProviderKey: v.providerKey,
    destinationResolutionMethod: v.resolutionMethod,
  };
}
