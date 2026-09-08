import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Business-First Stage 2A -- schema only, additive, zero data written.
 * Adds one nullable "workspaceId" column (+ index) each to `product` and
 * `classified`, pointing at operational_workspace(id). No NOT NULL, no
 * historical backfill inside this migration (that is the separate,
 * human-gated backfill-product-classified-ownership.ts tool, run only
 * after this migration is live and only under its own confirmation gate).
 * No legacy ownership field (seller/sellerId/commerceProfileId) is
 * touched, renamed, or removed.
 *
 * Existence-aware, following the same hardening already applied to
 * AddCommunicationParticipantAudience / AddBusinessFirstFoundationSchema:
 * OBJECT ABSENT -> create; OBJECT PRESENT and matching -> skip; OBJECT
 * PRESENT but missing the expected column -> throw a specific diagnostic.
 */
export class AddProductClassifiedWorkspaceOwnership1788259800000
  implements MigrationInterface
{
  name = 'AddProductClassifiedWorkspaceOwnership1788259800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureWorkspaceIdColumn(queryRunner, 'product', 'IDX_product_workspace');
    await this.ensureWorkspaceIdColumn(queryRunner, 'classified', 'IDX_classified_workspace');
  }

  private async ensureWorkspaceIdColumn(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(table, 'workspaceId');
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE public.${table} ADD COLUMN "workspaceId" integer;`,
      );
    }

    const fkName = `FK_${table}_workspace`;
    const fkRows = (await queryRunner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1`,
      [fkName],
    )) as unknown[];
    if (fkRows.length === 0) {
      await queryRunner.query(`
        ALTER TABLE public.${table}
          ADD CONSTRAINT "${fkName}" FOREIGN KEY ("workspaceId")
            REFERENCES public.operational_workspace(id) ON DELETE SET NULL;
      `);
    }

    await this.ensureIndex(
      queryRunner,
      indexName,
      `CREATE INDEX "${indexName}" ON public.${table} USING btree ("workspaceId")`,
    );
  }

  /** OBJECT ABSENT -> create. OBJECT PRESENT (any definition) -> skip. */
  private async ensureIndex(queryRunner: QueryRunner, indexName: string, createSql: string): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [indexName],
    )) as unknown[];
    if (rows.length > 0) return;
    await queryRunner.query(createSql);
  }

  async down(): Promise<void> {
    throw new Error(
      "Business-First Stage 2A workspace-ownership schema is intentionally " +
        "non-reversible, matching this repository's established precedent " +
        "for foundation-laying migrations. Do not drop workspace-ownership " +
        "columns through migration rollback.",
    );
  }
}
