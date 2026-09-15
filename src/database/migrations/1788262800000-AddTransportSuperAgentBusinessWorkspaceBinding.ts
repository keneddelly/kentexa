import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Business Capability Activation Stage B5A: schema/profile-identity
 * foundation only -- no application/approval behavior, no operational
 * endpoint migration, no OperationalWorkspace location fields (those are
 * B5B/B5C/B6). Purely additive; no data UPDATE, no backfill, no DELETE.
 *
 * TransportProvider and SuperAgent intentionally get DIFFERENT
 * organizational bindings, matching their proven-different real-world
 * cardinality (see the B5.0 contract audit):
 *
 *  - TransportProvider.businessId: one canonical company/fleet profile
 *    per Business. TransportRoute already differentiates location at the
 *    route level (originRegionId/destinationRegionId), so the provider
 *    profile itself stays Business-wide, exactly like SellerProfile's own
 *    businessId precedent.
 *  - SuperAgent.workspaceId: one hub profile per OperationalWorkspace.
 *    Parcel.superAgent/destinationSuperAgent already point directly at a
 *    SuperAgent row as "origin/destination hub" -- a Business-level
 *    SuperAgent would make every hub of a multi-hub business
 *    indistinguishable. Business lineage is always resolved via
 *    workspace.businessId; SuperAgent.businessId is deliberately NOT
 *    added, to avoid a second, redundant source of truth.
 *
 * Legacy rows (5 TransportProvider, 4 SuperAgent, confirmed zero duplicate
 * userId values in either table via read-only production verification)
 * are left completely untouched -- businessId/workspaceId stay NULL, and
 * the "unbound" partial unique indexes below are satisfied trivially by
 * every existing row. Nothing is backfilled from name/businessName/
 * city/address free text.
 */
export class AddTransportSuperAgentBusinessWorkspaceBinding1788262800000
  implements MigrationInterface
{
  name = 'AddTransportSuperAgentBusinessWorkspaceBinding1788262800000';

  private readonly FK_TRANSPORT_PROVIDER_BUSINESS =
    'FK_transport_provider_business';
  private readonly FK_SUPER_AGENT_WORKSPACE = 'FK_super_agent_workspace';

  private readonly UQ_TRANSPORT_PROVIDER_BUSINESS =
    'UQ_transport_provider_business';
  private readonly UQ_TRANSPORT_PROVIDER_UNBOUND_USER =
    'UQ_transport_provider_unbound_user';
  private readonly UQ_SUPER_AGENT_WORKSPACE = 'UQ_super_agent_workspace';
  private readonly UQ_SUPER_AGENT_UNBOUND_USER =
    'UQ_super_agent_unbound_user';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── TransportProvider: optional Business binding ──────────────────────
    await queryRunner.query(`
      ALTER TABLE public.transport_provider
        ADD COLUMN "businessId" integer
    `);
    await queryRunner.query(`
      ALTER TABLE public.transport_provider
        ADD CONSTRAINT "${this.FK_TRANSPORT_PROVIDER_BUSINESS}"
          FOREIGN KEY ("businessId")
          REFERENCES public.business(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "${this.UQ_TRANSPORT_PROVIDER_BUSINESS}"
        ON public.transport_provider ("businessId")
        WHERE "businessId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "${this.UQ_TRANSPORT_PROVIDER_UNBOUND_USER}"
        ON public.transport_provider ("userId")
        WHERE "businessId" IS NULL
    `);

    // ── SuperAgent: optional OperationalWorkspace (hub) binding ────────────
    await queryRunner.query(`
      ALTER TABLE public.super_agent
        ADD COLUMN "workspaceId" integer
    `);
    await queryRunner.query(`
      ALTER TABLE public.super_agent
        ADD CONSTRAINT "${this.FK_SUPER_AGENT_WORKSPACE}"
          FOREIGN KEY ("workspaceId")
          REFERENCES public.operational_workspace(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "${this.UQ_SUPER_AGENT_WORKSPACE}"
        ON public.super_agent ("workspaceId")
        WHERE "workspaceId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "${this.UQ_SUPER_AGENT_UNBOUND_USER}"
        ON public.super_agent ("userId")
        WHERE "workspaceId" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${this.UQ_SUPER_AGENT_UNBOUND_USER}"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${this.UQ_SUPER_AGENT_WORKSPACE}"`,
    );
    await queryRunner.query(`
      ALTER TABLE public.super_agent
        DROP CONSTRAINT "${this.FK_SUPER_AGENT_WORKSPACE}"
    `);
    await queryRunner.query(`
      ALTER TABLE public.super_agent
        DROP COLUMN "workspaceId"
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "${this.UQ_TRANSPORT_PROVIDER_UNBOUND_USER}"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${this.UQ_TRANSPORT_PROVIDER_BUSINESS}"`,
    );
    await queryRunner.query(`
      ALTER TABLE public.transport_provider
        DROP CONSTRAINT "${this.FK_TRANSPORT_PROVIDER_BUSINESS}"
    `);
    await queryRunner.query(`
      ALTER TABLE public.transport_provider
        DROP COLUMN "businessId"
    `);
  }
}
