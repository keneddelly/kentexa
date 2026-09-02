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
    return { userRepo, roleRepo, sessionRepo, profileRepo };
  };

  it('resolves authority from sid/rid, not informational rt', async () => {
    const r = repos();
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo);
    const context = await service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.ADMIN, cv: 1 });
    expect(context.roleType).toBe(AccountRoleType.BUYER);
  });

  it('rejects a revoked old session', async () => {
    const r = repos();
    r.sessionRepo.findOne.mockResolvedValue({ id: 'session-1', userId: 1, accountRoleId: 10, contextVersion: 1, expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() });
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.BUYER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_REVOKED' } });
  });

  it('rejects a context-version mismatch', async () => {
    const r = repos();
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.BUYER, cv: 2 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_VERSION_MISMATCH' } });
  });

  it('rejects an operational membership whose trusted profile is missing', async () => {
    const r = repos();
    r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SELLER, profileType: RoleProfileType.SELLER_PROFILE, profileId: 88 });
    r.profileRepo.findOne.mockResolvedValue(null);
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_PROFILE_INVALID' } });
  });

  it('rejects a role/profile-type mismatch even when the profile exists', async () => {
    const r = repos();
    r.roleRepo.findOne.mockResolvedValue({ ...role, roleType: AccountRoleType.SELLER, profileType: RoleProfileType.AGENT, profileId: 88 });
    r.profileRepo.findOne.mockResolvedValue({ id: 88, userId: 1 });
    const service = new RoleContextService(r.userRepo, r.roleRepo, r.sessionRepo, r.profileRepo, r.profileRepo, r.profileRepo, r.profileRepo);
    await expect(service.resolveContext({ sub: 1, sid: 'session-1', rid: 10, rt: AccountRoleType.SELLER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_PROFILE_INVALID' } });
  });
});
