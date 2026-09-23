/**
 * LogisticsLocationContext (Stage 2E) -- the explicit, server-derived bridge
 * from a resolved place to the strings today's logistics data is keyed by.
 *
 *   PlaceRef -> server resolve -> LocationCandidate -> LogisticsLocationContext -> legacy discovery
 *
 * This is a COMPATIBILITY ADAPTER for the current free-text route/hub model,
 * not a definition of what a location "is": nothing here adds a `city` concept
 * to LocationCandidate, and when routes/hubs move to normalised keys this
 * file is the one place that changes.
 *
 * Trust rules (each is tested):
 *  - built ONLY from the candidate the server resolved -- never from client
 *    names, provenance or coordinates;
 *  - the unverified `localityText` of a partial selection is never an input, so
 *    it can never become a routing key;
 *  - no coordinates are carried or used (an admin centroid is not an address);
 *  - free text is NOT enriched: it stays exactly the typed string, labelled
 *    unresolved. No district/region/capital alias is ever derived from typed
 *    text.
 */
import { LocationCandidate } from '../location-intelligence/location-provider.interface';
import { TZ_REGION_CAPITALS } from '../tz-location/region-capitals';
import { DISCOVERY_CITY_MAX, DISCOVERY_CITY_MIN } from '../transport/city-match';

export type RouteKeyKind = 'ward' | 'district' | 'region' | 'region_capital' | 'text';

export interface RouteKey {
  key: string;
  kind: RouteKeyKind;
}

export type PlaceLevel = 'ward' | 'district' | 'region';

/** A side that was selected as a place and re-resolved by the server. */
export interface ResolvedLogisticsContext {
  source: 'place';
  level: PlaceLevel;
  providerKey: string;
  providerPlaceId: string;
  label: string;
  /**
   * Today's SuperAgent.city convention (a REGION name). A compatibility/SEARCH
   * key only -- several hubs can share it, so it is NOT a hub identity, and
   * Stage 2E never selects, ranks or assigns a hub.
   */
  hubCompatibilityKey: string;
  /** Most specific -> broadest, de-duplicated. */
  routeKeys: RouteKey[];
}

/** A side given as free text: explicitly unresolved, never enriched. */
export interface TextLogisticsContext {
  source: 'text';
  routeKeys: [RouteKey];
}

export type LogisticsSide = ResolvedLogisticsContext | TextLogisticsContext;

/** Bounds on the discovery fan-out (checked in tests): <=4 keys per side, so <=16 pairs. */
export const MAX_ROUTE_KEYS_PER_SIDE = 4;
export const MAX_KEY_PAIRS = MAX_ROUTE_KEYS_PER_SIDE * MAX_ROUTE_KEYS_PER_SIDE;

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length >= DISCOVERY_CITY_MIN && t.length <= DISCOVERY_CITY_MAX ? t : null;
}

/**
 * Keys for a selected place, most specific first:
 *   ward -> ward, district, region; district -> district, region; region -> region;
 * then the region's capital ONLY where the shared production policy
 * (TZ_REGION_CAPITALS) supplies one that differs from the region name.
 * Returns null when the resolved candidate has no region context (fail closed).
 */
export function buildLogisticsLocationContext(
  candidate: LocationCandidate,
): ResolvedLogisticsContext | null {
  const region = clean(candidate.regionName);
  if (!region || !candidate.providerPlaceId) return null;
  const ward = clean(candidate.wardName);
  const district = clean(candidate.districtName);
  const level: PlaceLevel = ward ? 'ward' : district ? 'district' : 'region';

  const raw: RouteKey[] = [];
  if (ward) raw.push({ key: ward, kind: 'ward' });
  if (district) raw.push({ key: district, kind: 'district' });
  raw.push({ key: region, kind: 'region' });
  const capital = clean(TZ_REGION_CAPITALS[region]);
  if (capital) raw.push({ key: capital, kind: 'region_capital' });

  const seen = new Set<string>();
  const routeKeys: RouteKey[] = [];
  for (const k of raw) {
    const id = k.key.toLowerCase();
    if (seen.has(id)) continue; // e.g. capital === region name
    seen.add(id);
    routeKeys.push(k);
  }

  return {
    source: 'place',
    level,
    providerKey: candidate.providerKey,
    providerPlaceId: candidate.providerPlaceId,
    label: candidate.displayLabel,
    hubCompatibilityKey: region,
    routeKeys: routeKeys.slice(0, MAX_ROUTE_KEYS_PER_SIDE),
  };
}

/** Free text: exactly the typed string, marked unresolved. No derived aliases. */
export function buildTextLogisticsContext(text: string): TextLogisticsContext {
  return { source: 'text', routeKeys: [{ key: text, kind: 'text' }] };
}

// ── PlaceRef query-parameter grammar ─────────────────────────────────────────
// `<providerKey>:<providerPlaceId>`; provider place ids themselves contain ':'
// (e.g. "tz_seed:ward:56"), so the value is split ONLY at the FIRST ':'.
const PROVIDER_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const PROVIDER_PLACE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/;

export interface ParsedPlaceRef {
  providerKey: string;
  providerPlaceId: string;
}

/** Returns null for anything that is not exactly one well-formed reference. */
export function parsePlaceRefParam(raw: unknown): ParsedPlaceRef | null {
  if (typeof raw !== 'string') return null; // absent, repeated (array) or object params
  if (raw.length === 0 || raw.length > 110 || raw !== raw.trim()) return null;
  const i = raw.indexOf(':');
  if (i < 1) return null;
  const providerKey = raw.slice(0, i);
  const providerPlaceId = raw.slice(i + 1);
  if (!PROVIDER_KEY.test(providerKey) || !PROVIDER_PLACE_ID.test(providerPlaceId)) return null;
  return { providerKey, providerPlaceId };
}
