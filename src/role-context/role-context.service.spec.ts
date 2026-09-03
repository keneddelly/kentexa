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
    const sessionEvents: any = { emitRevoked: jest.fn() };
    return { userRepo, roleRepo, sessionRepo, profileRepo, sessionEvents };
  };

  it('resolves authority from sid/rid, not informational rt', async () => {
    const r = repos();
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.sessionEvents);
    const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.ADMIN, cv: 1 });
    expect(context.roleType).toBe(AccountRoleType.BUYER);
  });

  it('rejects a revoked old session', async () => {
    const r = repos();
    r.sessionRepo.findOne.mockResolvedValue({ id: 'session-1', userId: 1, accountRoleId: 10, contextVersion: 1, expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() });
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.sessionEvents);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.BUYER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_REVOKED' } });
  });

  it('rejects a suspended AccountRole even with a valid session', async () => {
    const r = repos();
    r.roleRepo.findOne.mockResolvedValue({ ...role, status: AccountRoleStatus.SUSPENDED });
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.sessionEvents);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.BUYER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_NOT_ACTIVE' } });
  });

  it('rejects a context-version mismatch', async () => {
    const r = repos();
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.sessionEvents);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.BUYER, cv: 2 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_VERSION_MISMATCH' } });
  });

  it('rejects an operational membership whose trusted profile is missing', async () => {
    const r = repos();
    r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SELLER, profileType: RoleProfileType.SELLER_PROFILE, profileId: 88 });
    r.profileRepo.findOne.mockResolvedValue(null);
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.sessionEvents);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_PROFILE_INVALID' } });
  });

  it('rejects a role/profile-type mismatch even when the profile exists', async () => {
    const r = repos();
    r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SELLER, profileType: RoleProfileType.AGENT, profileId: 88 });
    r.profileRepo.findOne.mockResolvedValue({ id: 88, userId: 1 });
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.sessionEvents);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_PROFILE_INVALID' } });
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
        service: new RoleContextService(other, roleRepo, sessionRepo, other, other, other, other, sessionEvents),
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
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.sessionEvents);
    const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.BUYER, cv: 1 });
    expect(context.roleType).toBe(AccountRoleType.BUYER);
    expect(context.accountRoleId).toBe(10);
  });
});
