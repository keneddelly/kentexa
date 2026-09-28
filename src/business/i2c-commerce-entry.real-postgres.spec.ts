import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  bootstrapB5BTestSchema,
  B5B_ALL_ENTITIES,
} from './b5b-closure-test-db';
import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { Business, BusinessStatus } from './entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { User } from '../users/entities/user.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * I2C — Canonical Business "start selling" entry, real PostgreSQL. Proves the
 * server-derived COMMERCE state (GET /business/:id/commerce-entry) and that the
 * EXISTING generic engine (apply -> admin approve/reject) keeps
 *   Business selected -> application for THAT Business -> activation for THAT
 *   Business -> selling context for THAT Business
 * exact, with the owner's Personal legacy Seller and their other Business
 * untouched. Uses the dedicated kentexa_b5b_test database behind the shared
 * safety gate; skipped (never failed) when it is not configured.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('I2C — canonical Business commerce entry, real disposable-DB', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let service: BusinessCapabilityApplicationService;
  let seq = 0;
  const denyVerification = new Map<number, 'VERIFICATION_REQUIRED' | 'VERIFICATION_REJECTED'>();
  const verificationStub = {
    requireFeature: jest.fn(async (userId: number) => {
      const code = denyVerification.get(userId);
      if (code) throw new ForbiddenException({ code, message: code });
    }),
  };

  const repo = <T,>(e: new () => T) => ds.getRepository(e as any) as any;
  const makeUser = async (name: string) => {
    const n = ++seq;
    return repo(User).save(repo(User).create({ email: `u${n}@i2c-test.local`, phone: `+2552${String(n).padStart(8, '0')}`, password: 'x', name }));
  };
  const makeBusiness = async (owner: User, name: string) => {
    const business = await repo(Business).save(repo(Business).create({ legalName: name, tradingName: name, user: owner, status: BusinessStatus.ACTIVE }));
    const workspace = await repo(OperationalWorkspace).save(repo(OperationalWorkspace).create({ businessId: business.id, name: 'Default Operations', isDefault: true, status: OperationalWorkspaceStatus.ACTIVE }));
    const membership = await repo(BusinessMembership).save(repo(BusinessMembership).create({ businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE }));
    const assignment = await repo(WorkspaceAssignment).save(repo(WorkspaceAssignment).create({ businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} }));
    return { business, workspace, membership, assignment };
  };
  // The owner's Personal legacy Seller: unbound SellerProfile + unbound SELLER AccountRole.
  const makePersonalLegacySeller = async (owner: User) => {
    const profile = await repo(SellerProfile).save(repo(SellerProfile).create({ user: owner, businessName: 'Bob Personal Shop', sellerType: 'individual', status: SellerStatus.APPROVED }));
    const role = await repo(AccountRole).save(repo(AccountRole).create({
      userId: owner.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE,
      profileId: profile.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
    }));
    return { profile, role };
  };
  const snapshot = async () => ({
    sellerProfiles: await ds.query(`SELECT id, "businessId", status::text, "userId" FROM seller_profile ORDER BY id`),
    roles: await ds.query(`SELECT id, "userId", "roleType"::text, status::text, "profileId", "workspaceAssignmentId" FROM account_role ORDER BY id`),
    capabilities: await ds.query(`SELECT "workspaceId", "capabilityCode"::text, status::text FROM business_capability ORDER BY id`),
    applications: await ds.query(`SELECT id, "businessId", "workspaceId", status::text FROM business_capability_application ORDER BY id`),
  });

  let bob: User, wm: any, be: any, personal: any, admin: User;

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    await bootstrapB5BTestSchema(config!);
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: false, entities: [...B5B_ALL_ENTITIES],
    });
    await ds.initialize();
    service = new BusinessCapabilityApplicationService(
      repo(BusinessCapabilityApplication), repo(BusinessCapability), ds, verificationStub as any, {} as any,
    );
    admin = await makeUser('Admin');
    bob = await makeUser('Bob');
    personal = await makePersonalLegacySeller(bob); // Bob Personal
    wm = await makeBusiness(bob, 'Washing Machine TZ');
    be = await makeBusiness(bob, 'Bob Electronics');
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  const stateOf = (b: any, u: User = bob) => service.getCommerceEntryState(b.business.id, u);
  const apply = (b: any, u: User = bob) => service.applyForCapability(b.business.id, 'commerce', u, {});
  const errCode = (e: any) => e?.getResponse?.()?.code;

  it('A. no COMMERCE anywhere: each Business is independently "available" — Bob Personal\'s legacy Seller does NOT make either look like it is selling', async () => {
    for (const b of [wm, be]) {
      expect(await stateOf(b)).toEqual({ businessId: b.business.id, state: 'available', canApply: true, verification: 'ok', rejectionReason: null, blockedReason: null });
    }
  });

  it('A/B. "Start selling" applies for Washing Machine TZ\'s EXACT workspace; a second tap is refused (no duplicate) and the state is a simple pending', async () => {
    const before = await snapshot();
    const out = await apply(wm);
    expect(out.application).toMatchObject({ status: 'pending', capabilityCode: 'commerce' });
    const snap = await snapshot();
    expect(snap.applications).toEqual([{ id: expect.any(Number), businessId: wm.business.id, workspaceId: wm.workspace.id, status: 'pending' }]);
    // exactly ONE new seller profile, bound to Washing Machine TZ, PENDING; one new role bound to WM's assignment, PENDING
    const newProfiles = snap.sellerProfiles.filter((p: any) => !before.sellerProfiles.some((o: any) => o.id === p.id));
    expect(newProfiles).toEqual([{ id: expect.any(Number), businessId: wm.business.id, status: 'pending', userId: bob.id }]);
    const newRoles = snap.roles.filter((r: any) => !before.roles.some((o: any) => o.id === r.id));
    expect(newRoles).toEqual([expect.objectContaining({ userId: bob.id, roleType: 'seller', status: 'pending', workspaceAssignmentId: wm.assignment.id })]);

    await expect(apply(wm)).rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });
    expect((await snapshot()).applications).toHaveLength(1);
    expect(await stateOf(wm)).toMatchObject({ state: 'pending', canApply: false });
  });

  it('D/E. while WM is pending, Bob Electronics is untouched and Bob Personal\'s legacy Seller is unchanged (still unbound, not attached to WM)', async () => {
    expect(await stateOf(be)).toMatchObject({ state: 'available', canApply: true });
    const snap = await snapshot();
    expect(snap.sellerProfiles.find((p: any) => p.id === personal.profile.id)).toMatchObject({ businessId: null, status: 'approved' });
    expect(snap.roles.find((r: any) => r.id === personal.role.id)).toMatchObject({ status: 'active', workspaceAssignmentId: null, profileId: personal.profile.id });
    expect(snap.applications.every((a: any) => a.businessId === wm.business.id)).toBe(true);
    expect(snap.capabilities).toEqual([]);
  });

  it('C. admin approval activates COMMERCE for Washing Machine TZ only, through the canonical organizational chain; state becomes active', async () => {
    const [{ id: applicationId }] = await ds.query(`SELECT id FROM business_capability_application WHERE "businessId" = $1`, [wm.business.id]);
    await service.approveApplication(applicationId, admin);
    const snap = await snapshot();
    expect(snap.capabilities).toEqual([{ workspaceId: wm.workspace.id, capabilityCode: 'commerce', status: 'active' }]);
    const wmProfile = snap.sellerProfiles.find((p: any) => p.businessId === wm.business.id);
    expect(wmProfile).toMatchObject({ status: 'approved', userId: bob.id });
    const wmRole = snap.roles.find((r: any) => r.workspaceAssignmentId === wm.assignment.id);
    expect(wmRole).toMatchObject({ roleType: 'seller', status: 'active', profileId: wmProfile.id });
    expect(await stateOf(wm)).toMatchObject({ state: 'active', canApply: false, verification: 'ok' });
    // F. an active Business can no longer apply (the engine refuses; the UI never offers it)
    await expect(apply(wm)).rejects.toMatchObject({ response: { code: 'CAPABILITY_ALREADY_ACTIVE' } });
  });

  it('D/E. after activation: Bob Electronics has NO seller profile, role, capability or application; Bob Personal is still Personal/unbound', async () => {
    const snap = await snapshot();
    expect(snap.sellerProfiles.filter((p: any) => p.businessId === be.business.id)).toEqual([]);
    expect(snap.roles.filter((r: any) => r.workspaceAssignmentId === be.assignment.id)).toEqual([]);
    expect(snap.capabilities.filter((c: any) => c.workspaceId === be.workspace.id)).toEqual([]);
    expect(snap.applications.filter((a: any) => a.businessId === be.business.id)).toEqual([]);
    expect(await stateOf(be)).toMatchObject({ state: 'available', canApply: true });
    expect(snap.sellerProfiles.find((p: any) => p.id === personal.profile.id)).toMatchObject({ businessId: null, status: 'approved' });
    expect(snap.roles.find((r: any) => r.id === personal.role.id)).toMatchObject({ workspaceAssignmentId: null, status: 'active' });
    expect(snap.sellerProfiles).toHaveLength(2); // personal + Washing Machine TZ, nothing else invented
  });

  it('G. rejection + reapply is deterministic: reason surfaced, canApply true, the SAME profile/role rows are reused (no duplicates)', async () => {
    await apply(be);
    const [{ id: applicationId }] = await ds.query(`SELECT id FROM business_capability_application WHERE "businessId" = $1`, [be.business.id]);
    await service.rejectApplication(applicationId, admin, 'Documents unclear');
    const rejected = await stateOf(be);
    expect(rejected).toMatchObject({ state: 'rejected', canApply: true, rejectionReason: 'Documents unclear' });
    const before = await snapshot();
    await apply(be);
    const after = await snapshot();
    expect(after.sellerProfiles).toHaveLength(before.sellerProfiles.length);
    expect(after.roles).toHaveLength(before.roles.length);
    expect(await stateOf(be)).toMatchObject({ state: 'pending', canApply: false, rejectionReason: null });
    // clean up for later tests: reject again so BE returns to a known state
    const [{ id: a2 }] = await ds.query(`SELECT id FROM business_capability_application WHERE "businessId" = $1 AND status = 'pending'`, [be.business.id]);
    await service.rejectApplication(a2, admin, 'Still unclear');
  });

  describe('H. suspended / revoked / broken authority never reads as active', () => {
    const setCapability = (status: string) =>
      ds.query(`UPDATE business_capability SET status = $1 WHERE "workspaceId" = $2 AND "capabilityCode" = 'commerce'`, [status, wm.workspace.id]);
    afterEach(async () => {
      await setCapability('active');
      await ds.query(`UPDATE account_role SET status = 'active' WHERE "workspaceAssignmentId" = $1`, [wm.assignment.id]);
      await ds.query(`UPDATE seller_profile SET status = 'approved' WHERE "businessId" = $1`, [wm.business.id]);
    });

    it('capability SUSPENDED => suspended (and the engine refuses to re-apply)', async () => {
      await setCapability('suspended');
      expect(await stateOf(wm)).toMatchObject({ state: 'suspended', canApply: false });
      await expect(apply(wm)).rejects.toMatchObject({ response: { code: 'CAPABILITY_SUSPENDED' } });
    });
    it('capability REVOKED => revoked, fail closed', async () => {
      await setCapability('revoked');
      expect(await stateOf(wm)).toMatchObject({ state: 'revoked', canApply: false });
      await expect(apply(wm)).rejects.toMatchObject({ response: { code: 'CAPABILITY_REVOKED_REQUIRES_RECONCILIATION' } });
    });
    it('capability ACTIVE but the Seller role is suspended/revoked/pending => blocked (authority), NEVER active', async () => {
      for (const st of ['suspended', 'revoked', 'pending', 'rejected']) {
        await ds.query(`UPDATE account_role SET status = $1 WHERE "workspaceAssignmentId" = $2`, [st, wm.assignment.id]);
        expect(await stateOf(wm)).toMatchObject({ state: 'blocked', canApply: false, blockedReason: 'authority_inconsistent' });
      }
    });
    it('capability ACTIVE but the SellerProfile is not approved => blocked, never active', async () => {
      for (const st of ['pending', 'suspended', 'rejected']) {
        await ds.query(`UPDATE seller_profile SET status = $1 WHERE "businessId" = $2`, [st, wm.business.id]);
        expect(await stateOf(wm)).toMatchObject({ state: 'blocked', canApply: false });
      }
    });
    it('capability ACTIVE but the role points at a DIFFERENT profile => blocked, never active; and the DB itself refuses to bind the role to the Personal Seller profile', async () => {
      // the database already forbids pointing a second role at the Personal profile
      await expect(ds.query(`UPDATE account_role SET "profileId" = $1 WHERE "workspaceAssignmentId" = $2`, [personal.profile.id, wm.assignment.id])).rejects.toThrow(/UQ_account_role_operational_profile/);
      const stray = await repo(SellerProfile).save(repo(SellerProfile).create({ user: bob, businessName: 'Stray', sellerType: 'individual', status: SellerStatus.APPROVED }));
      const wmProfile = (await ds.query(`SELECT id FROM seller_profile WHERE "businessId" = $1`, [wm.business.id]))[0];
      await ds.query(`UPDATE account_role SET "profileId" = $1 WHERE "workspaceAssignmentId" = $2`, [stray.id, wm.assignment.id]);
      expect(await stateOf(wm)).toMatchObject({ state: 'blocked', blockedReason: 'authority_inconsistent' });
      await ds.query(`UPDATE account_role SET "profileId" = $1 WHERE "workspaceAssignmentId" = $2`, [wmProfile.id, wm.assignment.id]);
      await ds.query(`DELETE FROM seller_profile WHERE id = $1`, [stray.id]);
      expect(await stateOf(wm)).toMatchObject({ state: 'active' });
    });
  });

  describe('legacy / ambiguous shapes fail closed', () => {
    it('a PENDING SellerProfile with NO live application (legacy) => blocked, canApply false — matching the engine, never adopted', async () => {
      const carol = await makeUser('Carol');
      const cb = await makeBusiness(carol, 'Carol Co');
      await repo(SellerProfile).save(repo(SellerProfile).create({ user: carol, businessId: cb.business.id, businessName: 'Carol Co', sellerType: 'business', status: SellerStatus.PENDING }));
      expect(await stateOf(cb, carol)).toMatchObject({ state: 'blocked', canApply: false, blockedReason: 'authority_inconsistent' });
      await expect(service.applyForCapability(cb.business.id, 'commerce', carol, {})).rejects.toMatchObject({ response: { code: 'LEGACY_PENDING_COMMERCE_REQUIRES_RECONCILIATION' } });
    });
    it('an APPROVED SellerProfile bound to the Business with no entitlement => blocked', async () => {
      const dan = await makeUser('Dan');
      const db = await makeBusiness(dan, 'Dan Co');
      await repo(SellerProfile).save(repo(SellerProfile).create({ user: dan, businessId: db.business.id, businessName: 'Dan Co', sellerType: 'business', status: SellerStatus.APPROVED }));
      expect(await stateOf(db, dan)).toMatchObject({ state: 'blocked', canApply: false });
    });
  });

  describe('eligibility and boundaries', () => {
    it('identity verification is reused from the engine: required/rejected => canApply false with the reason class; nothing is created', async () => {
      const eve = await makeUser('Eve');
      const eb = await makeBusiness(eve, 'Eve Co');
      denyVerification.set(eve.id, 'VERIFICATION_REQUIRED');
      expect(await stateOf(eb, eve)).toMatchObject({ state: 'available', canApply: false, verification: 'required' });
      denyVerification.set(eve.id, 'VERIFICATION_REJECTED');
      expect(await stateOf(eb, eve)).toMatchObject({ canApply: false, verification: 'rejected' });
      await expect(service.applyForCapability(eb.business.id, 'commerce', eve, {})).rejects.toBeInstanceOf(ForbiddenException);
      expect((await snapshot()).applications.filter((a: any) => a.businessId === eb.business.id)).toEqual([]);
      denyVerification.delete(eve.id);
      expect(await stateOf(eb, eve)).toMatchObject({ canApply: true, verification: 'ok' });
    });

    it('a non-owner member sees "blocked" (only an owner can start selling); a NON-member is refused outright — no existence leak', async () => {
      const frank = await makeUser('Frank');
      await repo(BusinessMembership).save(repo(BusinessMembership).create({ businessId: be.business.id, userId: frank.id, roleTemplate: BusinessMembershipRoleTemplate.MANAGER, status: BusinessMembershipStatus.ACTIVE }));
      expect(await service.getCommerceEntryState(be.business.id, frank)).toMatchObject({ state: 'blocked', canApply: false, blockedReason: 'owner_required' });
      const stranger = await makeUser('Stranger');
      await expect(service.getCommerceEntryState(be.business.id, stranger)).rejects.toMatchObject({ response: { code: 'BUSINESS_MEMBERSHIP_REQUIRED' } });
      await expect(service.getCommerceEntryState(987654, stranger)).rejects.toMatchObject({ response: { code: 'BUSINESS_MEMBERSHIP_REQUIRED' } });
    });

    it('an inactive Business or workspace is blocked, not offered', async () => {
      const gina = await makeUser('Gina');
      const gb = await makeBusiness(gina, 'Gina Co');
      await ds.query(`UPDATE business SET status = 'suspended' WHERE id = $1`, [gb.business.id]);
      expect(await stateOf(gb, gina)).toMatchObject({ state: 'blocked', blockedReason: 'business_inactive', canApply: false });
      await ds.query(`UPDATE business SET status = 'active' WHERE id = $1`, [gb.business.id]);
      await ds.query(`UPDATE operational_workspace SET status = 'suspended' WHERE id = $1`, [gb.workspace.id]);
      expect(await stateOf(gb, gina)).toMatchObject({ state: 'blocked', blockedReason: 'workspace_unresolved', canApply: false });
    });

    it('the response is an allow-list: no workspace/role/profile/assignment ids ever leave the server', async () => {
      const r: any = await stateOf(wm);
      expect(Object.keys(r).sort()).toEqual(['blockedReason', 'businessId', 'canApply', 'rejectionReason', 'state', 'verification']);
    });

    it('the state read is read-only: it writes nothing', async () => {
      const before = JSON.stringify(await snapshot());
      await stateOf(wm); await stateOf(be);
      expect(JSON.stringify(await snapshot())).toBe(before);
    });
  });
});
