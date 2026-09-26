import { MigrationInterface, QueryRunner } from 'typeorm';

/** Recipient-held proof for the last-mile Agent handover. No historical backfill. */
export class AddParcelAgentDeliveryChallenge1788280200000 implements MigrationInterface {
  name = 'AddParcelAgentDeliveryChallenge1788280200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.parcel
      ADD COLUMN IF NOT EXISTS "agentDeliveryCodeHash" varchar(128),
      ADD COLUMN IF NOT EXISTS "agentDeliveryCodeExpiresAt" timestamp,
      ADD COLUMN IF NOT EXISTS "agentDeliveryCodeIssuedAt" timestamp,
      ADD COLUMN IF NOT EXISTS "agentDeliveryAgentUserId" integer,
      ADD COLUMN IF NOT EXISTS "agentDeliveryRecipientPhone" varchar(32),
      ADD COLUMN IF NOT EXISTS "agentDeliveryAttempts" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE public.parcel ADD CONSTRAINT "CHK_parcel_agent_delivery_challenge" CHECK (
      ("agentDeliveryCodeHash" IS NULL AND "agentDeliveryCodeExpiresAt" IS NULL
        AND "agentDeliveryCodeIssuedAt" IS NULL AND "agentDeliveryAgentUserId" IS NULL
        AND "agentDeliveryRecipientPhone" IS NULL)
      OR ("agentDeliveryCodeHash" IS NOT NULL AND "agentDeliveryCodeExpiresAt" IS NOT NULL
        AND "agentDeliveryCodeIssuedAt" IS NOT NULL AND "agentDeliveryAgentUserId" IS NOT NULL
        AND "agentDeliveryRecipientPhone" IS NOT NULL)
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE public.parcel IN ACCESS EXCLUSIVE MODE');
    const [{ pending }] = await queryRunner.query(`SELECT COUNT(*)::int AS pending FROM public.parcel
      WHERE "agentDeliveryCodeHash" IS NOT NULL`);
    if (pending > 0) throw new Error('Cannot remove pending Agent delivery challenges');
    await queryRunner.query('ALTER TABLE public.parcel DROP CONSTRAINT "CHK_parcel_agent_delivery_challenge"');
    await queryRunner.query(`ALTER TABLE public.parcel
      DROP COLUMN "agentDeliveryCodeHash", DROP COLUMN "agentDeliveryCodeExpiresAt",
      DROP COLUMN "agentDeliveryCodeIssuedAt", DROP COLUMN "agentDeliveryAgentUserId",
      DROP COLUMN "agentDeliveryRecipientPhone", DROP COLUMN "agentDeliveryAttempts"`);
  }
}
