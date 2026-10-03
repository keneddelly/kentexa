import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Van Pilot Readiness correction.
 *
 * A Shipment->provider booking is durable authority, while each movement
 * tender is deliberately one-use. The application derives a stable base key
 * from shipment/parcel/provider. Once the first tender was consumed, that
 * stable key previously resolved the consumed row forever, preventing a
 * legitimate pre-load cancellation from being rescheduled.
 *
 * This migration makes that stable authority generation-safe without
 * weakening provider, hub, or custody checks in ParcelRunAssignmentService.
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

        -- Serialize generation issuance even before the next row exists.
        -- createAssignment also locks the Parcel first, so normal service
        -- calls retain the established parcel -> run -> tender lock order.
        PERFORM pg_advisory_xact_lock(hashtext(base_key));

        SELECT * INTO existing_row
          FROM public.parcel_movement_tender
         WHERE "idempotencyKey" = base_key
         FOR UPDATE;

        IF FOUND AND existing_row.status = 'open' THEN
          -- An OPEN generation is idempotent only for the movement for which
          -- it was minted. Never reinterpret it for another Run/load stop.
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
              ELSE substring("idempotencyKey" from ':g([0-9]+)$')::integer
            END
          ), 0) + 1
            INTO next_generation
            FROM public.parcel_movement_tender
           WHERE "idempotencyKey" = base_key
              OR "idempotencyKey" LIKE base_key || ':g%';

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
