import { MigrationInterface, QueryRunner } from 'typeorm';

/** Issue #488: structured inline references are stored separately from original post text. */
export class AddInlineReferencesToBusinessFeedItem1795801000000 implements MigrationInterface {
  name = 'AddInlineReferencesToBusinessFeedItem1795801000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.business_feed_item ADD COLUMN IF NOT EXISTS "inlineReferences" jsonb NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.business_feed_item DROP COLUMN IF EXISTS "inlineReferences"`);
  }
}
