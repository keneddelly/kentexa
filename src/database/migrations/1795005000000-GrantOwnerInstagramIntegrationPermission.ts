import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Existing Business owners already have an explicit active workspace
 * assignment. Grant only the integration-management capability to active
 * owner assignments, preserving every other permission bit.
 */
export class GrantOwnerInstagramIntegrationPermission1795005000000 implements MigrationInterface {
  name = 'GrantOwnerInstagramIntegrationPermission1795005000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE workspace_assignment wa
      SET permissions = COALESCE(wa.permissions, '{}'::jsonb)
        || jsonb_build_object('canManageIntegrations', true)
      FROM business_membership bm, operational_workspace ow
      WHERE bm.id = wa."businessMembershipId"
        AND ow.id = wa."workspaceId"
        AND ow."businessId" = bm."businessId"
        AND bm."roleTemplate" = 'owner'
        AND bm.status = 'active'
        AND wa.status = 'active'
        AND ow.status = 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE workspace_assignment wa
      SET permissions = COALESCE(wa.permissions, '{}'::jsonb)
        || jsonb_build_object('canManageIntegrations', false)
      FROM business_membership bm, operational_workspace ow
      WHERE bm.id = wa."businessMembershipId"
        AND ow.id = wa."workspaceId"
        AND ow."businessId" = bm."businessId"
        AND bm."roleTemplate" = 'owner'
        AND bm.status = 'active'
        AND wa.status = 'active'
        AND ow.status = 'active'
        AND wa.permissions->>'canManageIntegrations' = 'true'
    `);
  }
}
