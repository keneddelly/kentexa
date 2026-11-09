import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { AccountRoleType, AccountRoleStatus, RoleProfileType } from '../role-context/entities/account-role.entity';

const buildContext = (required: UserRole[] | undefined, user: any) => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
  const request: any = { user };
  const context: any = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return { reflector, request, context };
};

const payload = (rt: AccountRoleType) => ({ sub: 1, sid: 'session-1', rid: 10, rt, cv: 1 });

describe('RolesGuard', () => {
  it('passes through when no roles are required', async () => {
    const roleContextService = { resolveContext: jest.fn() } as any;
    const { reflector, context } = buildContext(undefined, { authPayload: payload(AccountRoleType.SELLER) });
    await expect(new RolesGuard(reflector, roleContextService).canActivate(context)).resolves.toBe(true);
    expect(roleContextService.resolveContext).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    const roleContextService = { resolveContext: jest.fn() } as any;
    const { reflector, context } = buildContext([UserRole.ADMIN], undefined);
    await expect(new RolesGuard(reflector, roleContextService).canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a request whose JWT lacks sid/rid/cv (pre-role-context token)', async () => {
    const roleContextService = { resolveContext: jest.fn() } as any;
    const { reflector, context } = buildContext([UserRole.ADMIN], { authPayload: { sub: 1 } });
    await expect(new RolesGuard(reflector, roleContextService).canActivate(context))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_MISSING' } });
  });

  it('rejects a revoked session even for an admin-gated route', async () => {
    const roleContextService = {
      resolveContext: jest.fn().mockRejectedValue({ response: { code: 'ROLE_CONTEXT_REVOKED' } }),
    } as any;
    const { reflector, context } = buildContext([UserRole.ADMIN], { authPayload: payload(AccountRoleType.ADMIN) });
    await expect(new RolesGuard(reflector, roleContextService).canActivate(context))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_REVOKED' } });
  });

  it('rejects a suspended AccountRole even for an admin-gated route', async () => {
    const roleContextService = {
      resolveContext: jest.fn().mockRejectedValue({ response: { code: 'ROLE_NOT_ACTIVE' } }),
    } as any;
    const { reflector, context } = buildContext([UserRole.ADMIN], { authPayload: payload(AccountRoleType.ADMIN) });
    await expect(new RolesGuard(reflector, roleContextService).canActivate(context))
      .rejects.toMatchObject({ response: { code: 'ROLE_NOT_ACTIVE' } });
  });

  it('rejects a contextVersion mismatch', async () => {
    const roleContextService = {
      resolveContext: jest.fn().mockRejectedValue({ response: { code: 'ROLE_CONTEXT_VERSION_MISMATCH' } }),
    } as any;
    const { reflector, context } = buildContext([UserRole.ADMIN], { authPayload: payload(AccountRoleType.ADMIN) });
    await expect(new RolesGuard(reflector, roleContextService).canActivate(context))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_VERSION_MISMATCH' } });
  });

  it('grants an admin-gated route when the active role is admin', async () => {
    const resolved = { roleType: AccountRoleType.ADMIN, accountRoleId: 10, userId: 1 };
    const roleContextService = { resolveContext: jest.fn().mockResolvedValue(resolved) } as any;
    const { reflector, context, request } = buildContext([UserRole.ADMIN], { authPayload: payload(AccountRoleType.ADMIN) });
    await expect(new RolesGuard(reflector, roleContextService).canActivate(context)).resolves.toBe(true);
    expect(request.roleContext).toBe(resolved);
  });

  it('denies an admin-gated route for a seller-active account that also possesses an admin AccountRole', async () => {
    // The JWT rt claim can even (falsely) claim ADMIN, but resolveContext always returns the
    // DB-backed roleType for the session's rid — here the account's currently active session is seller.
    const resolved = { roleType: AccountRoleType.SELLER, accountRoleId: 10, userId: 1 };
    const roleContextService = { resolveContext: jest.fn().mockResolvedValue(resolved) } as any;
    const { reflector, context } = buildContext([UserRole.ADMIN], { authPayload: payload(AccountRoleType.ADMIN) });
    await expect(new RolesGuard(reflector, roleContextService).canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('grants a seller-gated route to an admin acting in the admin role (hierarchy override)', async () => {
    const resolved = { roleType: AccountRoleType.ADMIN, accountRoleId: 10, userId: 1 };
    const roleContextService = { resolveContext: jest.fn().mockResolvedValue(resolved) } as any;
    const { reflector, context } = buildContext([UserRole.SELLER], { authPayload: payload(AccountRoleType.ADMIN) });
    await expect(new RolesGuard(reflector, roleContextService).canActivate(context)).resolves.toBe(true);
  });

  it('denies a super-agent-gated route for an agent-active account', async () => {
    const resolved = { roleType: AccountRoleType.AGENT, accountRoleId: 10, userId: 1 };
    const roleContextService = { resolveContext: jest.fn().mockResolvedValue(resolved) } as any;
    const { reflector, context } = buildContext([UserRole.SUPER_AGENT], { authPayload: payload(AccountRoleType.AGENT) });
    await expect(new RolesGuard(reflector, roleContextService).canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});

// Owner 2026-11-09: KenteXa staff roles see the admin, each only in its own area.
describe('RolesGuard: KenteXa staff areas', () => {
  const run = async (roleType: AccountRoleType, method: string, routePath: string, required: UserRole[] = [UserRole.ADMIN]) => {
    const roleContextService = { resolveContext: jest.fn().mockResolvedValue({ roleType, userId: 1, accountRoleId: 10, profileType: RoleProfileType.USER, profileId: 1, status: AccountRoleStatus.ACTIVE }) } as any;
    const { reflector, context, request } = buildContext(required, { authPayload: payload(roleType) });
    request.method = method; request.baseUrl = ''; request.route = { path: routePath };
    return new RolesGuard(reflector, roleContextService).canActivate(context);
  };

  it('manager: everything except KenteXa fee changes and staff', async () => {
    await expect(run(AccountRoleType.MANAGER, 'PATCH', '/seller/:id/approve')).resolves.toBe(true);
    await expect(run(AccountRoleType.MANAGER, 'GET', '/payouts/admin/all')).resolves.toBe(true);
    await expect(run(AccountRoleType.MANAGER, 'POST', '/kentexa-fee/admin/settings')).rejects.toThrow(ForbiddenException);
    await expect(run(AccountRoleType.MANAGER, 'POST', '/admin/staff')).rejects.toThrow(ForbiddenException);
  });

  it('customer care: reads people and orders, answers messages and disputes; no money, no approvals', async () => {
    await expect(run(AccountRoleType.CUSTOMER_CARE, 'GET', '/activity/admin/people/:userId')).resolves.toBe(true);
    await expect(run(AccountRoleType.CUSTOMER_CARE, 'PATCH', '/contact/:id')).resolves.toBe(true);
    await expect(run(AccountRoleType.CUSTOMER_CARE, 'GET', '/payouts/admin/all')).rejects.toThrow(ForbiddenException);
    await expect(run(AccountRoleType.CUSTOMER_CARE, 'PATCH', '/seller/:id/approve')).rejects.toThrow(ForbiddenException);
  });

  it('finance: money changes only; moderator: content and approvals, no money', async () => {
    await expect(run(AccountRoleType.FINANCE, 'POST', '/payouts/admin/process/:orderId')).resolves.toBe(true);
    await expect(run(AccountRoleType.FINANCE, 'PATCH', '/seller/:id/approve')).rejects.toThrow(ForbiddenException);
    await expect(run(AccountRoleType.MODERATOR, 'POST', '/admin-intelligence/reports/:id/review')).resolves.toBe(true);
    await expect(run(AccountRoleType.MODERATOR, 'PATCH', '/seller/:id/approve')).resolves.toBe(true);
    await expect(run(AccountRoleType.MODERATOR, 'GET', '/payouts/admin/all')).rejects.toThrow(ForbiddenException);
  });

  it('a staff role never widens a route that is not admin-only', async () => {
    await expect(run(AccountRoleType.FINANCE, 'POST', '/pickup-tasks/:id/claim', [UserRole.AGENT])).rejects.toThrow(ForbiddenException);
  });
});
