import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Training office ("ofisi ya mafunzo"), owner decision 2026-10-12. Adds columns
 * only; every existing row gets false, so nothing changes until an admin marks
 * an office.
 *
 * super_agent."isTrainingOffice": the office works fully for its own staff but
 *   never appears to customers or other businesses (office pickers, automatic
 *   destination office, route stops, transfer destinations, the no-agent card),
 *   and sends no real SMS (the text is shown on screen instead).
 * commerce_profile."hiddenFromPublic": a profile that public profile pages,
 *   search and discovery never show. Set together with the office mark.
 *
 * NOT NULL DEFAULT false with a constant default is a metadata-only change in
 * PostgreSQL 11+ (no table rewrite).
 */
export class AddTrainingOffice1791900000000 implements MigrationInterface {
  name = 'AddTrainingOffice1791900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.super_agent
        ADD COLUMN IF NOT EXISTS "isTrainingOffice" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`
      ALTER TABLE public.commerce_profile
        ADD COLUMN IF NOT EXISTS "hiddenFromPublic" boolean NOT NULL DEFAULT false`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.commerce_profile DROP COLUMN IF EXISTS "hiddenFromPublic"`);
    await queryRunner.query(`ALTER TABLE public.super_agent DROP COLUMN IF EXISTS "isTrainingOffice"`);
  }
}
