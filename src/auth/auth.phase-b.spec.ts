import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';

describe('AuthService Phase B session lifecycle', () => {
  const user: any = { id: 1, role: 'user', phone: '255700000000', email: null, name: 'User', onboardingCompleted: true };
  const target: any = { id: 2, userId: 1, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE, profileId: 12, contextVersion: 1 };

  function serviceWith(roleContext: any) {
    return new AuthService(
      { findOne: jest.fn().mockResolvedValue(user) } as any,
      { sign: jest.fn().mockReturnValue('new-jwt') } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      roleContext,
    );
  }

  it('revokes the old context before issuing a switched-role token', async () => {
    const roleContext = {
      getRoleForUser: jest.fn().mockResolvedValue(target), isSwitchable: jest.fn().mockResolvedValue(true),
      revokeCurrentSession: jest.fn().mockResolvedValue(undefined), createSession: jest.fn().mockResolvedValue({ id: 'new-session' }),
      resolveContext: jest.fn().mockResolvedValue({ accountRoleId: 2, sessionId: 'new-session' }), listRoles: jest.fn().mockResolvedValue([]),
    };
    const result = await serviceWith(roleContext).switchRole(user, { sessionId: 'old-session' } as any, 2, {});
    expect(roleContext.revokeCurrentSession).toHaveBeenCalledWith('old-session', 'role_switched');
    expect(result.accessToken).toBe('new-jwt');
  });

  it('does not allow another user or inactive target to be switched to', async () => {
    const roleContext = { getRoleForUser: jest.fn().mockResolvedValue(null), isSwitchable: jest.fn() };
    await expect(serviceWith(roleContext).switchRole(user, { sessionId: 'old-session' } as any, 999, {}))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('logout is idempotent and scoped to the presented session', async () => {
    const roleContext = { revokeCurrentSession: jest.fn().mockResolvedValue(undefined) };
    const service = serviceWith(roleContext);
    await service.logout({ sub: 1, sid: 'session-1' } as any);
    await service.logout({ sub: 1, sid: 'session-1' } as any);
    expect(roleContext.revokeCurrentSession).toHaveBeenCalledTimes(2);
    expect(roleContext.revokeCurrentSession).toHaveBeenCalledWith('session-1', 'logout');
  });
});
