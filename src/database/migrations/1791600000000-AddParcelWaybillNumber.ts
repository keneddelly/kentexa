import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One waybill number per parcel (marketplace-basic step 2).
 *
 * Format: KTX + 9 random digits + 1 Luhn check digit, e.g. KTX4829103752
 * (printed "KTX 4829 1037 52"). See src/shipments/waybill.ts.
 *
 * - Random, not sequential: nobody can guess another parcel's number.
 *   Digits come from gen_random_uuid() (cryptographically strong).
 * - Unique: the generator re-draws if the number already exists, and a
 *   unique index is the final guard.
 * - NEW parcels only: the column is added WITHOUT a default first, so no
 *   existing row is filled; the default is attached afterwards and only
 *   fires on INSERT. Every insert path (the Super Agent counter, the send
 *   form, raw SQL) gets a number from the database with no code change.
 * - Old numbers (Parcel.trackingNumber) are never touched.
 */
export class AddParcelWaybillNumber1791600000000 implements MigrationInterface {
  name = 'AddParcelWaybillNumber1791600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.kentexa_waybill_check_digit(body text)
      RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
      DECLARE
        total integer := 0;
        digit integer;
        dbl boolean := true;
      BEGIN
        FOR i IN REVERSE length(body)..1 LOOP
          digit := substr(body, i, 1)::integer;
          IF dbl THEN
            digit := digit * 2;
            IF digit > 9 THEN digit := digit - 9; END IF;
          END IF;
          total := total + digit;
          dbl := NOT dbl;
        END LOOP;
        RETURN (10 - (total % 10)) % 10;
      END $$`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.kentexa_generate_waybill()
      RETURNS varchar LANGUAGE plpgsql VOLATILE AS $$
      DECLARE
        body text;
        candidate varchar;
      BEGIN
        FOR attempt IN 1..10 LOOP
          body := lpad(((('x' || substr(md5(gen_random_uuid()::text), 1, 15))::bit(60)::bigint) % 1000000000)::text, 9, '0');
          candidate := 'KTX' || body || public.kentexa_waybill_check_digit(body)::text;
          IF NOT EXISTS (SELECT 1 FROM public.parcel WHERE "waybillNumber" = candidate) THEN
            RETURN candidate;
          END IF;
        END LOOP;
        RAISE EXCEPTION 'Could not generate a unique waybill number';
      END $$`);

    await queryRunner.query(`ALTER TABLE public.parcel ADD COLUMN IF NOT EXISTS "waybillNumber" varchar(16) NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_parcel_waybillNumber" ON public.parcel ("waybillNumber")`);
    await queryRunner.query(`ALTER TABLE public.parcel ALTER COLUMN "waybillNumber" SET DEFAULT public.kentexa_generate_waybill()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.parcel ALTER COLUMN "waybillNumber" DROP DEFAULT`);
    await queryRunner.query(`DROP INDEX IF EXISTS public."UQ_parcel_waybillNumber"`);
    await queryRunner.query(`ALTER TABLE public.parcel DROP COLUMN IF EXISTS "waybillNumber"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS public.kentexa_generate_waybill()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS public.kentexa_waybill_check_digit(text)`);
  }
}
