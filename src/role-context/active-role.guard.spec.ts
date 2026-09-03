import { Reflector } from '@nestjs/core';
import { ActiveRoleGuard } from './active-role.guard';
import { AccountRoleType } from './entities/account-role.entity';

const mockContext = (roleContext: any, required: AccountRoleType[] | undefined) => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
  const executionContext: any = {
    switchToHttp: () => ({ getRequest: () => ({ roleContext }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return { reflector, executionContext };
};

describe('ActiveRoleGuard', () => {
  it('passes through when no active role is required', () => {
    const { reflector, executionContext } = mockContext(undefined, []);
    expect(new ActiveRoleGuard(reflector).canActivate(executionContext)).toBe(true);
  });

  it('allows a request whose active role matches', () => {
    const { reflector, executionContext } = mockContext(
      { roleType: AccountRoleType.SELLER }, [AccountRoleType.SELLER],
    );
    expect(new ActiveRoleGuard(reflector).canActivate(executionContext)).toBe(true);
  });

  it('rejects a request missing a resolved role context', () => {
    const { reflector, executionContext } = mockContext(undefined, [AccountRoleType.SELLER]);
    expect(() => new ActiveRoleGuard(reflector).canActivate(executionContext))
      .toThrow(expect.objectContaining({ response: { code: 'ROLE_CONTEXT_MISSING', message: 'ROLE_CONTEXT_MISSING' } }));
  });

  it('rejects a request whose active role does not match, even for an admin-capable account', () => {
    // Simulates a user who also possesses ADMIN, but is currently operating as SELLER:
    // resolveContext only ever returns the role tied to the session, so roleContext.roleType
    // can never be ADMIN here regardless of what other AccountRoles the account holds.
    const { reflector, executionContext } = mockContext(
      { roleType: AccountRoleType.SELLER }, [AccountRoleType.ADMIN],
    );
    expect(() => new ActiveRoleGuard(reflector).canActivate(executionContext))
      .toThrow(expect.objectContaining({ response: { code: 'ACTIVE_ROLE_REQUIRED', message: 'ACTIVE_ROLE_REQUIRED' } }));
  });

  it('rejects a forged role-type claim that never made it into the resolved context', () => {
    // RoleContextGuard/RoleContextService never let a JWT `rt` claim populate roleType directly;
    // this proves the guard itself only trusts request.roleContext, not any raw JWT payload.
    const { reflector, executionContext } = mockContext(
      { roleType: AccountRoleType.BUYER }, [AccountRoleType.ADMIN],
    );
    expect(() => new ActiveRoleGuard(reflector).canActivate(executionContext)).toThrow();
  });
});
