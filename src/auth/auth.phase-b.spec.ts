import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
      evaluateAccountRoleAvailability: jest.fn().mockResolvedValue({ switchable: true, reason: null }),
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

  it('renews only a valid, still-authorized session without changing roles', async () => {
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-only-secret';
    const context = { userId: 1, sessionId: 'session-1', accountRoleId: 2,
      roleType: AccountRoleType.SELLER, contextVersion: 1 };
    const roleContext = {
      resolveContext: jest.fn().mockResolvedValue(context),
      listRoles: jest.fn().mockResolvedValue([target]),
    };
    const service = serviceWith(roleContext);
    const jwt = (service as any).jwtService;
    jwt.verify = jest.fn().mockReturnValue({ purpose: 'refresh', sub: 1,
      sid: 'session-1', rid: 2, rt: AccountRoleType.SELLER, cv: 1 });
    try {
      const renewed = await service.refresh('signed-cookie');
      expect(roleContext.resolveContext).toHaveBeenCalledWith(expect.objectContaining({
        sid: 'session-1', rid: 2, cv: 1,
      }));
      expect(renewed.activeContext).toEqual(context);
      expect(renewed.accessToken).toBe('new-jwt');
      roleContext.resolveContext.mockRejectedValueOnce(new ForbiddenException('revoked'));
      await expect(service.refresh('signed-cookie')).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      if (oldSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = oldSecret;
    }
  });

  it('uses a distinct refresh signature that an access-token verifier rejects', () => {
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-only-access-secret';
    try {
      const service = serviceWith({});
      (service as any).jwtService = new JwtService({ secret: 'test-only-access-secret',
        signOptions: { expiresIn: '30m' } });
      const refresh = service.issueRefreshCredential({ userId: 1, sessionId: 'session-1',
        accountRoleId: 2, roleType: AccountRoleType.SELLER, contextVersion: 1 } as any);
      const accessVerifier = new JwtService({ secret: 'test-only-access-secret' });
      expect(() => accessVerifier.verify(refresh)).toThrow();
      const decoded = accessVerifier.decode(refresh) as any;
      expect(decoded.purpose).toBe('refresh');
      expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
    } finally {
      if (oldSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = oldSecret;
    }
  });
});
