import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSuperAgentOnboardingActivation1791514900000 implements MigrationInterface {
  name = 'RemoveSuperAgentOnboardingActivation1791514900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS public.super_agent_onboarding_audit');
    await queryRunner.query('DROP TABLE IF EXISTS public.super_agent_onboarding_officer');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.super_agent_onboarding_officer (
        "userId" integer PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
        "grantedByUserId" integer NOT NULL REFERENCES public."user"(id),
        "grantedAt" timestamptz NOT NULL DEFAULT now(),
        "revokedAt" timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE TABLE public.super_agent_onboarding_audit (
        id bigserial PRIMARY KEY,
        "actorUserId" integer NOT NULL REFERENCES public."user"(id),
        "subjectUserId" integer REFERENCES public."user"(id),
        "superAgentId" integer,
        action varchar(48) NOT NULL,
        note text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
}
