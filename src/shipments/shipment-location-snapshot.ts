/**
 * Shipment historical location snapshot (Stage 2B) -- pure normalization.
 *
 * Turns a user-selected Stage 2A LocationCandidate (or a client-sent subset
 * of one) into the by-value columns persisted on Shipment. No I/O, no
 * provider lookup, no guessing: an absent or unusable input yields an
 * all-null snapshot, which is exactly what a legacy/free-text shipment has.
 */
import { LocationCandidate, toValidatedPoint } from '../location-intelligence/location-provider.interface';

// Only the fields a Shipment actually snapshots. Deliberately a subset of
// LocationCandidate: no providerPlaceId, landmark, confidence or admin ids.
export type ShipmentLocationInput = Partial<
  Pick<
    LocationCandidate,
    | 'displayLabel'
    | 'latitude'
    | 'longitude'
    | 'regionName'
    | 'districtName'
    | 'providerKey'
    | 'resolutionMethod'
  >
>;

export interface LocationSnapshotValues {
  label: string | null;
  latitude: number | null;
  longitude: number | null;
  regionName: string | null;
  districtName: string | null;
  providerKey: string | null;
  resolutionMethod: string | null;
}

const MAX_LABEL = 200;
const MAX_NAME = 120;
const MAX_KEY = 40;

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
 * A snapshot requires a non-blank displayLabel (the one required field of a
 * LocationCandidate); without it nothing is stored. Coordinates go through
 * Stage 2A's toValidatedPoint() -- the single coordinate validator -- so they
 * are persisted as a valid pair or not at all, and an invalid coordinate
 * never fails the shipment (the label/admin-only snapshot is still valid).
 */
export function buildLocationSnapshot(input: unknown): LocationSnapshotValues {
  if (!input || typeof input !== 'object') return { ...EMPTY };
  const c = input as ShipmentLocationInput;

  const label = text(c.displayLabel, MAX_LABEL);
  if (!label) return { ...EMPTY };

  const point = toValidatedPoint(c.latitude, c.longitude);
  return {
    label,
    latitude: point.latitude ?? null,
    longitude: point.longitude ?? null,
    regionName: text(c.regionName, MAX_NAME),
    districtName: text(c.districtName, MAX_NAME),
    providerKey: text(c.providerKey, MAX_KEY),
    resolutionMethod: text(c.resolutionMethod, MAX_KEY),
  };
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
