import { MigrationInterface, QueryRunner } from 'typeorm';
import { DAR_COMMON_PLACES } from '../../tz-location/dar-common-places';

/**
 * Common Dar es Salaam places in the place picker (owner 2026-11-02: "add many common
 * places in Dar es Salaam so the engine can be more realistic"). Each place from
 * src/tz-location/dar-common-places.ts becomes a searchable row in tz_ward under its
 * district, so "Mwenge", "Posta" or "Tabata Relini" are found and priced by their zone.
 *
 * Additive and safe to run twice: a name that already exists anywhere in Dar es Salaam is
 * skipped, and nothing happens when the location tables or the district are not there.
 * Coordinates stay empty: KenteXa does not invent a map point.
 * Every parameter is cast (::varchar): without it PostgreSQL refuses the statement
 * ("inconsistent types deduced for parameter" one), which stopped the 2026-11-02 deploy.
 * Owner rule: never run down() on live.
 */
export class AddDarCommonPlaces1794300000000 implements MigrationInterface {
  name = 'AddDarCommonPlaces1794300000000';

  public async up(q: QueryRunner): Promise<void> {
    const [t] = await q.query(`SELECT to_regclass('public.tz_ward') IS NOT NULL AS w, to_regclass('public.tz_district') IS NOT NULL AS d`);
    if (!t?.w || !t?.d) return;
    for (const p of DAR_COMMON_PLACES) {
      await q.query(
        `INSERT INTO public.tz_ward (name, "nameSw", district_id, region_id, "isUrban", "isActive", "densityClass")
         SELECT $1::varchar, $1::varchar, d.id, d.region_id, true, true, 'high'
           FROM public.tz_district d JOIN public.tz_region r ON r.id = d.region_id
          WHERE r.name = 'Dar es Salaam' AND d.name = $2::varchar
            AND NOT EXISTS (SELECT 1 FROM public.tz_ward w WHERE w.region_id = d.region_id AND lower(w.name) = lower($1::varchar))
          LIMIT 1`,
        [p.name, p.district],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    // Removes only rows this migration could have added (no coordinates, same names).
    const [t] = await q.query(`SELECT to_regclass('public.tz_ward') IS NOT NULL AS w`);
    if (!t?.w) return;
    await q.query(
      `DELETE FROM public.tz_ward w USING public.tz_region r
        WHERE r.id = w.region_id AND r.name = 'Dar es Salaam' AND w.lat IS NULL AND w.lng IS NULL AND w.name = ANY($1::varchar[])`,
      [DAR_COMMON_PLACES.map((p) => p.name)],
    );
  }
}
