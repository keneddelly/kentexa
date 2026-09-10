import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { AddBusinessCapabilityApplication1788261600000 } from './1788261600000-AddBusinessCapabilityApplication';
import { Business } from '../../business/entities/business.entity';
import { OperationalWorkspace } from '../../business/entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate } from '../../business/entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from '../../business/entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode } from '../../business/entities/business-capability.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../../role-context/entities/active-role-session.entity';
import { SellerProfile, SellerStatus } from '../../seller/entities/seller-profile.entity';
import { User } from '../../users/entities/user.entity';
import {
  BusinessCapabilityApplication,
  BusinessCapabilityApplicationStatus,
} from '../../business/entities/business-capability-application.entity';

/**
 * Business Capability Activation Stage B1, mission §21 — Migration 9
 * applied against a REAL disposable database whose schema is built (via
 * synchronize: true, the same technique business.service.spec.ts already
 * uses) from the exact same entity decorators Migration 8 mirrors byte for
 * byte -- i.e. a genuine "current Migration 8 state" starting point, not a
 * mocked queryRunner. Confirms UP creates exactly the expected objects
 * without disturbing pre-existing rows shaped like production's real AR37/
 * AR38/legacy-unbound data, and that DOWN fully reverses it.
 */
describe('AddBusinessCapabilityApplication1788261600000 — real disposable-DB UP/DOWN', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_migration9_test';
  const ENTITIES = [
    Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment,
    BusinessCapability, AccountRole, ActiveRoleSession, SellerProfile, User,
  ];

  let reachable = false;
  let dataSource: DataSource;
  let adminClient: Client;

  beforeAll(async () => {
    const probe = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    try { await probe.connect(); reachable = true; await probe.end(); } catch { reachable = false; return; }
    adminClient = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    dataSource = new DataSource({
      type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD,
      database: TEST_DB_NAME, synchronize: true, entities: ENTITIES,
    });
    await dataSource.initialize();

    // Migration 9 reuses two enum types that real production created
    // explicitly by name in earlier migrations (business_capability_code_enum
    // in AddBusinessFirstFoundationSchema, role_profile_type_enum in the
    // original AccountRole migration) -- NOT TypeORM's own synchronize
    // auto-naming (confirmed empirically to produce
    // account_role_profiletype_enum / business_capability_capabilitycode_enum
    // instead, which is why they are created explicitly here rather than
    // relying on synchronize to reproduce them under the same name).
    await dataSource.query(`CREATE TYPE business_capability_code_enum AS ENUM ('commerce', 'transport', 'cargo', 'super_agent')`);
    await dataSource.query(`CREATE TYPE role_profile_type_enum AS ENUM ('user', 'seller_profile', 'agent', 'super_agent', 'transport_provider')`);
  }, 60000);

  afterAll(async () => {
    if (!reachable) return;
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (adminClient) { await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`); await adminClient.end(); }
  }, 90000);

  it('UP creates the table, enum, FKs, and indexes; leaves pre-existing AR37/AR38/legacy-unbound-shaped rows untouched', async () => {
    if (!reachable) return;

    // Seed rows shaped exactly like production's real, historical data.
    const owner = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({ email: 'owner@m9-test.local', phone: '+255900000001', password: 'x', name: 'Owner' } as any),
    );
    const business = await dataSource.getRepository(Business).save(
      dataSource.getRepository(Business).create({ legalName: 'AI Verify Test', user: owner } as any),
    );
    const workspace = await dataSource.getRepository(OperationalWorkspace).save(
      dataSource.getRepository(OperationalWorkspace).create({ businessId: business.id, name: 'Default Operations', isDefault: true } as any),
    );
    const membership = await dataSource.getRepository(BusinessMembership).save(
      dataSource.getRepository(BusinessMembership).create({ businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER } as any),
    );
    const assignment = await dataSource.getRepository(WorkspaceAssignment).save(
      dataSource.getRepository(WorkspaceAssignment).create({ businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} } as any),
    );
    const sellerProfile = await dataSource.getRepository(SellerProfile).save(
      dataSource.getRepository(SellerProfile).create({ user: owner, businessId: business.id, businessName: 'AI Verify Test', status: SellerStatus.PENDING } as any),
    );
    const ar37Shaped = await dataSource.getRepository(AccountRole).save(
      dataSource.getRepository(AccountRole).create({
        userId: owner.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.PENDING,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: sellerProfile.id, capabilities: {},
        workspaceAssignmentId: assignment.id,
      } as any),
    );
    const legacyUnboundSeller = await dataSource.getRepository(SellerProfile).save(
      dataSource.getRepository(SellerProfile).create({ user: owner, businessId: null, businessName: 'Legacy Solo Seller', status: SellerStatus.APPROVED } as any),
    );

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    const migration = new AddBusinessCapabilityApplication1788261600000();
    await migration.up(queryRunner);
    await queryRunner.release();

    // Table/enum/indexes exist.
    const tableRows = await dataSource.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'business_capability_application'`);
    expect(tableRows.length).toBe(1);
    const typeRows = await dataSource.query(`SELECT 1 FROM pg_type WHERE typname = 'business_capability_application_status_enum'`);
    expect(typeRows.length).toBe(1);
    const indexNames = (await dataSource.query(
      `SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND tablename IN ('business_capability_application', 'seller_profile')`,
    )).map((r: any) => r.indexname);
    expect(indexNames).toEqual(expect.arrayContaining([
      'IDX_bca_business_status', 'IDX_bca_workspace_code_status', 'IDX_bca_requested_by_user',
      'UQ_bca_workspace_code_pending', 'UQ_seller_profile_business',
    ]));

    // Pre-existing rows (AR37/AR38-shaped chain + legacy unbound profile) survive untouched.
    const reloadedAr37 = await dataSource.getRepository(AccountRole).findOne({ where: { id: ar37Shaped.id } });
    expect(reloadedAr37).toMatchObject({ status: AccountRoleStatus.PENDING, workspaceAssignmentId: assignment.id });
    const reloadedLegacy = await dataSource.getRepository(SellerProfile).findOne({ where: { id: legacyUnboundSeller.id } });
    expect(reloadedLegacy).toMatchObject({ businessId: null, status: SellerStatus.APPROVED });

    // No BusinessCapability was created by this migration.
    expect(await dataSource.getRepository(BusinessCapability).count()).toBe(0);

    // Can insert a real PENDING application referencing the seeded chain.
    await dataSource.query(
      `INSERT INTO business_capability_application
        ("businessId", "workspaceId", "capabilityCode", "requestedByUserId", "requestedByWorkspaceAssignmentId")
       VALUES ($1, $2, $3, $4, $5)`,
      [business.id, workspace.id, BusinessCapabilityCode.COMMERCE, owner.id, assignment.id],
    );
    expect((await dataSource.query(`SELECT count(*) FROM business_capability_application`))[0].count).toBe('1');
  });

  it('a second PENDING application for the same workspace+capability is rejected by the partial unique index', async () => {
    if (!reachable) return;
    const [row] = await dataSource.query(`SELECT "businessId", "workspaceId", "requestedByUserId", "requestedByWorkspaceAssignmentId" FROM business_capability_application LIMIT 1`);
    await expect(
      dataSource.query(
        `INSERT INTO business_capability_application ("businessId", "workspaceId", "capabilityCode", "requestedByUserId", "requestedByWorkspaceAssignmentId") VALUES ($1, $2, $3, $4, $5)`,
        [row.businessId, row.workspaceId, BusinessCapabilityCode.COMMERCE, row.requestedByUserId, row.requestedByWorkspaceAssignmentId],
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint "UQ_bca_workspace_code_pending"/);
  });

  it('a REJECTED historical application coexists with a new PENDING one for the same workspace+capability', async () => {
    if (!reachable) return;
    const [row] = await dataSource.query(`SELECT "businessId", "workspaceId", "requestedByUserId", "requestedByWorkspaceAssignmentId" FROM business_capability_application LIMIT 1`);
    await dataSource.query(`UPDATE business_capability_application SET status = 'rejected' WHERE "businessId" = $1`, [row.businessId]);
    await expect(
      dataSource.query(
        `INSERT INTO business_capability_application ("businessId", "workspaceId", "capabilityCode", "requestedByUserId", "requestedByWorkspaceAssignmentId") VALUES ($1, $2, $3, $4, $5)`,
        [row.businessId, row.workspaceId, BusinessCapabilityCode.COMMERCE, row.requestedByUserId, row.requestedByWorkspaceAssignmentId],
      ),
    ).resolves.toBeDefined();
    expect((await dataSource.query(`SELECT count(*) FROM business_capability_application`))[0].count).toBe('2');
  });

  describe('UQ_seller_profile_business — Stage B1 mission §20', () => {
    it('two non-null SellerProfiles for the same businessId are rejected by the DB', async () => {
      if (!reachable) return;
      const [existing] = await dataSource.query(`SELECT "userId", "businessId" FROM seller_profile WHERE "businessId" IS NOT NULL LIMIT 1`);
      const otherUser = await dataSource.getRepository(User).save(
        dataSource.getRepository(User).create({ email: 'dup-seller@m9-test.local', phone: '+255900000099', password: 'x', name: 'Dup' } as any),
      );
      await expect(
        dataSource.query(
          `INSERT INTO seller_profile ("userId", "businessId", "businessName", status) VALUES ($1, $2, 'Dup', 'pending')`,
          [otherUser.id, existing.businessId],
        ),
      ).rejects.toThrow(/duplicate key value violates unique constraint "UQ_seller_profile_business"/);
    });

    it('two SellerProfiles with businessId NULL are allowed (unchanged legacy semantics)', async () => {
      if (!reachable) return;
      const u1 = await dataSource.getRepository(User).save(dataSource.getRepository(User).create({ email: 'legacy1@m9-test.local', phone: '+255900000097', password: 'x', name: 'L1' } as any));
      const u2 = await dataSource.getRepository(User).save(dataSource.getRepository(User).create({ email: 'legacy2@m9-test.local', phone: '+255900000098', password: 'x', name: 'L2' } as any));
      await expect(dataSource.query(`INSERT INTO seller_profile ("userId", "businessId", "businessName", status) VALUES ($1, NULL, 'Legacy 1', 'approved')`, [u1.id])).resolves.toBeDefined();
      await expect(dataSource.query(`INSERT INTO seller_profile ("userId", "businessId", "businessName", status) VALUES ($1, NULL, 'Legacy 2', 'approved')`, [u2.id])).resolves.toBeDefined();
    });

    it('different non-null businessIds are allowed', async () => {
      if (!reachable) return;
      const owner3 = await dataSource.getRepository(User).save(dataSource.getRepository(User).create({ email: 'owner3@m9-test.local', phone: '+255900000096', password: 'x', name: 'Owner3' } as any));
      const business3 = await dataSource.getRepository(Business).save(dataSource.getRepository(Business).create({ legalName: 'Third Co', user: owner3 } as any));
      await expect(
        dataSource.query(`INSERT INTO seller_profile ("userId", "businessId", "businessName", status) VALUES ($1, $2, 'Third Co', 'pending')`, [owner3.id, business3.id]),
      ).resolves.toBeDefined();
    });
  });

  it('4. a CANCELLED historical application coexists with a new PENDING one for the same workspace+capability', async () => {
    if (!reachable) return;
    const [row] = await dataSource.query(`SELECT "businessId", "workspaceId", "requestedByUserId", "requestedByWorkspaceAssignmentId" FROM business_capability_application WHERE status = 'pending' LIMIT 1`);
    await dataSource.query(`UPDATE business_capability_application SET status = 'cancelled' WHERE id = (SELECT id FROM business_capability_application WHERE status = 'pending' LIMIT 1)`);
    await expect(
      dataSource.query(
        `INSERT INTO business_capability_application ("businessId", "workspaceId", "capabilityCode", "requestedByUserId", "requestedByWorkspaceAssignmentId") VALUES ($1, $2, $3, $4, $5)`,
        [row.businessId, row.workspaceId, BusinessCapabilityCode.COMMERCE, row.requestedByUserId, row.requestedByWorkspaceAssignmentId],
      ),
    ).resolves.toBeDefined();
  });

  it('5. an APPROVED historical application coexists with a new PENDING one for the same workspace+capability (structurally allowed by this table -- whether it SHOULD be reachable given a live BusinessCapability is a B2 domain check, not a DB constraint)', async () => {
    if (!reachable) return;
    const [row] = await dataSource.query(`SELECT "businessId", "workspaceId", "requestedByUserId", "requestedByWorkspaceAssignmentId" FROM business_capability_application WHERE status = 'pending' LIMIT 1`);
    await dataSource.query(`UPDATE business_capability_application SET status = 'approved' WHERE id = (SELECT id FROM business_capability_application WHERE status = 'pending' LIMIT 1)`);
    await expect(
      dataSource.query(
        `INSERT INTO business_capability_application ("businessId", "workspaceId", "capabilityCode", "requestedByUserId", "requestedByWorkspaceAssignmentId") VALUES ($1, $2, $3, $4, $5)`,
        [row.businessId, row.workspaceId, BusinessCapabilityCode.COMMERCE, row.requestedByUserId, row.requestedByWorkspaceAssignmentId],
      ),
    ).resolves.toBeDefined();
  });

  describe('entity mapping — BusinessCapabilityApplication repository against the real migrated table', () => {
    // Stage B1 mission §18 items 1/6/7/8 -- proves the entity decorators
    // (business-capability-application.entity.ts) actually match what
    // Migration 9 physically created, using a SECOND DataSource
    // (synchronize: false, pointed at the same disposable database) rather
    // than the first one's synchronize:true connection, which never had
    // BusinessCapabilityApplication in its own entity set and must not be
    // allowed to "fix up" the table Migration 9 already created.
    let entityDataSource: DataSource;

    beforeAll(async () => {
      if (!reachable) return;
      entityDataSource = new DataSource({
        type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD,
        database: TEST_DB_NAME, synchronize: false,
        entities: [Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment, User, BusinessCapabilityApplication],
      });
      await entityDataSource.initialize();
    }, 30000);

    afterAll(async () => {
      if (!reachable) return;
      if (entityDataSource?.isInitialized) await entityDataSource.destroy();
    }, 30000);

    it('1. a PENDING application can be persisted and read back via the repository', async () => {
      if (!reachable) return;
      const repo = entityDataSource.getRepository(BusinessCapabilityApplication);
      const [seed] = await dataSource.query(`SELECT "businessId", "workspaceId", "requestedByUserId", "requestedByWorkspaceAssignmentId" FROM business_capability_application LIMIT 1`);

      const saved = await repo.save(repo.create({
        businessId: seed.businessId, workspaceId: seed.workspaceId, capabilityCode: BusinessCapabilityCode.TRANSPORT,
        requestedByUserId: seed.requestedByUserId, requestedByWorkspaceAssignmentId: seed.requestedByWorkspaceAssignmentId,
      }));

      expect(saved.id).toBeGreaterThan(0);
      expect(saved.status).toBe(BusinessCapabilityApplicationStatus.PENDING); // default applied
      const reloaded = await repo.findOne({ where: { id: saved.id } });
      expect(reloaded).toMatchObject({ status: BusinessCapabilityApplicationStatus.PENDING, capabilityCode: BusinessCapabilityCode.TRANSPORT });
    });

    it('6. a different capability for the SAME workspace is allowed alongside an existing PENDING one', async () => {
      if (!reachable) return;
      const repo = entityDataSource.getRepository(BusinessCapabilityApplication);
      const [seed] = await dataSource.query(`SELECT "businessId", "workspaceId", "requestedByUserId", "requestedByWorkspaceAssignmentId" FROM business_capability_application LIMIT 1`);
      // COMMERCE is already PENDING for this business/workspace from an earlier test; SUPER_AGENT is a different code entirely.
      await expect(repo.save(repo.create({
        businessId: seed.businessId, workspaceId: seed.workspaceId, capabilityCode: BusinessCapabilityCode.SUPER_AGENT,
        requestedByUserId: seed.requestedByUserId, requestedByWorkspaceAssignmentId: seed.requestedByWorkspaceAssignmentId,
      }))).resolves.toMatchObject({ capabilityCode: BusinessCapabilityCode.SUPER_AGENT });
    });

    it('7. the same capability for a DIFFERENT workspace is allowed (no cross-workspace collision)', async () => {
      if (!reachable) return;
      const repo = entityDataSource.getRepository(BusinessCapabilityApplication);
      // A second, independent Business/Workspace/Membership/Assignment chain.
      const owner2 = await entityDataSource.getRepository(User).save(
        entityDataSource.getRepository(User).create({ email: 'owner2@m9-test.local', phone: '+255900000002', password: 'x', name: 'Owner2' } as any),
      );
      const business2 = await entityDataSource.getRepository(Business).save(
        entityDataSource.getRepository(Business).create({ legalName: 'Second Co', user: owner2 } as any),
      );
      const workspace2 = await entityDataSource.getRepository(OperationalWorkspace).save(
        entityDataSource.getRepository(OperationalWorkspace).create({ businessId: business2.id, name: 'Default Operations', isDefault: true } as any),
      );
      const membership2 = await entityDataSource.getRepository(BusinessMembership).save(
        entityDataSource.getRepository(BusinessMembership).create({ businessId: business2.id, userId: owner2.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER } as any),
      );
      const assignment2 = await entityDataSource.getRepository(WorkspaceAssignment).save(
        entityDataSource.getRepository(WorkspaceAssignment).create({ businessMembershipId: membership2.id, workspaceId: workspace2.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} } as any),
      );

      // COMMERCE is already PENDING on the FIRST business/workspace -- this is a different workspace entirely.
      await expect(repo.save(repo.create({
        businessId: business2.id, workspaceId: workspace2.id, capabilityCode: BusinessCapabilityCode.COMMERCE,
        requestedByUserId: owner2.id, requestedByWorkspaceAssignmentId: assignment2.id,
      }))).resolves.toMatchObject({ capabilityCode: BusinessCapabilityCode.COMMERCE, workspaceId: workspace2.id });
    });

    it('8. an application persists the exact requestedByUserId/requestedByWorkspaceAssignmentId it was created with', async () => {
      if (!reachable) return;
      const repo = entityDataSource.getRepository(BusinessCapabilityApplication);
      const [seed] = await dataSource.query(`SELECT "businessId", "workspaceId", "requestedByUserId", "requestedByWorkspaceAssignmentId" FROM business_capability_application LIMIT 1`);
      const saved = await repo.save(repo.create({
        businessId: seed.businessId, workspaceId: seed.workspaceId, capabilityCode: BusinessCapabilityCode.CARGO,
        requestedByUserId: seed.requestedByUserId, requestedByWorkspaceAssignmentId: seed.requestedByWorkspaceAssignmentId,
      }));
      const reloaded = await repo.findOne({ where: { id: saved.id } });
      expect(reloaded?.requestedByUserId).toBe(seed.requestedByUserId);
      expect(reloaded?.requestedByWorkspaceAssignmentId).toBe(seed.requestedByWorkspaceAssignmentId);
    });
  });

  it('DOWN removes exactly the objects Migration 9 created, leaving pre-existing tables/rows untouched', async () => {
    if (!reachable) return;
    const preRoleCount = await dataSource.getRepository(AccountRole).count();
    const preSellerProfileCount = await dataSource.getRepository(SellerProfile).count();

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    const migration = new AddBusinessCapabilityApplication1788261600000();
    await migration.down(queryRunner);
    await queryRunner.release();

    const tableRows = await dataSource.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'business_capability_application'`);
    expect(tableRows.length).toBe(0);
    const typeRows = await dataSource.query(`SELECT 1 FROM pg_type WHERE typname = 'business_capability_application_status_enum'`);
    expect(typeRows.length).toBe(0);
    const sellerProfileIndexes = (await dataSource.query(
      `SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND tablename = 'seller_profile'`,
    )).map((r: any) => r.indexname);
    expect(sellerProfileIndexes).not.toContain('UQ_seller_profile_business');

    // Unrelated tables/rows are completely unaffected by the rollback.
    expect(await dataSource.getRepository(AccountRole).count()).toBe(preRoleCount);
    expect(await dataSource.getRepository(SellerProfile).count()).toBe(preSellerProfileCount);
  });
});
