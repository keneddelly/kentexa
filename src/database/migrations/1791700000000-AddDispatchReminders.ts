import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Received but not dispatched" reminder (marketplace-basic item 3).
 * Two NEW tables only. Nothing existing is changed.
 *
 * parcel_still_here_mark: one row per "Still here" tap, never updated or
 *   deleted, so admins can see every mark. hiddenUntil = the next day's
 *   check time (default 22:00), Tanzania time.
 * super_agent_dispatch_reminder: one row per office per day. The unique
 *   (superAgentId, reminderDate) key is what makes "one SMS per office per
 *   day, never more" hold even with restarts or several servers.
 */
export class AddDispatchReminders1791700000000 implements MigrationInterface {
  name = 'AddDispatchReminders1791700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.parcel_still_here_mark (
        id SERIAL PRIMARY KEY,
        "parcelId" integer NOT NULL REFERENCES public.parcel(id) ON DELETE CASCADE,
        "superAgentId" integer NOT NULL,
        "markedByUserId" integer NOT NULL,
        "markedAt" timestamptz NOT NULL DEFAULT now(),
        "hiddenUntil" timestamptz NOT NULL
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_still_here_parcel" ON public.parcel_still_here_mark ("parcelId", "hiddenUntil")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_still_here_office_time" ON public.parcel_still_here_mark ("superAgentId", "markedAt")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.super_agent_dispatch_reminder (
        id SERIAL PRIMARY KEY,
        "superAgentId" integer NOT NULL,
        "reminderDate" date NOT NULL,
        "parcelCount" integer NOT NULL,
        phone varchar(32) NULL,
        status varchar(16) NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        "lastError" text NULL,
        "sentAt" timestamptz NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_dispatch_reminder_office_day" UNIQUE ("superAgentId", "reminderDate"),
        CONSTRAINT "CHK_dispatch_reminder_status" CHECK (status IN ('sending', 'sent', 'failed', 'no_phone'))
      )`);

    // The red list looks up "received at this office" in the custody ledger.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_custody_origin_received" ON public.parcel_custody_event ("parcelId", "recordedAt") WHERE "eventKind" = 'origin_hub_received'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS public."IDX_custody_origin_received"`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.super_agent_dispatch_reminder`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.parcel_still_here_mark`);
  }
}
