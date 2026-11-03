import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Team invitations (owner approved 2026-11-03: "when a cashier is invited she can see the invitation
 * and join KenteXa ... access the POS").
 *   team_invitation   the owner (or a manager) invites a person by name and phone to a business
 *                     (commerce profile). The person sees it (in-app notification, or a link the
 *                     owner sends from their own WhatsApp/SMS) and taps Kubali or Kataa. Only on
 *                     Kubali does the person join the team; the token in the link is single-use.
 *   backfill          Kazi -> Timu saved members to commerce_profile_member while the POS and every
 *                     seller tool read business_team_member, so staff added on Timu could not work.
 *                     Every active Timu member is copied into business_team_member (the owner of the
 *                     profile is the seller; with several rows, the one with the most permissions),
 *                     unless that person already has a row there.
 * Additive. Owner rule: never run down() on live.
 */
export class AddTeamInvitation1795100000000 implements MigrationInterface {
  name = 'AddTeamInvitation1795100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.team_invitation (
      id SERIAL PRIMARY KEY,
      "commerceProfileId" integer NOT NULL,
      "sellerId" integer NOT NULL,
      "invitedByUserId" integer NOT NULL,
      name varchar(120) NOT NULL,
      phone varchar(20) NOT NULL,
      role varchar(40) NOT NULL DEFAULT 'sales',
      permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
      token varchar(48) NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'pending',
      "userId" integer NULL,
      "respondedAt" timestamptz NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_team_invitation_token" ON public.team_invitation (token)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_team_invitation_pending" ON public.team_invitation ("commerceProfileId", phone) WHERE status = 'pending'`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_team_invitation_phone" ON public.team_invitation (phone) WHERE status = 'pending'`);
    await q.query(`
      INSERT INTO public.business_team_member (seller_id, user_id, role, permissions, "isActive", "joinedAt", "createdAt", "updatedAt")
      SELECT DISTINCT ON (cp."ownerId", m."userId") cp."ownerId", m."userId", m.role, m.permissions, true, m."createdAt", now(), now()
      FROM public.commerce_profile_member m
      JOIN public.commerce_profile cp ON cp.id = m."commerceProfileId"
      WHERE m."isActive" = true AND m."userId" <> cp."ownerId"
        AND NOT EXISTS (SELECT 1 FROM public.business_team_member t WHERE t.seller_id = cp."ownerId" AND t.user_id = m."userId")
      ORDER BY cp."ownerId", m."userId",
        (SELECT count(*) FROM jsonb_each(COALESCE(m.permissions, '{}'::jsonb)) e WHERE e.value = 'true'::jsonb) DESC, m."createdAt" DESC`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.team_invitation`);
  }
}
