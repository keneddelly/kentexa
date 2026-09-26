import { MigrationInterface, QueryRunner } from 'typeorm';

/** Pending hub-to-local-agent proof only. Existing parcels are untouched. */
export class AddParcelAgentHandoffChallenge1788279600000 implements MigrationInterface {
  name = 'AddParcelAgentHandoffChallenge1788279600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.parcel
      ADD COLUMN IF NOT EXISTS "agentHandoffCodeHash" varchar(128),
      ADD COLUMN IF NOT EXISTS "agentHandoffCodeExpiresAt" timestamp,
      ADD COLUMN IF NOT EXISTS "agentHandoffCodeIssuedAt" timestamp,
      ADD COLUMN IF NOT EXISTS "agentHandoffAgentUserId" integer,
      ADD COLUMN IF NOT EXISTS "agentHandoffHubId" integer,
      ADD COLUMN IF NOT EXISTS "agentHandoffAttempts" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE public.parcel
      ADD CONSTRAINT "CHK_parcel_agent_handoff_challenge" CHECK (
        ("agentHandoffCodeHash" IS NULL AND "agentHandoffCodeExpiresAt" IS NULL
          AND "agentHandoffCodeIssuedAt" IS NULL AND "agentHandoffAgentUserId" IS NULL
          AND "agentHandoffHubId" IS NULL)
        OR ("agentHandoffCodeHash" IS NOT NULL AND "agentHandoffCodeExpiresAt" IS NOT NULL
          AND "agentHandoffCodeIssuedAt" IS NOT NULL AND "agentHandoffAgentUserId" IS NOT NULL
          AND "agentHandoffHubId" IS NOT NULL)
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE public.parcel IN ACCESS EXCLUSIVE MODE');
    const [{ pending }] = await queryRunner.query(`SELECT COUNT(*)::int AS pending FROM public.parcel
      WHERE "agentHandoffCodeHash" IS NOT NULL`);
    if (pending > 0) throw new Error('Cannot remove pending agent handoff challenges');
    await queryRunner.query(`ALTER TABLE public.parcel DROP CONSTRAINT "CHK_parcel_agent_handoff_challenge"`);
    await queryRunner.query(`ALTER TABLE public.parcel
      DROP COLUMN "agentHandoffCodeHash", DROP COLUMN "agentHandoffCodeExpiresAt",
      DROP COLUMN "agentHandoffCodeIssuedAt", DROP COLUMN "agentHandoffAgentUserId",
      DROP COLUMN "agentHandoffHubId", DROP COLUMN "agentHandoffAttempts"`);
  }
}
