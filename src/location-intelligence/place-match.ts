/**
 * place-match.ts — one rule for "is this the same place?" (owner 2026-11-08: "shipment is dead ...
 * KenteXa still has a location issue, it uses the location name instead of coordinates").
 *
 * Coordinates decide first (an agent's base or an office's point within a radius of the pickup);
 * names are the fallback, compared the same way everywhere:
 *   - letters only, lower case, without words like "mjini", "manispaa", "district", "region", "city";
 *   - Dar es Salaam however it is written ("Dar", "DSM", "Dar-es-salaam") and its districts
 *     (Ilala, Kinondoni, Temeke, Ubungo, Kigamboni) are one place.
 * Before this, the agent search compared the town letter for letter, the agent offer compared
 * lower(trim()) and the claim compared trim().toLowerCase(): an agent saved as "Kinondoni" or
 * "Dar" never got a Dar es Salaam job. Pure: no database.
 */

const DAR_KEYS = new Set(['daressalaam', 'daressalam', 'dar', 'dsm', 'ilala', 'kinondoni', 'temeke', 'ubungo', 'kigamboni']);
const NOISE = /\b(mjini|manispaa|municipal|municipality|district|region|mkoa|wilaya|city|council|cc|mc|dc|tc)\b/gi;

/** The comparable key of a place name ('' when there is none). */
export function placeKey(name: unknown): string {
  const k = String(name ?? '').toLowerCase().replace(NOISE, ' ').replace(/[^a-z]/g, '');
  if (!k) return '';
  return DAR_KEYS.has(k) ? 'daressalaam' : k;
}

/** Same place by name: both keys known (2+ letters) and equal. */
export function samePlace(a: unknown, b: unknown): boolean {
  const x = placeKey(a);
  return x.length >= 2 && x === placeKey(b);
}

/** Any name on one side is the same place as any name on the other. */
export function anySamePlace(left: unknown[], right: unknown[]): boolean {
  return left.some((a) => right.some((b) => samePlace(a, b)));
}

export interface GeoPoint { latitude: number; longitude: number }

/** A usable point, or null (never 0,0 or half a point). */
export function geoPoint(lat: unknown, lng: unknown): GeoPoint | null {
  if (lat == null || lng == null || lat === '' || lng === '') return null;
  const latitude = Number(lat); const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return null;
  return { latitude, longitude };
}

/** Great-circle distance in km. */
export function kmBetween(a: GeoPoint, b: GeoPoint): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const positive = (v: unknown, fallback: number) => (Number(v) > 0 ? Number(v) : fallback);
/** How far from his base an agent is offered a pickup (km). */
export const agentRadiusKm = (env: NodeJS.ProcessEnv = process.env) => positive(env.AGENT_PICKUP_RADIUS_KM, 25);
/** How far from its point an office counts as "in the sender's town" (km). */
export const officeRadiusKm = (env: NodeJS.ProcessEnv = process.env) => positive(env.OFFICE_ORIGIN_RADIUS_KM, 30);

/** SQL: the same key as placeKey() for a column or expression. */
export function placeKeySql(expr: string): string {
  const base = `regexp_replace(regexp_replace(lower(coalesce(${expr}, '')), '\\m(mjini|manispaa|municipal|municipality|district|region|mkoa|wilaya|city|council|cc|mc|dc|tc)\\M', ' ', 'g'), '[^a-z]', '', 'g')`;
  return `(CASE WHEN ${base} IN (${[...DAR_KEYS].map((k) => `'${k}'`).join(', ')}) THEN 'daressalaam' ELSE ${base} END)`;
}

/** SQL: km between two points (NULL when a side is missing). */
export function kmSql(lat1: string, lng1: string, lat2: string, lng2: string): string {
  return `(CASE WHEN ${lat1} IS NULL OR ${lng1} IS NULL OR ${lat2} IS NULL OR ${lng2} IS NULL THEN NULL
    ELSE 2 * 6371 * asin(least(1, sqrt(power(sin(radians((${lat2} - ${lat1}) / 2)), 2)
      + cos(radians(${lat1})) * cos(radians(${lat2})) * power(sin(radians((${lng2} - ${lng1}) / 2)), 2)))) END)`;
}

export interface AgentPlace {
  city?: string | null; district?: string | null; region?: string | null;
  baseLatitude?: unknown; baseLongitude?: unknown;
}

/**
 * Does an agent cover a pickup? By name (his city, district or region is the pickup's town) OR
 * by distance (his base within the radius of the pickup point). Never narrower than the old
 * name rule; coordinates only add agents and order them.
 */
export function agentCovers(agent: AgentPlace, where: { names: unknown[]; point?: GeoPoint | null }, env: NodeJS.ProcessEnv = process.env) {
  const base = geoPoint(agent.baseLatitude, agent.baseLongitude);
  const distanceKm = base && where.point ? kmBetween(base, where.point) : null;
  const byName = anySamePlace([agent.city, agent.district, agent.region], where.names);
  const byDistance = distanceKm != null && distanceKm <= agentRadiusKm(env);
  return { covers: byName || byDistance, byName, byDistance, distanceKm, hasBase: Boolean(base) };
}

/**
 * SQL condition: agent alias `a` covers a pickup in `cityExpr`, whose point is `latExpr/lngExpr`.
 * Same rule as agentCovers().
 */
export function agentCoversSql(cityExpr: string, latExpr: string, lngExpr: string, alias = 'a', env: NodeJS.ProcessEnv = process.env): string {
  const city = placeKeySql(cityExpr);
  // Read through to_jsonb(): an agent table without the district or region column still works.
  const names = ['city', 'district', 'region'].map((c) => `${placeKeySql(`to_jsonb(${alias})->>'${c}'`)} = ${city}`).join(' OR ');
  const km = kmSql(`${alias}."baseLatitude"`, `${alias}."baseLongitude"`, latExpr, lngExpr);
  return `((length(${city}) >= 2 AND (${names})) OR coalesce(${km} <= ${agentRadiusKm(env)}, false))`;
}
