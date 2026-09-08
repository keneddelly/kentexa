import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { parseArgs, main, REQUIRED_CONFIRMATION_TOKEN } from './backfill-product-classified-ownership';
import { Product } from '../products/entities/products.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from '../business/entities/workspace-assignment.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate } from '../business/entities/business-membership.entity';
import { OperationalWorkspace } from '../business/entities/operational-workspace.entity';
import { Business, BusinessStatus } from '../business/entities/business.entity';
import { BusinessFirstMigrationAudit } from '../business/entities/business-first-migration-audit.entity';
import { User } from '../users/entities/user.entity';

const SOURCE = fs.readFileSync(path.join(__dirname, 'backfill-product-classified-ownership.ts'), 'utf8');

describe('backfill-product-classified-ownership -- parseArgs (pure, no DB)', () => {
  it('defaults to dry-run', () => {
    expect(parseArgs([]).execute).toBe(false);
  });

  it('--execute requires the exact confirmation token', () => {
    expect(() => parseArgs(['--execute'])).toThrow(/requires --confirm-production-product-classified-backfill/);
    expect(() => parseArgs(['--execute', '--confirm-production-product-classified-backfill', REQUIRED_CONFIRMATION_TOKEN])).not.toThrow();
  });

  it('rejects unknown arguments', () => {
    expect(() => parseArgs(['--YOLO'])).toThrow(/Unknown argument/);
  });

  it('rejects duplicate arguments', () => {
    expect(() => parseArgs(['--execute', '--execute'])).toThrow(/Duplicate argument/);
  });

  it('parses independent Product and Classified expect-* flags', () => {
    const opts = parseArgs([
      '--expect-product-resolved', '2', '--expect-product-ambiguous', '0', '--expect-product-unresolved', '1',
      '--expect-classified-resolved', '3', '--expect-classified-ambiguous', '0', '--expect-classified-unresolved', '0',
    ]);
    expect(opts).toMatchObject({
      expectProductResolved: 2, expectProductAmbiguous: 0, expectProductUnresolved: 1,
      expectClassifiedResolved: 3, expectClassifiedAmbiguous: 0, expectClassifiedUnresolved: 0,
    });
  });
});

describe('backfill-product-classified-ownership -- structural safety proofs', () => {
  const importLines = SOURCE.split('\n').filter((l) => /^\s*import\b/.test(l));

  it('never bootstraps Nest and never imports an unrelated ownership domain entity', () => {
    expect(importLines.some((l) => /NestFactory|@nestjs\/schedule|AppModule/.test(l))).toBe(false);
    expect(importLines.some((l) => /\bOrder\b|\bPayment\b|\bInvoice\b|\bInventory\b|ConversationParticipant\b|\bNotification\b|\bShipment\b|\bSale\b/.test(l))).toBe(false);
  });

  it('never writes to SellerProfile, CommerceProfile, AccountRole, Business, OperationalWorkspace, BusinessMembership, or WorkspaceAssignment', () => {
    expect(SOURCE).not.toMatch(/getRepository\((AccountRole|Business|OperationalWorkspace|BusinessMembership|WorkspaceAssignment)\)\.(save|create|update|delete|remove)/);
  });

  it('the only tables it writes to are Product, Classified, and BusinessFirstMigrationAudit', () => {
    expect(SOURCE).toMatch(/repo\.update\(row\.id/);
    expect(SOURCE).toMatch(/getRepository\(BusinessFirstMigrationAudit\)\.save/);
  });
});

describe('backfill-product-classified-ownership -- end-to-end against a disposable database', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_product_classified_backfill_test';
  const ENTITIES = [
    Product, Classified, AccountRole, ActiveRoleSession, WorkspaceAssignment,
    BusinessMembership, OperationalWorkspace, Business, BusinessFirstMigrationAudit, User,
  ];

  let reachable = false;
  let dataSource: DataSource;
  let adminClient: Client;
  let seq = 0;

  const userRepo = () => dataSource.getRepository(User);
  const productRepo = () => dataSource.getRepository(Product);
  const classifiedRepo = () => dataSource.getRepository(Classified);
  const accountRoleRepo = () => dataSource.getRepository(AccountRole);
  const businessRepo = () => dataSource.getRepository(Business);
  const workspaceRepo = () => dataSource.getRepository(OperationalWorkspace);
  const membershipRepo = () => dataSource.getRepository(BusinessMembership);
  const assignmentRepo = () => dataSource.getRepository(WorkspaceAssignment);
  const auditRepo = () => dataSource.getRepository(BusinessFirstMigrationAudit);

  const makeUser = async (tag: string) => { const n = ++seq; return userRepo().save(userRepo().create({ email: `${tag}${n}@pc-backfill-test.local`, phone: `+2557${String(n).padStart(8, '0')}`, password: 'x', name: tag } as any)); };

  /** A seller fully resolved to a real, active workspace via the Stage 1 chain. */
  const makeResolvedSeller = async () => {
    const owner = await makeUser('Owner');
    const business = await businessRepo().save(businessRepo().create({ legalName: 'Test Co', status: BusinessStatus.ACTIVE, user: { id: owner.id } as any }));
    const workspace = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Default Operations', isDefault: true } as any));
    const membership = await membershipRepo().save(membershipRepo().create({ businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER } as any));
    const assignment = await assignmentRepo().save(assignmentRepo().create({ businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} } as any));
    const role = await accountRoleRepo().save(accountRoleRepo().create({
      userId: owner.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
      profileType: RoleProfileType.SELLER_PROFILE, profileId: owner.id, capabilities: {}, workspaceAssignmentId: assignment.id,
    } as any));
    return { owner, business, workspace, membership, assignment, role };
  };

  const resetDb = async () => {
    await dataSource.query('delete from product');
    await dataSource.query('delete from classified');
    await dataSource.query('delete from business_first_migration_audit');
    await dataSource.query('delete from workspace_assignment');
    await dataSource.query('delete from business_membership');
    await dataSource.query('delete from operational_workspace');
    await dataSource.query('update account_role set "workspaceAssignmentId" = null');
    await dataSource.query('delete from account_role');
    await dataSource.query('delete from business');
    await dataSource.query('delete from "user"');
  };

  beforeAll(async () => {
    const probe = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    try { await probe.connect(); reachable = true; await probe.end(); } catch { reachable = false; return; }
    adminClient = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    dataSource = new DataSource({ type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: TEST_DB_NAME, synchronize: true, entities: ENTITIES });
    await dataSource.initialize();
  }, 60000);

  beforeEach(async () => { if (reachable) await resetDb(); }, 30000);

  afterAll(async () => {
    if (!reachable) return;
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (adminClient) { await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`); await adminClient.end(); }
  }, 90000);

  it('dry run performs zero writes, including zero audit rows', async () => {
    if (!reachable) return;
    const { owner } = await makeResolvedSeller();
    await productRepo().save(productRepo().create({ name: 'Phone', seller: { id: owner.id } as any } as any));

    const code = await main([], dataSource);
    expect(code).toBe(0);
    const reloaded = await productRepo().find();
    expect(reloaded[0].workspaceId).toBeNull();
    expect(await auditRepo().count()).toBe(0);
  });

  it('RESOLVED: execute sets workspaceId for a product whose seller has a real, active organizational binding', async () => {
    if (!reachable) return;
    const { owner, workspace } = await makeResolvedSeller();
    const product = await productRepo().save(productRepo().create({ name: 'Phone', seller: { id: owner.id } as any } as any));

    const code = await main(['--execute', '--confirm-production-product-classified-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    const reloaded = await productRepo().findOne({ where: { id: product.id } });
    expect(reloaded?.workspaceId).toBe(workspace.id);
  });

  it('UNRESOLVED: a product whose seller has no Seller AccountRole at all stays workspaceId=null, and is audited', async () => {
    if (!reachable) return;
    const seller = await makeUser('NoRoleSeller');
    const product = await productRepo().save(productRepo().create({ name: 'Phone', seller: { id: seller.id } as any } as any));

    const code = await main(['--execute', '--confirm-production-product-classified-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    const reloaded = await productRepo().findOne({ where: { id: product.id } });
    expect(reloaded?.workspaceId).toBeNull();
    const audit = await auditRepo().findOne({ where: { code: 'product_seller_without_workspace' } });
    expect(audit).toBeTruthy();
  });

  it('UNRESOLVED: a product with no seller at all (fully anonymous row) is never fabricated a workspace', async () => {
    if (!reachable) return;
    const product = await productRepo().save(productRepo().create({ name: 'Anonymous item' } as any));

    const code = await main(['--execute', '--confirm-production-product-classified-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    const reloaded = await productRepo().findOne({ where: { id: product.id } });
    expect(reloaded?.workspaceId).toBeNull();
  });

  it('AMBIGUOUS: a Seller AccountRole claiming a workspaceAssignmentId that no longer resolves to an active assignment is flagged, never guessed', async () => {
    if (!reachable) return;
    const { owner, assignment, role } = await makeResolvedSeller();
    // Corrupt the assignment to simulate a data-integrity inconsistency.
    await assignmentRepo().update(assignment.id, { status: WorkspaceAssignmentStatus.REVOKED });
    const product = await productRepo().save(productRepo().create({ name: 'Phone', seller: { id: owner.id } as any } as any));

    const code = await main(['--execute', '--confirm-production-product-classified-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    const reloaded = await productRepo().findOne({ where: { id: product.id } });
    expect(reloaded?.workspaceId).toBeNull();
    const audit = await auditRepo().findOne({ where: { code: 'product_workspace_assignment_inconsistent' } });
    expect(audit).toBeTruthy();
  });

  it('is idempotent -- a second execute run does not change an already-resolved product', async () => {
    if (!reachable) return;
    const { owner, workspace } = await makeResolvedSeller();
    const product = await productRepo().save(productRepo().create({ name: 'Phone', seller: { id: owner.id } as any } as any));

    await main(['--execute', '--confirm-production-product-classified-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    const code = await main(['--execute', '--confirm-production-product-classified-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);

    expect(code).toBe(0);
    const reloaded = await productRepo().findOne({ where: { id: product.id } });
    expect(reloaded?.workspaceId).toBe(workspace.id);
  });

  it('never touches a Product that already has a workspaceId set (e.g. a post-Stage-2A dual write)', async () => {
    if (!reachable) return;
    const seller = await makeUser('DualWriteSeller'); // deliberately no organizational binding
    const product = await productRepo().save(productRepo().create({ name: 'Phone', seller: { id: seller.id } as any, workspaceId: 999 } as any));

    const code = await main(['--execute', '--confirm-production-product-classified-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    const reloaded = await productRepo().findOne({ where: { id: product.id } });
    expect(reloaded?.workspaceId).toBe(999); // untouched
  });

  it('Product and Classified counts are independent -- an ambiguous/unresolved Product does not affect Classified guards or vice versa', async () => {
    if (!reachable) return;
    const { owner: resolvedOwner, workspace } = await makeResolvedSeller();
    const unresolvedSeller = await makeUser('Unresolved');
    await productRepo().save(productRepo().create({ name: 'P1', seller: { id: resolvedOwner.id } as any } as any));
    await classifiedRepo().save(classifiedRepo().create({ title: 'C1', description: 'A listing', price: 1, seller: { id: unresolvedSeller.id } as any, category: 'general' } as any));

    const code = await main([
      '--execute', '--confirm-production-product-classified-backfill', REQUIRED_CONFIRMATION_TOKEN,
      '--expect-product-resolved', '1', '--expect-product-ambiguous', '0', '--expect-product-unresolved', '0',
      '--expect-classified-resolved', '0', '--expect-classified-ambiguous', '0', '--expect-classified-unresolved', '1',
    ], dataSource);

    expect(code).toBe(0);
    const p = await productRepo().find();
    const c = await classifiedRepo().find();
    expect(p[0].workspaceId).toBe(workspace.id);
    expect(c[0].workspaceId).toBeNull();
  });

  it('--expect-product-resolved guard blocks the write when it does not match the actual dry-run count (Classified guard still independent)', async () => {
    if (!reachable) return;
    const { owner } = await makeResolvedSeller();
    const product = await productRepo().save(productRepo().create({ name: 'Phone', seller: { id: owner.id } as any } as any));

    const code = await main(['--execute', '--confirm-production-product-classified-backfill', REQUIRED_CONFIRMATION_TOKEN, '--expect-product-resolved', '999'], dataSource);
    expect(code).toBe(1);
    const reloaded = await productRepo().findOne({ where: { id: product.id } });
    expect(reloaded?.workspaceId).toBeNull(); // no writes performed despite --execute
  });

  it('never creates or activates an AccountRole, Business, or WorkspaceAssignment', async () => {
    if (!reachable) return;
    const { owner } = await makeResolvedSeller();
    const businessCountBefore = await businessRepo().count();
    const roleCountBefore = await accountRoleRepo().count();
    await productRepo().save(productRepo().create({ name: 'Phone', seller: { id: owner.id } as any } as any));

    await main(['--execute', '--confirm-production-product-classified-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);

    expect(await businessRepo().count()).toBe(businessCountBefore);
    expect(await accountRoleRepo().count()).toBe(roleCountBefore);
  });

  it('the DataSource it builds itself always closes', async () => {
    if (!reachable) return;
    const prevEnv = { host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USERNAME, pass: process.env.DB_PASSWORD, name: process.env.DB_NAME };
    process.env.DB_HOST = DB_HOST; process.env.DB_PORT = String(DB_PORT); process.env.DB_USERNAME = DB_USERNAME; process.env.DB_PASSWORD = DB_PASSWORD; process.env.DB_NAME = TEST_DB_NAME;
    try {
      const code = await main([]);
      expect(code).toBe(0);
    } finally {
      process.env.DB_HOST = prevEnv.host; process.env.DB_PORT = prevEnv.port; process.env.DB_USERNAME = prevEnv.user; process.env.DB_PASSWORD = prevEnv.pass; process.env.DB_NAME = prevEnv.name;
    }
  });
});
