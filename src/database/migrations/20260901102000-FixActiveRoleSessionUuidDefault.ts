import { MigrationInterface, QueryRunner } from 'typeorm';

/** Align the Phase A session table with @PrimaryGeneratedColumn('uuid'). */
export class FixActiveRoleSessionUuidDefault20260901102000
  implements MigrationInterface
{
  name = 'FixActiveRoleSessionUuidDefault20260901102000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.active_role_session
      ALTER COLUMN id SET DEFAULT gen_random_uuid()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.active_role_session
      ALTER COLUMN id DROP DEFAULT
    `);
  }
}
