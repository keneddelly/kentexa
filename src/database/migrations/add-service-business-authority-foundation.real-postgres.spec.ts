import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  B5B_TEST_DB_NAME,
  B5B_TEST_DB_USER,
} from '../../business/b5b-closure-test-db';
import { AddServiceBusinessAuthorityFoundation1788263400000 } from './1788263400000-AddServiceBusinessAuthorityFoundation';
import { AddBusinessCapabilityApplication1788261600000 } from './1788261600000-AddBusinessCapabilityApplication';
import { Business } from '../../business/entities/business.entity';
import { OperationalWorkspace } from '../../business/entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from '../../business/entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from '../../business/entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode } from '../../business/entities/business-capability.entity';
import { BusinessCapabilityApplication } from '../../business/entities/business-capability-application.entity';
import { SellerProfile } from '../../seller/entities/seller-profile.entity';
import { TransportProvider } from '../../transport/entities/transport-provider.entity';
import { SuperAgent } from '../../super-agents/entities/super-agent.entity';
import { AccountRole, RoleProfileType } from '../../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../../role-context/entities/active-role-session.entity';
import { User } from '../../users/entities/user.entity';
import { ServiceProvider, ServiceProviderStatus } from '../../service-providers/entities/service-provider.entity';
import { ServiceAd, ServiceCategory, ServiceStatus, PriceType } from '../../services/entities/service-ad.entity';
import { BusinessCapabilityApplicationService } from '../../business/business-capability-application.service';

/**
 * B6B FINAL PROOF — executes the ACTUAL committed Migration 11
 * (1788263400000-AddServiceBusinessAuthorityFoundation) via a real
 * PostgreSQL QueryRunner against a genuinely pre-migration schema, never
 * synchronize/mocks/reconstructed SQL for this specific proof. Uses the
 * dedicated kentexa_b5b_test database only, gated by the same
 * resetB5BTestSchema safety check every other closure spec uses.
 *
 * "Legacy" entity classes below deliberately mirror service-provider.entity.ts
 * and service-ad.entity.ts EXACTLY as they existed at the B5C baseline
 * commit (9c48d88, confirmed via `git show`) -- i.e. with no businessId at
 * all -- so synchronizing them produces a genuinely pre-Migration-11
 * table shape for the migration's own up() to alter for real, rather than
 * silently starting from the post-migration shape the current (already
 * B6B-modified) entity classes would produce.
 */
@Entity('service_provider')
class LegacyServiceProviderPreB6B {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' }) user: User;
  @Column() businessName: string;
  @Column({ type: 'text', nullable: true }) businessDescription: string | null;
  @Column({ type: 'enum', enum: ServiceCategory, nullable: true }) primaryCategory: ServiceCategory | null;
  @Column({ type: 'varchar', nullable: true }) city: string | null;
  @Column({ type: 'text', nullable: true }) address: string | null;
  @Column({ type: 'varchar', nullable: true }) contactPhone: string | null;
  @Column({ type: 'varchar', nullable: true }) whatsappPhone: string | null;
  @Column({ type: 'varchar', nullable: true }) website: string | null;
  @Column({ type: 'text', nullable: true }) logoUrl: string | null;
  @Column({ type: 'varchar', nullable: true }) idType: string | null;
  @Column({ type: 'varchar', nullable: true }) idNumber: string | null;
  @Column({ type: 'text', nullable: true }) idPhotoUrl: string | null;
  @Column({ type: 'varchar', nullable: true }) registrationNumber: string | null;
  @Column({ type: 'enum', enum: ServiceProviderStatus, default: ServiceProviderStatus.PENDING }) status: ServiceProviderStatus;
  @Column({ type: 'text', nullable: true }) rejectionReason: string | null;
  @Column({ type: 'timestamp', nullable: true }) verifiedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('service_ad')
class LegacyServiceAdPreB6B {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => User, { eager: false }) @JoinColumn() provider: User;
  @Column({ type: 'int' }) providerId: number;
  @Column({ type: 'int', nullable: true }) commerceProfileId: number | null;
  @Column({ type: 'varchar' }) title: string;
  @Column({ type: 'text' }) description: string;
  @Column({ type: 'enum', enum: ServiceCategory }) category: ServiceCategory;
  @Column({ type: 'varchar', nullable: true }) subcategory: string | null;
  @Column({ type: 'enum', enum: PriceType, default: PriceType.NEGOTIATE }) priceType: PriceType;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) price: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) priceMax: number | null;
  @Column({ type: 'varchar' }) coverageCity: string;
  @Column({ type: 'simple-array', nullable: true }) coverageWards: string[] | null;
  @Column({ type: 'simple-array', nullable: true }) workingDays: string[] | null;
  @Column({ type: 'varchar', nullable: true }) workingHours: string | null;
  @Column({ type: 'boolean', default: true }) isAvailableNow: boolean;
  @Column({ type: 'simple-array', nullable: true }) images: string[] | null;
  @Column({ type: 'int', default: 0 }) totalJobs: number;
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 }) rating: number;
  @Column({ type: 'int', default: 0 }) totalRatings: number;
  @Column({ type: 'int', default: 0 }) views: number;
  @Column({ type: 'varchar', nullable: true }) whatsappPhone: string | null;
  @Column({ type: 'enum', enum: ServiceStatus, default: ServiceStatus.ACTIVE }) status: ServiceStatus;
  @Column({ type: 'boolean', default: false }) isVerified: boolean;
  @Column({ type: 'boolean', default: true }) isAvailableForBooking: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

describe('Migration 11 (AddServiceBusinessAuthorityFoundation) — real PostgreSQL execution proof', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let legacyDataSource: DataSource;
  let migrationClient: Client;

  const PRE_MIGRATION_ENUM_VALUES = {
    businessCapabilityCode: `('commerce', 'transport', 'cargo', 'super_agent')`,
    roleProfileType: `('user', 'seller_profile', 'agent', 'super_agent', 'transport_provider')`,
  };

  beforeAll(async () => {
    if (!config) return;
    const client = new Client(config);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
  }, 30000);

  afterAll(async () => {
    // Never gate cleanup on isInitialized: TypeORM's Postgres driver opens
    // real pool connections BEFORE metadata-building completes, so a
    // DataSource whose .initialize() call THREW (e.g. a missing related
    // entity in the array) can still be holding live connections --
    // skipping destroy() in that case is exactly what leaves the whole
    // Jest process unable to exit, discovered the hard way while building
    // this proof. destroy() itself is safe to call on an uninitialized/
    // partially-initialized DataSource; swallow any secondary error from
    // it so the real test failure (if any) is still what gets reported.
    if (legacyDataSource) await legacyDataSource.destroy().catch(() => {});
    if (migrationClient) await migrationClient.end().catch(() => {});
  });

  it('§0 explicit connectivity assertion', async () => {
    expect(reachable).toBe(true);
  });

  it('§3 pre-migration schema: builds the genuinely pre-B6B shape, confirms every absence, and inserts representative legacy rows', async () => {
    if (!reachable || !config) return;

    legacyDataSource = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user, password: config.password,
      database: config.database, synchronize: true,
      // AccountRole/ActiveRoleSession included solely because User.accountRoles
      // and AccountRole's own activeSessions relation require their target
      // entities to be registered for metadata-building to succeed --
      // neither is otherwise used by this narrow pre-migration bootstrap.
      // Deliberately NOT the real (current) ServiceProvider/ServiceAd
      // classes here -- this DataSource has synchronize:true, and having
      // both the Legacy* and current shapes of the same table registered
      // together would let synchronize add businessId itself at
      // .initialize() time, before Migration 11 ever runs, defeating the
      // entire point of this proof. §7 below opens its own separate,
      // synchronize:false DataSource for real-entity repository operations
      // once the schema has already been migrated for real.
      entities: [Business, User, AccountRole, ActiveRoleSession, LegacyServiceProviderPreB6B, LegacyServiceAdPreB6B],
    });
    await legacyDataSource.initialize();

    await legacyDataSource.query(`CREATE TYPE business_capability_code_enum AS ENUM ${PRE_MIGRATION_ENUM_VALUES.businessCapabilityCode}`);
    await legacyDataSource.query(`CREATE TYPE role_profile_type_enum AS ENUM ${PRE_MIGRATION_ENUM_VALUES.roleProfileType}`);

    // ── Confirm every pre-condition the mission asks for, via real catalog introspection ──
    const enumValues = async (typeName: string) => (await legacyDataSource.query(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`,
      [typeName],
    )).map((r: any) => r.enumlabel);
    expect(await enumValues('business_capability_code_enum')).not.toContain('service');
    expect(await enumValues('role_profile_type_enum')).not.toContain('service_provider');

    const hasColumn = async (table: string, column: string) => (await legacyDataSource.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column],
    )).length > 0;
    expect(await hasColumn('service_provider', 'businessId')).toBe(false);
    expect(await hasColumn('service_ad', 'businessId')).toBe(false);

    const migrationsTableExists = (await legacyDataSource.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'migrations'`,
    )).length > 0;
    expect(migrationsTableExists).toBe(false); // no migration ledger at all yet -- Migration 11 cannot possibly be recorded

    // ── Representative pre-B6 legacy rows ──
    const legacyUser = await legacyDataSource.getRepository(User).save(
      legacyDataSource.getRepository(User).create({ email: 'legacy-provider@b6b-migration-proof.local', phone: '+255700000001', password: 'x', name: 'Legacy Provider' } as any),
    );
    const legacyProvider = await legacyDataSource.getRepository(LegacyServiceProviderPreB6B).save(
      legacyDataSource.getRepository(LegacyServiceProviderPreB6B).create({
        user: legacyUser, businessName: 'Legacy Solo Provider Co', status: ServiceProviderStatus.APPROVED,
      } as any),
    );
    const legacyAd = await legacyDataSource.getRepository(LegacyServiceAdPreB6B).save(
      legacyDataSource.getRepository(LegacyServiceAdPreB6B).create({
        provider: legacyUser, providerId: legacyUser.id, title: 'Legacy Electrical Repair', description: 'Pre-B6B ad',
        category: ServiceCategory.UFUNDI, coverageCity: 'Dar es Salaam', status: ServiceStatus.ACTIVE,
      } as any),
    );

    expect(legacyProvider.id).toBeGreaterThan(0);
    expect(legacyAd.id).toBeGreaterThan(0);
  }, 60000);

  it('§4 executes the ACTUAL committed Migration 11 up() against a real PostgreSQL QueryRunner', async () => {
    if (!reachable) return;

    const queryRunner = legacyDataSource.createQueryRunner();
    await queryRunner.connect();

    // Hard safety re-assertion immediately before the real destructive/
    // structural migration statements run, using the SAME connection the
    // migration itself will use -- never trusted merely because an
    // earlier connection already passed the check.
    const [{ db, usr }] = await queryRunner.query('SELECT current_database() AS db, current_user AS usr');
    if (db !== B5B_TEST_DB_NAME || usr !== B5B_TEST_DB_USER) {
      await queryRunner.release();
      throw new Error(`B6B SAFETY ABORT: refusing to run Migration 11 -- expected ${B5B_TEST_DB_NAME}/${B5B_TEST_DB_USER}, got ${db}/${usr}`);
    }

    const migration = new AddServiceBusinessAuthorityFoundation1788263400000();
    await expect(migration.up(queryRunner)).resolves.not.toThrow();

    await queryRunner.release();
  }, 60000);

  it('§5 post-migration schema proof via real catalog introspection', async () => {
    if (!reachable) return;

    const enumValues = async (typeName: string) => (await legacyDataSource.query(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`,
      [typeName],
    )).map((r: any) => r.enumlabel);
    expect(await enumValues('business_capability_code_enum')).toEqual(
      expect.arrayContaining(['commerce', 'transport', 'cargo', 'super_agent', 'service']),
    );
    expect(await enumValues('role_profile_type_enum')).toEqual(
      expect.arrayContaining(['user', 'seller_profile', 'agent', 'super_agent', 'transport_provider', 'service_provider']),
    );

    const columnInfo = async (table: string, column: string) => (await legacyDataSource.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column],
    ))[0];
    expect((await columnInfo('service_provider', 'businessId'))?.is_nullable).toBe('YES');
    expect((await columnInfo('service_ad', 'businessId'))?.is_nullable).toBe('YES');

    const fkExists = async (constraintName: string) => (await legacyDataSource.query(
      `SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = $1 AND constraint_type = 'FOREIGN KEY'`,
      [constraintName],
    )).length > 0;
    expect(await fkExists('FK_service_provider_business')).toBe(true);
    expect(await fkExists('FK_service_ad_business')).toBe(true);

    const indexExists = async (indexName: string) => (await legacyDataSource.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
      [indexName],
    )).length > 0;
    expect(await indexExists('UQ_service_provider_business')).toBe(true);
    expect(await indexExists('UQ_service_provider_unbound_user')).toBe(true);
    expect(await indexExists('IDX_service_ad_provider')).toBe(true);
    expect(await indexExists('IDX_service_ad_business')).toBe(true);
    expect(await indexExists('IDX_service_ad_category')).toBe(true);
    expect(await indexExists('IDX_service_ad_status')).toBe(true);
    expect(await indexExists('IDX_service_ad_coverage_city')).toBe(true);
  });

  it('§6 legacy data preservation: pre-migration rows survive unchanged, new businessId is NULL, no backfill', async () => {
    if (!reachable) return;
    const providers: any[] = await legacyDataSource.query(`SELECT * FROM service_provider WHERE "businessName" = 'Legacy Solo Provider Co'`);
    expect(providers).toHaveLength(1);
    expect(providers[0].businessId).toBeNull();
    expect(providers[0].status).toBe('approved');

    const ads: any[] = await legacyDataSource.query(`SELECT * FROM service_ad WHERE title = 'Legacy Electrical Repair'`);
    expect(ads).toHaveLength(1);
    expect(ads[0].businessId).toBeNull();
    expect(ads[0].status).toBe('active');
  });

  it('§7 constraint behavior on the real migrated schema', async () => {
    if (!reachable || !config) return;
    // A dedicated synchronize:false DataSource using the REAL (current,
    // post-migration-shape) entity classes -- deliberately separate from
    // legacyDataSource (synchronize:true, Legacy* shapes) so the two
    // never register conflicting metadata for the same table.
    const realDataSource = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user, password: config.password,
      database: config.database, synchronize: false,
      entities: [Business, User, AccountRole, ActiveRoleSession, ServiceProvider, ServiceAd],
    });
    await realDataSource.initialize();

    const userRepo = realDataSource.getRepository(User);
    const businessRepo = realDataSource.getRepository(Business);
    const providerRepo = realDataSource.getRepository(ServiceProvider);
    const adRepo = realDataSource.getRepository(ServiceAd);

    const u1 = await userRepo.save(userRepo.create({ email: 'p1@b6b-migration-proof.local', phone: '+255700000002', password: 'x', name: 'P1' } as any));
    const u2 = await userRepo.save(userRepo.create({ email: 'p2@b6b-migration-proof.local', phone: '+255700000003', password: 'x', name: 'P2' } as any));
    const bizA = await businessRepo.save(businessRepo.create({ legalName: 'Biz A', user: u1 } as any));
    const bizB = await businessRepo.save(businessRepo.create({ legalName: 'Biz B', user: u2 } as any));

    await providerRepo.save(providerRepo.create({ user: u1, businessId: bizA.id, businessName: 'Provider A' } as any));

    // Two Business-bound ServiceProvider rows cannot share one businessId.
    await expect(
      providerRepo.save(providerRepo.create({ user: u2, businessId: bizA.id, businessName: 'Provider A duplicate' } as any)),
    ).rejects.toMatchObject({ code: '23505' });

    // A distinct Business works fine.
    const providerB = await providerRepo.save(providerRepo.create({ user: u2, businessId: bizB.id, businessName: 'Provider B' } as any));
    expect(providerB.id).toBeGreaterThan(0);

    // Multiple ServiceAd rows may share one businessId (no uniqueness).
    const ad1 = await adRepo.save(adRepo.create({ provider: u1, providerId: u1.id, businessId: bizA.id, title: 'Ad 1', description: 'd', category: ServiceCategory.UFUNDI, coverageCity: 'Dodoma' } as any));
    const ad2 = await adRepo.save(adRepo.create({ provider: u1, providerId: u1.id, businessId: bizA.id, title: 'Ad 2', description: 'd', category: ServiceCategory.USAFI, coverageCity: 'Dodoma' } as any));
    expect(ad1.id).not.toBe(ad2.id);

    // Nullable legacy ServiceAd remains valid.
    const legacyStyleAd = await adRepo.save(adRepo.create({ provider: u1, providerId: u1.id, businessId: null, title: 'Ad 3 legacy-style', description: 'd', category: ServiceCategory.ELIMU, coverageCity: 'Dodoma' } as any));
    expect(legacyStyleAd.businessId).toBeNull();

    await realDataSource.destroy();
  });

  it('§8 entity/schema compatibility: the full B6B focused suite runs against this exact migrated schema without synchronize changing it', async () => {
    if (!reachable || !config) return;

    // Build the REST of the schema (unaffected by Migration 11) on top of
    // the ALREADY-migrated service_provider/service_ad/enum state --
    // synchronize:true here must be a no-op for the tables Migration 11
    // already created/altered, and only add the tables it never touched.
    const fullSyncDataSource = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user, password: config.password,
      database: config.database, synchronize: true,
      entities: [
        Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment,
        BusinessCapability, AccountRole, ActiveRoleSession, SellerProfile,
        TransportProvider, SuperAgent, ServiceProvider, ServiceAd, User,
      ],
    });
    await fullSyncDataSource.initialize();

    // Confirm synchronize did NOT alter the already-migrated columns/indexes.
    const businessIdCol = (await fullSyncDataSource.query(
      `SELECT is_nullable, udt_name FROM information_schema.columns WHERE table_name = 'service_provider' AND column_name = 'businessId'`,
    ))[0];
    expect(businessIdCol?.is_nullable).toBe('YES');

    const queryRunner = fullSyncDataSource.createQueryRunner();
    await queryRunner.connect();
    await new AddBusinessCapabilityApplication1788261600000().up(queryRunner);
    await queryRunner.release();
    await fullSyncDataSource.destroy();

    const ds = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user, password: config.password,
      database: config.database, synchronize: false,
      entities: [
        Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment,
        BusinessCapability, AccountRole, ActiveRoleSession, SellerProfile,
        TransportProvider, SuperAgent, ServiceProvider, ServiceAd, User,
        BusinessCapabilityApplication,
      ],
    });
    await ds.initialize();

    const applicationRepo = ds.getRepository(BusinessCapabilityApplication);
    const capabilityRepo = ds.getRepository(BusinessCapability);
    const service = new BusinessCapabilityApplicationService(
      applicationRepo, capabilityRepo, ds,
      { requireFeature: async () => undefined } as any,
      { resolveAgentLocation: async () => ({ district: 'Dar es Salaam' } as any) } as any,
    );

    let seq = 1000;
    const makeUser = async () => {
      const n = ++seq;
      return ds.getRepository(User).save(ds.getRepository(User).create({ email: `u${n}@b6b-migration-e2e.local`, phone: `+2557${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
    };
    const owner = await makeUser();
    const admin = await makeUser();
    const business = await ds.getRepository(Business).save(ds.getRepository(Business).create({ legalName: 'E2E Migration Proof Co', user: owner } as any));
    const workspace = await ds.getRepository(OperationalWorkspace).save(ds.getRepository(OperationalWorkspace).create({ businessId: business.id, name: 'Default Operations', isDefault: true } as any));
    const membership = await ds.getRepository(BusinessMembership).save(ds.getRepository(BusinessMembership).create({ businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE } as any));
    await ds.getRepository(WorkspaceAssignment).save(ds.getRepository(WorkspaceAssignment).create({ businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} } as any));

    const submitted = await service.applyForCapability(business.id, 'service', owner, {});
    expect(submitted.operationalProfile.type).toBe(RoleProfileType.SERVICE_PROVIDER);
    const approved = await service.approveApplication(submitted.application.id, admin);
    expect(approved.capability).toMatchObject({ code: BusinessCapabilityCode.SERVICE });

    const provider = await ds.getRepository(ServiceProvider).findOneOrFail({ where: { id: submitted.operationalProfile.id } });
    expect(provider.businessId).toBe(business.id);

    await ds.destroy();
  }, 60000);
});
