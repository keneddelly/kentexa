import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seller partner agents (owner 2026-10-22). A seller (e.g. BIS) invites the
 * person who delivers for them to work with them on KenteXa as an agent. The
 * invitation goes by the seller's own WhatsApp or SMS (never KenteXa SMS).
 *
 * One row = one invitation, and, once the invited number accepts, the
 * partnership itself (status 'accepted') until either side ends it.
 * The agent stays a normal agent (approved by the normal process, free to take
 * other jobs, free to leave): the only effect is that the seller's own pickup
 * jobs are offered to their partner agents first, for a few minutes.
 *
 * New table only; nothing existing changes. Code checks the table exists before
 * using it, so the release is safe in either order.
 * Owner rule: never run down() on live.
 */
export class AddSellerAgentPartner1792400000000 implements MigrationInterface {
  name = 'AddSellerAgentPartner1792400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.seller_agent_partner (
      id SERIAL PRIMARY KEY,
      "sellerUserId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
      "invitedByUserId" integer NULL REFERENCES public."user"(id) ON DELETE SET NULL,
      "invitedPhone" varchar(20) NOT NULL,
      "invitedName" varchar(100) NULL,
      channel varchar(16) NOT NULL,
      "tokenHash" varchar(64) NOT NULL UNIQUE,
      status varchar(16) NOT NULL DEFAULT 'sent',
      "expiresAt" timestamp NOT NULL,
      "openedAt" timestamp NULL,
      "acceptedAt" timestamp NULL,
      "agentUserId" integer NULL REFERENCES public."user"(id) ON DELETE SET NULL,
      "endedAt" timestamp NULL,
      "endedBy" varchar(16) NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_seller_agent_partner_status" CHECK (status IN ('sent','opened','accepted','ended','expired')),
      CONSTRAINT "CHK_seller_agent_partner_channel" CHECK (channel IN ('whatsapp','sms')),
      CONSTRAINT "CHK_seller_agent_partner_accepted" CHECK (
        status NOT IN ('accepted') OR ("agentUserId" IS NOT NULL AND "acceptedAt" IS NOT NULL)),
      CONSTRAINT "CHK_seller_agent_partner_ended" CHECK (
        status <> 'ended' OR ("endedAt" IS NOT NULL AND "endedBy" IN ('seller','agent')))
    )`);
    // One live partnership per seller and agent.
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_seller_agent_partner_active"
      ON public.seller_agent_partner ("sellerUserId", "agentUserId") WHERE status = 'accepted'`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_seller_agent_partner_seller"
      ON public.seller_agent_partner ("sellerUserId", status)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_seller_agent_partner_agent"
      ON public.seller_agent_partner ("agentUserId", status)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.seller_agent_partner`);
  }
}
