import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowInstagramTokenErasure1795070000000 implements MigrationInterface {
  name = 'AllowInstagramTokenErasure1795070000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.instagram_business_connection
      ALTER COLUMN "accessTokenEncrypted" DROP NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE public.instagram_business_connection
      SET "accessTokenEncrypted" = ''
      WHERE "accessTokenEncrypted" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE public.instagram_business_connection
      ALTER COLUMN "accessTokenEncrypted" SET NOT NULL
    `);
  }
}
