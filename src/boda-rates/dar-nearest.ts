import { darMatch } from './dar-boda-zones';

/**
 * The Dar zone place nearest a map point (owner 2026-11-08: "it uses the location name instead of
 * coordinates"): the closest location-seed ward with a point, within 6 km, read by the zone table.
 * null when the point is not near any (never a guess).
 */
export async function nearestDarPlace(db: { query: (sql: string, p?: any[]) => Promise<any[]> } | null | undefined,
  point: { latitude: number; longitude: number } | null | undefined) {
  if (!db || !point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
  const [w] = await db.query(
    `SELECT w.name, sqrt(power((w.lat::float8 - $1::float8) * 111.32, 2) + power((w.lng::float8 - $2::float8) * 111.32 * cos(radians($1::float8)), 2)) AS km
       FROM public.tz_ward w JOIN public.tz_region r ON r.id = w.region_id
      WHERE r.name = 'Dar es Salaam' AND w.lat IS NOT NULL AND w.lng IS NOT NULL AND w."isActive" = true
      ORDER BY km ASC LIMIT 1`, [point.latitude, point.longitude]).catch(() => []);
  if (!w || !(Number(w.km) <= 6)) return null;
  return darMatch(String(w.name));
}
