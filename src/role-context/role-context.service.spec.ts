import { RoleContextService } from './role-context.service';
import { AccountRoleStatus, AccountRoleType, RoleProfileType } from './entities/account-role.entity';

const role = {
  id: 10, userId: 1, roleType: AccountRoleType.BUYER,
  status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.USER,
  profileId: 1, capabilities: {}, contextVersion: 1,
};

describe('RoleContextService', () => {
  const repos = () => {
    const userRepo: any = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
    const roleRepo: any = { findOne: jest.fn().mockResolvedValue(role), find: jest.fn().mockResolvedValue([]) };
    const sessionRepo: any = {
      findOne: jest.fn().mockResolvedValue({ id: 'session-1', userId: 1, accountRoleId: 10, contextVersion: 1, expiresAt: new Date(Date.now() + 60_000), revokedAt: null }),
      update: jest.fn(),
    };
    const profileRepo: any = { findOne: jest.fn() };
    const workspaceAssignmentRepo: any = { manager: { query: jest.fn().mockResolvedValue([]) } };
    const sessionEvents: any = { emitRevoked: jest.fn() };
    return { userRepo, roleRepo, sessionRepo, profileRepo, workspaceAssignmentRepo, sessionEvents };
  };

  it('resolves authority from sid/rid, not informational rt', async () => {
    const r = repos();
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
    const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.ADMIN, cv: 1 });
    expect(context.roleType).toBe(AccountRoleType.BUYER);
  });

  it('rejects a revoked old session', async () => {
    const r = repos();
    r.sessionRepo.findOne.mockResolvedValue({ id: 'session-1', userId: 1, accountRoleId: 10, contextVersion: 1, expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() });
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.BUYER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_REVOKED' } });
  });

  it('rejects a suspended AccountRole even with a valid session', async () => {
    const r = repos();
    r.roleRepo.findOne.mockResolvedValue({ ...role, status: AccountRoleStatus.SUSPENDED });
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.BUYER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_NOT_ACTIVE' } });
  });

  it('rejects a context-version mismatch', async () => {
    const r = repos();
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.BUYER, cv: 2 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_VERSION_MISMATCH' } });
  });

  it('rejects an operational membership whose trusted profile is missing', async () => {
    const r = repos();
    r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SELLER, profileType: RoleProfileType.SELLER_PROFILE, profileId: 88 });
    r.profileRepo.findOne.mockResolvedValue(null);
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_PROFILE_INVALID' } });
  });

  it('rejects a role/profile-type mismatch even when the profile exists', async () => {
    const r = repos();
    r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SELLER, profileType: RoleProfileType.AGENT, profileId: 88 });
    r.profileRepo.findOne.mockResolvedValue({ id: 88, userId: 1 });
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_PROFILE_INVALID' } });
  });

  // Multi-Business Authority Stage 1B — required abuse test: listRoles()
  // with two AccountRole rows of the same roleType must return two
  // distinct entries, each carrying enough organizational metadata
  // (businessId/businessName/workspaceId) for a future frontend to
  // distinguish e.g. "Transport — BIS" from "Transport — Kentexa
  // Logistics", never collapsing or deduplicating by roleType.
  describe('listRoles — multiplicity', () => {
    it('returns two distinct entries for two AccountRole rows of the same roleType, each with businessId/workspaceId/businessName', async () => {
      const transportA = {
        id: 200, userId: 1, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId: 20, capabilities: {}, contextVersion: 1,
        workspaceAssignmentId: 1,
      };
      const transportB = {
        id: 201, userId: 1, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId: 21, capabilities: {}, contextVersion: 1,
        workspaceAssignmentId: 2,
      };
      const r = repos();
      r.roleRepo.find.mockResolvedValue([transportA, transportB]);
      r.workspaceAssignmentRepo.manager.query.mockImplementation((_sql: string, params: any[]) => {
        const [assignmentId] = params;
        if (assignmentId === 1) return Promise.resolve([{ businessId: 10, workspaceId: 1, businessName: 'BIS', capabilityActive: true }]);
        if (assignmentId === 2) return Promise.resolve([{ businessId: 11, workspaceId: 2, businessName: 'Kentexa Logistics', capabilityActive: true }]);
        return Promise.resolve([]);
      });
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);

      const roles = await service.listRoles(1);

      expect(roles).toHaveLength(2);
      expect(roles[0]).toMatchObject({ accountRoleId: 200, roleType: AccountRoleType.TRANSPORT_PROVIDER, businessId: 10, businessName: 'BIS', workspaceId: 1 });
      expect(roles[1]).toMatchObject({ accountRoleId: 201, roleType: AccountRoleType.TRANSPORT_PROVIDER, businessId: 11, businessName: 'Kentexa Logistics', workspaceId: 2 });
    });

    it('a broken organizational chain for one role never breaks listing the others (best-effort per row)', async () => {
      const transportA = {
        id: 200, userId: 1, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId: 20, capabilities: {}, contextVersion: 1,
        workspaceAssignmentId: 1,
      };
      const r = repos();
      r.roleRepo.find.mockResolvedValue([transportA]);
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([]); // broken chain -- ROLE_CONTEXT_ORGANIZATIONAL_REVOKED internally
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);

      const roles = await service.listRoles(1);

      expect(roles).toHaveLength(1);
      expect(roles[0]).toMatchObject({ accountRoleId: 200, businessId: null, workspaceId: null, businessName: null });
    });
  });

  describe('syncOperationalRole', () => {
    const syncRepos = (existing: any = null) => {
      const roleRepo: any = {
        findOne: jest.fn().mockResolvedValue(existing),
        merge: jest.fn((target, patch) => Object.assign(target, patch)),
        create: jest.fn((data) => data),
        save: jest.fn((data) => Promise.resolve({ id: existing?.id ?? 99, ...data })),
      };
      const sessionRepo: any = { update: jest.fn() };
      const other: any = { findOne: jest.fn() };
      const sessionEvents: any = { emitRevoked: jest.fn() };
      return {
        service: new RoleContextService(other, roleRepo, sessionRepo, other, other, other, other, other, sessionEvents),
        roleRepo,
        sessionRepo,
        sessionEvents,
      };
    };

    it('creates a new AccountRole (contextVersion 1) when the user has never held this role before', async () => {
      const { service, roleRepo, sessionRepo } = syncRepos(null);
      const saved = await service.syncOperationalRole({
        userId: 5, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 77,
      });
      expect(saved).toMatchObject({ userId: 5, roleType: AccountRoleType.SELLER, contextVersion: 1 });
      expect(sessionRepo.update).not.toHaveBeenCalled();
    });

    it('bumps contextVersion and revokes existing sessions when re-approving a previously-known role', async () => {
      const existing = {
        id: 42, userId: 5, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.SUSPENDED,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 77, contextVersion: 3,
      };
      const { service, sessionRepo } = syncRepos(existing);
      const saved = await service.syncOperationalRole({
        userId: 5, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 77,
      });
      expect(saved.contextVersion).toBe(4);
      expect(sessionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ accountRoleId: 42 }),
        expect.objectContaining({ revokeReason: 'role_status_synced_active' }),
      );
    });

    it('suspending an active role also revokes its sessions, invalidating any outstanding authority', async () => {
      const existing = {
        id: 42, userId: 5, roleType: AccountRoleType.AGENT, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.AGENT, profileId: 12, contextVersion: 1,
      };
      const { service, sessionRepo } = syncRepos(existing);
      await service.syncOperationalRole({
        userId: 5, roleType: AccountRoleType.AGENT, status: AccountRoleStatus.SUSPENDED,
        profileType: RoleProfileType.AGENT, profileId: 12,
      });
      expect(sessionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ accountRoleId: 42 }),
        expect.objectContaining({ revokeReason: 'role_status_synced_suspended' }),
      );
    });

    it('announces the revocation via RoleSessionEventsService so a connected socket can be dropped', async () => {
      const existing = {
        id: 42, userId: 5, roleType: AccountRoleType.AGENT, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.AGENT, profileId: 12, contextVersion: 1,
      };
      const { service, sessionEvents } = syncRepos(existing);
      await service.syncOperationalRole({
        userId: 5, roleType: AccountRoleType.AGENT, status: AccountRoleStatus.SUSPENDED,
        profileType: RoleProfileType.AGENT, profileId: 12,
      });
      expect(sessionEvents.emitRevoked).toHaveBeenCalledWith(
        expect.objectContaining({ accountRoleId: 42, reason: 'role_status_synced_suspended' }),
      );
    });
  });

  it('resolves only the session-bound role, never a different role the same account also possesses', async () => {
    // The account holds BOTH a BUYER role (id 10, this session) and an ADMIN role (id 99).
    // resolveContext is keyed strictly off payload.rid/session.accountRoleId, so it can never
    // "pick up" the account's other role no matter what that other role's status/type is.
    const r = repos();
    r.roleRepo.findOne.mockImplementation(({ where }: any) => {
      if (where.id === 10) return Promise.resolve(role);
      if (where.id === 99) return Promise.resolve({ ...role, id: 99, roleType: AccountRoleType.ADMIN });
      return Promise.resolve(null);
    });
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
    const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.BUYER, cv: 1 });
    expect(context.roleType).toBe(AccountRoleType.BUYER);
    expect(context.accountRoleId).toBe(10);
  });

  describe('organizational resolution (Business-First Stage 1)', () => {
    it('NULL ORGANIZATIONAL ROLE: workspaceAssignmentId null (Buyer/Agent/platform/unmigrated) resolves businessId/workspaceId to null, never an error', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue({ ...role, workspaceAssignmentId: null });
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.BUYER, cv: 1 });
      expect(context.businessId).toBeNull();
      expect(context.workspaceId).toBeNull();
      expect(r.workspaceAssignmentRepo.manager.query).not.toHaveBeenCalled();
    });

    it('VALID ORGANIZATIONAL SELLER: a bound, fully active chain resolves the exact Business/Workspace ids', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SELLER, profileType: RoleProfileType.SELLER_PROFILE, workspaceAssignmentId: 2 });
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([{ businessId: 2, workspaceId: 2, capabilityActive: true }]);
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 });
      expect(context.businessId).toBe(2);
      expect(context.workspaceId).toBe(2);
      expect(r.workspaceAssignmentRepo.manager.query).toHaveBeenCalledWith(expect.any(String), [2, 'commerce']);
    });

    it('REVOKED MEMBERSHIP / REVOKED WORKSPACE ASSIGNMENT / SUSPENDED WORKSPACE / INVALID CROSS-BUSINESS CHAIN: any broken link -- the query returns zero rows -- fails closed, never null/null', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SELLER, profileType: RoleProfileType.SELLER_PROFILE, workspaceAssignmentId: 2 });
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([]); // no row: any one of revoked/suspended/inconsistent
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 }))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_ORGANIZATIONAL_REVOKED' } });
    });

    it('PENDING ACCOUNTROLE: a valid workspaceAssignmentId binding does NOT bypass the existing ROLE_NOT_ACTIVE check -- organizational resolution never even runs', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.PENDING, workspaceAssignmentId: 1 });
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 }))
        .rejects.toMatchObject({ response: { code: 'ROLE_NOT_ACTIVE' } });
      // The organizational chain is never even queried -- status is checked first.
      expect(r.workspaceAssignmentRepo.manager.query).not.toHaveBeenCalled();
    });
  });

  // Business Capability Activation Stage A — required test list items 1-20.
  describe('BusinessCapability entitlement enforcement (Stage A)', () => {
    const bound = (roleType: AccountRoleType, profileType: RoleProfileType, workspaceAssignmentId: number) => ({
      ...role, roleType, profileType, workspaceAssignmentId,
    });

    it('1. unbound Seller remains valid — capability query never runs', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SELLER, profileType: RoleProfileType.SELLER_PROFILE, workspaceAssignmentId: null });
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 });
      expect(context.businessId).toBeNull();
      expect(r.workspaceAssignmentRepo.manager.query).not.toHaveBeenCalled();
    });

    it('2. unbound Transport Provider remains valid — capability query never runs', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.TRANSPORT_PROVIDER, profileType: RoleProfileType.TRANSPORT_PROVIDER, workspaceAssignmentId: null });
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.TRANSPORT_PROVIDER, cv: 1 });
      expect(context.businessId).toBeNull();
      expect(r.workspaceAssignmentRepo.manager.query).not.toHaveBeenCalled();
    });

    it('3. unbound Super Agent remains valid — capability query never runs', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SUPER_AGENT, profileType: RoleProfileType.SUPER_AGENT, workspaceAssignmentId: null });
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SUPER_AGENT, cv: 1 });
      expect(context.businessId).toBeNull();
      expect(r.workspaceAssignmentRepo.manager.query).not.toHaveBeenCalled();
    });

    it('4. bound Seller + COMMERCE active succeeds', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue(bound(AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, 2));
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([{ businessId: 2, workspaceId: 2, businessName: 'BiS', capabilityActive: true }]);
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 });
      expect(context.workspaceId).toBe(2);
      expect(r.workspaceAssignmentRepo.manager.query).toHaveBeenCalledWith(expect.any(String), [2, 'commerce']);
    });

    it('5. bound Seller + COMMERCE suspended fails ROLE_CONTEXT_CAPABILITY_INACTIVE', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue(bound(AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, 2));
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([{ businessId: 2, workspaceId: 2, businessName: 'BiS', capabilityActive: false }]);
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 }))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' } });
    });

    it('6. bound Seller + COMMERCE revoked fails ROLE_CONTEXT_CAPABILITY_INACTIVE (same as suspended: the EXISTS filter only matches status = active)', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue(bound(AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, 2));
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([{ businessId: 2, workspaceId: 2, businessName: 'BiS', capabilityActive: false }]);
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 }))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' } });
    });

    it('7. bound Seller + missing (never granted) COMMERCE fails the same way as suspended/revoked', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue(bound(AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, 2));
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([{ businessId: 2, workspaceId: 2, businessName: 'BiS', capabilityActive: false }]);
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 }))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' } });
    });

    it('8. bound Transport + TRANSPORT active succeeds', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue(bound(AccountRoleType.TRANSPORT_PROVIDER, RoleProfileType.TRANSPORT_PROVIDER, 5));
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([{ businessId: 3, workspaceId: 5, businessName: 'ABC Transport', capabilityActive: true }]);
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.TRANSPORT_PROVIDER, cv: 1 });
      expect(context.workspaceId).toBe(5);
      expect(r.workspaceAssignmentRepo.manager.query).toHaveBeenCalledWith(expect.any(String), [5, 'transport']);
    });

    it('9. bound Transport + TRANSPORT suspended fails', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue(bound(AccountRoleType.TRANSPORT_PROVIDER, RoleProfileType.TRANSPORT_PROVIDER, 5));
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([{ businessId: 3, workspaceId: 5, businessName: 'ABC Transport', capabilityActive: false }]);
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.TRANSPORT_PROVIDER, cv: 1 }))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' } });
    });

    it('10. bound Super Agent + SUPER_AGENT active succeeds', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue(bound(AccountRoleType.SUPER_AGENT, RoleProfileType.SUPER_AGENT, 7));
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([{ businessId: 4, workspaceId: 7, businessName: 'Kentexa Logistics', capabilityActive: true }]);
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SUPER_AGENT, cv: 1 });
      expect(context.workspaceId).toBe(7);
      expect(r.workspaceAssignmentRepo.manager.query).toHaveBeenCalledWith(expect.any(String), [7, 'super_agent']);
    });

    it('11. bound Super Agent + SUPER_AGENT suspended fails', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue(bound(AccountRoleType.SUPER_AGENT, RoleProfileType.SUPER_AGENT, 7));
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([{ businessId: 4, workspaceId: 7, businessName: 'Kentexa Logistics', capabilityActive: false }]);
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SUPER_AGENT, cv: 1 }))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' } });
    });

    it('12. Workspace A suspension is isolated to A — Workspace B is a separate query call unaffected by A\'s result', async () => {
      const r = repos();
      // Two independent resolveOrganizationalContext calls (simulating AR-A and AR-B) --
      // each is its own query invocation keyed by its own workspaceAssignmentId, so A's
      // suspension can only ever affect a query filtered to A's own workspaceId.
      r.workspaceAssignmentRepo.manager.query.mockImplementation((_sql: string, params: any[]) => {
        const [assignmentId] = params;
        if (assignmentId === 100) return Promise.resolve([{ businessId: 10, workspaceId: 100, businessName: 'Business A', capabilityActive: false }]);
        if (assignmentId === 200) return Promise.resolve([{ businessId: 11, workspaceId: 200, businessName: 'Business B', capabilityActive: true }]);
        return Promise.resolve([]);
      });
      const roleA = bound(AccountRoleType.TRANSPORT_PROVIDER, RoleProfileType.TRANSPORT_PROVIDER, 100);
      const roleB = { ...bound(AccountRoleType.TRANSPORT_PROVIDER, RoleProfileType.TRANSPORT_PROVIDER, 200), id: 11 };
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });

      r.roleRepo.findOne.mockResolvedValueOnce(roleA);
      const serviceA = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      await expect(serviceA.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.TRANSPORT_PROVIDER, cv: 1 }))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' } });

      r.roleRepo.findOne.mockResolvedValueOnce(roleB);
      r.sessionRepo.findOne.mockResolvedValueOnce({ id: 'session-1', userId: 1, accountRoleId: 11, contextVersion: 1, expiresAt: new Date(Date.now() + 60_000), revokedAt: null });
      const serviceB = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      const contextB = await serviceB.resolveContext({ sub: 1, sid: 'session-1', rid: 11, rt: AccountRoleType.TRANSPORT_PROVIDER, cv: 1 });
      expect(contextB.workspaceId).toBe(200);
    });

    it('service_provider has no capability mapping yet — a hypothetical bound context is left ungated (existing pre-Stage-A semantics preserved, not invented)', async () => {
      const r = repos();
      r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SERVICE_PROVIDER, profileType: RoleProfileType.USER, workspaceAssignmentId: 9 });
      r.profileRepo.findOne.mockResolvedValue({ id: role.profileId, userId: role.userId });
      // capabilityActive: true here simulates what the real SQL's
      // `CASE WHEN $2::text IS NULL THEN true ...` branch returns for an
      // unmapped roleType (this unit test mocks the query call, not
      // Postgres, so it can't execute that CASE itself) -- the actual
      // proof that the null-capability branch is what's requested is the
      // `[9, null]` query-args assertion below.
      r.workspaceAssignmentRepo.manager.query.mockResolvedValue([{ businessId: 6, workspaceId: 9, businessName: 'Some Business', capabilityActive: true }]);
      const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.workspaceAssignmentRepo, r.sessionEvents);
      const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SERVICE_PROVIDER, cv: 1 });
      expect(context.workspaceId).toBe(9);
      expect(r.workspaceAssignmentRepo.manager.query).toHaveBeenCalledWith(expect.any(String), [9, null]);
    });
  });

  describe('syncOperationalRole — workspace-aware sync (Stage A)', () => {
    const syncRepos = (existing: any = null) => {
      const roleRepo: any = {
        findOne: jest.fn().mockResolvedValue(existing),
        merge: jest.fn((target, patch) => Object.assign(target, patch)),
        create: jest.fn((data) => data),
        save: jest.fn((data) => Promise.resolve({ id: existing?.id ?? 99, ...data })),
      };
      const sessionRepo: any = { update: jest.fn() };
      const other: any = { findOne: jest.fn() };
      const sessionEvents: any = { emitRevoked: jest.fn() };
      const service = new RoleContextService(other, roleRepo, sessionRepo, other, other, other, other, other, sessionEvents);
      return { service, roleRepo, sessionRepo, sessionEvents };
    };

    it('13. sync with explicit workspaceAssignmentId: null never selects an existing bound row for the same userId+roleType', async () => {
      const { service, roleRepo } = syncRepos(null);
      await service.syncOperationalRole({
        userId: 5, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 77, workspaceAssignmentId: null,
      });
      expect(roleRepo.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: 5, roleType: AccountRoleType.SELLER, workspaceAssignmentId: expect.anything() }),
      });
      // The where clause's workspaceAssignmentId must be an IS NULL FindOperator, not the literal value undefined/2.
      const whereArg = roleRepo.findOne.mock.calls[0][0].where;
      expect(whereArg.workspaceAssignmentId.type).toBe('isNull');
    });

    it('14. sync bound Workspace A never mutates the bound Workspace B row for the same user+roleType', async () => {
      const roleA = { id: 201, userId: 5, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE, contextVersion: 1, workspaceAssignmentId: 10 };
      const roleRepo: any = {
        findOne: jest.fn((opts: any) => {
          if (opts.where.workspaceAssignmentId === 10) return Promise.resolve(roleA);
          if (opts.where.workspaceAssignmentId === 20) return Promise.resolve(null); // Workspace B: no row yet
          return Promise.resolve(null);
        }),
        merge: jest.fn((target, patch) => Object.assign(target, patch)),
        create: jest.fn((data) => data),
        save: jest.fn((data) => Promise.resolve({ id: data.id ?? 202, ...data })),
      };
      const sessionRepo: any = { update: jest.fn() };
      const other: any = { findOne: jest.fn() };
      const sessionEvents: any = { emitRevoked: jest.fn() };
      const service = new RoleContextService(other, roleRepo, sessionRepo, other, other, other, other, other, sessionEvents);

      // Approve Workspace B's Transport application for the same user+roleType.
      const savedB = await service.syncOperationalRole({
        userId: 5, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId: 88, workspaceAssignmentId: 20,
      });

      expect(savedB.id).toBe(202); // a NEW row, not roleA's id (201)
      expect(roleA.status).toBe(AccountRoleStatus.ACTIVE); // roleA untouched
      expect(sessionEvents.emitRevoked).not.toHaveBeenCalledWith(expect.objectContaining({ accountRoleId: 201 }));
    });

    it('15. duplicate same-workspace sync is idempotent — resolves to the same AccountRole id, never creates a second row', async () => {
      const existing = { id: 42, userId: 5, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, contextVersion: 3, workspaceAssignmentId: 2 };
      const { service, roleRepo } = syncRepos(existing);
      const first = await service.syncOperationalRole({
        userId: 5, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 77, workspaceAssignmentId: 2,
      });
      const second = await service.syncOperationalRole({
        userId: 5, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 77, workspaceAssignmentId: 2,
      });
      expect(first.id).toBe(42);
      expect(second.id).toBe(42);
      expect(roleRepo.create).not.toHaveBeenCalled(); // never took the "create a new row" branch
    });

    it('omitted workspaceAssignmentId preserves the exact pre-Stage-A lookup ({userId, roleType} only) — required so SellerService.approve() keeps updating an already-migrated bound row (e.g. production AccountRole 38) instead of spawning a stray unbound duplicate', async () => {
      const existingBoundRole = { id: 38, userId: 2, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, contextVersion: 1, workspaceAssignmentId: 2 };
      const { service, roleRepo } = syncRepos(existingBoundRole);
      const saved = await service.syncOperationalRole({
        userId: 2, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 5,
        // workspaceAssignmentId intentionally omitted -- exactly what SellerService.approve() passes today.
      });
      expect(roleRepo.findOne).toHaveBeenCalledWith({ where: { userId: 2, roleType: AccountRoleType.SELLER } });
      expect(saved.id).toBe(38); // updates the existing bound row, does not orphan it
      expect(saved.workspaceAssignmentId).toBe(2); // binding preserved, not cleared
    });

    it('a brand-new row created via explicit workspaceAssignmentId persists it on the created AccountRole', async () => {
      const { service, roleRepo } = syncRepos(null);
      const saved = await service.syncOperationalRole({
        userId: 9, roleType: AccountRoleType.SUPER_AGENT, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SUPER_AGENT, profileId: 3, workspaceAssignmentId: 15,
      });
      expect(saved.workspaceAssignmentId).toBe(15);
      expect(roleRepo.create).toHaveBeenCalledWith(expect.objectContaining({ workspaceAssignmentId: 15 }));
    });
  });
});
