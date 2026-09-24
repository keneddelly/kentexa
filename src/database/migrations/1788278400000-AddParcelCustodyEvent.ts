import { MigrationInterface, QueryRunner } from 'typeorm';

/** Stage 3A1: empty custody evidence table. No backfill or event writer. */
export class AddParcelCustodyEvent1788278400000 implements MigrationInterface {
  name = 'AddParcelCustodyEvent1788278400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.parcel_custody_event (
        id SERIAL PRIMARY KEY,
        "parcelId" integer NOT NULL,
        "eventKind" character varying(64) NOT NULL,
        "operationKey" character varying(128) NOT NULL,
        "fromCustodianType" character varying(24),
        "fromCustodianId" integer,
        "toCustodianType" character varying(24),
        "toCustodianId" integer,
        "actorSource" character varying(24) NOT NULL,
        "actorUserId" integer,
        "actorAccountRoleId" integer,
        "actorWorkspaceId" integer,
        "hubId" integer,
        "assignmentId" integer,
        "evidenceRef" character varying(128),
        "recordedAt" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "FK_parcel_custody_parcel" FOREIGN KEY ("parcelId")
          REFERENCES public.parcel(id) ON DELETE RESTRICT,
        CONSTRAINT "CHK_parcel_custody_from" CHECK
          (("fromCustodianType" IS NULL) = ("fromCustodianId" IS NULL)),
        CONSTRAINT "CHK_parcel_custody_to" CHECK
          (("toCustodianType" IS NULL) = ("toCustodianId" IS NULL)),
        CONSTRAINT "CHK_parcel_custody_actor" CHECK
          (("actorSource" = 'account_role' AND "actorUserId" IS NOT NULL AND "actorAccountRoleId" IS NOT NULL)
           OR ("actorSource" IN ('system', 'provider_webhook', 'external')
               AND "actorUserId" IS NULL AND "actorAccountRoleId" IS NULL AND "actorWorkspaceId" IS NULL))
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_parcel_custody_operation"
      ON public.parcel_custody_event ("parcelId", "operationKey")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_parcel_custody_parcel_time"
      ON public.parcel_custody_event ("parcelId", "recordedAt", id)`);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public."fn_parcel_custody_immutable"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'parcel custody history is immutable' USING ERRCODE = '23514';
      END $$`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_parcel_custody_immutable" ON public.parcel_custody_event`);
    await queryRunner.query(`CREATE TRIGGER "TRG_parcel_custody_immutable"
      BEFORE UPDATE OR DELETE ON public.parcel_custody_event
      FOR EACH ROW EXECUTE FUNCTION public."fn_parcel_custody_immutable"()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse a destructive rollback once custody evidence has been written.
    const rows: { exists: boolean }[] = await queryRunner.query(
      `SELECT EXISTS(SELECT 1 FROM public.parcel_custody_event LIMIT 1) AS "exists"`,
    );
    if (rows[0]?.exists) throw new Error('Cannot revert a nonempty parcel custody ledger');
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_parcel_custody_immutable" ON public.parcel_custody_event`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS public."fn_parcel_custody_immutable"()`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.parcel_custody_event`);
  }
}
