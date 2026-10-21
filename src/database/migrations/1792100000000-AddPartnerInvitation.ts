import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Partner invitations (owner 2026-10-21). ONE new table and its three enum types.
 * Nothing existing is changed: no column is added to super_agent, transport_provider
 * or parcel. See src/partner-invitations/partner-invitation.entity.ts.
 *
 * partner_invitation: one row per invitation a Super Agent sends for one waybill.
 *   status sent → opened → joined (role application submitted) → confirmed (the
 *   inviting office confirms the person); sent/opened → expired after 7 days.
 *   "tokenHash" is sha256 of the signed link; the link itself is never stored.
 *   "joinedApplicationId" is transport_provider.id or super_agent.id per
 *   "roleOffered" (no FK: it points at one of two tables).
 *
 * Owner rule: never run down() on live.
 */
export class AddPartnerInvitation1792100000000 implements MigrationInterface {
  name = 'AddPartnerInvitation1792100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE public.partner_invitation_role_enum AS ENUM ('transport_provider', 'super_agent');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE public.partner_invitation_channel_enum AS ENUM ('whatsapp', 'own_sms');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE public.partner_invitation_status_enum AS ENUM ('sent', 'opened', 'joined', 'confirmed', 'expired');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.partner_invitation (
        id SERIAL PRIMARY KEY,
        "invitedBySuperAgentId" integer NOT NULL REFERENCES public.super_agent(id) ON DELETE CASCADE,
        "invitedByUserId" integer NULL REFERENCES public."user"(id) ON DELETE SET NULL,
        "parcelId" integer NOT NULL REFERENCES public.parcel(id) ON DELETE CASCADE,
        "waybillNumber" varchar(16) NOT NULL,
        "invitedPhone" varchar(20) NOT NULL,
        "invitedName" varchar(100) NULL,
        "roleOffered" public.partner_invitation_role_enum NOT NULL,
        channel public.partner_invitation_channel_enum NOT NULL,
        "tokenHash" varchar(64) NOT NULL,
        status public.partner_invitation_status_enum NOT NULL DEFAULT 'sent',
        "expiresAt" timestamp NOT NULL,
        "openedAt" timestamp NULL,
        "joinedAt" timestamp NULL,
        "joinedUserId" integer NULL REFERENCES public."user"(id) ON DELETE SET NULL,
        "joinedApplicationId" integer NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_partner_invitation_tokenHash" UNIQUE ("tokenHash")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_partner_invitation_inviter_status" ON public.partner_invitation ("invitedBySuperAgentId", status)`);
    // accept/onApplicationSubmitted look up by the accepting account.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_partner_invitation_joined_user" ON public.partner_invitation ("joinedUserId") WHERE "joinedUserId" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.partner_invitation`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.partner_invitation_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.partner_invitation_channel_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.partner_invitation_role_enum`);
  }
}
