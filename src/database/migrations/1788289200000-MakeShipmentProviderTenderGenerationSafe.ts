import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Van Pilot Readiness correction.
 *
 * Direct Shipment->provider authority is durable, but each movement tender is
 * deliberately one-use. The application derives a stable base idempotency key
 * from shipment/parcel/provider. Before this migration, a legitimate
 * pre-load cancellation followed by rescheduling hit the already-consumed
 * base-key tender and could never obtain fresh one-use authority.
 *
 * Keep the application-level authority model unchanged and make the database
 * key generation-safe. A BEFORE INSERT trigger serializes generation issuance
 * for the stable base key. Terminal prior generations receive :gN suffixes;
 * an OPEN generation remains idempotent only for the same run/load stop and
 * fails closed if a caller attempts to reinterpret it for another movement.
 * Super-Agent release tenders are intentionally untouched.
 */
export class MakeShipmentProviderTenderGenerationSafe1788289200000
  implements MigrationInterface
{
  name = 'MakeShipmentProviderTenderGenerationSafe1788289200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.allocate_shipment_provider_tender_generation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE
        base_key text;
        existing_row public.parcel_movement_tender%ROWTYPE;
        next_generation integer;
      BEGIN
        IF NEW.source <> 'shipment_provider_booking' THEN
          RETURN NEW;
        END IF;

        base_key := regexp_replace(NEW."idempotencyKey", ':g[0-9]+$', '');

        -- Serialize issuance even when no row for the next generation exists
        -- yet. createAssignment already locks the Parcel first; this advisory
        -- lock additionally protects direct SQL/concurrent generation races.
        PERFORM pg_advisory_xact_lock(hashtext(base_key));

        SELECT * INTO existing_row
          FROM public.parcel_movement_tender
         WHERE "idempotencyKey" = base_key
         FOR UPDATE;

        IF FOUND AND existing_row.status = 'open' THEN
          -- An OPEN authority may only be retried for the movement it was
          -- minted for. Never reinterpret an old open token for another Run.
          IF existing_row."parcelId" <> NEW."parcelId"
             OR existing_row."transportProviderId" <> NEW."transportProviderId"
             OR existing_row."runId" IS DISTINCT FROM NEW."runId"
             OR existing_row."loadRunStopId" IS DISTINCT FROM NEW."loadRunStopId" THEN
            RAISE EXCEPTION 'Open shipment-provider movement tender belongs to a different movement'
              USING ERRCODE = '23505';
          END IF;
          RETURN NEW;
        END IF;

        IF FOUND THEN
          SELECT COALESCE(MAX(
            CASE
              WHEN "idempotencyKey" = base_key THEN 0
              WHEN "idempotencyKey" ~ (':g[0-9]+$')
                THEN substring("idempotencyKey" from ':g([0-9]+)$')::integer
              ELSE 0
            END
          ), 0) + 1
          INTO next_generation
          FROM public.parcel_movement_tender
          WHERE "idempotencyKey" = base_key
             OR "idempotencyKey" ~ ('^' || regexp_replace(base_key, '([\\.\\+\\*\\?\\[\\^\\]\\$\\(\\)\\{\\}=!<>|:\\-])', '\\\\\1', 'g') || ':g[0-9]+$');

          NEW."idempotencyKey" := base_key || ':g' || next_generation::text;
        END IF;

        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_shipment_provider_tender_generation"
      ON public.parcel_movement_tender
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_shipment_provider_tender_generation"
      BEFORE INSERT ON public.parcel_movement_tender
      FOR EACH ROW
      WHEN (NEW.source = 'shipment_provider_booking')
      EXECUTE FUNCTION public.allocate_shipment_provider_tender_generation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_shipment_provider_tender_generation"
      ON public.parcel_movement_tender
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS public.allocate_shipment_provider_tender_generation()
    `);
  }
}
