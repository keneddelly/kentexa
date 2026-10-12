import { mapsDirectionsUrl, roughDistanceLabel } from '../shipments/pickup-pin';

/**
 * Same-city door pickup with no agent available (KNOWN_FAULTS #24): instead of
 * a dead end, point the sender to the nearest active Super Agent office so
 * they can bring the parcel in themselves.
 */
export const NO_AGENT_NOW = {
  code: 'NO_AGENT_NOW',
  message: 'Hakuna wakala sasa hivi. Peleka mzigo ofisini.',
} as const;

export interface NearestOffice {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  mapsUrl: string | null;
  distance: string | null;
}

// Only active offices of the same city/region (by name) that HAVE a map point
// (set by the office itself, "Weka mahali pa ofisi"); nearest to the pickup
// place first. An office without a map point is never shown: without one the
// card could only guess, and could pick a test office.
const NEAREST_OFFICE_SQL = `
  SELECT sa.id, sa."businessName" AS name, sa.phone, sa.address, sa.latitude, sa.longitude,
         CASE WHEN $1::float8 IS NULL OR sa.latitude IS NULL OR sa.longitude IS NULL THEN NULL
              ELSE 2 * 6371000 * asin(sqrt(
                power(sin(radians((sa.latitude - $1::float8) / 2)), 2) +
                cos(radians($1::float8)) * cos(radians(sa.latitude)) *
                power(sin(radians((sa.longitude - $2::float8) / 2)), 2))) END AS "distanceM"
    FROM public.super_agent sa
   WHERE sa.status = 'active' AND sa."isTrainingOffice" = false AND sa.latitude IS NOT NULL AND sa.longitude IS NOT NULL
     AND (lower(btrim(sa.city)) = lower(btrim($3)) OR lower(btrim(COALESCE(sa."regionName", ''))) = lower(btrim($3)))
   ORDER BY "distanceM" ASC NULLS LAST, sa.id ASC   -- no pickup point: lowest id among offices WITH a point
   LIMIT 1`;

export async function findNearestOffice(
  db: { query(sql: string, params?: any[]): Promise<any> },
  city: string,
  point: { latitude: number; longitude: number } | null,
): Promise<NearestOffice | null> {
  if (!city?.trim()) return null;
  const rows: any[] = await db.query(NEAREST_OFFICE_SQL, [point?.latitude ?? null, point?.longitude ?? null, city.trim()]);
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) return null;
  const hasPoint = r.latitude != null && r.longitude != null;
  return {
    id: Number(r.id),
    name: r.name,
    phone: r.phone || null,
    address: r.address || null,
    mapsUrl: hasPoint ? mapsDirectionsUrl(Number(r.latitude), Number(r.longitude)) : null,
    distance: r.distanceM == null ? null : roughDistanceLabel(Number(r.distanceM)),
  };
}
