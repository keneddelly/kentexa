import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Business Capability Activation Stage B6B: schema foundation only for
 * Business-bound SERVICE authority -- no application/approval-service
 * changes live here (those are TypeScript-layer, see
 * business-capability-application.service.ts), no operational endpoint
 * wiring, no ServiceAd.workspaceId (deferred to a future multi-location
 * stage, see B6A's own architecture report). Purely additive; no data
 * UPDATE, no backfill, no DELETE.
 *
 * ServiceProvider gets the exact same organizational binding shape as
 * TransportProvider (Migration 10) -- one canonical company-wide provider
 * identity per Business, never per-workspace, since a single service
 * company offers MANY services as ONE identity (see B6A's ABC Solutions
 * example: CCTV/electrical/network/repair/consulting all under one
 * ServiceProvider row) -- exactly TransportProvider's own precedent, not
 * SuperAgent's (which is deliberately per-hub/workspace). Unlike
 * TransportProvider, ServiceProvider.user/userId is NOT made nullable here
 * -- the entity's `user` relation has always been a required FK (no
 * `nullable: true`), so a Business-bound row still always carries a real
 * applying user's id; only `businessId` is new and optional.
 *
 * ServiceAd gets an optional nullable businessId (denormalized, mirroring
 * SellerProfile's own businessId convention) so a Business's services can
 * be queried directly without joining through ServiceProvider on every
 * hot-path read -- NOT unique (one Business legitimately owns MANY
 * ServiceAd rows, per B6A section 7/21's explicit requirement).
 *
 * Legacy rows (every existing ServiceProvider/ServiceAd row today) are
 * left completely untouched -- businessId stays NULL, and the "unbound"
 * partial unique index below is satisfied trivially by every existing
 * ServiceProvider row, PROVIDED no userId currently has more than one
 * ServiceProvider row (this migration does not itself verify that against
 * production -- a live, read-only duplicate check equivalent to Migration
 * 10's own pre-migration production verification is a required
 * pre-deployment gate for whoever runs B6B's eventual production release,
 * not something this schema-only stage can check). Nothing is backfilled
 * from name/businessName/city/address free text.
 */
export class AddServiceBusinessAuthorityFoundation1788263400000
  implements MigrationInterface
{
  name = 'AddServiceBusinessAuthorityFoundation1788263400000';

  private readonly FK_SERVICE_PROVIDER_BUSINESS =
    'FK_service_provider_business';
  private readonly UQ_SERVICE_PROVIDER_BUSINESS =
    'UQ_service_provider_business';
  private readonly UQ_SERVICE_PROVIDER_UNBOUND_USER =
    'UQ_service_provider_unbound_user';

  private readonly IDX_SERVICE_AD_PROVIDER = 'IDX_service_ad_provider';
  private readonly IDX_SERVICE_AD_BUSINESS = 'IDX_service_ad_business';
  private readonly IDX_SERVICE_AD_CATEGORY = 'IDX_service_ad_category';
  private readonly IDX_SERVICE_AD_STATUS = 'IDX_service_ad_status';
  private readonly IDX_SERVICE_AD_COVERAGE_CITY =
    'IDX_service_ad_coverage_city';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enum additions (native Postgres types, additive only) ─────────────
    // Safe inside a transaction on Postgres 12+ as long as the new value is
    // never referenced within the same transaction that adds it -- this
    // migration never inserts/updates any row using either new value.
    await queryRunner.query(
      `ALTER TYPE business_capability_code_enum ADD VALUE IF NOT EXISTS 'service'`,
    );
    await queryRunner.query(
      `ALTER TYPE role_profile_type_enum ADD VALUE IF NOT EXISTS 'service_provider'`,
    );

    // ── ServiceProvider: optional Business binding ─────────────────────────
    await queryRunner.query(`
      ALTER TABLE public.service_provider
        ADD COLUMN "businessId" integer
    `);
    await queryRunner.query(`
      ALTER TABLE public.service_provider
        ADD CONSTRAINT "${this.FK_SERVICE_PROVIDER_BUSINESS}"
          FOREIGN KEY ("businessId")
          REFERENCES public.business(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "${this.UQ_SERVICE_PROVIDER_BUSINESS}"
        ON public.service_provider ("businessId")
        WHERE "businessId" IS NOT NULL
    `);
    // Preserves the existing "one legacy provider per user" invariant for
    // unbound rows -- uses the ALREADY-EXISTING physical "userId" column
    // (TypeORM's own default join-column name for the entity's `user`
    // relation), not a new one; the entity gains an explicit shadow
    // @Column for it in the same spirit as Migration 10's SuperAgent
    // change, schema-neutral.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "${this.UQ_SERVICE_PROVIDER_UNBOUND_USER}"
        ON public.service_provider ("userId")
        WHERE "businessId" IS NULL
    `);

    // ── ServiceAd: optional Business attribution + hot-path indexes ────────
    // No uniqueness on businessId here -- one Business legitimately owns
    // many ServiceAd rows (B6A section 7/21).
    await queryRunner.query(`
      ALTER TABLE public.service_ad
        ADD COLUMN "businessId" integer
    `);
    await queryRunner.query(`
      ALTER TABLE public.service_ad
        ADD CONSTRAINT "FK_service_ad_business"
          FOREIGN KEY ("businessId")
          REFERENCES public.business(id) ON DELETE SET NULL
    `);

    // ServiceAd had zero indexes despite being queried directly by
    // providerId ("my ads"), category/status/coverageCity (public browse/
    // search) -- B6A flagged this as a pre-existing gap independent of the
    // ownership change; fixed here since the table is already being
    // altered for businessId.
    await queryRunner.query(`
      CREATE INDEX "${this.IDX_SERVICE_AD_PROVIDER}" ON public.service_ad ("providerId")
    `);
    await queryRunner.query(`
      CREATE INDEX "${this.IDX_SERVICE_AD_BUSINESS}" ON public.service_ad ("businessId")
    `);
    await queryRunner.query(`
      CREATE INDEX "${this.IDX_SERVICE_AD_CATEGORY}" ON public.service_ad ("category")
    `);
    await queryRunner.query(`
      CREATE INDEX "${this.IDX_SERVICE_AD_STATUS}" ON public.service_ad ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "${this.IDX_SERVICE_AD_COVERAGE_CITY}" ON public.service_ad ("coverageCity")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "${this.IDX_SERVICE_AD_COVERAGE_CITY}"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${this.IDX_SERVICE_AD_STATUS}"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${this.IDX_SERVICE_AD_CATEGORY}"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${this.IDX_SERVICE_AD_BUSINESS}"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${this.IDX_SERVICE_AD_PROVIDER}"`);
    await queryRunner.query(`
      ALTER TABLE public.service_ad DROP CONSTRAINT IF EXISTS "FK_service_ad_business"
    `);
    await queryRunner.query(`
      ALTER TABLE public.service_ad DROP COLUMN IF EXISTS "businessId"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "${this.UQ_SERVICE_PROVIDER_UNBOUND_USER}"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "${this.UQ_SERVICE_PROVIDER_BUSINESS}"`);
    await queryRunner.query(`
      ALTER TABLE public.service_provider DROP CONSTRAINT IF EXISTS "${this.FK_SERVICE_PROVIDER_BUSINESS}"
    `);
    await queryRunner.query(`
      ALTER TABLE public.service_provider DROP COLUMN IF EXISTS "businessId"
    `);

    // Postgres does not support removing a value from an existing enum
    // type (no DROP VALUE) -- reverting the two ADD VALUE statements above
    // would require recreating both enum types from scratch (dropping and
    // rebuilding every column that uses them), a far more invasive
    // operation than anything else this migration's down() does, and not
    // needed for local test-harness rollback (the two extra enum members
    // are inert/harmless if simply left in place). Intentionally a no-op
    // here, exactly the same tradeoff every future additive-enum migration
    // in this codebase will face.
  }
}
