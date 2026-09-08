import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Communication canonicality fix -- Conversation's two existing partial
 * unique indexes ((seller_id, customer_id) and (seller_id, customer_id,
 * "commerceProfileId")) key uniqueness ONLY on the seller's bare User.id.
 * Every one of a User's operational identities (Seller, Super Agent,
 * Transport Provider, Agent) shares the same User.id, so a buyer messaging
 * two different operational identities of the same person always collapsed
 * onto the same Conversation row -- confirmed against production: zero
 * conversations have ever been created with ownerWorkspaceType other than
 * 'seller_profile' or null.
 *
 * Stage 2 already added the correct discriminator (ownerWorkspaceType/
 * ownerWorkspaceId, mirroring RoleContext.profileType/profileId) but never
 * wired it into this uniqueness. This migration replaces the two indexes
 * with four, splitting first on whether ownerWorkspaceType is resolved:
 *
 *  - ownerWorkspaceType IS NOT NULL (a Stage-2-classified operational
 *    conversation): uniqueness includes (ownerWorkspaceType,
 *    ownerWorkspaceId), so a Seller conversation and a Super Agent
 *    conversation for the very same (seller_id, customer_id) pair are now
 *    distinct rows. commerceProfileId is still folded in for the
 *    with-profile case, preserving the existing Personal/Business
 *    CommerceProfile distinction for seller_profile-owned conversations.
 *  - ownerWorkspaceType IS NULL (every pre-Stage-2 LEGACY_UNSCOPED row,
 *    and any genuinely account-scope/personal conversation, which never
 *    gets an operational owner by design): uniqueness is EXACTLY the
 *    original two-index shape, unchanged -- these rows keep behaving
 *    exactly as they did before this migration.
 *
 * Additive in spirit even though it replaces two indexes: no column is
 * added, removed, or renamed, no row is written or altered, and down()
 * restores the original two indexes byte-for-byte -- this migration only
 * ever touches index definitions.
 *
 * Existence-aware, following AddProductClassifiedWorkspaceOwnership's
 * precedent: OBJECT ABSENT -> create; OBJECT PRESENT -> skip (idempotent
 * re-run), never silently drop-and-recreate something already correct.
 */
export class AddConversationOperationalOwnerUniqueness1788260400000
  implements MigrationInterface
{
  name = 'AddConversationOperationalOwnerUniqueness1788260400000';

  private readonly OLD_NO_PROFILE = 'idx_conversation_unique_no_profile';
  private readonly OLD_WITH_PROFILE = 'idx_conversation_unique_with_profile';
  private readonly NEW_LEGACY_NO_PROFILE = 'idx_conversation_unique_legacy_no_profile';
  private readonly NEW_LEGACY_WITH_PROFILE = 'idx_conversation_unique_legacy_with_profile';
  private readonly NEW_WORKSPACE_NO_PROFILE = 'idx_conversation_unique_workspace_no_profile';
  private readonly NEW_WORKSPACE_WITH_PROFILE = 'idx_conversation_unique_workspace_with_profile';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexIfPresent(queryRunner, this.OLD_NO_PROFILE);
    await this.dropIndexIfPresent(queryRunner, this.OLD_WITH_PROFILE);

    await this.createIndexIfAbsent(
      queryRunner,
      this.NEW_LEGACY_NO_PROFILE,
      `CREATE UNIQUE INDEX "${this.NEW_LEGACY_NO_PROFILE}" ON public.conversation
         USING btree (seller_id, customer_id)
         WHERE "ownerWorkspaceType" IS NULL AND "commerceProfileId" IS NULL`,
    );
    await this.createIndexIfAbsent(
      queryRunner,
      this.NEW_LEGACY_WITH_PROFILE,
      `CREATE UNIQUE INDEX "${this.NEW_LEGACY_WITH_PROFILE}" ON public.conversation
         USING btree (seller_id, customer_id, "commerceProfileId")
         WHERE "ownerWorkspaceType" IS NULL AND "commerceProfileId" IS NOT NULL`,
    );
    await this.createIndexIfAbsent(
      queryRunner,
      this.NEW_WORKSPACE_NO_PROFILE,
      `CREATE UNIQUE INDEX "${this.NEW_WORKSPACE_NO_PROFILE}" ON public.conversation
         USING btree (seller_id, customer_id, "ownerWorkspaceType", "ownerWorkspaceId")
         WHERE "ownerWorkspaceType" IS NOT NULL AND "commerceProfileId" IS NULL`,
    );
    await this.createIndexIfAbsent(
      queryRunner,
      this.NEW_WORKSPACE_WITH_PROFILE,
      `CREATE UNIQUE INDEX "${this.NEW_WORKSPACE_WITH_PROFILE}" ON public.conversation
         USING btree (seller_id, customer_id, "ownerWorkspaceType", "ownerWorkspaceId", "commerceProfileId")
         WHERE "ownerWorkspaceType" IS NOT NULL AND "commerceProfileId" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexIfPresent(queryRunner, this.NEW_LEGACY_NO_PROFILE);
    await this.dropIndexIfPresent(queryRunner, this.NEW_LEGACY_WITH_PROFILE);
    await this.dropIndexIfPresent(queryRunner, this.NEW_WORKSPACE_NO_PROFILE);
    await this.dropIndexIfPresent(queryRunner, this.NEW_WORKSPACE_WITH_PROFILE);

    await this.createIndexIfAbsent(
      queryRunner,
      this.OLD_NO_PROFILE,
      `CREATE UNIQUE INDEX "${this.OLD_NO_PROFILE}" ON public.conversation
         USING btree (seller_id, customer_id)
         WHERE "commerceProfileId" IS NULL`,
    );
    await this.createIndexIfAbsent(
      queryRunner,
      this.OLD_WITH_PROFILE,
      `CREATE UNIQUE INDEX "${this.OLD_WITH_PROFILE}" ON public.conversation
         USING btree (seller_id, customer_id, "commerceProfileId")
         WHERE "commerceProfileId" IS NOT NULL`,
    );
  }

  private async dropIndexIfPresent(queryRunner: QueryRunner, indexName: string): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [indexName],
    )) as unknown[];
    if (rows.length === 0) return;
    await queryRunner.query(`DROP INDEX public."${indexName}"`);
  }

  private async createIndexIfAbsent(queryRunner: QueryRunner, indexName: string, createSql: string): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [indexName],
    )) as unknown[];
    if (rows.length > 0) return;
    await queryRunner.query(createSql);
  }
}
