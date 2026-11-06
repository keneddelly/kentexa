import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Separate otherwise-identical conversations by communication channel.
 * A buyer may contact the same SellerProfile through Kentexa and Instagram;
 * those threads must remain distinct so outbound replies use the right
 * transport. Existing rows retain their current channel value.
 */
export class AddConversationChannelUniqueness1795098000000 implements MigrationInterface {
  name = 'AddConversationChannelUniqueness1795098000000';

  private readonly indexes = [
    'idx_conversation_unique_workspace_with_profile',
    'idx_conversation_unique_workspace_no_profile',
    'idx_conversation_unique_legacy_with_profile',
    'idx_conversation_unique_legacy_no_profile',
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const name of this.indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS public."${name}"`);
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_conversation_unique_workspace_with_profile"
      ON public.conversation USING btree
      (seller_id, customer_id, channel, "ownerWorkspaceType", "ownerWorkspaceId", "commerceProfileId")
      WHERE "ownerWorkspaceType" IS NOT NULL AND "commerceProfileId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_conversation_unique_workspace_no_profile"
      ON public.conversation USING btree
      (seller_id, customer_id, channel, "ownerWorkspaceType", "ownerWorkspaceId")
      WHERE "ownerWorkspaceType" IS NOT NULL AND "commerceProfileId" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_conversation_unique_legacy_with_profile"
      ON public.conversation USING btree
      (seller_id, customer_id, channel, "commerceProfileId")
      WHERE "ownerWorkspaceType" IS NULL AND "commerceProfileId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_conversation_unique_legacy_no_profile"
      ON public.conversation USING btree
      (seller_id, customer_id, channel)
      WHERE "ownerWorkspaceType" IS NULL AND "commerceProfileId" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of this.indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS public."${name}"`);
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_conversation_unique_workspace_with_profile"
      ON public.conversation USING btree
      (seller_id, customer_id, "ownerWorkspaceType", "ownerWorkspaceId", "commerceProfileId")
      WHERE "ownerWorkspaceType" IS NOT NULL AND "commerceProfileId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_conversation_unique_workspace_no_profile"
      ON public.conversation USING btree
      (seller_id, customer_id, "ownerWorkspaceType", "ownerWorkspaceId")
      WHERE "ownerWorkspaceType" IS NOT NULL AND "commerceProfileId" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_conversation_unique_legacy_with_profile"
      ON public.conversation USING btree
      (seller_id, customer_id, "commerceProfileId")
      WHERE "ownerWorkspaceType" IS NULL AND "commerceProfileId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_conversation_unique_legacy_no_profile"
      ON public.conversation USING btree
      (seller_id, customer_id)
      WHERE "ownerWorkspaceType" IS NULL AND "commerceProfileId" IS NULL
    `);
  }
}
