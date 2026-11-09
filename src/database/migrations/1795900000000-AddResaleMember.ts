import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Uza tena" members (owner 2026-11-10): reseller prices show only to people who joined as
 * resellers (one tap, verified phone, three rules; no admin approval). resale_member records who
 * joined and when they accepted the rules. People who already made an offer are members from
 * their first offer (rules not yet accepted; asked on their next visit).
 *
 * Additive only. Owner rule: never run down() on live.
 */
export class AddResaleMember1795900000000 implements MigrationInterface {
  name = 'AddResaleMember1795900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.resale_member (
      "userId" int PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
      "joinedAt" timestamptz NOT NULL DEFAULT now(),
      "rulesAcceptedAt" timestamptz NULL,
      "isActive" boolean NOT NULL DEFAULT true)`);
    await q.query(`INSERT INTO public.resale_member ("userId", "joinedAt")
      SELECT o."resellerUserId", MIN(o."createdAt") FROM public.resale_offer o GROUP BY o."resellerUserId"
      ON CONFLICT ("userId") DO NOTHING`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Owner rule: never run down() on live. Kept for local resets only.
    await q.query(`DROP TABLE IF EXISTS public.resale_member`);
  }
}
